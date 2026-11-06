/**
 * Oh My Pi for VS Code: chats in editor tabs backed by `omp acp`, history and settings in the sidebar. omp is the agent; this extension renders its
 * stream, tool cards and diffs, edits omp's own settings, and wires VS Code niceties (tabs per session,
 * open file, diff view, @-file mentions, add selection, permission prompts).
 */
import { homedir } from 'node:os'
import * as vscode from 'vscode'
import { OmpHost, type OmpSession } from './agent.ts'
import { resolveOmp } from './binary.ts'
import { OmpConfigCli } from './settings.ts'
import { agentSteps, sessionStats } from './stats.ts'
import { checkForUpdate } from './update.ts'
import type { AgentModelChoice, AgentSetting, HostMessage, TabState, WebviewMessage } from './types.ts'

const DIFF_SCHEME = 'oh-my-pi-diff'
const PANEL_TYPE = 'ohMyPi.panel'
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
/** omp's global tool-approval setting, shown as the composer's Mode menu. */
const APPROVAL_KEY = 'tools.approvalMode'
const APPROVAL_MODES = ['always-ask', 'always-ask-cached', 'write', 'yolo'] as const

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Oh My Pi')
  const command = () => resolveOmp(vscode.workspace.getConfiguration('ohMyPi').get<string>('command') || 'omp')
  const cli = new OmpConfigCli(command)

  // Read-only "before" side of diffs: oh-my-pi-diff:/<toolId>/<file>
  const diffBefore = new Map<string, string>()
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, {
    provideTextDocumentContent: uri => diffBefore.get(uri.path.split('/')[1] ?? '') ?? '',
  }))

  const provider = new ChatViewProvider(context, command, cli, output, diffBefore)
  context.subscriptions.push(
    output,
    vscode.window.registerWebviewViewProvider('ohMyPi.chat', provider, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.window.registerWebviewPanelSerializer(PANEL_TYPE, { deserializeWebviewPanel: (panel, state) => provider.restorePanel(panel, state as never) }),
    vscode.commands.registerCommand('ohMyPi.newSession', () => provider.newTab()),
    vscode.commands.registerCommand('ohMyPi.history', () => provider.showView('history')),
    vscode.commands.registerCommand('ohMyPi.settings', () => provider.showView('settings')),
    vscode.commands.registerCommand('ohMyPi.focus', () => provider.focusChat()),
    vscode.commands.registerCommand('ohMyPi.addSelection', () => provider.addSelection()),
    vscode.commands.registerCommand('ohMyPi.checkForUpdates', () => checkForUpdate(context, output, true)),
    vscode.window.onDidChangeActiveTextEditor(() => provider.folderMaybeChanged()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.folderMaybeChanged()),
    { dispose: () => provider.dispose() },
  )
  // Daily, a minute after startup so it never slows activation.
  const t = setTimeout(() => { void checkForUpdate(context, output) }, 60_000)
  context.subscriptions.push({ dispose: () => clearTimeout(t) })
}

export function deactivate(): void {}

