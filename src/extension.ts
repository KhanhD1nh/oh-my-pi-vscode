/**
 * Oh My Pi for VS Code: a sidebar chat backed by `omp acp`. omp is the agent; this extension renders its
 * stream, tool cards and diffs, edits omp's own settings, and wires VS Code niceties (tabs per session,
 * open file, diff view, @-file mentions, add selection, permission prompts).
 */
import { homedir } from 'node:os'
import * as vscode from 'vscode'
import { OmpHost, type OmpSession } from './agent.ts'
import { resolveOmp } from './binary.ts'
import { OmpConfigCli } from './settings.ts'
import type { AgentModelChoice, AgentSetting, HostMessage, TabState, WebviewMessage } from './types.ts'

const DIFF_SCHEME = 'oh-my-pi-diff'

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
    vscode.commands.registerCommand('ohMyPi.newSession', () => provider.newTab()),
    vscode.commands.registerCommand('ohMyPi.history', () => provider.showView('history')),
    vscode.commands.registerCommand('ohMyPi.settings', () => provider.showView('settings')),
    vscode.commands.registerCommand('ohMyPi.focus', () => vscode.commands.executeCommand('ohMyPi.chat.focus')),
    vscode.commands.registerCommand('ohMyPi.addSelection', () => provider.addSelection()),
    vscode.window.onDidChangeActiveTextEditor(() => provider.folderMaybeChanged()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.folderMaybeChanged()),
    { dispose: () => provider.dispose() },
  )
}

export function deactivate(): void {}

