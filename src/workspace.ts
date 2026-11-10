/**
 * Editor and file-system actions the chat triggers: @-file search, open a file or a diff, revert omp's edits,
 * turn dropped paths into @mentions, save a chat as Markdown.
 */
import * as vscode from 'vscode'
import type { ChatItem, ToolCard } from './types.ts'

/** Read-only "before" side of diffs: oh-my-pi-diff:/<toolId>/<file>. */
export const DIFF_SCHEME = 'oh-my-pi-diff'

/** Workspace files matching an @-mention query (fuzzy on path segments), relative to `cwd`. */
export async function findFiles(query: string, cwd: string): Promise<string[]> {
  const base = vscode.Uri.file(cwd)
  const q = query.replace(/\\/g, '/').toLowerCase()
  const glob = q ? `**/*${q.split('/').pop()!.replace(/[[\]{}*?]/g, '')}*` : '**/*'
  const found = await vscode.workspace.findFiles(new vscode.RelativePattern(base, glob), '**/{node_modules,.git,dist,build,out,.next,coverage}/**', 400)
  const rel = found.map(u => vscode.workspace.asRelativePath(u, false).replace(/\\/g, '/'))
  const score = (p: string) => { const l = p.toLowerCase(); const name = l.split('/').pop()!; return (name.startsWith(q) ? 0 : name.includes(q) ? 1 : l.includes(q) ? 2 : 3) * 1000 + p.length }
  return rel.filter(p => !q || p.toLowerCase().includes(q.split('/').pop()!)).sort((a, b) => score(a) - score(b)).slice(0, 30)
}

/** Open `path` (absolute, or relative to `cwd`) at `line`. */
export async function openFile(cwd: string, path: string, line?: number): Promise<void> {
  const uri = /^[a-zA-Z]:[\\/]|^\//u.test(path) ? vscode.Uri.file(path) : vscode.Uri.joinPath(vscode.Uri.file(cwd), path)
  const doc = await vscode.workspace.openTextDocument(uri)
  const pos = new vscode.Position(Math.max(0, (line ?? 1) - 1), 0)
  await vscode.window.showTextDocument(doc, { selection: new vscode.Range(pos, pos), preview: true })
}

/** VS Code's diff view for an edit card: the recorded old text against the file on disk. */
export async function openDiff(card: ToolCard | undefined, toolId: string, diffBefore: Map<string, string>): Promise<void> {
  if (card?.diff === undefined) return
  diffBefore.set(toolId, card.diff.oldText)
  const file = vscode.Uri.file(card.diff.path)
  const before = vscode.Uri.from({ scheme: DIFF_SCHEME, path: `/${toolId}/${file.path.split('/').pop() ?? 'file'}` })
  await vscode.commands.executeCommand('vscode.diff', before, file, `${vscode.workspace.asRelativePath(file)} (Oh My Pi)`)
}

/** Open one diff per file changed between prompt `itemId` and the next prompt (first old text vs the file now). */
export async function openTurnDiff(items: ChatItem[], itemId: string, diffBefore: Map<string, string>): Promise<void> {
  const from = items.findIndex(i => i.id === itemId)
  if (from < 0) return
  let to = items.findIndex((i, n) => n > from && i.type === 'user'); if (to < 0) to = items.length
  const first = new Map<string, { toolId: string; old: string }>()
  for (const it of items.slice(from + 1, to)) if (it.type === 'tool' && it.card.diff && !first.has(it.card.diff.path)) first.set(it.card.diff.path, { toolId: it.card.id, old: it.card.diff.oldText })
  if (!first.size) { void vscode.window.showInformationMessage('OMP: this turn changed no files.'); return }
  for (const [path, { toolId, old }] of first) {
    diffBefore.set(toolId, old)
    const file = vscode.Uri.file(path)
    const before = vscode.Uri.from({ scheme: DIFF_SCHEME, path: `/${toolId}/${file.path.split('/').pop() ?? 'file'}` })
    await vscode.commands.executeCommand('vscode.diff', before, file, `${vscode.workspace.asRelativePath(file)} (turn, Oh My Pi)`, { preview: false })
  }
}

/**
 * Undo file edits omp made after the user message `itemId`, newest first, by reversing each recorded diff.
 * ponytail: only edits seen as diffs are reverted (not bash side effects); a hunk that no longer matches is skipped and reported.
 * @param quiet - no "nothing to revert" toast (when called as part of another action).
 */
export async function revertEditsAfter(items: ChatItem[], itemId: string, quiet = false): Promise<void> {
  const from = items.findIndex(i => i.id === itemId)
  const edits = items.slice(from + 1).flatMap(i => i.type === 'tool' && i.card.diff ? [i.card.diff] : []).reverse()
  if (from < 0 || edits.length === 0) { if (!quiet) void vscode.window.showInformationMessage('OMP: no file edits after this message.'); return }
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

/** Dropped paths as @mentions: workspace files relative, anything outside absolute; quoted when they contain spaces. */
export function mentionText(paths: string[]): string {
  const rel = paths.map(p => { const r = vscode.workspace.asRelativePath(vscode.Uri.file(p), false).replace(/\\/gu, '/'); return /^[A-Za-z]:\//u.test(r) || r.startsWith('/') ? p : r })
  return rel.map(r => `@${r.includes(' ') ? `"${r}"` : r}`).join(' ') + ' '
}

/** Ask where to save, write the chat's Markdown, offer to open it. */
export async function exportChat(title: string | undefined, cwd: string, markdown: string): Promise<void> {
  const name = (title ?? 'omp-chat').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 60) || 'omp-chat'
  const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.joinPath(vscode.Uri.file(cwd), `${name}.md`), filters: { Markdown: ['md'] } })
  if (!target) return
  await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(markdown))
  void vscode.window.showInformationMessage(`Chat exported to ${vscode.workspace.asRelativePath(target)}`, 'Open').then(p => { if (p) void vscode.window.showTextDocument(target) })
}
