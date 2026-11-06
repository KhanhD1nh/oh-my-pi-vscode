/**
 * Self-update from GitHub Releases: the newest release of the repo that carries an `oh-my-pi-<version>.vsix`
 * asset. Checks once a day (and on demand), asks before installing, installs with VS Code's own command.
 */
import * as vscode from 'vscode'
import { newer } from './version.ts'

const REPO = 'KhanhD1nh/oh-my-pi-vscode'
const DAY = 24 * 60 * 60 * 1000
const LAST_CHECK = 'ohMyPi.update.lastCheck'
const SKIPPED = 'ohMyPi.update.skipped'

interface Release { tag_name: string; body?: string; html_url: string; draft: boolean; prerelease: boolean; assets: { name: string; browser_download_url: string }[] }

async function latest(): Promise<{ version: string; url: string; page: string; notes: string } | undefined> {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'oh-my-pi-vscode' } })
  if (!r.ok) return undefined
  const rel = await r.json() as Release
  const asset = rel.assets.find(a => /^oh-my-pi-.*\.vsix$/u.test(a.name))
  if (rel.draft || rel.prerelease || asset === undefined) return undefined
  return { version: rel.tag_name.replace(/^v/u, ''), url: asset.browser_download_url, page: rel.html_url, notes: (rel.body ?? '').split('\n')[0] ?? '' }
}

/**
 * @param manual - run now and report "up to date" (command palette), instead of the silent daily check.
 */
export async function checkForUpdate(context: vscode.ExtensionContext, output: vscode.OutputChannel, manual = false): Promise<void> {
  if (!manual) {
    if (!vscode.workspace.getConfiguration('ohMyPi').get<boolean>('autoUpdate', true)) return
    const last = context.globalState.get<number>(LAST_CHECK, 0)
    if (Date.now() - last < DAY) return
  }
  await context.globalState.update(LAST_CHECK, Date.now())
  const current = String(context.extension.packageJSON.version)
  let rel
  try { rel = await latest() } catch (error) { output.appendLine(`update check: ${String(error)}`); if (manual) void vscode.window.showWarningMessage('OMP: could not reach GitHub to check for updates.'); return }
  if (rel === undefined || !newer(rel.version, current)) { if (manual) void vscode.window.showInformationMessage(`OMP ${current} is up to date.`); return }
  if (!manual && context.globalState.get<string>(SKIPPED) === rel.version) return
  const pick = await vscode.window.showInformationMessage(`OMP ${rel.version} is available (you have ${current}).${rel.notes ? ` ${rel.notes}` : ''}`, 'Install', 'Release notes', 'Skip this version')
  if (pick === 'Release notes') { void vscode.env.openExternal(vscode.Uri.parse(rel.page)); return }
  if (pick === 'Skip this version') { await context.globalState.update(SKIPPED, rel.version); return }
  if (pick !== 'Install') return
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Installing OMP ${rel.version}…` }, async () => {
    const res = await fetch(rel.url, { headers: { 'User-Agent': 'oh-my-pi-vscode' } })
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`)
    const file = vscode.Uri.joinPath(context.globalStorageUri, `oh-my-pi-${rel.version}.vsix`)
    await vscode.workspace.fs.createDirectory(context.globalStorageUri)
    await vscode.workspace.fs.writeFile(file, new Uint8Array(await res.arrayBuffer()))
    await vscode.commands.executeCommand('workbench.extensions.installExtension', file)
  }).then(async () => {
    const r = await vscode.window.showInformationMessage(`OMP ${rel.version} installed. Reload to use it.`, 'Reload now')
    if (r) void vscode.commands.executeCommand('workbench.action.reloadWindow')
  }, (error: unknown) => {
    output.appendLine(`update install: ${String(error)}`)
    void vscode.window.showErrorMessage(`OMP update failed: ${String((error as Error)?.message ?? error)}`)
  })
}
