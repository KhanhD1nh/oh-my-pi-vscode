/**
 * Chats: one editor tab (webview panel) per omp session, one omp process per workspace folder, and the sidebar
 * (sessions + settings). Owns tab state, titles, the status bar item and the host ↔ webview plumbing.
 */
import { homedir } from 'node:os'
import * as vscode from 'vscode'
import { OmpHost, type OmpSession } from './agent.ts'
import { branchOf } from './git.ts'
import { webviewHtml } from './html.ts'
import { errorText, handleMessage } from './messages.ts'
import type { OmpConfigCli } from './settings.ts'
import { SettingsPane } from './settingsPane.ts'
import { sessionJobs, sessionStats } from './stats.ts'
import { longWait, nudgePrompt, shouldNudge } from './autopilot.ts'
import type { AgentModelChoice, ChatItem, HostMessage, SessionStats, TabState, WebviewMessage } from './types.ts'

export const PANEL_TYPE = 'ohMyPi.panel'
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

/** One open chat tab. */
export interface ChatTab { session: OmpSession; cwd: string; unread: boolean; panel: vscode.WebviewPanel; startedAt: number; stats?: SessionStats }

export class ChatProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined
  /** omp process per workspace folder path. */
  private readonly hosts = new Map<string, OmpHost>()
  /** Open tabs in display order. */
  tabs: ChatTab[] = []
  active: string | undefined
  models: AgentModelChoice[] = []
  readonly settingsPane: SettingsPane
  private creating: Promise<void> | undefined
  private spinAt = 0
  private readonly spinner = setInterval(() => this.tickTitles(), 100)
  /** Autopilot watchdog: breaks waits that will never return. Waits already nudged are not nudged twice. */
  private readonly watchdog = setInterval(() => { void this.checkStalls() }, 30_000)
  private readonly nudged = new Set<string>()
  private readonly lastTitles = new Map<string, string | undefined>()
  private readonly wasBusy = new Map<string, boolean>()
  private sidebarTimer: ReturnType<typeof setTimeout> | undefined
  /** Status bar: "OMP", a spinner with a count while chats run, a dot when one finished unseen. */
  readonly status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly command: () => Promise<string>,
    readonly cli: OmpConfigCli,
    private readonly output: vscode.OutputChannel,
    readonly diffBefore: Map<string, string>,
  ) {
    this.settingsPane = new SettingsPane(cli, m => this.post(m), () => this.models, m => { this.models = m })
  }

  // ── lookups ──

  tab(id: string | undefined): ChatTab | undefined { return this.tabs.find(t => t.session.id === id) }

  /** Folder of the active editor, else the first workspace folder, else home. */
  currentFolder(): string {
    const editor = vscode.window.activeTextEditor
    const folder = (editor && vscode.workspace.getWorkspaceFolder(editor.document.uri)) ?? vscode.workspace.workspaceFolders?.[0]
    return folder?.uri.fsPath ?? homedir()
  }

  /** The omp process for `cwd`, started on first use; its events feed the tab that owns each session. */
  host(cwd: string): OmpHost {
    let host = this.hosts.get(cwd)
    if (host === undefined) {
      host = new OmpHost(this.command, () => cwd, {
        item: (s, item) => { this.markUnread(s.id); this.queueUpsert(s.id, item) },
        reset: s => { this.pending.delete(s.id); this.postTab(s.id, { type: 'reset', tab: s.id, items: s.transcript.items }) },
        state: s => this.onSessionState(s),
        permission: async (s, title, options) => {
          const t = s ? this.tab(s.id) : undefined
          if (s && t) {
            // Answer in the chat; if the tab is out of sight, say so in a toast too.
            if (!t.panel.visible) void vscode.window.showInformationMessage(`OMP needs permission: ${title}`, 'Show').then(p => { if (p) t.panel.reveal() })
            return s.permit(title, options)
          }
          const pick = await vscode.window.showInformationMessage(`OMP: ${title}`, { modal: true }, ...options.map(o => o.name))
          return options.find(o => o.name === pick)?.optionId
        },
        log: line => { this.output.appendLine(line) },
      })
      this.hosts.set(cwd, host)
    }
    return host
  }

  private onSessionState(s: OmpSession): void {
    if (!s.busy) this.flushUpserts()
    const was = this.wasBusy.get(s.id) ?? false
    this.wasBusy.set(s.id, s.busy)
    if (was && !s.busy) this.notifyDone(s)
    this.postTab(s.id, { type: 'tab', tab: this.tabState(s) })
    this.tickTitles()
    // Sidebar follows title changes (omp names a session after its first turn) and turn ends.
    if (!s.busy || s.title !== this.lastTitles.get(s.id)) { this.lastTitles.set(s.id, s.title); this.refreshSidebar() }
    if (!s.busy) void this.refreshTabStats(s.id)
  }

  // ── posting to webviews ──

  post(message: HostMessage): void { void this.view?.webview.postMessage(message) }
  postTab(id: string, message: HostMessage): void { void this.tab(id)?.panel.webview.postMessage(message) }

  /** Each panel gets only its own tab; the sidebar gets the list (to mark open sessions). */
  postTabs(): void {
    for (const t of this.tabs) this.postTab(t.session.id, { type: 'tabs', tabs: [this.tabState(t.session)], active: t.session.id, models: this.models, cwd: t.cwd })
    this.post({ type: 'tabs', tabs: this.tabs.map(t => this.tabState(t.session)), models: this.models, cwd: this.currentFolder() })
  }

  /** Streaming sends one update per token; send each changed item at most every 50 ms (latest copy wins). */
  private pending = new Map<string, Map<string, ChatItem>>()
  private flushTimer: ReturnType<typeof setTimeout> | undefined
  private queueUpsert(tab: string, item: ChatItem): void {
    let m = this.pending.get(tab)
    if (m === undefined) { m = new Map(); this.pending.set(tab, m) }
    m.set(item.id, item)
    this.flushTimer ??= setTimeout(() => this.flushUpserts(), 50)
  }
  private flushUpserts(): void {
    this.flushTimer = undefined
    const all = this.pending
    this.pending = new Map()
    for (const [tab, items] of all) for (const item of items.values()) this.postTab(tab, { type: 'upsert', tab, item })
  }

  /** Push one tab's state to its panel (after a change the session did not announce itself). */
  refreshTab(id: string): void { const t = this.tab(id); if (t) this.postTab(id, { type: 'tab', tab: this.tabState(t.session) }) }

  private tabState(s: OmpSession): TabState {
    const t = this.tab(s.id)
    const branch = t ? branchOf(t.cwd) : undefined
    return {
      id: s.id, autopilot: s.autopilot.enabled, busy: s.busy, queued: s.queue.filter(q => !q.goal).length, ...s.goal ? { goal: s.goal } : {}, thinkingLevels: s.thinkingLevels, modes: s.modes, commands: s.commands, usage: s.usage,
      ...s.title ? { title: s.title } : {}, ...s.model ? { model: s.model } : {}, ...s.thinking ? { thinking: s.thinking } : {}, ...s.mode ? { mode: s.mode } : {},
      ...t?.unread ? { unread: true } : {},
      ...t ? { folder: t.cwd.replace(/\\/gu, '/').split('/').filter(Boolean).pop() ?? t.cwd, startedAt: t.startedAt } : {},
      ...branch ? { branch } : {},
      ...t?.stats ? { stats: t.stats } : {},
    }
  }

  // ── tabs ──

  private markUnread(id: string): void {
    const t = this.tab(id)
    if (t && !t.panel.active && !t.unread) { t.unread = true; this.tickTitles() }
  }

  /** Editor tab titles: braille spinner while omp works, ● when it finished out of sight. */
  private tickTitles(): void {
    this.updateStatusItem()
    this.spinAt = (this.spinAt + 1) % SPIN.length
    for (const t of this.tabs) {
      const name = (t.session.title ?? 'New chat').replace(/\s+/gu, ' ').slice(0, 40)
      const title = t.session.busy ? `${SPIN[this.spinAt]} ${name}` : t.unread ? `● ${name}` : name
      if (t.panel.title !== title) t.panel.title = title
    }
  }

  updateStatusItem(): void {
    if (!vscode.workspace.getConfiguration('ohMyPi').get<boolean>('statusBarButton', true)) { this.status.hide(); this.status.text = ''; return }
    const busy = this.tabs.filter(t => t.session.busy).length
    const unread = this.tabs.filter(t => t.unread).length
    const text = busy ? `$(loading~spin) OMP ${busy}` : unread ? `$(circle-filled) OMP` : '$(comment-discussion) OMP'
    if (this.status.text === text) return // called on every spinner tick; touch the item only on change
    this.status.text = text
    this.status.tooltip = busy ? `${busy} chat(s) running — click to open` : unread ? 'A chat finished — click to open' : 'Open OMP chat (Ctrl+Alt+P)'
    this.status.command = 'ohMyPi.focus'
    this.status.show()
  }

  /** Open a chat panel for `session` next to the other chats (or beside the editor); `restored` reuses a panel VS Code brought back. */
  openPanel(session: OmpSession, cwd: string, restored?: vscode.WebviewPanel): void {
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media')
    const column = this.tab(this.active)?.panel.viewColumn ?? (vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active)
    const panel = restored ?? vscode.window.createWebviewPanel(PANEL_TYPE, session.title ?? 'New chat', { viewColumn: column, preserveFocus: false }, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [media] })
    if (restored) panel.webview.options = { enableScripts: true, localResourceRoots: [media] }
    panel.iconPath = vscode.Uri.joinPath(media, 'pi-tab.svg')
    panel.webview.html = webviewHtml(panel.webview, media, 'panel', { sessionId: session.id, cwd })
    const entry: ChatTab = { session, cwd, unread: false, panel, startedAt: Date.now() }
    const ap = vscode.workspace.getConfiguration('ohMyPi')
    session.autopilot.enabled = ap.get<boolean>('autopilot.enabled', true)
    session.autopilot.maxContinues = ap.get<number>('autopilot.maxContinues', 5)
    this.tabs.push(entry)
    this.active = session.id
    panel.webview.onDidReceiveMessage((m: WebviewMessage) => { void this.onMessage(m, session.id) })
    panel.onDidChangeViewState(() => { if (panel.active) { this.active = session.id; if (entry.unread) { entry.unread = false; this.tickTitles() } } })
    panel.onDidDispose(() => {
      this.tabs = this.tabs.filter(t => t !== entry)
      this.hosts.get(cwd)?.close(session.id)
      if (this.active === session.id) this.active = this.tabs.at(-1)?.session.id
      this.postTabs()
    })
    this.tickTitles()
    this.postTabs()
    void this.refreshTabStats(session.id)
  }

  /** Open a new tab in the current folder, carrying the active tab's model and thinking. */
  async newTab(): Promise<void> {
    // Serialize: several quick clicks must not race the omp handshake.
    const run = async () => {
      const from = this.tab(this.active)?.session
      const cwd = vscode.window.activeTextEditor ? this.currentFolder() : this.tab(this.active)?.cwd ?? this.currentFolder()
      const session = await this.host(cwd).create({ ...from?.model ? { model: from.model } : {}, ...from?.thinking ? { thinking: from.thinking } : {} })
      this.openPanel(session, cwd)
    }
    const prev = this.creating ?? Promise.resolve()
    const next = prev.then(run, run)
    this.creating = next.finally(() => { if (this.creating === next) this.creating = undefined })
    await next
  }

  /** Show a session from the sidebar: its tab if open, else load it into a new tab. */
  async openSession(sessionId: string): Promise<void> {
    if (this.tab(sessionId)) { this.tab(sessionId)!.panel.reveal(); return }
    const cwd = this.currentFolder()
    const row = (await this.host(cwd).list()).find(r => r.sessionId === sessionId) ?? { sessionId, cwd }
    this.openPanel(await this.host(cwd).open(row), cwd)
  }

  /**
   * VS Code restored a chat tab after reload: reopen its omp session in that same tab.
   * @param state - what the webview saved with `setState` (session id and folder).
   */
  async restorePanel(panel: vscode.WebviewPanel, state: { sessionId?: string; cwd?: string } | undefined): Promise<void> {
    if (!state?.sessionId || !state.cwd) { panel.dispose(); return }
    try {
      const host = this.host(state.cwd)
      const row = (await host.list()).find(r => r.sessionId === state.sessionId) ?? { sessionId: state.sessionId, cwd: state.cwd }
      this.openPanel(await host.open(row), state.cwd, panel)
    } catch (error) {
      this.output.appendLine(`restore ${state.sessionId}: ${String(error)}`)
      panel.dispose()
    }
  }

  /** Ctrl+Alt+P: show the last chat, or start one. */
  focusChat(): void {
    const t = this.tab(this.active) ?? this.tabs.at(-1)
    if (t) t.panel.reveal(t.panel.viewColumn, false); else void this.newTab()
  }

  /** When the editor moves to another workspace folder, new tabs follow it (open tabs keep their folder). */
  folderMaybeChanged(): void { this.postTabs() }

  // ── putting text into the input ──

  /** Put `text` into the active chat's input (opening a chat if none); `empty` explains when there is nothing to send. */
  async sendContext(text: string | undefined, empty = 'Nothing to send.'): Promise<void> {
    if (!text) { void vscode.window.showInformationMessage(`OMP: ${empty}`); return }
    let t = this.tab(this.active) ?? this.tabs.at(-1)
    if (t === undefined) { await this.newTab(); t = this.tab(this.active) }
    if (t === undefined) return
    t.panel.reveal(t.panel.viewColumn, false)
    this.postTab(t.session.id, { type: 'insert', text: `${text}\n` })
  }

  addSelection(): void {
    const editor = vscode.window.activeTextEditor
    if (editor === undefined || editor.selection.isEmpty) return
    const rel = vscode.workspace.asRelativePath(editor.document.uri, false).replace(/\\/g, '/')
    const { start, end } = editor.selection
    const range = start.line === end.line ? `${start.line + 1}` : `${start.line + 1}-${end.line + 1}`
    const code = editor.document.getText(editor.selection)
    const t = this.tab(this.active) ?? this.tabs.at(-1)
    if (t === undefined) return
    t.panel.reveal()
    this.postTab(t.session.id, { type: 'insert', text: `@${rel}#L${range}\n\`\`\`\n${code}\n\`\`\`\n` })
  }

  // ── sidebar and stats ──

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media')
    view.webview.options = { enableScripts: true, localResourceRoots: [media] }
    view.webview.html = webviewHtml(view.webview, media, 'sidebar')
    view.webview.onDidReceiveMessage((m: WebviewMessage) => { void this.onMessage(m, undefined) })
  }

  showView(view: 'history' | 'settings'): void {
    void vscode.commands.executeCommand('ohMyPi.chat.focus')
    this.post({ type: 'view', view })
  }

  async loadModels(): Promise<void> {
    try { this.models = await this.cli.models() } catch (error) { this.output.appendLine(`models: ${String(error)}`) }
    this.postTabs()
  }

  /** omp's sessions for the current folder, with stats from omp's session files. */
  async sessionRows() {
    const cwd = this.currentFolder()
    const rows = await this.host(cwd).list()
    const stats = await sessionStats(cwd, new Set(rows.map(r => r.sessionId))).catch(() => ({} as Record<string, never>))
    return rows.map(r => {
      const live = this.tab(r.sessionId)?.session.title
      return { ...r, ...live && live !== r.title ? { title: live } : {}, ...stats[r.sessionId] ? { stats: stats[r.sessionId] } : {} }
    })
  }

  /** A `wait` stuck for minutes with no job left to deliver (or far too long) gets a nudge into the running turn. */
  private async checkStalls(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('ohMyPi')
    const on = cfg.get<boolean>('autopilot.enabled', true)
    const stallMs = cfg.get<number>('autopilot.stallMinutes', 3) * 60_000
    const now = Date.now()
    for (const t of this.tabs) {
      const s = t.session
      if (!s.autopilot.pinned) s.autopilot.enabled = on
      s.autopilot.maxContinues = cfg.get<number>('autopilot.maxContinues', 5)
      if (!s.autopilot.enabled || !s.busy) continue
      const w = longWait(s.transcript.items, now, stallMs)
      if (w === undefined || this.nudged.has(w.id)) continue
      const running = (await sessionJobs(t.cwd, s.id).catch(() => [])).filter(j => j.status === 'running' && j.type !== 'task').length
      if (!shouldNudge(w, running, now, stallMs * 5)) continue
      this.nudged.add(w.id)
      s.nudge(nudgePrompt(running, Math.round((now - (w.startedAt ?? now)) / 60_000)))
    }
  }

  /** Debounced: re-list sessions in the sidebar after a turn ends. */
  private refreshSidebar(): void {
    clearTimeout(this.sidebarTimer)
    this.sidebarTimer = setTimeout(() => { void this.sessionRows().then(rows => this.post({ type: 'sessions', rows }), () => {}) }, 600)
  }

  /** Re-read omp's session file for one tab and push the totals to its status line. */
  private async refreshTabStats(id: string): Promise<void> {
    const t = this.tab(id)
    if (t === undefined) return
    const got = (await sessionStats(t.cwd, new Set([id])).catch(() => ({})) as Record<string, SessionStats>)[id]
    if (got === undefined) return
    t.stats = got
    this.postTab(id, { type: 'tab', tab: this.tabState(t.session) })
  }

  /** A chat finished while you were elsewhere: toast with a jump back (setting ohMyPi.notifyOnDone). */
  private notifyDone(s: OmpSession): void {
    const t = this.tab(s.id)
    if (!t || (t.panel.active && vscode.window.state.focused)) return
    if (!vscode.workspace.getConfiguration('ohMyPi').get<boolean>('notifyOnDone', false)) return
    const last = [...s.transcript.items].reverse().find(i => i.type === 'assistant' || i.type === 'error')
    const summary = last && 'text' in last ? last.text.replace(/\s+/gu, ' ').slice(0, 90) : ''
    const name = (s.title ?? 'Chat').replace(/^\S*\s*/u, m => /\p{Extended_Pictographic}/u.test(m) ? '' : m)
    void vscode.window.showInformationMessage(`OMP finished: ${name}${summary ? ` — ${summary}` : ''}`, 'Open').then(p => { if (p) t.panel.reveal() })
  }

  /** Run a webview message; failures go to the output channel and an error toast. */
  private async onMessage(m: WebviewMessage, from: string | undefined): Promise<void> {
    try {
      await handleMessage(this, m, from)
    } catch (error) {
      const text = errorText(error)
      this.output.appendLine(`${m.type}: ${text}`)
      void vscode.window.showErrorMessage(`Oh My Pi: ${text}`)
    }
  }

  dispose(): void { this.status.dispose(); clearInterval(this.spinner); clearInterval(this.watchdog); for (const h of this.hosts.values()) h.dispose() }
}
