// Render media/chat.js in Chrome with a fake VS Code host and screenshot chat, menus, history and settings.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire('D:/WorkSpace/omp-desktop/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/package.json')
const { chromium } = require('playwright-core')
const [out] = process.argv.slice(2)
const css = readFileSync(new URL('../media/chat.css', import.meta.url), 'utf8')
const js = readFileSync(new URL('../media/chat.js', import.meta.url), 'utf8')
const vars = ':root{--vscode-font-family:Segoe UI;--vscode-font-size:13px;--vscode-foreground:#cccccc;--vscode-sideBar-background:#1f2024;--vscode-input-background:#2a2b30;--vscode-input-foreground:#ddd;--vscode-dropdown-background:#2a2b30;--vscode-dropdown-foreground:#ddd;--vscode-descriptionForeground:#8b8d93;--vscode-textLink-foreground:#58a6ff;--vscode-textCodeBlock-background:#16171a;--vscode-button-background:#7c3aed;--vscode-button-hoverBackground:#6d28d9;--vscode-button-foreground:#fff;--vscode-list-hoverBackground:#2c2e33;--vscode-editor-font-family:Consolas;--vscode-errorForeground:#f85149;--vscode-focusBorder:#7c3aed;--vscode-editorWidget-background:#25262b}'
const models = [
  { selector: '9router/cx/gpt-6.1-terra', provider: '9router', id: 'cx/gpt-6.1-terra', name: 'GPT-6.1 Terra', reasoning: true },
  { selector: '9router/cc/claude-sonnet-5-5', provider: '9router', id: 'cc/claude-sonnet-5-5', name: 'Claude Sonnet 5.5', reasoning: true },
  { selector: 'openai/gpt-6', provider: 'openai', id: 'gpt-6', name: 'GPT-6', reasoning: true },
]
const items = [
  { type: 'user', id: 'i1', text: 'Fix the date parsing bug in `src/lib/date.ts` and add a test.' },
  { type: 'thought', id: 'i2', text: 'Need to read the file first.' },
  { type: 'tool', id: 't-1', card: { id: '1', kind: 'read', name: 'read', title: 'Reading date helper', status: 'completed', path: 'D:/WorkSpace/XE-VN/src/lib/date.ts', output: '1: export function parse(s) {' } },
  { type: 'tool', id: 't-2', card: { id: '2', kind: 'edit', name: 'edit', title: 'Editing date helper', status: 'completed', path: 'D:/WorkSpace/XE-VN/src/lib/date.ts', diff: { path: 'D:/WorkSpace/XE-VN/src/lib/date.ts', oldText: 'export function parse(s) {\n  return new Date(s)\n}', newText: "export function parse(s) {\n  const [d, m, y] = s.split('/')\n  return new Date(+y, +m - 1, +d)\n}" } } },
  { type: 'tool', id: 't-3', card: { id: '3', kind: 'execute', name: 'bash', title: 'Run date tests', status: 'completed', input: '{"command":"npx vitest run src/lib"}', output: ' RUN  v3.2.4\n ✓ src/lib/date.test.ts (3 tests) 4ms\n\n Test Files  1 passed (1)\n      Tests  3 passed (3)\n   Start at  10:05:12\n   Duration  412ms\n extra line 1\n extra line 2' } },
  { type: 'ask', id: 'q1', message: 'Two remaining changes need scope before editing:', schema: { properties: {
    model: { type: 'string', title: 'Where should the model name show?', oneOf: [{ const: 'ui', title: 'Desktop UI', description: 'You see the active model.' }, { const: 'ctx', title: 'AI session context', description: 'The agent knows which model answers.' }, { const: 'both', title: 'Both', description: 'Recommended.' }, { const: 'skip', title: 'Skip this' }] },
    signing: { type: 'string', title: 'Windows release', oneOf: [{ const: 'none', title: 'No certificate yet', description: 'Add artifact checks; app stays unsigned.' }, { const: 'have', title: 'Have a certificate' }, { const: 'unsure', title: 'Not sure' }] },
  }, required: ['model', 'signing'] } },
  { type: 'assistant', id: 'i3', text: 'Fixed `parse` to read **dd/mm/yyyy** in src/lib/date.ts:2.\n\n- Root cause: `new Date("05/11/2026")` is parsed month-first.\n- Added a regression test.' },
]
const settings = {
  type: 'settings', status: 'ready', failed: {}, models,
  settings: [
    { key: 'advisor.enabled', group: 'model', type: 'boolean', value: true, description: 'Pair a second model that reviews each turn and injects notes.' },
    { key: 'defaultThinkingLevel', group: 'model', type: 'enum', value: 'auto', options: ['minimal', 'low', 'medium', 'high', 'auto'], description: 'Reasoning depth for thinking-capable models' },
    { key: 'modelRoles', group: 'model', type: 'record', value: { default: '9router/cx/gpt-6.1-terra:medium', task: '9router/cc/claude-sonnet-5-5:medium' }, description: 'Model per role' },
    { key: 'compaction.thresholdTokens', group: 'model', type: 'number', value: 200000, description: 'Fixed token limit for context maintenance' },
    { key: 'statusLine.leftSegments', group: 'model', type: 'array', value: ['model', 'path', 'git'], choices: { kind: 'multi', values: ['model', 'path', 'git', 'cost', 'pr'] }, description: 'Left status line segments' },
  ],
}
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 440, height: 860 }, deviceScaleFactor: 2 })
page.on('pageerror', e => console.log('PAGEERROR', String(e)))
await page.setContent(`<html><head><style>${vars}${css}</style></head><body><div id="app"></div></body></html>`)
await page.evaluate(() => { window.__sent = []; window.acquireVsCodeApi = () => ({ postMessage: m => window.__sent.push(m) }) })
await page.addScriptTag({ content: js })
const post = m => page.evaluate(msg => window.dispatchEvent(new MessageEvent('message', { data: msg })), m)
await page.screenshot({ path: `${out}/vsc-empty.png` })
const base = { thinkingLevels: ['off', 'low', 'medium', 'high'], modes: [{ id: 'default', name: 'Default' }, { id: 'plan', name: 'Plan' }], commands: [{ name: 'plan', description: 'Enter plan mode' }, { name: 'model', description: 'Show current model' }], queued: 0 }
const tabs = [
  { ...base, id: 'A', title: 'Fix date parsing', busy: true, queued: 1, model: '9router/cx/gpt-6.1-terra', thinking: 'medium', mode: 'default', usage: { used: 41000, size: 272000, cost: 0.0213 } },
  { ...base, id: 'B', title: 'Refactor', busy: true, model: '9router/cc/claude-sonnet-5-5', thinking: 'high', usage: {} },
  { ...base, id: 'C', title: 'Chat 1', busy: false, unread: true, model: 'openai/gpt-6', usage: {} },
]
await post({ type: 'tabs', tabs, active: 'A', models, cwd: 'D:/WorkSpace/XE-VN' })
await post({ type: 'reset', tab: 'A', items })
await page.click('.tool-line >> nth=1')
await page.waitForTimeout(200)
await page.screenshot({ path: `${out}/vsc-chat.png` }); await page.screenshot({ path: `${out}/vsc-tabs.png`, clip: { x: 0, y: 0, width: 440, height: 40 } })
await page.hover('.user-wrap'); await page.click('.ua-btn'); await page.waitForTimeout(100); await page.screenshot({ path: `${out}/vsc-fork.png`, clip: { x: 0, y: 0, width: 440, height: 200 } }); await page.mouse.click(5, 500)
await page.click('.ask-opt >> nth=2'); await page.click('.ask-opt >> nth=4'); await page.evaluate(() => document.querySelector('.ask').scrollIntoView()); await page.screenshot({ path: `${out}/vsc-ask.png` })
await page.fill('#input', 'look at @dat')
 await page.focus('#input'); await page.evaluate(() => { const t = document.getElementById('input'); t.setSelectionRange(t.value.length, t.value.length); t.dispatchEvent(new Event('input')) })
 await post({ type: 'files', query: 'dat', files: ['src/lib/date.ts', 'src/lib/date.test.ts', 'src/features/reports/lib/date-range.ts'] })
 await page.waitForTimeout(200)
 await page.screenshot({ path: `${out}/vsc-files.png` })
 await page.keyboard.press('Enter')
 await page.waitForTimeout(100)
 console.log('after pick:', await page.inputValue('#input'))
 await page.click('.chip-btn >> nth=1')
await page.waitForTimeout(200)
await page.screenshot({ path: `${out}/vsc-model.png` })
await post({ type: 'view', view: 'settings' })
await post(settings)
await page.waitForTimeout(200)
await page.screenshot({ path: `${out}/vsc-settings.png` })
console.log('sent:', JSON.stringify(await page.evaluate(() => window.__sent.map(m => m.type))))
await browser.close()
