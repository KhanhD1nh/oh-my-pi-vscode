/**
 * Oh My Pi for VS Code: a sidebar chat backed by `omp acp`. omp is the agent; this extension renders its
 * stream, tool cards and diffs, edits omp's own settings, and wires VS Code niceties (open file, diff view,
 * add selection, permission prompts).
 */
import { homedir } from 'node:os'
import * as vscode from 'vscode'
import { OmpAgent } from './agent.ts'
import { resolveOmp } from './binary.ts'
import { OmpConfigCli } from './settings.ts'
import type { AgentModelChoice, AgentSetting, HostMessage, WebviewMessage } from './types.ts'

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
    vscode.commands.registerCommand('ohMyPi.newSession', () => provider.newSession()),
    vscode.commands.registerCommand('ohMyPi.history', () => provider.showView('history')),
    vscode.commands.registerCommand('ohMyPi.settings', () => provider.showView('settings')),
    vscode.commands.registerCommand('ohMyPi.focus', () => vscode.commands.executeCommand('ohMyPi.chat.focus')),
    vscode.commands.registerCommand('ohMyPi.addSelection', () => provider.addSelection()),
    { dispose: () => provider.dispose() },
  )
}

export function deactivate(): void {}

class ChatViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined
  private agent: OmpAgent | undefined
  private models: AgentModelChoice[] = []
  private settings: AgentSetting[] = []
  private saving = ''
  private failed: Record<string, string> = {}

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly command: () => Promise<string>,
    private readonly cli: OmpConfigCli,
    private readonly output: vscode.OutputChannel,
    private readonly diffBefore: Map<string, string>,
  ) {}

  private cwd(): string {
    const editor = vscode.window.activeTextEditor
    const folder = (editor && vscode.workspace.getWorkspaceFolder(editor.document.uri)) ?? vscode.workspace.workspaceFolders?.[0]
    return folder?.uri.fsPath ?? homedir()
  }

  private getAgent(): OmpAgent {
    this.agent ??= new OmpAgent(this.command, this.cwd(), {
      item: item => { this.post({ type: 'upsert', item }) },
      reset: items => { this.post({ type: 'reset', items }) },
      state: () => { this.postState() },
      usage: (used, size, cost) => { this.post({ type: 'usage', ...used === undefined ? {} : { used }, ...size === undefined ? {} : { size }, ...cost === undefined ? {} : { cost } }) },
      permission: async (title, options) => {
        const pick = await vscode.window.showInformationMessage(`Oh My Pi: ${title}`, { modal: true }, ...options.map(o => o.name))
        return options.find(o => o.name === pick)?.optionId
      },
      log: line => { this.output.appendLine(line) },
    })
    return this.agent
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media')
    view.webview.options = { enableScripts: true, localResourceRoots: [media] }
    view.webview.html = this.html(view.webview, media)
    view.webview.onDidReceiveMessage((m: WebviewMessage) => { void this.onMessage(m) })
  }

  private post(message: HostMessage): void { void this.view?.webview.postMessage(message) }

  private postState(): void {
    const a = this.agent
    this.post({
      type: 'state', busy: a?.busy ?? false, models: this.models,
      ...a?.sessionId ? { sessionId: a.sessionId } : {},
      ...a?.model ? { model: a.model } : {},
      ...a?.thinking ? { thinking: a.thinking } : {},
      thinkingLevels: a?.thinkingLevels ?? [],
      ...a?.mode ? { mode: a.mode } : {},
      modes: a?.modes ?? [], commands: a?.commands ?? [],
    })
  }

  private postSettings(status: 'loading' | 'ready' | 'error', error?: string): void {
    this.post({ type: 'settings', status, ...error ? { error } : {}, settings: this.settings, models: this.models, saving: this.saving, failed: this.failed })
  }

  private async loadModels(): Promise<void> {
    try { this.models = await this.cli.models() } catch (error) { this.output.appendLine(`models: ${String(error)}`) }
    this.postState()
  }

  private async onMessage(m: WebviewMessage): Promise<void> {
    try {
      switch (m.type) {
        case 'ready': {
          const agent = this.getAgent()
          this.post({ type: 'reset', items: agent.transcript.items })
          this.postState()
          void this.loadModels()
          await agent.ensure().catch((e: unknown) => { this.post({ type: 'upsert', item: agent.transcript.error(`Could not start omp: ${String((e as Error)?.message ?? e)}`) }) })
          return
        }
        case 'prompt': await this.getAgent().prompt(m.text, m.images ?? []); return
        case 'cancel': this.agent?.cancel(); return
        case 'newSession': await this.newSession(); return
        case 'setModel': await this.getAgent().setOption('model', m.value); return
        case 'setThinking': await this.getAgent().setOption('thinking', m.value); return
        case 'setMode': await this.getAgent().setMode(m.value); return
        case 'openFile': await this.openFile(m.path, m.line); return
        case 'openDiff': await this.openDiff(m.toolId); return
        case 'listSessions': this.post({ type: 'sessions', rows: await this.getAgent().listSessions() }); return
        case 'loadSession': await this.getAgent().loadSession(m.sessionId); this.post({ type: 'view', view: 'chat' }); return
        case 'loadSettings': await this.refreshSettings(); return
        case 'setSetting': await this.writeSetting(m.key, () => this.cli.set(this.settings.find(s => s.key === m.key)!, m.value)); return
        case 'resetSetting': await this.writeSetting(m.key, () => this.cli.reset(m.key)); return
        case 'view': return
      }
    } catch (error) {
      const text = String((error as Error)?.message ?? error)
      this.output.appendLine(`${m.type}: ${text}`)
      void vscode.window.showErrorMessage(`Oh My Pi: ${text}`)
    }
  }

  private async refreshSettings(): Promise<void> {
    this.postSettings('loading')
    try {
      const [settings, models] = await Promise.all([this.cli.list(), this.models.length ? Promise.resolve(this.models) : this.cli.models()])
      this.settings = settings; this.models = models
      this.postSettings('ready')
    } catch (error) {
      this.postSettings('error', String((error as Error)?.message ?? error))
    }
  }

  private async writeSetting(key: string, op: () => Promise<void>): Promise<void> {
    this.saving = key; this.failed = { ...this.failed, [key]: '' }
    this.postSettings('ready')
    try {
      await op()
      this.settings = await this.cli.list()
    } catch (error) {
      this.failed = { ...this.failed, [key]: String((error as Error)?.message ?? error) }
    }
    this.saving = ''
    this.postSettings('ready')
  }

  async newSession(): Promise<void> {
    await this.getAgent().newSession()
    this.post({ type: 'view', view: 'chat' })
  }

  showView(view: 'history' | 'settings'): void {
    void vscode.commands.executeCommand('ohMyPi.chat.focus')
    this.post({ type: 'view', view })
  }

  addSelection(): void {
    const editor = vscode.window.activeTextEditor
    if (editor === undefined || editor.selection.isEmpty) return
    const rel = vscode.workspace.asRelativePath(editor.document.uri)
    const { start, end } = editor.selection
    const range = start.line === end.line ? `${start.line + 1}` : `${start.line + 1}-${end.line + 1}`
    const code = editor.document.getText(editor.selection)
    void vscode.commands.executeCommand('ohMyPi.chat.focus')
    this.post({ type: 'insert', text: `@${rel}#L${range}\n\`\`\`\n${code}\n\`\`\`\n` })
  }

  private async openFile(path: string, line?: number): Promise<void> {
    const uri = /^[a-zA-Z]:[\\/]|^\//u.test(path) ? vscode.Uri.file(path) : vscode.Uri.joinPath(vscode.Uri.file(this.cwd()), path)
    const doc = await vscode.workspace.openTextDocument(uri)
    const pos = new vscode.Position(Math.max(0, (line ?? 1) - 1), 0)
    await vscode.window.showTextDocument(doc, { selection: new vscode.Range(pos, pos), preview: true })
  }

  private async openDiff(toolId: string): Promise<void> {
    const card = this.agent?.transcript.card(toolId)
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

  dispose(): void { this.agent?.dispose() }
}
