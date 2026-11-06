/** The webview page: CSP with a nonce, the bundled script and stylesheet, and which mode it runs in. */
import * as vscode from 'vscode'

/**
 * @param mode - 'panel' (one chat in an editor tab) or 'sidebar' (history + settings).
 * @param restore - session shown in a panel, kept in the page so VS Code can restore it after a reload.
 */
export function webviewHtml(webview: vscode.Webview, media: vscode.Uri, mode: 'panel' | 'sidebar', restore?: { sessionId: string; cwd: string }): string {
  const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join('')
  const script = webview.asWebviewUri(vscode.Uri.joinPath(media, 'chat.js'))
  const style = webview.asWebviewUri(vscode.Uri.joinPath(media, 'chat.css'))
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${style}"></head>
<body data-mode="${mode}"${restore ? ` data-session="${encodeURIComponent(restore.sessionId)}" data-cwd="${encodeURIComponent(restore.cwd)}"` : ''}><div id="app"></div><script nonce="${nonce}" src="${script}"></script></body></html>`
}
