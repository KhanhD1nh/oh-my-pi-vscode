/**
 * Oh My Pi for VS Code: chats in editor tabs backed by `omp acp`, history and settings in the sidebar.
 * This file wires the extension into VS Code (commands, menus, views, startup checks); the chats live in
 * chats.ts, webview messages in messages.ts, editor actions in workspace.ts.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import * as vscode from 'vscode'
import { resolveOmp } from './binary.ts'
import { ChatProvider, PANEL_TYPE } from './chats.ts'
import { checkSessionFormat, installOmpExtensions } from './compat.ts'
import { filesContext, gitDiffContext, openTabsContext, problemsContext, selectionContext, symbolContext } from './context.ts'
import { OmpConfigCli } from './settings.ts'
import { folderKey } from './stats.ts'
import { checkForUpdate } from './update.ts'
import { DIFF_SCHEME } from './workspace.ts'

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Oh My Pi')
  const command = () => resolveOmp(vscode.workspace.getConfiguration('ohMyPi').get<string>('command') || 'omp')
  const cli = new OmpConfigCli(command)

  // Read-only "before" side of diffs: oh-my-pi-diff:/<toolId>/<file>
  const diffBefore = new Map<string, string>()
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, {
    provideTextDocumentContent: uri => diffBefore.get(uri.path.split('/')[1] ?? '') ?? '',
  }))

  const chats = new ChatProvider(context, command, cli, output, diffBefore)
  active = chats
  /** Uri passed by a menu (Explorer / editor context), else the active editor's file. */
  const fileOf = (uri?: vscode.Uri) => uri instanceof vscode.Uri ? uri : vscode.window.activeTextEditor?.document.uri
  context.subscriptions.push(
    output,
    vscode.window.registerWebviewViewProvider('ohMyPi.chat', chats, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.window.registerWebviewPanelSerializer(PANEL_TYPE, { deserializeWebviewPanel: (panel, state) => chats.restorePanel(panel, state as never) }),
    vscode.commands.registerCommand('ohMyPi.newSession', () => chats.newTab()),
    vscode.commands.registerCommand('ohMyPi.lockSshKeys', async () => { const n = await chats.lockAllKeys(); void vscode.window.showInformationMessage(n ? `OMP: removed ${n} SSH key${n > 1 ? 's' : ''} from ssh-agent.` : 'OMP: no SSH key in ssh-agent.') }),
    vscode.commands.registerCommand('ohMyPi.history', () => chats.showView('history')),
    vscode.commands.registerCommand('ohMyPi.settings', () => chats.showView('settings')),
    vscode.commands.registerCommand('ohMyPi.focus', () => chats.focusChat()),
    vscode.commands.registerCommand('ohMyPi.addSelection', () => chats.addSelection()),
    // Send to OMP: each builds prompt text and drops it into the chat input (opening a chat if none).
    vscode.commands.registerCommand('ohMyPi.send.selection', () => { const e = vscode.window.activeTextEditor; if (e) void chats.sendContext(selectionContext(e)) }),
    vscode.commands.registerCommand('ohMyPi.send.problems', (uri?: vscode.Uri) => { const u = fileOf(uri); void chats.sendContext(u ? problemsContext(u) : undefined, 'No errors or warnings in this file.') }),
    vscode.commands.registerCommand('ohMyPi.send.workspaceProblems', () => chats.sendContext(problemsContext(), 'No errors or warnings in the workspace.')),
    vscode.commands.registerCommand('ohMyPi.send.gitDiff', async (uri?: vscode.Uri) => { const u = fileOf(uri); void chats.sendContext(u ? await gitDiffContext(u) : undefined, 'No uncommitted changes in this file (or it is not in a git repository).') }),
    vscode.commands.registerCommand('ohMyPi.send.openTabs', () => chats.sendContext(openTabsContext(), 'No open files.')),
    vscode.commands.registerCommand('ohMyPi.send.symbol', async () => { const e = vscode.window.activeTextEditor; void chats.sendContext(e ? await symbolContext(e) : undefined, 'No function or class at the cursor (or no language support for this file).') }),
    vscode.commands.registerCommand('ohMyPi.send.files', (uri?: vscode.Uri, all?: vscode.Uri[]) => { const list = all?.length ? all : uri ? [uri] : []; void chats.sendContext(list.length ? filesContext(list) : undefined, 'Select files in the Explorer first.') }),
    vscode.commands.registerCommand('ohMyPi.checkForUpdates', () => checkForUpdate(context, output, true)),
    vscode.window.onDidChangeActiveTextEditor(() => chats.folderMaybeChanged()),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('ohMyPi.statusBarButton')) chats.updateStatusItem() }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => chats.folderMaybeChanged()),
    { dispose: () => chats.dispose() },
  )
  chats.updateStatusItem()
  void startupChecks(context, output)
  // Daily, a minute after startup so it never slows activation.
  const t = setTimeout(() => { void checkForUpdate(context, output) }, 60_000)
  context.subscriptions.push({ dispose: () => clearTimeout(t) })
}

let active: ChatProvider | undefined
/** VS Code waits for this: take back SSH keys unlocked from the chat before the window closes. */
export function deactivate(): Promise<void> | undefined { return active?.relockAll() }

/** Bundled omp extensions (fork-from-here, subagent fix) and a check that omp's session files still parse. */
async function startupChecks(context: vscode.ExtensionContext, output: vscode.OutputChannel): Promise<void> {
  try {
    const added = await installOmpExtensions(vscode.Uri.joinPath(context.extensionUri, 'omp-extensions').fsPath, String(context.extension.packageJSON.version))
    if (added.length) output.appendLine(`installed omp extensions: ${added.join(', ')} (take effect when omp restarts)`)
  } catch (error) { output.appendLine(`omp extensions: ${String(error)}`) }
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (folder === undefined) return
  const bad = await checkSessionFormat(join(homedir(), '.omp', 'agent', 'sessions', folderKey(folder))).catch(() => undefined)
  if (bad) {
    output.appendLine(`omp session format changed: ${bad}`)
    void vscode.window.showWarningMessage(`OMP: omp's session files changed shape (${bad}). Usage and status numbers may be wrong until the extension is updated.`)
  }
}