/** Tabs and their omp sessions; one omp process per workspace folder. */
class ChatViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined
  /** omp process per workspace folder path. */
  private readonly hosts = new Map<string, OmpHost>()
  /** Open tabs in display order: session + the folder it runs in. */
  private tabs: { session: OmpSession; cwd: string; unread: boolean; panel: vscode.WebviewPanel; startedAt: number; stats?: import('./types.ts').SessionStats }[] = []
  private spinAt = 0
  private readonly spinner = setInterval(() => this.tickTitles(), 100)
  private active: string | undefined
  private models: AgentModelChoice[] = []
  private settings: AgentSetting[] = []
  private failed: Record<string, string> = {}
  private writes: Promise<void> = Promise.resolve()
  private creating: Promise<void> | undefined

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly command: () => Promise<string>,
    private readonly cli: OmpConfigCli,
    private readonly output: vscode.OutputChannel,
    private readonly diffBefore: Map<string, string>,
  ) {}

  /** Folder of the active editor, else the first workspace folder, else home. */
  private currentFolder(): string {
    const editor = vscode.window.activeTextEditor
    const folder = (editor && vscode.workspace.getWorkspaceFolder(editor.document.uri)) ?? vscode.workspace.workspaceFolders?.[0]
    return folder?.uri.fsPath ?? homedir()
  }

  private host(cwd: string): OmpHost {
    let host = this.hosts.get(cwd)
    if (host === undefined) {
      host = new OmpHost(this.command, () => cwd, {
        item: (s, item) => { this.markUnread(s.id); this.queueUpsert(s.id, item) },
        reset: s => { this.pending.delete(s.id); this.postTab(s.id, { type: 'reset', tab: s.id, items: s.transcript.items }) },
        state: s => {
          if (!s.busy) this.flushUpserts()
          const was = this.wasBusy.get(s.id) ?? false
          this.wasBusy.set(s.id, s.busy)
          if (was && !s.busy) this.notifyDone(s)
          this.postTab(s.id, { type: 'tab', tab: this.tabState(s) }); this.tickTitles()
          // Sidebar follows title changes (omp names a session after its first turn) and turn ends.
          if (!s.busy || s.title !== this.lastTitles.get(s.id)) { this.lastTitles.set(s.id, s.title); this.refreshSidebar() }
          if (!s.busy) void this.refreshTabStats(s.id)
        },
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

  /** Current git branch of `cwd` from VS Code's git extension (no git process of our own). */
  private branch(cwd: string): string | undefined {
    const git = vscode.extensions.getExtension<{ getAPI(v: 1): { repositories: { rootUri: vscode.Uri; state: { HEAD?: { name?: string } } }[] } }>('vscode.git')
    if (!git?.isActive) return undefined
    const norm = (p: string) => p.replace(/\\/gu, '/').toLowerCase()
    const repo = git.exports.getAPI(1).repositories.filter(r => norm(cwd).startsWith(norm(r.rootUri.fsPath))).sort((a, b) => b.rootUri.fsPath.length - a.rootUri.fsPath.length)[0]
    return repo?.state.HEAD?.name
  }

  /** Streaming sends one update per token; send each changed item at most every 50 ms (latest copy wins). */
  private pending = new Map<string, Map<string, import('./types.ts').ChatItem>>()
  private flushTimer: ReturnType<typeof setTimeout> | undefined
  private queueUpsert(tab: string, item: import('./types.ts').ChatItem): void {
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

  private tab(id: string | undefined) { return this.tabs.find(t => t.session.id === id) }

  private markUnread(id: string): void {
    const t = this.tab(id)
    if (t && !t.panel.active && !t.unread) { t.unread = true; this.tickTitles() }
  }

  private tabState(s: OmpSession): TabState {
    const t = this.tab(s.id)
    return {
      id: s.id, busy: s.busy, queued: s.queue.length, thinkingLevels: s.thinkingLevels, modes: s.modes, commands: s.commands, usage: s.usage,
      ...s.title ? { title: s.title } : {}, ...s.model ? { model: s.model } : {}, ...s.thinking ? { thinking: s.thinking } : {}, ...s.mode ? { mode: s.mode } : {},
      ...t?.unread ? { unread: true } : {},
      ...t ? { folder: t.cwd.replace(/\\/gu, '/').split('/').filter(Boolean).pop() ?? t.cwd, startedAt: t.startedAt } : {},
      ...t && this.branch(t.cwd) ? { branch: this.branch(t.cwd)! } : {},
      ...t?.stats ? { stats: t.stats } : {},
    }
  }

  /** Each panel gets only its own tab; the sidebar gets the list (to mark open sessions). */
  private postTabs(): void {
    for (const t of this.tabs) this.postTab(t.session.id, { type: 'tabs', tabs: [this.tabState(t.session)], active: t.session.id, models: this.models, cwd: t.cwd })
    this.post({ type: 'tabs', tabs: this.tabs.map(t => this.tabState(t.session)), models: this.models, cwd: this.currentFolder() })
  }

  private postTab(id: string, message: HostMessage): void { void this.tab(id)?.panel.webview.postMessage(message) }

  /** Editor tab titles: braille spinner while omp works, ● when it finished out of sight. */
  private tickTitles(): void {
    this.spinAt = (this.spinAt + 1) % SPIN.length
    for (const t of this.tabs) {
      const name = (t.session.title ?? 'New chat').replace(/\s+/gu, ' ').slice(0, 40)
      const title = t.session.busy ? `${SPIN[this.spinAt]} ${name}` : t.unread ? `● ${name}` : name
      if (t.panel.title !== title) t.panel.title = title
    }
  }

  /** Open a chat panel for `session` next to the other chats (or beside the editor). */
  private openPanel(session: OmpSession, cwd: string, restored?: vscode.WebviewPanel): void {
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media')
    const column = this.tab(this.active)?.panel.viewColumn ?? vscode.ViewColumn.Beside
    const panel = restored ?? vscode.window.createWebviewPanel(PANEL_TYPE, session.title ?? 'New chat', { viewColumn: column, preserveFocus: false }, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [media] })
    if (restored) panel.webview.options = { enableScripts: true, localResourceRoots: [media] }
    panel.iconPath = vscode.Uri.joinPath(media, 'pi-tab.svg')
    panel.webview.html = this.html(panel.webview, media, 'panel', { sessionId: session.id, cwd })
    const entry = { session, cwd, unread: false, panel, startedAt: Date.now() }
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

  /** omp's sessions for the current folder, with stats from omp's session files. */
  private async sessionRows() {
    const cwd = this.currentFolder()
    const rows = await this.host(cwd).list()
    const stats = await sessionStats(cwd, new Set(rows.map(r => r.sessionId))).catch(() => ({} as Record<string, never>))
    return rows.map(r => {
      const live = this.tab(r.sessionId)?.session.title
      return { ...r, ...live && live !== r.title ? { title: live } : {}, ...stats[r.sessionId] ? { stats: stats[r.sessionId] } : {} }
    })
  }

  private readonly lastTitles = new Map<string, string | undefined>()
  private readonly wasBusy = new Map<string, boolean>()

  /** A chat finished while you were elsewhere: toast with a jump back (setting ohMyPi.notifyOnDone). */
  private notifyDone(s: OmpSession): void {
    const t = this.tab(s.id)
    if (!t || (t.panel.active && vscode.window.state.focused)) return
    if (!vscode.workspace.getConfiguration('ohMyPi').get<boolean>('notifyOnDone', true)) return
    const last = [...s.transcript.items].reverse().find(i => i.type === 'assistant' || i.type === 'error')
    const summary = last && 'text' in last ? last.text.replace(/\s+/gu, ' ').slice(0, 90) : ''
    const name = (s.title ?? 'Chat').replace(/^\S*\s*/u, m => /\p{Extended_Pictographic}/u.test(m) ? '' : m)
    void vscode.window.showInformationMessage(`OMP finished: ${name}${summary ? ` — ${summary}` : ''}`, 'Open').then(p => { if (p) t.panel.reveal() })
  }
  private sidebarTimer: ReturnType<typeof setTimeout> | undefined
  /** Debounced: re-list sessions in the sidebar after a turn ends. */
  private refreshSidebar(): void {
    clearTimeout(this.sidebarTimer)
    this.sidebarTimer = setTimeout(() => { void this.sessionRows().then(rows => this.post({ type: 'sessions', rows }), () => {}) }, 600)
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

  /** Re-read omp's session file for one tab and push the totals to its status line. */
  private async refreshTabStats(id: string): Promise<void> {
    const t = this.tab(id)
    if (t === undefined) return
    const got = (await sessionStats(t.cwd, new Set([id])).catch(() => ({})) as Record<string, import('./types.ts').SessionStats>)[id]
    if (got === undefined) return
    t.stats = got
    this.postTab(id, { type: 'tab', tab: this.tabState(t.session) })
  }

  /** Ctrl+Alt+P: show the last chat, or start one. */
  focusChat(): void {
    const t = this.tab(this.active) ?? this.tabs.at(-1)
    if (t) t.panel.reveal(); else void this.newTab()
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media')
    view.webview.options = { enableScripts: true, localResourceRoots: [media] }
    view.webview.html = this.html(view.webview, media, 'sidebar')
    view.webview.onDidReceiveMessage((m: WebviewMessage) => { void this.onMessage(m, undefined) })
  }

  private post(message: HostMessage): void { void this.view?.webview.postMessage(message) }

  private postSettings(status: 'loading' | 'ready' | 'error', error?: string): void {
    this.post({ type: 'settings', status, ...error ? { error } : {}, settings: this.settings, models: this.models, failed: this.failed })
  }

  private async loadModels(): Promise<void> {
    try { this.models = await this.cli.models() } catch (error) { this.output.appendLine(`models: ${String(error)}`) }
    this.postTabs()
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

  private closeTab(id: string): void { this.tab(id)?.panel.dispose() }

  private activate(id: string): void { this.tab(id)?.panel.reveal() }

  /** When the editor moves to another workspace folder, new tabs follow it (open tabs keep their folder). */
  folderMaybeChanged(): void { this.postTabs() }

  /** @param from - tab id of the sending chat panel, undefined for the sidebar. */
  private async onMessage(m: WebviewMessage, from: string | undefined): Promise<void> {
    const reply = (msg: HostMessage) => { if (from === undefined) this.post(msg); else this.postTab(from, msg) }
    try {
      switch (m.type) {
        case 'ready': {
          void this.loadModels()
          void this.cli.get(APPROVAL_KEY).then(value => reply({ type: 'approval', value }), () => {})
          this.postTabs()
          const t = this.tab(from)
          if (t) reply({ type: 'reset', tab: t.session.id, items: t.session.transcript.items })
          else reply({ type: 'sessions', rows: await this.sessionRows() })
          return
        }
        case 'newTab': await this.newTab(); return
        case 'closeTab': this.closeTab(m.tab); return
        case 'activate': this.activate(m.tab); return
        case 'prompt': {
          const t = this.tab(m.tab)
          if (t === undefined) return
          await this.hosts.get(t.cwd)!.ready(t.session)
          t.session.prompt(m.text, m.images ?? [])
          return
        }
        case 'cancel': this.tab(m.tab)?.session.cancel(); return
        case 'setModel': await this.tab(m.tab)?.session.setOption('model', m.value); return
        case 'setThinking': await this.tab(m.tab)?.session.setOption('thinking', m.value); return
        case 'setMode': await this.tab(m.tab)?.session.setMode(m.value); return
        case 'openFile': await this.openFile(m.path, m.line); return
        case 'openDiff': await this.openDiff(m.tab, m.toolId); return
        case 'listSessions': reply({ type: 'sessions', rows: await this.sessionRows() }); return
        case 'loadSession': {
          const cwd = this.currentFolder()
          const existing = this.tab(m.sessionId)
          if (existing === undefined) {
            const rows = await this.host(cwd).list()
            const row = rows.find(r => r.sessionId === m.sessionId) ?? { sessionId: m.sessionId, cwd }
            this.openPanel(await this.host(cwd).open(row), cwd)
          } else this.activate(m.sessionId)
          return
        }
        case 'fork': {
          const t = this.tab(m.tab)
          if (t === undefined) return
          // omp refuses to fork while a turn runs; offer to stop it first.
          if (t.session.busy) {
            const pick = await vscode.window.showWarningMessage('omp is still working in this chat. Stop the current turn and fork?', { modal: true }, 'Stop and fork')
            if (pick !== 'Stop and fork') return
            t.session.cancel()
            for (let i = 0; i < 50 && t.session.busy; i++) await new Promise(r => setTimeout(r, 100))
          }
          this.openPanel(await this.hosts.get(t.cwd)!.fork(t.session), t.cwd)
          return
        }
        case 'setApproval':
          await this.cli.set({ key: APPROVAL_KEY, type: 'enum', options: [...APPROVAL_MODES] }, m.value)
          for (const x of this.tabs) this.postTab(x.session.id, { type: 'approval', value: m.value })
          return
        case 'addSelection': this.addSelection(); return
        case 'mentionPaths': {
          // Workspace files become relative @paths; anything outside stays absolute.
          const rel = m.paths.map(p => { const r = vscode.workspace.asRelativePath(vscode.Uri.file(p), false).replace(/\\/gu, '/'); return /^[A-Za-z]:\//u.test(r) || r.startsWith('/') ? p : r })
          reply({ type: 'insert', inline: true, text: rel.map(r => `@${r.includes(' ') ? `"${r}"` : r}`).join(' ') + ' ' })
          return
        }
        case 'exportChat': {
          const t = this.tab(m.tab)
          const name = (t?.session.title ?? 'omp-chat').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 60) || 'omp-chat'
          const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.joinPath(vscode.Uri.file(t?.cwd ?? this.currentFolder()), `${name}.md`), filters: { Markdown: ['md'] } })
          if (!target) return
          await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(m.markdown))
          void vscode.window.showInformationMessage(`Chat exported to ${vscode.workspace.asRelativePath(target)}`, 'Open').then(p => { if (p) void vscode.window.showTextDocument(target) })
          return
        }
        case 'permit': this.tab(m.tab)?.session.choose(m.itemId, m.optionId); return
        case 'answer': this.tab(m.tab)?.session.answer(m.itemId, m.action, m.content); return
        case 'rewind': await this.rewind(m.tab, m.itemId); return
        case 'agentSteps': {
          const t = this.tab(m.tab)
          const got = t ? await agentSteps(t.cwd, t.session.id, m.name) : undefined
          if (got) reply({ type: 'agentSteps', toolId: m.toolId, name: m.name, ...got })
          return
        }
        case 'loadSettings': await this.refreshSettings(); return
        case 'setSetting': this.writeSetting(m.key, m.value); return
        case 'resetSetting': this.resetSetting(m.key); return
        case 'findFiles': reply({ type: 'files', query: m.query, files: await this.findFiles(m.query, this.tab(from)?.cwd) }); return
      }
    } catch (error) {
      const e = error as { message?: string; data?: unknown }
      const detail = typeof e?.data === 'string' ? e.data : typeof (e?.data as { message?: unknown })?.message === 'string' ? (e.data as { message: string }).message : e?.data ? JSON.stringify(e.data) : ''
      const text = [String(e?.message ?? error), detail].filter(Boolean).join(': ')
      this.output.appendLine(`${m.type}: ${text}`)
      void vscode.window.showErrorMessage(`Oh My Pi: ${text}`)
    }
  }

  /** Workspace files matching an @-mention query (fuzzy on path segments), relative to the tab folder. */
  private async findFiles(query: string, folder?: string): Promise<string[]> {
    const cwd = folder ?? this.currentFolder()
    const base = vscode.Uri.file(cwd)
    const q = query.replace(/\\/g, '/').toLowerCase()
    const glob = q ? `**/*${q.split('/').pop()!.replace(/[[\]{}*?]/g, '')}*` : '**/*'
    const found = await vscode.workspace.findFiles(new vscode.RelativePattern(base, glob), '**/{node_modules,.git,dist,build,out,.next,coverage}/**', 400)
    const rel = found.map(u => vscode.workspace.asRelativePath(u, false).replace(/\\/g, '/'))
    const score = (p: string) => { const l = p.toLowerCase(); const name = l.split('/').pop()!; return (name.startsWith(q) ? 0 : name.includes(q) ? 1 : l.includes(q) ? 2 : 3) * 1000 + p.length }
    return rel.filter(p => !q || p.toLowerCase().includes(q.split('/').pop()!)).sort((a, b) => score(a) - score(b)).slice(0, 30)
  }

  private async refreshSettings(): Promise<void> {
    this.postSettings('loading')
    try {
      const [settings, models] = await Promise.all([this.cli.list(), this.cli.models()])
      this.settings = settings; this.models = models
      this.postSettings('ready')
    } catch (error) {
      this.postSettings('error', String((error as Error)?.message ?? error))
    }
  }

  /** Writes run one at a time in the background; the UI updates immediately (optimistic). */
  private writeSetting(key: string, value: AgentSetting['value']): void {
    const setting = this.settings.find(s => s.key === key)
    if (setting === undefined) return
    const previous = setting.value
    setting.value = value
    this.failed = { ...this.failed, [key]: '' }
    this.postSettings('ready')
    this.writes = this.writes.then(() => this.cli.set(setting, value)).catch((error: unknown) => {
      setting.value = previous
      this.failed = { ...this.failed, [key]: String((error as Error)?.message ?? error) }
      this.postSettings('ready')
    })
  }

  private resetSetting(key: string): void {
    this.writes = this.writes.then(async () => {
      await this.cli.reset(key)
      // Defaults are only known to omp; re-read once after the reset.
      this.settings = await this.cli.list()
      this.postSettings('ready')
    }).catch((error: unknown) => {
      this.failed = { ...this.failed, [key]: String((error as Error)?.message ?? error) }
      this.postSettings('ready')
    })
  }

  showView(view: 'history' | 'settings'): void {
    void vscode.commands.executeCommand('ohMyPi.chat.focus')
    this.post({ type: 'view', view })
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

  private async openFile(path: string, line?: number): Promise<void> {
    const cwd = this.tab(this.active)?.cwd ?? this.currentFolder()
    const uri = /^[a-zA-Z]:[\\/]|^\//u.test(path) ? vscode.Uri.file(path) : vscode.Uri.joinPath(vscode.Uri.file(cwd), path)
    const doc = await vscode.workspace.openTextDocument(uri)
    const pos = new vscode.Position(Math.max(0, (line ?? 1) - 1), 0)
    await vscode.window.showTextDocument(doc, { selection: new vscode.Range(pos, pos), preview: true })
  }

  /**
   * Undo file edits omp made after the user message `itemId`, newest first, by reversing each recorded diff.
   * ponytail: only edits seen as diffs are reverted (not bash side effects); a hunk that no longer matches is skipped and reported.
   */
  private async rewind(tabId: string, itemId: string): Promise<void> {
    const t = this.tab(tabId)
    if (t === undefined) return
    const items = t.session.transcript.items
    const from = items.findIndex(i => i.id === itemId)
    const edits = items.slice(from + 1).flatMap(i => i.type === 'tool' && i.card.diff ? [i.card.diff] : []).reverse()
    if (from < 0 || edits.length === 0) { void vscode.window.showInformationMessage('Oh My Pi: no file edits after this message.'); return }
    const files = [...new Set(edits.map(e => vscode.workspace.asRelativePath(e.path)))]
    const ok = await vscode.window.showWarningMessage(`Revert ${edits.length} edit(s) in ${files.length} file(s) made after this message?`, { modal: true, detail: files.join('\n') }, 'Rewind')
    if (ok !== 'Rewind') return
    const skipped: string[] = []
    for (const e of edits) {
      const uri = vscode.Uri.file(e.path)
      let text: string | undefined
      try { text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)) } catch { text = undefined }
      if (text === undefined) { if (e.oldText) await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(e.oldText)); continue }
      if (!e.oldText && text === e.newText) { await vscode.workspace.fs.delete(uri); continue }
      const at = text.indexOf(e.newText)
      if (at < 0) { skipped.push(vscode.workspace.asRelativePath(uri)); continue }
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text.slice(0, at) + e.oldText + text.slice(at + e.newText.length)))
    }
    if (skipped.length) void vscode.window.showWarningMessage(`Oh My Pi: changed since, not reverted: ${[...new Set(skipped)].join(', ')}`)
    else void vscode.window.showInformationMessage(`Oh My Pi: reverted ${edits.length} edit(s).`)
  }

  private async openDiff(tabId: string, toolId: string): Promise<void> {
    const card = this.tab(tabId)?.session.transcript.card(toolId)
    if (card?.diff === undefined) return
    this.diffBefore.set(toolId, card.diff.oldText)
    const file = vscode.Uri.file(card.diff.path)
    const before = vscode.Uri.from({ scheme: DIFF_SCHEME, path: `/${toolId}/${file.path.split('/').pop() ?? 'file'}` })
    await vscode.commands.executeCommand('vscode.diff', before, file, `${vscode.workspace.asRelativePath(file)} (Oh My Pi)`)
  }

  private html(webview: vscode.Webview, media: vscode.Uri, mode: 'panel' | 'sidebar', restore?: { sessionId: string; cwd: string }): string {
    const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join('')
    const script = webview.asWebviewUri(vscode.Uri.joinPath(media, 'chat.js'))
    const style = webview.asWebviewUri(vscode.Uri.joinPath(media, 'chat.css'))
    return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${style}"></head>
<body data-mode="${mode}"${restore ? ` data-session="${encodeURIComponent(restore.sessionId)}" data-cwd="${encodeURIComponent(restore.cwd)}"` : ''}><div id="app"></div><script nonce="${nonce}" src="${script}"></script></body></html>`
  }

  dispose(): void { clearInterval(this.spinner); for (const h of this.hosts.values()) h.dispose() }
}
