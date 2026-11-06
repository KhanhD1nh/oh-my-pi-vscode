/** VS Code's built-in git extension, for the repo that contains a path (no git process of our own). */
import * as vscode from 'vscode'

export interface GitRepo {
  rootUri: vscode.Uri
  state: { HEAD?: { name?: string } }
  diffWithHEAD(path: string): Promise<string>
}

/** The innermost repository containing `fsPath`, or undefined (no git extension, or not in a repo). */
export function gitRepo(fsPath: string): GitRepo | undefined {
  const git = vscode.extensions.getExtension<{ getAPI(v: 1): { repositories: GitRepo[] } }>('vscode.git')
  if (!git?.isActive) return undefined
  const norm = (p: string) => p.replace(/\\/gu, '/').toLowerCase()
  return git.exports.getAPI(1).repositories
    .filter(r => norm(fsPath).startsWith(norm(r.rootUri.fsPath)))
    .sort((a, b) => b.rootUri.fsPath.length - a.rootUri.fsPath.length)[0]
}

/** Current branch name of the repo containing `cwd`. */
export function branchOf(cwd: string): string | undefined {
  return gitRepo(cwd)?.state.HEAD?.name
}
