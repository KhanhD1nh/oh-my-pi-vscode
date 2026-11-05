// Render media/chat.js in Chrome with a fake VS Code host, replaying a realistic session, and screenshot it.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire('D:/WorkSpace/omp-desktop/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/package.json')
const { chromium } = require('playwright-core')
const [out] = process.argv.slice(2)
const css = readFileSync(new URL('../media/chat.css', import.meta.url), 'utf8')
const js = readFileSync(new URL('../media/chat.js', import.meta.url), 'utf8')
const vars = `:root{--vscode-font-family:Segoe UI;--vscode-font-size:13px;--vscode-foreground:#ccc;--vscode-sideBar-background:#181818;--vscode-panel-border:#2b2b2b;--vscode-input-background:#313131;--vscode-input-foreground:#ccc;--vscode-dropdown-background:#313131;--vscode-dropdown-foreground:#ccc;--vscode-descriptionForeground:#9d9d9d;--vscode-textLink-foreground:#4daafc;--vscode-textCodeBlock-background:#2b2b2b;--vscode-button-background:#0078d4;--vscode-button-foreground:#fff;--vscode-list-hoverBackground:#2a2d2e;--vscode-badge-background:#616161;--vscode-badge-foreground:#fff;--vscode-editor-font-family:Consolas;--vscode-errorForeground:#f85149}`
const models = [{ selector: '9router/cx/gpt-6.1-terra', provider: '9router', id: 'cx/gpt-6.1-terra', name: 'GPT-6.1 Terra', reasoning: true }, { selector: '9router/cc/claude-sonnet-5-5', provider: '9router', id: 'cc/claude-sonnet-5-5', name: 'Claude Sonnet 5.5', reasoning: true }]
const items = [
  { type: 'user', id: 'i1', text: 'Fix the date parsing bug in `src/lib/date.ts` and add a test.' },
  { type: 'thought', id: 'i2', text: 'Need to read the file first.' },
  { type: 'tool', id: 't-1', card: { id: '1', kind: 'read', name: 'read', title: 'Reading date helper', status: 'completed', path: 'D:/WorkSpace/XE-VN/src/lib/date.ts', output: '1: export function parse(s) {\n2:   return new Date(s)\n3: }' } },
  { type: 'tool', id: 't-2', card: { id: '2', kind: 'edit', name: 'edit', title: 'Editing date helper', status: 'completed', path: 'D:/WorkSpace/XE-VN/src/lib/date.ts', diff: { path: 'D:/WorkSpace/XE-VN/src/lib/date.ts', oldText: 'export function parse(s) {\n  return new Date(s)\n}', newText: "export function parse(s) {\n  const [d, m, y] = s.split('/')\n  return new Date(+y, +m - 1, +d)\n}" } } },
  { type: 'tool', id: 't-3', card: { id: '3', kind: 'execute', name: 'bash', title: '$ npx vitest run src/lib', status: 'in_progress' } },
  { type: 'assistant', id: 'i3', text: 'Fixed `parse` to read **dd/mm/yyyy** in src/lib/date.ts:2.\n\n- Root cause: `new Date("05/11/2026")` is parsed as US month-first.\n- Added a regression test.' },
]
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 420, height: 860 } })
page.on('pageerror', e => console.log('PAGEERROR', String(e)))
await page.setContent(`<html><head><style>${vars}${css}</style></head><body><div id="app"></div></body></html>`)
await page.evaluate(() => { window.__sent = []; window.acquireVsCodeApi = () => ({ postMessage: m => window.__sent.push(m) }) })
await page.addScriptTag({ content: js })
const post = m => page.evaluate(msg => window.dispatchEvent(new MessageEvent('message', { data: msg })), m)
await post({ type: 'state', busy: true, models, model: '9router/cx/gpt-6.1-terra', thinking: 'medium', thinkingLevels: ['off', 'low', 'medium', 'high'], mode: 'default', modes: [{ id: 'default', name: 'Default' }, { id: 'plan', name: 'Plan' }], commands: [{ name: 'plan', description: 'Enter plan mode' }, { name: 'model', description: 'Show model' }] })
await post({ type: 'reset', items })
await post({ type: 'usage', used: 41000, size: 272000, cost: 0.0213 })
await page.click('.tool.completed .tool-head >> nth=1')
await page.waitForTimeout(300)
await page.screenshot({ path: `${out}/vsc-chat.png` })
await page.fill('#input', '/pl')
await page.dispatchEvent('#input', 'input')
await page.waitForTimeout(200)
await page.screenshot({ path: `${out}/vsc-slash.png`, clip: { x: 0, y: 560, width: 420, height: 300 } })
console.log('sent:', JSON.stringify(await page.evaluate(() => window.__sent.map(m => m.type))))
await browser.close()
