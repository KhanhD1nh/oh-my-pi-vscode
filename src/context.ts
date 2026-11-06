/**
 * "Send to OMP" context: turn what you are looking at in VS Code into prompt text — the selection or file,
 * its problems, a git diff, open tabs, the symbol at the cursor. Each returns Markdown for the chat input.
 */
import * as vscode from 'vscode'
import { gitRepo } from './git.ts'

const rel = (uri: vscode.Uri) => vscode.workspace.asRelativePath(uri, false).replace(/\\/gu, '/')
const fence = (lang: string, body: string) => `\`\`\`${lang}\n${body.replace(/\n$/u, '')}\n\`\`\``
const SEV = ['error', 'warning', 'info', 'hint'] as const

function problemLines(uri: vscode.Uri, list: readonly vscode.Diagnostic[], min: vscode.DiagnosticSeverity): string[] {
  return list.filter(d => d.severity <= min).map(d => `- \`${rel(uri)}:${d.range.start.line + 1}:${d.range.start.character + 1}\` ${SEV[d.severity]}: ${d.message.split('\n')[0]}${d.source ? ` (${d.source}${d.code !== undefined ? ` ${typeof d.code === 'object' ? d.code.value : d.code}` : ''})` : ''}`)
}

/** Selection (or whole file when nothing is selected) with its path and line range. */
export function selectionContext(editor: vscode.TextEditor): string {
  const doc = editor.document
  const sel = editor.selection
  if (sel.isEmpty) return `@${rel(doc.uri)}`
  const range = sel.start.line === sel.end.line ? `${sel.start.line + 1}` : `${sel.start.line + 1}-${sel.end.line + 1}`
  return `@${rel(doc.uri)}#L${range}\n${fence(doc.languageId, doc.getText(sel))}`
}

/** Errors and warnings of one file, or of the whole workspace. */
export function problemsContext(uri?: vscode.Uri): string | undefined {
  const min = vscode.DiagnosticSeverity.Warning
  const all = uri ? [[uri, vscode.languages.getDiagnostics(uri)] as const] : vscode.languages.getDiagnostics()
  const lines = all.flatMap(([u, list]) => problemLines(u, list, min))
  if (lines.length === 0) return undefined
  const cap = 200
  return [`Problems${uri ? ` in @${rel(uri)}` : ' in the workspace'} (${lines.length}):`, ...lines.slice(0, cap), ...lines.length > cap ? [`- … ${lines.length - cap} more`] : []].join('\n')
}

/** Every open editor tab with a file behind it, as @mentions. */
export function openTabsContext(): string | undefined {
  const uris = vscode.window.tabGroups.all.flatMap(g => g.tabs).map(t => t.input).flatMap(i => i instanceof vscode.TabInputText || i instanceof vscode.TabInputTextDiff ? [i instanceof vscode.TabInputText ? i.uri : i.modified] : [])
  const seen = [...new Set(uris.filter(u => u.scheme === 'file').map(rel))]
  return seen.length ? `Open files:\n${seen.map(p => `- @${p}`).join('\n')}` : undefined
}

/** The innermost function/class/method around the cursor, with its source. */
export async function symbolContext(editor: vscode.TextEditor): Promise<string | undefined> {
  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[] | undefined>('vscode.executeDocumentSymbolProvider', editor.document.uri)
  const pos = editor.selection.active
  let best: vscode.DocumentSymbol | undefined
  const walk = (list: vscode.DocumentSymbol[] | undefined) => { for (const s of list ?? []) if (s.range.contains(pos)) { best = s; walk(s.children) } }
  walk(symbols)
  if (best === undefined) return undefined
  const r = best.range
  return `${vscode.SymbolKind[best.kind]} \`${best.name}\` in @${rel(editor.document.uri)}#L${r.start.line + 1}-${r.end.line + 1}\n${fence(editor.document.languageId, editor.document.getText(r))}`
}

/** Uncommitted changes of a file against HEAD (staged and unstaged), via VS Code's git extension. */
export async function gitDiffContext(uri: vscode.Uri): Promise<string | undefined> {
  const repo = gitRepo(uri.fsPath)
  if (repo === undefined) return undefined
  const diff = (await repo.diffWithHEAD(uri.fsPath)).trim()
  if (!diff) return undefined
  const cap = 40_000
  return `Uncommitted changes in @${rel(uri)}:\n${fence('diff', diff.length > cap ? `${diff.slice(0, cap)}\n… (truncated)` : diff)}`
}

/** Files picked in the Explorer (one or many). */
export function filesContext(uris: vscode.Uri[]): string {
  return uris.map(u => `@${rel(u)}`).join(' ')
}