/** Tabs and their omp sessions; one omp process per workspace folder. */
class ChatViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined
  /** omp process per workspace folder path. */
  private readonly hosts = new Map<string, OmpHost>()
  /** Open tabs in display order: session + the folder it runs in. */
  private tabs: { session: OmpSession; cwd: string; unread: boolean }[] = []
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
        item: (s, item) => { this.markUnread(s.id); this.post({ type: 'upsert', tab: s.id, item }) },
        reset: s => { this.post({ type: 'reset', tab: s.id, items: s.transcript.items }) },
        state: s => { this.post({ type: 'tab', tab: this.tabState(s) }) },
        permission: async (s, title, options) => {
          const where = s?.title ? ` (${s.title})` : ''
          const pick = await vscode.window.showInformationMessage(`Oh My Pi${where}: ${title}`, { modal: true }, ...options.map(o => o.name))
          return options.find(o => o.name === pick)?.optionId
        },
        log: line => { this.output.appendLine(line) },
      })
      this.hosts.set(cwd, host)
    }
    return host
  }

  private tab(id: string | undefined) { return this.tabs.find(t => t.session.id === id) }

  private markUnread(id: string): void {
    const t = this.tab(id)
    if (t && id !== this.active && !t.unread) { t.unread = true; this.post({ type: 'tab', tab: this.tabState(t.session) }) }
  }

  private tabState(s: OmpSession): TabState {
    const t = this.tab(s.id)
    return {
      id: s.id, busy: s.busy, queued: s.queue.length, thinkingLevels: s.thinkingLevels, modes: s.modes, commands: s.commands, usage: s.usage,
      ...s.title ? { title: s.title } : {}, ...s.model ? { model: s.model } : {}, ...s.thinking ? { thinking: s.thinking } : {}, ...s.mode ? { mode: s.mode } : {},
      ...t?.unread ? { unread: true } : {},
    }
  }

  private postTabs(): void {
    this.post({ type: 'tabs', tabs: this.tabs.map(t => this.tabState(t.session)), models: this.models, cwd: this.tab(this.active)?.cwd ?? this.currentFolder(), ...this.active ? { active: this.active } : {} })
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media')
    view.webview.options = { enableScripts: true, localResourceRoots: [media] }
    view.webview.html = this.html(view.webview, media)
    view.webview.onDidReceiveMessage((m: WebviewMessage) => { void this.onMessage(m) })
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
      const cwd = this.currentFolder()
      const session = await this.host(cwd).create({ ...from?.model ? { model: from.model } : {}, ...from?.thinking ? { thinking: from.thinking } : {} })
      this.tabs.push({ session, cwd, unread: false })
      this.active = session.id
      this.postTabs()
      this.post({ type: 'reset', tab: session.id, items: [] })
      this.post({ type: 'view', view: 'chat' })
    }
    const prev = this.creating ?? Promise.resolve()
    const next = prev.then(run, run)
    this.creating = next.finally(() => { if (this.creating === next) this.creating = undefined })
    await next
  }

  private closeTab(id: string): void {
    const i = this.tabs.findIndex(t => t.session.id === id)
    if (i < 0) return
    const [t] = this.tabs.splice(i, 1)
    this.hosts.get(t!.cwd)?.close(id)
    if (this.active === id) this.active = (this.tabs[i] ?? this.tabs[i - 1])?.session.id
    this.postTabs()
    if (this.active) this.activate(this.active)
    else void this.newTab()
  }

  private activate(id: string): void {
    const t = this.tab(id)
    if (t === undefined) return
    this.active = id
    t.unread = false
    this.postTabs()
    this.post({ type: 'reset', tab: id, items: t.session.transcript.items })
  }

  /** When the editor moves to another workspace folder, new tabs follow it (open tabs keep their folder). */
  folderMaybeChanged(): void {
    this.post({ type: 'tabs', tabs: this.tabs.map(t => this.tabState(t.session)), models: this.models, cwd: this.tab(this.active)?.cwd ?? this.currentFolder(), ...this.active ? { active: this.active } : {} })
  }

  private async onMessage(m: WebviewMessage): Promise<void> {
    try {
      switch (m.type) {
        case 'ready': {
          void this.loadModels()
          if (this.tabs.length === 0) await this.newTab()
          else { this.postTabs(); if (this.active) this.activate(this.active) }
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
        case 'listSessions': this.post({ type: 'sessions', rows: await this.host(this.currentFolder()).list() }); return
        case 'loadSession': {
          const cwd = this.currentFolder()
          const existing = this.tab(m.sessionId)
          if (existing === undefined) {
            const rows = await this.host(cwd).list()
            const row = rows.find(r => r.sessionId === m.sessionId) ?? { sessionId: m.sessionId, cwd }
            const session = await this.host(cwd).open(row)
            this.tabs.push({ session, cwd, unread: false })
          }
          this.activate(m.sessionId)
          this.post({ type: 'view', view: 'chat' })
          return
        }
        case 'loadSettings': await this.refreshSettings(); return
        case 'setSetting': this.writeSetting(m.key, m.value); return
        case 'resetSetting': this.resetSetting(m.key); return
        case 'findFiles': this.post({ type: 'files', query: m.query, files: await this.findFiles(m.query) }); return
      }
    } catch (error) {
      const text = String((error as Error)?.message ?? error)
      this.output.appendLine(`${m.type}: ${text}`)
      void vscode.window.showErrorMessage(`Oh My Pi: ${text}`)
    }
  }

  /** Workspace files matching an @-mention query (fuzzy on path segments), relative to the tab folder. */
  private async findFiles(query: string): Promise<string[]> {
    const cwd = this.tab(this.active)?.cwd ?? this.currentFolder()
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
    void vscode.commands.executeCommand('ohMyPi.chat.focus')
    this.post({ type: 'insert', text: `@${rel}#L${range}\n\`\`\`\n${code}\n\`\`\`\n` })
  }

  private async openFile(path: string, line?: number): Promise<void> {
    const cwd = this.tab(this.active)?.cwd ?? this.currentFolder()
    const uri = /^[a-zA-Z]:[\\/]|^\//u.test(path) ? vscode.Uri.file(path) : vscode.Uri.joinPath(vscode.Uri.file(cwd), path)
    const doc = await vscode.workspace.openTextDocument(uri)
    const pos = new vscode.Position(Math.max(0, (line ?? 1) - 1), 0)
    await vscode.window.showTextDocument(doc, { selection: new vscode.Range(pos, pos), preview: true })
  }

  private async openDiff(tabId: string, toolId: string): Promise<void> {
    const card = this.tab(tabId)?.session.transcript.card(toolId)
    if (card?.diff === undefined) return
    this.diffBefore.set(toolId, card.diff.oldText)
    const file = vscode.Uri.file(card.diff.path)
    const before = vscode.Uri.from({ scheme: DIFF_SCHEME, path: `/${toolId}/${file.path.split('/').pop() ?? 'file'}` })
    await vscode.commands.executeCommand('vscode.diff', before, file, `${vscode.workspace.asRelativePath(file)} (Oh My Pi)`)
  }

  private html(webview: vscode.Webview, media: vscode.Uri): string {
    const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join('')
    const script = webview.asWebviewUri(vscode.Uri.joinPath(media, 'chat.js'))
    const style = webview.asWebviewUri(vscode.Uri.joinPath(media, 'chat.css'))
    return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${style}"></head>
<body><div id="app"></div><script nonce="${nonce}" src="${script}"></script></body></html>`
  }

  dispose(): void { for (const h of this.hosts.values()) h.dispose() }
}
