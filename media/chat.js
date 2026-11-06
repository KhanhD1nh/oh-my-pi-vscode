// Oh My Pi webview — Claude Code–style chat. Plain DOM, incremental updates (no full re-render on stream).
// eslint-disable-next-line no-undef
const vscode = acquireVsCodeApi()
const send = msg => vscode.postMessage(msg)
const h = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'html') el.innerHTML = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const kid of kids.flat(9)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)))
  return el
}
const svg = d => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.5'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.innerHTML = d; return s }
const ICON = {
  plus: '<path d="M8 3v10M3 8h10"/>', history: '<path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9"/><path d="M2.5 2.5v2.6h2.6M8 5v3l2 1.5"/>',
  gear: '<circle cx="8" cy="8" r="2"/><path d="M8 1.8v1.6M8 12.6v1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M1.8 8h1.6M12.6 8h1.6M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1"/>',
  up: '<path d="M8 13V3M4 7l4-4 4 4"/>', stop: '<rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" stroke="none"/>',
  back: '<path d="M10 3L5 8l5 5"/>', chevron: '<path d="M4 6l4 4 4-4"/>', brain: '<path d="M6 3.5a2 2 0 0 0-3 1.7 2 2 0 0 0 0 3.6A2 2 0 0 0 6 12.5V3.5zM10 3.5a2 2 0 0 1 3 1.7 2 2 0 0 1 0 3.6 2 2 0 0 1-3 3.7V3.5z"/>',
  image: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="6" cy="6.5" r="1"/><path d="M14 11l-3.5-3.5L4 13"/>',
}
// ───────────── markdown ─────────────
const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>')
  .replace(/(^|[\s(])((?:[A-Za-z]:)?[\w.@/\\-]+\.[A-Za-z0-9]{1,6})(?::(\d+))?(?=[\s).,;:]|$)/g,
    (m, pre, p, line) => /[/\\]/.test(p) ? `${pre}<a class="file" data-path="${p}"${line ? ` data-line="${line}"` : ''}>${p}${line ? ':' + line : ''}</a>` : m)
function md(src) {
  const out = []; const L = src.split('\n')
  for (let i = 0; i < L.length; i++) {
    const l = L[i]
    if (/^```/.test(l)) { const b = []; i++; while (i < L.length && !/^```/.test(L[i])) b.push(L[i++]); out.push(`<pre><code>${esc(b.join('\n'))}</code></pre>`); continue }
    const hd = /^(#{1,4})\s+(.*)/.exec(l); if (hd) { out.push(`<h${hd[1].length + 2}>${inline(hd[2])}</h${hd[1].length + 2}>`); continue }
    if (/^\s*[-*]\s+/.test(l)) { const b = []; while (i < L.length && /^\s*[-*]\s+/.test(L[i])) b.push(`<li>${inline(L[i++].replace(/^\s*[-*]\s+/, ''))}</li>`); i--; out.push(`<ul>${b.join('')}</ul>`); continue }
    if (/^\s*\d+\.\s+/.test(l)) { const b = []; while (i < L.length && /^\s*\d+\.\s+/.test(L[i])) b.push(`<li>${inline(L[i++].replace(/^\s*\d+\.\s+/, ''))}</li>`); i--; out.push(`<ol>${b.join('')}</ol>`); continue }
    if (/^\|.*\|\s*$/.test(l)) {
      const rows = []; while (i < L.length && /^\|.*\|\s*$/.test(L[i])) rows.push(L[i++]); i--
      const cells = r => r.trim().slice(1, -1).split('|').map(c => c.trim())
      const body = rows.filter(r => !/^\|[\s:|-]+\|\s*$/.test(r))
      out.push(`<table>${body.map((r, n) => `<tr>${cells(r).map(c => n === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table>`); continue
    }
    if (/^>\s?/.test(l)) { out.push(`<blockquote>${inline(l.replace(/^>\s?/, ''))}</blockquote>`); continue }
    if (l.trim()) out.push(`<p>${inline(l)}</p>`)
  }
  return out.join('')
}

// ───────────── tools ─────────────
const VERB = { read: 'Read', edit: 'Update', delete: 'Delete', move: 'Move', search: 'Search', execute: 'Bash', think: 'Think', fetch: 'Fetch', other: 'Tool' }
const shortPath = p => { const parts = p.replace(/\\/g, '/').split('/'); return parts.slice(-3).join('/') }
function toolTarget(c) {
  if (c.path) return { text: shortPath(c.path), file: c.path }
  try { const i = JSON.parse(c.input ?? '{}'); return { text: i.command ?? i.pattern ?? i.query ?? i.url ?? c.title } } catch { return { text: c.title } }
}
function diffStat(d) {
  const a = d.oldText ? d.oldText.split('\n') : [], b = d.newText.split('\n')
  let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++
  let ea = a.length - 1, eb = b.length - 1; while (ea >= s && eb >= s && a[ea] === b[eb]) { ea--; eb-- }
  return { s, ea, eb, a, b, add: Math.max(0, eb - s + 1), del: Math.max(0, ea - s + 1) }
}
function diffEl(d) {
  const { s, ea, eb, a, b } = diffStat(d)
  // ponytail: prefix/suffix trim, not a full LCS diff; the "Open diff" action shows the exact one.
  const rows = []
  for (let i = Math.max(0, s - 2); i < s; i++) rows.push(h('div', { class: 'd ctx' }, '  ' + a[i]))
  for (let i = s; i <= ea; i++) rows.push(h('div', { class: 'd del' }, '- ' + a[i]))
  for (let i = s; i <= eb; i++) rows.push(h('div', { class: 'd add' }, '+ ' + b[i]))
  for (let i = eb + 1; i < Math.min(b.length, eb + 3); i++) rows.push(h('div', { class: 'd ctx' }, '  ' + b[i]))
  return h('div', { class: 'diff' }, rows)
}
/** Claude Code–style step: bullet on a timeline, verb + target, then an IN/OUT box (bash) or inline diff (edit). */
/** omp `task` tool: one or more subagents. */
function taskInfo(c) {
  if (c.name !== 'task') return null
  let i = {}; try { i = JSON.parse(c.input ?? '{}') } catch {}
  const tasks = Array.isArray(i.tasks) ? i.tasks : i.task ? [{ name: i.name, agent: i.agent, task: i.task }] : []
  return tasks.length ? { tasks, context: i.context } : null
}
/** bash with `async` or a service `name` keeps running after the tool returns. */
function bgInfo(c) {
  if (c.kind !== 'execute' && c.name !== 'bash') return null
  let i = {}; try { i = JSON.parse(c.input ?? '{}') } catch {}
  return i.async || i.name ? { name: i.name || 'background', command: i.command ?? '' } : null
}
const since = ms => { const s = Math.max(0, Math.floor((Date.now() - ms) / 1000)); return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s` }
const T0 = new Map()
function agentEl(c, key, info) {
  const open = S.open.has(key)
  const running = c.status === 'pending' || c.status === 'in_progress'
  if (!T0.has(c.id)) T0.set(c.id, Date.now())
  const n = info.tasks.length
  const head = h('div', { class: 'tool-line', onclick: () => toggle(key) },
    h('span', { class: 'tool-verb' }, n > 1 ? `${n} agents` : 'Agent'),
    h('span', { class: 'tool-target' }, c.title),
    h('span', { class: 'tool-stat muted', 'data-t0': running ? String(T0.get(c.id)) : '' }, running ? since(T0.get(c.id)) : c.status === 'failed' ? 'failed' : 'done'))
  const rows = info.tasks.map(t => h('div', { class: `agent-row ${c.status}` },
    h('span', { class: 'agent-ico' }, running ? h('span', { class: 'tab-spin' }, SPIN[spinAt]) : c.status === 'failed' ? '✕' : '✓'),
    h('span', { class: 'agent-name' }, t.name ?? 'task'), t.agent ? h('span', { class: 'agent-kind' }, t.agent) : null,
    h('span', { class: 'agent-task' }, String(t.task ?? '').split('\n')[0])))
  return h('div', { class: 'tool agent' }, head, h('div', { class: 'agents' }, rows),
    open && c.output ? h('pre', { class: 'tool-out' }, c.output.slice(0, 20000)) : null,
    !open && c.output && !running ? h('a', { class: 'io-more', onclick: () => toggle(key) }, 'Show result') : null)
}
function toolEl(c, key) {
  const ti = taskInfo(c)
  if (ti) return agentEl(c, key, ti)
  const bg = bgInfo(c)
  if (bg) {
    const line = h('div', { class: 'tool-line', onclick: () => toggle(key) },
      h('span', { class: 'tool-verb' }, 'Background'), h('span', { class: 'tool-target' }, bg.name), h('span', { class: 'bg-pill' }, 'runs on'))
    return h('div', { class: 'tool' }, line, h('div', { class: 'io' }, h('div', { class: 'io-row' }, h('span', { class: 'io-k' }, 'IN'), h('pre', { class: 'io-v' }, bg.command)),
      S.open.has(key) && c.output ? h('div', { class: 'io-row' }, h('span', { class: 'io-k' }, 'OUT'), h('pre', { class: 'io-v' }, c.output.slice(0, 20000))) : null))
  }

  const open = S.open.has(key)
  const t = toolTarget(c)
  const bash = c.kind === 'execute'
  let cmd = ''; try { cmd = JSON.parse(c.input ?? '{}').command ?? '' } catch {}
  const head = bash && c.title && c.title !== cmd ? c.title : t.text
  const stat = c.diff ? diffStat(c.diff) : null
  const line = h('div', { class: 'tool-line', onclick: () => toggle(key) },
    h('span', { class: 'tool-verb' }, VERB[c.kind] ?? VERB.other),
    h('span', { class: `tool-target${t.file ? ' file' : ''}`, title: t.file ?? t.text, onclick: t.file ? e => { e.stopPropagation(); send({ type: 'openFile', path: t.file }) } : undefined }, head),
    stat ? h('span', { class: 'tool-stat' }, h('span', { class: 'plus' }, `+${stat.add}`), ' ', h('span', { class: 'minus' }, `-${stat.del}`)) : null)
  const clip = (txt, n) => { const l = txt.split('\n'); return !open && l.length > n ? { text: l.slice(0, n).join('\n'), more: l.length - n } : { text: txt.length > 20000 ? txt.slice(0, 20000) + '\n…' : txt } }
  let body = null
  if (bash) {
    const out = c.output ? clip(c.output, 6) : null
    body = h('div', { class: 'io' },
      h('div', { class: 'io-row' }, h('span', { class: 'io-k' }, 'IN'), h('pre', { class: 'io-v' }, clip(cmd || c.title || '', 4).text)),
      out ? h('div', { class: 'io-row' }, h('span', { class: 'io-k' }, 'OUT'), h('div', { class: 'io-v' }, h('pre', {}, out.text), out.more ? h('a', { class: 'io-more', onclick: () => toggle(key) }, `+${out.more} lines`) : null)) : null)
  } else if (c.diff) {
    body = h('div', {}, diffEl(c.diff), h('div', { class: 'tool-actions' }, h('a', { onclick: () => send({ type: 'openDiff', tab: S.active, toolId: c.id }) }, 'Open diff'), h('a', { onclick: () => send({ type: 'openFile', path: c.diff.path }) }, 'Open file')))
  } else if (open && (c.output || c.input)) {
    body = h('pre', { class: 'tool-out' }, (c.output || c.input).slice(0, 20000))
  }
  return h('div', { class: 'tool' }, line, body)
}


// ───────────── state ─────────────
/** 'panel' = one chat in an editor tab; 'sidebar' = history + settings. */
const MODE = document.body.dataset.mode ?? 'panel'
const S = {
  view: MODE === 'sidebar' ? 'history' : 'chat', tabs: [], active: undefined, models: [], cwd: '', transcripts: {},
  sessions: [], settings: { status: 'idle', settings: [], models: [], failed: {} },
  query: '', group: 'model', open: new Set(), images: [], menu: null, sessionQuery: '', modelQuery: '',
  files: [], fileQuery: null, menuIndex: 0, drafts: {},
}
const tab = () => S.tabs.find(t => t.id === S.active) ?? { busy: false, queued: 0, thinkingLevels: [], modes: [], commands: [], usage: {} }
const items = () => S.transcripts[S.active] ?? []

// ───────────── chat items (incremental) ─────────────
let transcriptEl = null
const nodes = new Map()
function toggle(key) {
  S.open.has(key) ? S.open.delete(key) : S.open.add(key)
  const it = items().find(x => x.id === key); if (!it) return
  upsertNode(it)
  if (!S.open.has(key)) return
  const n = nodes.get(key)
  ;(n?.querySelector('.thought-body') ?? n?.querySelector('.tool')?.children[1])?.classList.add('expand')
}
function itemNode(it) {
  if (it.type === 'user') return h('div', { class: 'user-wrap' }, it.images?.length ? h('div', { class: 'user-imgs' }, it.images.map(i => thumb(`data:${i.mimeType};base64,${i.data}`))) : null, h('div', { class: 'msg user' }, it.text ? h('div', { class: 'msg-text', html: md(it.text) }) : null, userActions(it)))
  const state = it.type === 'tool' ? it.card.status : it.type === 'error' ? 'failed' : 'text'
  return h('div', { class: `step ${state}` }, itemBody(it))
}
function itemBody(it) {
  switch (it.type) {
    case 'user': return h('div', { class: 'msg user', html: md(it.text) })
    case 'assistant': return h('div', { class: 'msg', html: md(it.text) })
    case 'thought': {
      const open = S.open.has(it.id)
      return h('div', { class: 'thought' }, h('div', { class: 'thought-head', onclick: () => toggle(it.id) }, svg(ICON.brain), open ? 'Thinking' : 'Thought for a moment', open ? '' : ' ›'),
        open ? h('div', { class: 'thought-body', html: md(it.text) }) : null)
    }
    case 'tool': return toolEl(it.card, it.id)
    case 'error': return h('div', { class: 'msg error' }, it.text)
    case 'ask': return askEl(it)
  }
}
function upsertNode(it) {
  if (!transcriptEl) return
  transcriptEl.querySelector('.empty')?.remove()
  const fresh = itemNode(it)
  const old = nodes.get(it.id)
  if (old) old.replaceWith(fresh); else { fresh.classList.add('enter'); transcriptEl.insertBefore(fresh, transcriptEl.querySelector('.working')) }
  nodes.set(it.id, fresh)
}
function stickBottom(fn) {
  const t = transcriptEl; const near = !t || t.scrollHeight - t.scrollTop - t.clientHeight < 80
  fn(); if (t && near) t.scrollTop = t.scrollHeight
}
/** "Thinking… · 249 tokens": what omp is doing now and how much it has written this turn.
 * ponytail: tokens estimated as chars/4 of streamed text; omp sends no per-turn output count over ACP. */
function updateWorking() {
  const el = transcriptEl?.querySelector('.working-label'); if (!el) return
  const list = items(); let i = list.length - 1; while (i >= 0 && list[i].type !== 'user') i--
  const turn = list.slice(i + 1)
  const chars = turn.reduce((n, x) => n + (x.type === 'assistant' || x.type === 'thought' ? x.text.length : x.type === 'tool' ? (x.card.input?.length ?? 0) : 0), 0)
  const last = turn.at(-1)
  const verb = last?.type === 'thought' ? 'Thinking…' : last?.type === 'tool' && last.card.status !== 'completed' ? 'Running…' : last?.type === 'assistant' ? 'Writing…' : 'Working…'
  const tokens = Math.round(chars / 4)
  el.textContent = tokens ? `${verb} · ${tokens.toLocaleString()} tokens` : verb
}
function renderWorking() {
  if (!transcriptEl) return
  transcriptEl.querySelector('.working')?.remove()
  const t = tab()
  if (t.busy) { transcriptEl.append(h('div', { class: 'working' }, h('span', { class: 'work-ico' }, h('span', { class: 'tab-spin' }, SPIN[spinAt])), h('span', { class: 'working-label shimmer' }), t.queued ? h('span', { class: 'muted' }, ` · ${t.queued} queued`) : null)); updateWorking() }
}

// ───────────── views ─────────────
const app = document.getElementById('app')
const folderName = p => p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p
function tabbar() {
  const bar = h('div', { class: 'tabbar' },
    S.tabs.map((t, i) => h('div', { class: `tabchip${t.id === S.active ? ' on' : ''}${t.unread ? ' unread' : ''}`, title: t.title ?? 'New chat', onclick: () => activate(t.id), onauxclick: e => { if (e.button === 1) send({ type: 'closeTab', tab: t.id }) } },
      piIcon(t),
      h('span', { class: 'tab-label' }, t.title || `Chat ${i + 1}`),
      h('button', { class: 'tab-x', title: 'Close tab', onclick: e => { e.stopPropagation(); send({ type: 'closeTab', tab: t.id }) } }, svg('<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>')))),
    )
  // New tab, History and Settings live in VS Code's view title bar (package.json view/title).
  return h('div', { class: 'topbar tabs-only' }, bar)
}
function backbar(title) {
  if (MODE === 'sidebar' && title === 'History') return h('div', { class: 'topbar' }, h('div', { class: 'title' }, 'Chats'), h('button', { class: 'new-chat', onclick: () => send({ type: 'newTab' }) }, svg(ICON.plus), 'New chat'))
  return h('div', { class: 'topbar' }, h('button', { class: 'back', onclick: () => go(MODE === 'sidebar' ? 'history' : 'chat') }, svg(ICON.back), 'Back'), h('div', { class: 'title' }, title))
}
function activate(id) { if (id === S.active) return; saveDraft(); S.active = id; S.menu = null; S.fade = true; send({ type: 'activate', tab: id }); render() }
function go(view) {
  S.view = view; S.menu = null; S.fade = true
  if (view === 'history') send({ type: 'listSessions' })
  if (view === 'settings' && !S.settings.settings.length) send({ type: 'loadSettings' })
  render()
}
function saveDraft() { const ta = document.getElementById('input'); if (ta && S.active) S.drafts[S.active] = ta.value }

function chatView() {
  transcriptEl = h('div', { class: 'transcript' })
  nodes.clear()
  const list = items()
  if (!list.length) {
    transcriptEl.append(h('div', { class: 'empty' }, h('div', { class: 'logo' }, 'π'), h('h2', {}, 'Oh My Pi'),
      h('div', { class: 'muted' }, S.cwd ? `omp in ${folderName(S.cwd)} · each tab runs on its own` : 'omp runs here with your ~/.omp setup.'),
      h('div', { class: 'suggest' }, ['Explain this project structure', 'Find and fix a bug in the current file', 'Write tests for the selected code']
        .map(t => h('button', { onclick: () => { const ta = document.getElementById('input'); ta.value = t; ta.focus() } }, t)))))
  } else {
    for (const it of list) { const n = itemNode(it); nodes.set(it.id, n); transcriptEl.append(n) }
  }
  renderWorking()
  const wrap = h('div', { class: 'composer-wrap' }, composer(), statusLine())
  queueMicrotask(() => { transcriptEl.scrollTop = transcriptEl.scrollHeight })
  return MODE === 'sidebar' ? [tabbar(), transcriptEl, wrap] : [transcriptEl, wrap]
}

function modelName(sel) { return S.models.find(m => m.selector === sel)?.name ?? (sel ? sel.split('/').pop() : 'Model') }

const MI = {
  hand: '<path d="M5.5 8V3.8a1 1 0 0 1 2 0V7.5M7.5 7.5V2.8a1 1 0 0 1 2 0v4.7M9.5 7.5V3.8a1 1 0 0 1 2 0V9M11.5 7a1 1 0 0 1 2 0v3a4 4 0 0 1-4 4h-1a4 4 0 0 1-3.3-1.7L3.3 9.8a1 1 0 0 1 1.6-1.2l.6.8"/>',
  shield: '<path d="M8 1.8l5 2v4c0 3-2.2 5.3-5 6.2-2.8-.9-5-3.2-5-6.2v-4z"/><path d="M5.8 8l1.6 1.6 2.9-3"/>',
  code: '<path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5"/>',
  bolt: '<path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z"/>',
  plan: '<path d="M4 2.5h5.5L12 5v8.5H4z"/><path d="M6 7.5h4M6 10h4"/>',
  slash: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M9.5 5 6.5 11"/>',
}
/** omp tools.approvalMode values, in Shift+Tab order. */
const APPROVAL = [
  { id: 'always-ask', name: 'Manual', desc: 'omp asks before every tool call', icon: MI.hand },
  { id: 'always-ask-cached', name: 'Ask once', desc: 'Asks the first time, remembers your answer', icon: MI.shield },
  { id: 'write', name: 'Ask for writes', desc: 'Reads run freely; asks before writing', icon: MI.code },
  { id: 'yolo', name: 'Auto', desc: 'Runs every tool without asking', icon: MI.bolt },
]
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s
function setApproval(id) {
  if (tab().mode === 'plan') send({ type: 'setMode', tab: S.active, value: 'default' })
  S.approval = id; send({ type: 'setApproval', value: id })
}
/** Shift+Tab: next approval mode, then Plan, then back to the first. */
function cycleMode() {
  const t = tab(); const hasPlan = t.modes.some(m => m.id === 'plan')
  const i = t.mode === 'plan' ? APPROVAL.length : APPROVAL.findIndex(x => x.id === S.approval)
  const next = (i + 1) % (APPROVAL.length + (hasPlan ? 1 : 0))
  if (next === APPROVAL.length) send({ type: 'setMode', tab: S.active, value: 'plan' }); else setApproval(APPROVAL[next].id)
  refreshComposer()
}
function pickImage() {
  const inp = h('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none', onchange: () => {
    for (const f of inp.files ?? []) { const r = new FileReader(); r.onload = () => { S.images.push({ mimeType: f.type, data: String(r.result).split(',')[1], url: r.result }); refreshComposer() }; r.readAsDataURL(f) }
    inp.remove()
  } })
  document.body.append(inp); inp.click()
}
function insertAtEnd(ch) { const x = document.getElementById('input'); x.value += (x.value && !/\s$/.test(x.value) ? ' ' : '') + ch; x.focus(); x.setSelectionRange(x.value.length, x.value.length); updateInlineMenus(x); syncAction() }
/** One button: Stop while omp works and the box is empty, otherwise Send (queues while busy). */
function syncAction() {
  const b = document.getElementById('action'); const x = document.getElementById('input'); if (!b || !x) return
  const t = tab(); const stop = t.busy && !x.value.trim() && !S.images.length
  const state = stop ? 'stop' : 'send'; const prev = b.dataset.state; const flip = prev !== undefined && prev !== state; b.dataset.state = state
  b.className = `send${stop ? ' stop' : ''}`
  b.title = stop ? 'Stop (Esc)' : t.busy ? 'Queue message (Enter)' : 'Send (Enter)'
  if (prev === state) return
  const icon = svg(stop ? ICON.stop : ICON.up); if (flip) icon.classList.add('swap'); b.replaceChildren(icon)
}

function composer() {
  const t = tab()
  const ta = h('textarea', {
    id: 'input', rows: 1, placeholder: t.busy ? 'Queue another message…' : 'Ask omp anything · @ files · / commands',
    onkeydown: e => {
      if ((S.menu === 'slash' || S.menu === 'files') && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(e.key)) return menuKey(e)
      if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); cycleMode(); return }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit() }
      if (e.key === 'Escape') { if (S.menu) closeMenu(); else if (t.busy) send({ type: 'cancel', tab: S.active }) }
    },
    oninput: () => { autosize(ta); updateInlineMenus(ta); syncAction() },
    onpaste: e => {
      for (const f of e.clipboardData?.files ?? []) if (f.type.startsWith('image/')) {
        e.preventDefault()
        const r = new FileReader(); r.onload = () => { S.images.push({ mimeType: f.type, data: String(r.result).split(',')[1], url: r.result }); refreshComposer() }; r.readAsDataURL(f)
      }
    },
  })
  const plan = t.mode === 'plan'
  const ap = APPROVAL.find(x => x.id === S.approval)
  const pct = t.usage?.size ? Math.round((t.usage.used ?? 0) / t.usage.size * 100) : null
  const box = h('div', { class: `composer${t.busy ? ' busy' : ''}`, id: 'composer' },
    S.images.length ? h('div', { class: 'attachments' }, S.images.map((img, i) => h('span', { class: 'attach' }, thumb(img.url), h('button', { onclick: () => { S.images.splice(i, 1); refreshComposer() } }, '×')))) : null,
    ta,
    h('div', { class: 'composer-bar' },
      h('button', { class: `chip-btn icon${S.menu === 'add' ? ' open' : ''}`, title: 'Add', onclick: () => openMenu('add') }, svg(ICON.plus)),
      t.commands.length ? h('button', { class: 'chip-btn icon', title: 'Commands (/)', onclick: () => { const x = document.getElementById('input'); if (!x.value.startsWith('/')) { x.value = '/'; } x.focus(); updateInlineMenus(x); syncAction() } }, svg(MI.slash)) : null,
      h('button', { class: `chip-btn model${S.menu === 'model' ? ' open' : ''}`, title: 'Model', onclick: () => openMenu('model') }, h('span', { class: 'label' }, modelName(t.model)), t.thinking ? h('span', { class: 'sub' }, cap(t.thinking)) : null),
      false && pct !== null ? h('span', { class: 'ctx', title: `${t.usage.used} / ${t.usage.size} tokens${t.usage.cost ? ` · $${t.usage.cost.toFixed(4)}` : ''}` }, `${pct}%`) : null,
      bgChip(),
      h('span', { class: 'grow' }),
      h('button', { class: `chip-btn${S.menu === 'mode' ? ' open' : ''}${plan ? ' plan' : ''}`, title: 'Mode (Shift+Tab)', onclick: () => openMenu('mode') }, svg(plan ? MI.plan : ap?.icon ?? MI.bolt), h('span', { class: 'label' }, plan ? 'Plan' : ap?.name ?? 'Mode')),
      h('button', { id: 'action', class: 'send', onclick: () => { const x = document.getElementById('input'); if (tab().busy && !x.value.trim() && !S.images.length) send({ type: 'cancel', tab: S.active }); else submit() } }, svg(ICON.up))),
    menuEl())
  const menu = box.querySelector('.menu')
  if (menu && S.menuEnter) menu.classList.add('enter')
  S.menuEnter = false
  queueMicrotask(() => { autosize(ta); syncAction() })
  return box
}
function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(240, ta.scrollHeight) + 'px' }
function refreshComposer() {
  const old = document.getElementById('composer'); if (!old) return
  const ta = document.getElementById('input'); const v = ta.value; const pos = ta.selectionStart; const focused = document.activeElement === ta
  const fresh = composer(); old.replaceWith(fresh)
  const nt = document.getElementById('input'); nt.value = v; autosize(nt)
  if (focused) { nt.focus(); nt.setSelectionRange(pos, pos) }
}

// menus: model, thinking, /commands, @files
function openMenu(kind) { S.menu = S.menu === kind ? null : kind; S.menuEnter = true; refreshComposer(); if (S.menu === 'model') setTimeout(() => document.getElementById('model-filter')?.focus(), 0) }
function closeMenu() { S.menu = null; S.fileQuery = null; refreshComposer() }
function menuEl() {
  const t = tab()
  if (S.menu === 'model') {
    const q = S.modelQuery.toLowerCase()
    const tok = n => n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}K`
    const price = m => m.cost && (m.cost.input || m.cost.output) ? `$${+m.cost.input.toFixed(2)}/$${+m.cost.output.toFixed(2)} per Mtok` : ''
    const detail = m => [m.selector, m.contextWindow ? `${tok(m.contextWindow)} context` : '', price(m)].filter(Boolean).join(' · ')
    const def = S.models.find(m => m.roles?.includes('default'))
    // Pinned: models with an omp role, then everything from providers you configured yourself (models.yml), current one always.
    const own = new Set(S.models.filter(m => m.roles?.length).map(m => m.provider))
    const pinned = q ? [] : S.models.filter(m => m.roles?.length || own.has(m.provider) || m.selector === t.model)
    const hits = q ? S.models.filter(m => m.name.toLowerCase().includes(q) || m.selector.toLowerCase().includes(q)).slice(0, 80) : []
    const pick = sel => { send({ type: 'setModel', tab: S.active, value: sel }); t.model = sel; S.modelQuery = ''; closeMenu() }
    const row = (m, title, sub) => h('button', { class: `menu-item mode${m.selector === t.model ? ' active' : ''}`, onclick: () => pick(m.selector) },
      h('span', { class: 'mi-text' }, h('b', {}, title ?? m.name, m.roles?.length && !title ? h('span', { class: 'roles' }, m.roles.filter(r => r !== 'default').slice(0, 3).join(' · ')) : null), h('small', {}, sub ?? detail(m))),
      h('span', { class: 'check' }, m.selector === t.model ? '✓' : ''))
    const filter = h('input', { type: 'text', id: 'model-filter', placeholder: `Search all ${S.models.length || ''} models…`, value: S.modelQuery, oninput: e => { S.modelQuery = e.target.value; const pos = e.target.selectionStart; refreshComposer(); const f = document.getElementById('model-filter'); f.focus(); f.setSelectionRange(pos, pos) }, onkeydown: e => { if (e.key === 'Escape') closeMenu() } })
    const lv = t.thinkingLevels; const cur = lv.indexOf(t.thinking ?? '')
    return h('div', { class: 'menu models' },
      h('div', { class: 'menu-group row' }, h('span', {}, 'Select a model')),
      filter,
      !S.models.length ? h('div', { class: 'menu-item muted' }, 'Loading models…') : null,
      def && !q ? row(def, 'Default (recommended)', `Use omp's default model (currently ${def.name})${price(def) ? ' · ' + price(def) : ''}`) : null,
      pinned.filter(m => m !== def).map(m => row(m)),
      hits.map(m => row(m)),
      q && !hits.length ? h('div', { class: 'menu-item muted' }, 'No models match') : null,
      lv.length ? [h('div', { class: 'menu-sep' }), h('div', { class: 'effort' }, svg(ICON.brain), h('span', {}, 'Effort ', h('span', { class: 'muted' }, `(${cap(t.thinking ?? 'auto')})`)), h('span', { class: 'grow' }),
        h('span', { class: 'dots' }, lv.map((l, i) => h('button', { class: `dot${i <= cur ? ' on' : ''}${i === cur ? ' cur' : ''}`, title: cap(l), onclick: e => { e.stopPropagation(); send({ type: 'setThinking', tab: S.active, value: l }); t.thinking = l; refreshComposer() } }))))] : null)
  }
  if (S.menu === 'jobs') {
    const { agents, jobs } = activity()
    const jump = id => { closeMenu(); const n = nodes.get(id); n?.scrollIntoView({ block: 'center', behavior: 'smooth' }); n?.classList.add('flash'); setTimeout(() => n?.classList.remove('flash'), 900) }
    return h('div', { class: 'menu', style: 'left:6px;min-width:260px' },
      agents.length ? [h('div', { class: 'menu-group' }, 'Subagents'), agents.map(a => h('button', { class: 'menu-item', onclick: () => jump(a.id) }, h('span', { class: 'tab-spin' }, SPIN[spinAt]), h('span', {}, a.label), h('span', { class: 'desc' }, since(T0.get(a.cid) ?? Date.now()))))] : null,
      jobs.length ? [h('div', { class: 'menu-group' }, 'Background'), jobs.map(j => h('button', { class: 'menu-item', onclick: () => jump(j.id) }, h('span', { class: 'live busy' }), h('span', {}, j.label), h('span', { class: 'desc' }, j.command)))] : null,
      h('div', { class: 'menu-group' }, 'Ask omp'),
      h('button', { class: 'menu-item', onclick: () => { closeMenu(); send({ type: 'prompt', tab: S.active, text: 'read jobs:// and give me the status of every running task and background service' }) } }, 'Check status of all jobs'))
  }
  if (S.menu === 'add') {
    return h('div', { class: 'menu', style: 'left:6px;min-width:210px' },
      h('button', { class: 'menu-item', onclick: () => { closeMenu(); pickImage() } }, svg(ICON.image), 'Upload image'),
      h('button', { class: 'menu-item', onclick: () => { closeMenu(); insertAtEnd('@') } }, h('span', { class: 'mi-ico' }, '@'), 'Mention a file'),
      h('button', { class: 'menu-item', onclick: () => { closeMenu(); send({ type: 'addSelection' }) } }, svg(MI.code), 'Add editor selection'))
  }
  if (S.menu === 'mode') {
    const plan = t.mode === 'plan'
    const lv = t.thinkingLevels; const cur = lv.indexOf(t.thinking ?? '')
    const row = (on, icon, name, desc, onclick) => h('button', { class: `menu-item mode${on ? ' active' : ''}`, onclick }, svg(icon), h('span', { class: 'mi-text' }, h('b', {}, name), h('small', {}, desc)), h('span', { class: 'check' }, on ? '✓' : ''))
    return h('div', { class: 'menu modes' },
      h('div', { class: 'menu-group row' }, h('span', {}, 'Modes'), h('span', { class: 'kbd' }, '⇧ + Tab to switch')),
      APPROVAL.map(x => row(!plan && x.id === S.approval, x.icon, x.name, x.desc, () => { setApproval(x.id); closeMenu() })),
      t.modes.some(m => m.id === 'plan') ? row(plan, MI.plan, 'Plan', 'Explores the code and presents a plan before editing', () => { send({ type: 'setMode', tab: S.active, value: plan ? 'default' : 'plan' }); closeMenu() }) : null,
      lv.length ? [h('div', { class: 'menu-sep' }), h('div', { class: 'effort' }, svg(ICON.brain), h('span', {}, `Effort (${cap(t.thinking ?? 'auto')})`), h('span', { class: 'grow' }),
        h('span', { class: 'dots' }, lv.map((l, i) => h('button', { class: `dot${i <= cur ? ' on' : ''}${i === cur ? ' cur' : ''}`, title: cap(l), onclick: e => { e.stopPropagation(); send({ type: 'setThinking', tab: S.active, value: l }); t.thinking = l; refreshComposer() } }))))] : null)
  }
  if (S.menu === 'thinking') {
    return h('div', { class: 'menu', style: 'left:60px;min-width:160px' }, h('div', { class: 'menu-group' }, 'Thinking'),
      t.thinkingLevels.map(l => h('button', { class: `menu-item${l === t.thinking ? ' active' : ''}`, onclick: () => { send({ type: 'setThinking', tab: S.active, value: l }); t.thinking = l; closeMenu() } }, h('span', { class: 'check' }, l === t.thinking ? '✓' : ''), l)))
  }
  if (S.menu === 'slash') {
    const hits = slashHits()
    if (!hits.length) return null
    queueMicrotask(() => document.querySelector('.menu.slash .menu-item.active')?.scrollIntoView({ block: 'nearest' }))
    return h('div', { class: 'menu slash', style: 'left:0;right:0' }, h('div', { class: 'menu-group' }, `${hits.length} commands`), hits.map((c, i) => h('button', { class: `menu-item${i === S.menuIndex ? ' active' : ''}`, onclick: () => pickSlash(c) }, h('strong', {}, '/' + c.name), h('span', { class: 'desc' }, c.description ?? ''))))
  }
  if (S.menu === 'files') {
    return h('div', { class: 'menu', style: 'left:0;right:0' },
      h('div', { class: 'menu-group' }, S.fileQuery ? `Files matching “${S.fileQuery}”` : 'Files'),
      !S.files.length ? h('div', { class: 'menu-item muted' }, 'No matching files') : null,
      S.files.map((f, i) => { const parts = f.split('/'); const name = parts.pop(); return h('button', { class: `menu-item${i === S.menuIndex ? ' active' : ''}`, onclick: () => pickFile(f) }, h('span', {}, name), h('span', { class: 'desc' }, parts.join('/'))) }))
  }
  return null
}
function slashHits() { const ta = document.getElementById('input'); const m = ta && /^\/(\S*)$/.exec(ta.value); if (!m) return []; const q = m[1].toLowerCase(); const all = tab().commands; return [...all.filter(c => c.name.toLowerCase().startsWith(q)), ...all.filter(c => !c.name.toLowerCase().startsWith(q) && (c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q)))] }
/** `@query` right before the caret, or null. */
function mentionAt(ta) { const before = ta.value.slice(0, ta.selectionStart); const m = /(^|\s)@([^\s@]*)$/.exec(before); return m ? m[2] : null }
let fileTimer = null
function updateInlineMenus(ta) {
  const mention = mentionAt(ta)
  if (mention !== null) {
    if (S.menu !== 'files') { S.menu = 'files'; S.files = []; S.menuIndex = 0; S.menuEnter = true }
    if (mention !== S.fileQuery) {
      S.fileQuery = mention
      clearTimeout(fileTimer); fileTimer = setTimeout(() => send({ type: 'findFiles', query: mention }), 120)
    }
    refreshComposer(); return
  }
  const wantSlash = /^\/\S*$/.test(ta.value) && tab().commands.length
  if (wantSlash) { if (S.menu !== 'slash') S.menuEnter = true; S.menu = 'slash'; S.menuIndex = 0; refreshComposer(); return }
  if (S.menu === 'slash' || S.menu === 'files') { S.menu = null; S.fileQuery = null; refreshComposer() }
}
function menuKey(e) {
  const list = S.menu === 'slash' ? slashHits() : S.files
  if (!list.length) return
  e.preventDefault()
  if (e.key === 'ArrowDown') S.menuIndex = (S.menuIndex + 1) % list.length
  else if (e.key === 'ArrowUp') S.menuIndex = (S.menuIndex - 1 + list.length) % list.length
  else return S.menu === 'slash' ? pickSlash(list[S.menuIndex]) : pickFile(list[S.menuIndex])
  refreshComposer()
}
function pickSlash(c) { const ta = document.getElementById('input'); ta.value = `/${c.name} `; S.menu = null; refreshComposer(); document.getElementById('input').focus() }
function pickFile(path) {
  const ta = document.getElementById('input')
  const pos = ta.selectionStart
  const before = ta.value.slice(0, pos).replace(/@([^\s@]*)$/, `@${path} `)
  ta.value = before + ta.value.slice(pos)
  S.menu = null; S.fileQuery = null
  refreshComposer()
  const nt = document.getElementById('input'); nt.focus(); nt.setSelectionRange(before.length, before.length)
}

function submit() {
  const ta = document.getElementById('input')
  const text = ta.value.trim()
  if ((!text && !S.images.length) || !S.active) return
  send({ type: 'prompt', tab: S.active, text, images: S.images.map(({ mimeType, data }) => ({ mimeType, data })) })
  ta.value = ''; S.images = []; S.menu = null; S.drafts[S.active] = ''
  refreshComposer()
}

// history
const money = n => n >= 100 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`
const dur = ms => { if (!ms) return '0s'; const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s` }
const ago = iso => { const d = (Date.now() - Date.parse(iso)) / 1000; return d < 60 ? 'now' : d < 3600 ? `${Math.floor(d / 60)}m` : d < 86400 ? `${Math.floor(d / 3600)}h` : `${Math.floor(d / 86400)}d` }
const cleanTitle = t => (t || 'Untitled session').replace(/^\S*\s*ESC:\s*/u, '').replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, '')
function collapsible(key, title, right, body) {
  S.closed ??= new Set(['empty'])
  const open = !S.closed.has(key)
  return h('div', { class: 'sb-sec' },
    h('button', { class: 'sb-head', onclick: () => { (S.closed ??= new Set()); open ? S.closed.add(key) : S.closed.delete(key); render() } }, h('span', { class: `chev${open ? ' open' : ''}` }, '›'), title, h('span', { class: 'grow' }), right),
    open ? body : null)
}
function historyView() {
  const q = S.sessionQuery.toLowerCase()
  const open = new Set(S.tabs.map(t => t.id))
  const busy = new Set(S.tabs.filter(t => t.busy).map(t => t.id))
  const all = S.sessions
  const sum = all.reduce((a, s) => { const x = s.stats; if (x) { a.cost += x.cost; a.api += x.apiMs; a.wall += x.wallMs ?? 0; a.add += x.added; a.del += x.removed; a.inp += x.input; a.out += x.output; a.prompts += x.prompts } return a }, { cost: 0, api: 0, wall: 0, add: 0, del: 0, inp: 0, out: 0, prompts: 0 })
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayCost = all.filter(s => s.updatedAt && Date.parse(s.updatedAt) >= today.getTime()).reduce((n, s) => n + (s.stats?.cost ?? 0), 0)
  const kv = (k, v) => h('div', { class: 'kv-row' }, h('span', {}, k), h('span', { class: 'v' }, v))
  const usage = collapsible('usage', 'Usage', h('span', { class: 'muted small' }, folderName(S.cwd)), h('div', { class: 'sb-body' },
    kv('Total cost', money(sum.cost)), kv('Today', money(todayCost)),
    kv('Duration (API)', dur(sum.api)), kv('Duration (wall)', dur(sum.wall)),
    kv('Tokens in / out', `${fmtTok(sum.inp)} / ${fmtTok(sum.out)}`),
    kv('Prompts', String(sum.prompts)),
    h('div', { class: 'kv-row col' }, h('span', {}, 'Code changes'), h('span', { class: 'v' }, h('span', { class: 'plus' }, `${sum.add.toLocaleString()} added`), ', ', h('span', { class: 'minus' }, `${sum.del.toLocaleString()} removed`)))))
  const rows = all.filter(s => !q || cleanTitle(s.title).toLowerCase().includes(q) || (s.stats?.model ?? '').toLowerCase().includes(q))
  const active = rows.filter(s => open.has(s.sessionId))
  const empty = rows.filter(s => !open.has(s.sessionId) && s.stats && !s.stats.prompts)
  const rest = rows.filter(s => !open.has(s.sessionId) && !empty.includes(s))
  const groups = {}
  for (const s of rest) { const d = s.updatedAt ? new Date(s.updatedAt) : null; (groups[d ? relDay(d) : 'Older'] ??= []).push(s) }
  const row = s => {
    const x = s.stats
    const meta = [x?.model ? x.model.split('/').pop() : '', x?.prompts ? `${x.prompts} prompt${x.prompts > 1 ? 's' : ''}` : '', x?.cost ? money(x.cost) : ''].filter(Boolean).join(' · ')
    return h('button', { class: `session${open.has(s.sessionId) ? ' current' : ''}`, title: s.title ?? '', onclick: () => send({ type: 'loadSession', sessionId: s.sessionId }) },
      h('div', { class: 'srow' }, open.has(s.sessionId) ? h('span', { class: `live${busy.has(s.sessionId) ? ' busy' : ''}` }) : null,
        h('span', { class: 'session-title' }, cleanTitle(s.title)), h('span', { class: 'when' }, s.updatedAt ? ago(s.updatedAt) : '')),
      meta || x?.added || x?.removed ? h('div', { class: 'session-meta' }, meta, x && (x.added || x.removed) ? h('span', { class: 'diffstat' }, h('span', { class: 'plus' }, `+${x.added}`), ' ', h('span', { class: 'minus' }, `-${x.removed}`)) : null) : null)
  }
  const search = h('input', { type: 'search', class: 'search', placeholder: 'Search sessions…', value: S.sessionQuery, oninput: e => { S.sessionQuery = e.target.value; const p = e.target.selectionStart; render(); const f = document.querySelector('.search'); f.focus(); f.setSelectionRange(p, p) } })
  const sessions = collapsible('sessions', 'Sessions', h('span', { class: 'count' }, String(all.length)), h('div', { class: 'sb-body' },
    h('button', { class: 'sb-new', onclick: () => send({ type: 'newTab' }) }, svg(ICON.plus), 'New session'),
    search,
    !all.length ? h('div', { class: 'muted', style: 'padding:8px 4px' }, `No omp sessions in ${folderName(S.cwd)} yet.`) : null,
    active.length ? [h('div', { class: 'day' }, h('span', {}, 'Active'), h('span', { class: 'count' }, String(active.length))), active.map(row)] : null,
    Object.entries(groups).map(([day, list]) => [h('div', { class: 'day' }, h('span', {}, day), h('span', { class: 'count' }, String(list.length))), list.map(row)]),
    empty.length ? h('div', { class: 'sb-sub' }, collapsible('empty', 'Empty sessions', h('span', { class: 'count' }, String(empty.length)), h('div', {}, empty.map(row)))) : null))
  return [h('div', { class: 'page sidebar' }, usage, sessions)]
}
function relDay(d) {
  const day = 864e5, now = new Date(); const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (d.getTime() >= t0) return 'Today'
  if (d.getTime() >= t0 - day) return 'Yesterday'
  if (d.getTime() >= t0 - 6 * day) return 'This week'
  return d.toLocaleDateString()
}

// ───────────── settings ─────────────
const GROUPS = [['model', 'Models'], ['providers', 'Providers'], ['interaction', 'Interaction'], ['context', 'Context'], ['memory', 'Memory'], ['tools', 'Tools'], ['tasks', 'Tasks'], ['files', 'Files'], ['shell', 'Shell'], ['appearance', 'Appearance'], ['internal', 'Advanced']]
const isModelKey = k => k === 'modelRoles' || k === 'retry.fallbackChains' || /(^|\.)(model|smolModel|slowModel|planModel)$/.test(k)
const EFFORTS = ['', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const PAGE = 40
let settingsPage = 1
const prettify = k => { const last = k.split('.').pop(); return last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase()) }
const setSetting = (key, value) => send({ type: 'setSetting', key, value })

function modelPicker(value, onChange, allowEmpty) {
  const colon = value.lastIndexOf(':')
  const [base, effort] = colon > 0 && !value.slice(colon).includes(']') && !value.slice(colon + 1).includes('/') ? [value.slice(0, colon), value.slice(colon + 1)] : [value, '']
  const emit = (b, e) => onChange(b === '' ? '' : e ? `${b}:${e}` : b)
  const models = S.settings.models.length ? S.settings.models : S.models
  const sel = h('select', { onchange: e => emit(e.target.value, effort) },
    allowEmpty ? h('option', { value: '' }, '— none —') : null,
    base && !models.some(m => m.selector === base) ? h('option', { value: base, selected: true }, base) : null,
    Object.entries(models.reduce((a, m) => ((a[m.provider] ??= []).push(m), a), {})).map(([p, list]) => h('optgroup', { label: p }, list.map(m => h('option', { value: m.selector, selected: m.selector === base }, m.name)))))
  return h('span', { class: 'pair' }, sel, h('select', { disabled: base === '', onchange: e => emit(base, e.target.value) }, EFFORTS.map(x => h('option', { value: x, selected: x === effort }, x || 'effort: default'))))
}
function controlFor(s) {
  const text = typeof s.value === 'string' ? s.value : s.value == null ? '' : JSON.stringify(s.value)
  const commit = el => { if (el.value !== text) setSetting(s.key, s.type === 'number' ? Number(el.value) : el.value) }
  if (s.type === 'boolean') return h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: s.value === true, onchange: e => setSetting(s.key, e.target.checked) }), h('span'))
  if (s.type === 'enum') return h('select', { onchange: e => setSetting(s.key, e.target.value) }, (s.options ?? []).map(o => h('option', { value: o, selected: o === s.value }, o)))
  if (s.type === 'record' && isModelKey(s.key)) {
    const rec = s.value ?? {}
    return h('div', { class: 'kv' }, Object.entries(rec).map(([role, v]) => [h('span', { class: 'k' }, role),
      Array.isArray(v)
        ? h('span', { class: 'pair' }, v.map((sel, i) => modelPicker(sel, n => { const list = [...v]; if (n === '') list.splice(i, 1); else list[i] = n; setSetting(s.key, { ...rec, [role]: list }) }, true)))
        : modelPicker(String(v), n => setSetting(s.key, { ...rec, [role]: n })),
      Array.isArray(v) ? h('button', { class: 'add-btn', onclick: () => setSetting(s.key, { ...rec, [role]: [...v, (S.settings.models[0] ?? S.models[0])?.selector ?? ''] }) }, '+ fallback') : h('span')]))
  }
  if (s.type === 'string' && isModelKey(s.key)) return modelPicker(text, v => setSetting(s.key, v), true)
  if (s.choices?.kind === 'select') return h('select', { onchange: e => setSetting(s.key, e.target.value) },
    s.choices.values.includes(text) ? null : h('option', { value: text, selected: true }, text || '— none —'),
    s.choices.values.map(o => h('option', { value: o, selected: o === text }, o || '— none —')))
  if (s.choices?.kind === 'multi') {
    const list = Array.isArray(s.value) ? s.value.map(String) : []
    const rest = s.choices.values.filter(v => !list.includes(v))
    return h('div', { class: 'chips' }, list.map((v, i) => h('span', { class: 'tag' }, v,
      i > 0 ? h('button', { title: 'Move earlier', onclick: () => { const n = [...list]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setSetting(s.key, n) } }, '‹') : null,
      h('button', { title: 'Remove', onclick: () => setSetting(s.key, list.filter(x => x !== v)) }, '×'))),
      rest.length ? h('select', { onchange: e => { if (e.target.value) setSetting(s.key, [...list, e.target.value]) } }, h('option', { value: '' }, '+ Add'), rest.map(v => h('option', { value: v }, v))) : null)
  }
  if (s.type === 'array' && (s.value == null || (Array.isArray(s.value) && s.value.every(x => typeof x === 'string')))) {
    const list = Array.isArray(s.value) ? s.value : []
    const input = h('input', { type: 'text', placeholder: 'Add value and press Enter', onkeydown: e => { if (e.key === 'Enter' && input.value.trim()) setSetting(s.key, [...list, input.value.trim()]) } })
    return h('div', { class: 'chips' }, list.map((v, i) => h('span', { class: 'tag' }, v, h('button', { onclick: () => setSetting(s.key, list.filter((_, j) => j !== i)) }, '×'))), input)
  }
  if (s.type === 'record' && (s.value == null || Object.values(s.value).every(x => typeof x === 'string' || typeof x === 'number'))) {
    const rec = s.value ?? {}
    const approval = s.key === 'tools.approval'
    const k = approval ? h('select', {}, h('option', { value: '' }, 'tool…'), ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'find', 'lsp', 'web_search', 'web_fetch', 'browser', 'task', 'eval'].filter(t => !(t in rec)).map(t => h('option', { value: t }, t))) : h('input', { type: 'text', placeholder: 'key' })
    const v = approval ? h('select', {}, ['allow', 'prompt', 'deny'].map(o => h('option', { value: o }, o))) : h('input', { type: 'text', placeholder: 'value' })
    return h('div', { class: 'kv' },
      Object.entries(rec).map(([key, val]) => [h('span', { class: 'k' }, key), h('code', {}, String(val)), h('button', { class: 'add-btn', onclick: () => { const n = { ...rec }; delete n[key]; setSetting(s.key, n) } }, 'Remove')]),
      k, v, h('button', { class: 'add-btn', onclick: () => { if (!k.value || !v.value) return; const num = Number(v.value); setSetting(s.key, { ...rec, [k.value]: !approval && Number.isFinite(num) ? num : v.value }) } }, '+ Add'))
  }
  if (s.type === 'array' || s.type === 'record') {
    const ta = h('textarea', { class: 'field', rows: 4, style: 'width:100%;font-family:var(--vscode-editor-font-family)', onblur: e => { try { setSetting(s.key, JSON.parse(e.target.value)) } catch { /* keep draft */ } } })
    ta.value = s.value == null ? '' : JSON.stringify(s.value, null, 2)
    return ta
  }
  const input = h('input', { type: s.type === 'number' ? 'number' : /token|key|password|secret/i.test(s.key) ? 'password' : 'text', style: s.type === 'number' ? 'width:110px' : 'width:220px', onblur: e => commit(e.target), onkeydown: e => { if (e.key === 'Enter') commit(e.target) } })
  input.value = text
  return input
}
function settingRow(s) {
  const wide = s.type === 'record' || (s.type === 'array') || s.choices?.kind === 'multi'
  return h('div', { class: `row${wide ? ' wide' : ''}`, 'data-key': s.key },
    h('div', { class: 'meta' }, h('div', { class: 'name' }, prettify(s.key)), h('div', { class: 'key' }, s.key), s.description ? h('div', { class: 'desc' }, s.description) : null, S.settings.failed?.[s.key] ? h('div', { class: 'error' }, S.settings.failed[s.key]) : null),
    h('div', { class: 'control' }, controlFor(s), h('button', { class: 'reset', title: 'Reset to default', onclick: () => send({ type: 'resetSetting', key: s.key }) }, '↺')))
}
let settingsList = null
function renderSettingsList() {
  if (!settingsList) return
  const st = S.settings
  const q = S.query.trim().toLowerCase()
  const shown = st.settings.filter(s => q ? s.key.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) : s.group === S.group)
  settingsList.innerHTML = ''
  if (q) settingsList.append(h('div', { class: 'muted', style: 'padding:4px 2px' }, `${shown.length} results`))
  const card = h('div', { class: 'card' }, shown.slice(0, settingsPage * PAGE).map(settingRow))
  settingsList.append(card)
  if (shown.length > settingsPage * PAGE) settingsList.append(h('div', { class: 'pager' }, h('button', { class: 'add-btn', onclick: () => { settingsPage++; renderSettingsList() } }, `Show more (${shown.length - settingsPage * PAGE})`)))
}
function settingsView() {
  const st = S.settings
  const body = h('div', { class: 'page' })
  if (st.status !== 'ready' && !st.settings.length) {
    body.append(st.status === 'error' ? h('div', {}, h('div', { class: 'error' }, st.error), h('button', { class: 'add-btn', onclick: () => send({ type: 'loadSettings' }) }, 'Retry')) : h('div', { class: 'working', style: 'padding:12px' }, h('span', { class: 'spinner' }), 'Loading omp settings…'))
    return [backbar('Settings'), body]
  }
  const groups = GROUPS.filter(([g]) => st.settings.some(s => s.group === g))
  const search = h('input', { type: 'search', class: 'search', placeholder: `Search ${st.settings.length} omp settings…`, value: S.query, oninput: e => { S.query = e.target.value; settingsPage = 1; cats.style.display = S.query ? 'none' : ''; renderSettingsList() } })
  const cats = h('div', { class: 'cats', style: S.query ? 'display:none' : '' }, groups.map(([g, label]) => h('button', { class: `cat${g === S.group ? ' on' : ''}`, onclick: e => { S.group = g; settingsPage = 1; for (const c of cats.children) c.classList.toggle('on', c === e.currentTarget); renderSettingsList() } }, label)))
  settingsList = h('div', { class: 'settings-layout' })
  body.append(h('div', { class: 'muted', style: 'font-size:.86em' }, 'Saved to ~/.omp/agent/config.yml — the same file the omp TUI uses.'), search, cats, settingsList)
  renderSettingsList()
  return [backbar('Settings'), body]
}

// ───────────── render / wiring ─────────────
function render() {
  saveDraft()
  app.innerHTML = ''
  transcriptEl = null; settingsList = null
  const parts = S.view === 'chat' ? chatView() : S.view === 'history' ? historyView() : settingsView()
  app.append(...[parts].flat())
  if (S.fade) { app.children[1]?.classList.add('fade'); S.fade = false }
  const ta = document.getElementById('input')
  if (ta && S.active) { ta.value = S.drafts[S.active] ?? ''; autosize(ta) }
}

document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a.file')
  if (a) { e.preventDefault(); send({ type: 'openFile', path: a.dataset.path, ...a.dataset.line ? { line: Number(a.dataset.line) } : {} }); return }
  if (S.menu && !e.target.closest('.menu') && !e.target.closest('.chip-btn') && !e.target.closest('#input')) closeMenu()
})

window.addEventListener('message', ({ data: m }) => {
  switch (m.type) {
    case 'tabs': {
      const changedActive = m.active !== S.active
      const structure = S.tabs.map(t => t.id).join() !== m.tabs.map(t => t.id).join()
      S.tabs = m.tabs; S.models = m.models; S.cwd = m.cwd
      if (changedActive) { saveDraft(); S.active = m.active }
      if (S.view === 'chat') { if (changedActive || structure) render(); else refreshComposer() }
      else if (S.view === 'history' && structure) render()
      return
    }
    case 'tab': {
      const i = S.tabs.findIndex(t => t.id === m.tab.id)
      if (i < 0) return
      const was = S.tabs[i]
      S.tabs[i] = m.tab
      if (m.tab.busy && !was.busy) { const st = (STAT[m.tab.id] ??= { chars: 0, total: 0, t0: 0, last: 0 }); st.chars = 0; st.t0 = 0 }
      if (m.tab.id === S.active) refreshStatus()
      if (S.view !== 'chat') return
      // Tab strip (spinner / unread / title) always; composer and spinner only for the active tab.
      const strip = document.querySelector('.tabbar')
      if (strip) strip.replaceWith(tabbar().querySelector('.tabbar'))
      if (m.tab.id === S.active) { refreshComposer(); if (was.busy !== m.tab.busy || was.queued !== m.tab.queued) stickBottom(renderWorking) }
      return
    }
    case 'reset': {
      const same = JSON.stringify(S.transcripts[m.tab] ?? null) === JSON.stringify(m.items)
      S.transcripts[m.tab] = m.items
      if (!same && m.tab === S.active && S.view === 'chat') { S.open.clear(); render() }
      return
    }
    case 'upsert': {
      const list = (S.transcripts[m.tab] ??= [])
      const i = list.findIndex(x => x.id === m.item.id)
      trackStream(m.tab, m.item, i >= 0 ? list[i].text?.length : 0)
      if (i >= 0) list[i] = m.item; else list.push(m.item)
      if (m.tab === S.active && S.view === 'chat') { stickBottom(() => upsertNode(m.item)); updateWorking() }
      return
    }
    case 'files': if (S.menu === 'files' && m.query === S.fileQuery) { S.files = m.files; S.menuIndex = 0; refreshComposer() } return
    case 'sessions': S.sessions = m.rows; if (S.view === 'history') render(); return
    case 'settings': {
      const firstLoad = !S.settings.settings.length
      S.settings = m
      if (S.view !== 'settings') return
      if (firstLoad || m.status !== 'ready') render(); else renderSettingsList()
      return
    }
    case 'approval': S.approval = m.value; if (S.view === 'chat') refreshComposer(); return
    case 'view': go(m.view); return
    case 'insert': {
      if (S.view !== 'chat') go('chat')
      const ta = document.getElementById('input')
      ta.value = (ta.value ? ta.value + '\n' : '') + m.text; autosize(ta); ta.focus()
    }
  }
})


/** Tab icon: π; while running, 3 dots orbit in a small circle to its right. */
function piIcon(t) {
  const pi = svg('<path fill="currentColor" stroke="none" transform="scale(.6667)" d="M3 6.5C3 5.1 4.1 4 5.5 4H20a1.5 1.5 0 0 1 0 3h-3v8.5c0 .6.4 1 1 1 .4 0 .7-.2 1-.4a1.4 1.4 0 0 1 2 2c-.8.8-1.9 1.3-3 1.3-2.3 0-4-1.6-4-3.9V7H10v12.5a1.5 1.5 0 0 1-3 0V7h-1.5c-.8 0-1.5.7-1.5 1.5a1.5 1.5 0 0 1-3 0v-2Z"/>')
  pi.setAttribute('class', `tab-ico${t.busy ? ' busy' : ''}${t.unread ? ' unread' : ''}`)
  if (!t.busy) return pi
  const dots = h('span', { class: 'tab-spin' }, SPIN[spinAt])
  return h('span', { class: 'tab-ico-wrap' }, pi, dots)
}

/** Hover actions on a user message: fork the conversation, or rewind file edits made after it. */
function userActions(it) {
  const open = S.userMenu === it.id
  const btn = h('button', { class: 'icon-btn ua-btn', title: 'Fork / rewind', onclick: e => { e.stopPropagation(); S.userMenu = open ? null : it.id; upsertNode(it) } }, svg('<path d="M5 3 2 6l3 3"/><path d="M2 6h7a4 4 0 0 1 0 8H6"/>'))
  const pick = msg => { S.userMenu = null; upsertNode(it); send(msg) }
  return h('div', { class: 'ua' }, btn, open ? h('div', { class: 'ua-menu' },
    h('button', { class: 'menu-item', onclick: () => pick({ type: 'fork', tab: S.active }) }, 'Fork conversation'),
    h('button', { class: 'menu-item', onclick: () => pick({ type: 'rewind', tab: S.active, itemId: it.id }) }, 'Rewind code to here')) : null)
}
document.addEventListener('click', e => { if (S.userMenu && !e.target.closest('.ua')) { const it = items().find(x => x.id === S.userMenu); S.userMenu = null; if (it) upsertNode(it) } })

// CLI-style braille spinner beside π on running tabs; one shared timer.
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
let spinAt = 0
setInterval(() => { spinAt = (spinAt + 1) % SPIN.length; for (const el of document.querySelectorAll('.tab-spin')) el.textContent = SPIN[spinAt] }, 80)

/** omp `ask` tool: a form of choices; the answer goes back to omp. */
function askEl(it) {
  const props = Object.entries(it.schema.properties ?? {})
  const opts = p => p.oneOf?.map(o => ({ v: o.const, t: o.title, d: o.description })) ?? p.enum?.map(v => ({ v, t: v })) ?? p.items?.anyOf?.map(o => ({ v: o.const, t: o.title, d: o.description })) ?? p.items?.enum?.map(v => ({ v, t: v })) ?? null
  if (it.answer) {
    const c = it.answer.content ?? {}
    const label = (p, v) => (opts(p) ?? []).find(o => o.v === v)?.t ?? String(v)
    return h('div', { class: 'ask done' }, h('div', { class: 'ask-msg', html: md(it.message) }),
      it.answer.action !== 'accept' ? h('div', { class: 'muted' }, 'Skipped') :
        props.map(([k, p]) => h('div', { class: 'ask-ans' }, h('span', { class: 'muted' }, (p.title || k) + ': '), [c[k]].flat().map(v => label(p, v)).join(', '))))
  }
  const val = {}
  for (const [k, p] of props) if (p.default != null) val[k] = p.default
  const submit = h('button', { class: 'ask-submit', onclick: () => send({ type: 'answer', tab: S.active, itemId: it.id, action: 'accept', content: val }) }, 'Submit')
  const check = () => { submit.disabled = (it.schema.required ?? []).some(k => val[k] === undefined || val[k] === '' || (Array.isArray(val[k]) && !val[k].length)) }
  const fields = props.map(([k, p], qi) => {
    const o = opts(p)
    const head = h('div', { class: 'ask-q' }, props.length > 1 ? h('span', { class: 'ask-n' }, String(qi + 1)) : null, p.title || k)
    const desc = p.description ? h('div', { class: 'ask-d' }, p.description) : null
    let body
    if (o && p.type === 'array') {
      val[k] ??= []
      body = o.map(x => h('label', { class: 'ask-opt' }, h('input', { type: 'checkbox', onchange: e => { val[k] = e.target.checked ? [...val[k], x.v] : val[k].filter(v => v !== x.v); check() } }), h('span', {}, h('b', {}, x.t), x.d ? h('small', {}, x.d) : null)))
    } else if (o) {
      body = o.map((x, i) => h('label', { class: 'ask-opt' }, h('input', { type: 'radio', name: it.id + k, ...val[k] === x.v ? { checked: true } : {}, onchange: () => { val[k] = x.v; check() } }), h('span', { class: 'ask-key' }, String.fromCharCode(65 + i)), h('span', {}, h('b', {}, x.t), x.d ? h('small', {}, x.d) : null)))
    } else if (p.type === 'boolean') {
      val[k] ??= false
      body = h('label', { class: 'ask-opt' }, h('input', { type: 'checkbox', ...val[k] ? { checked: true } : {}, onchange: e => { val[k] = e.target.checked; check() } }), h('span', {}, 'Yes'))
    } else {
      body = h('textarea', { class: 'field ask-text', rows: 2, placeholder: 'Type your answer…', oninput: e => { val[k] = p.type === 'number' || p.type === 'integer' ? Number(e.target.value) : e.target.value; check() } })
    }
    return h('div', { class: 'ask-field' }, head, desc, body)
  })
  queueMicrotask(check)
  return h('div', { class: 'ask' }, h('div', { class: 'ask-msg', html: md(it.message) }), fields,
    h('div', { class: 'ask-actions' }, h('button', { class: 'ask-skip', onclick: () => send({ type: 'answer', tab: S.active, itemId: it.id, action: 'decline' }) }, 'Skip'), submit))
}

/** Image thumbnail; click opens it full size. */
function thumb(src) { return h('img', { src, class: 'thumb', title: 'Click to view', onclick: () => lightbox(src) }) }
function lightbox(src) {
  const close = () => { box.classList.add('out'); setTimeout(() => box.remove(), 150); document.removeEventListener('keydown', onKey) }
  const onKey = e => { if (e.key === 'Escape') close() }
  const box = h('div', { class: 'lightbox', onclick: close }, h('img', { src }))
  document.addEventListener('keydown', onKey)
  document.body.append(box)
}

// ───────────── status line (like omp CLI) ─────────────
/** Per-tab output stats: chars streamed this turn and when the turn's first chunk arrived. */
const STAT = {}
function trackStream(tabId, item, before) {
  if (item.type !== 'assistant' && item.type !== 'thought') return
  const s = (STAT[tabId] ??= { chars: 0, total: 0, t0: 0, last: 0 })
  const added = item.text.length - (before ?? 0)
  if (added <= 0) return
  const now = performance.now()
  if (!s.t0) s.t0 = now
  s.chars += added; s.total += added; s.last = now
}
const fmtTok = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(n)
const fmtDur = ms => { const m = Math.floor(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : m ? `${m}m` : `${Math.floor(ms / 1000)}s` }
function statusLine() {
  const t = tab(); const s = STAT[S.active] ?? { chars: 0, total: 0, t0: 0, last: 0 }
  const seg = (cls, icon, text, title) => text ? h('span', { class: `seg ${cls}`, title }, icon ? h('span', { class: 'seg-i' }, icon) : null, text) : null
  const u = t.usage ?? {}
  const pct = u.size ? (u.used ?? 0) / u.size * 100 : null
  const secs = s.t0 && s.last > s.t0 ? (s.last - s.t0) / 1000 : 0
  const rate = t.busy && secs > 1 ? (s.chars / 4 / secs).toFixed(1) : null
  const agents = activity().agents.length
  return h('div', { class: 'statusline', id: 'statusline' },
    seg('time', '⏱', t.startedAt ? fmtDur(Date.now() - t.startedAt) : '', 'Tab open for'),
    seg('path', '▣', t.folder ?? '', S.cwd),
    seg('git', '⎇', t.branch ?? '', 'Git branch'),
    agents ? seg('agents', '◆', String(agents), 'Subagents running') : null,
    h('span', { class: 'grow' }),
    seg('ctx', '', pct === null ? '' : `${pct.toFixed(1)}% · ${fmtTok(u.used ?? 0)}/${fmtTok(u.size)}`, 'Context used (omp)'),
    seg('out', '↑', s.total ? fmtTok(Math.round(s.total / 4)) : '', 'Output tokens this tab (estimated)'),
    seg('rate', '⚡', rate ? `${rate} tok/s` : '', 'Output speed (estimated)'),
    seg('cost', '', u.cost ? `$${u.cost.toFixed(u.cost < 1 ? 4 : 2)}` : '', 'Session cost (omp)'))
}
function refreshStatus() { const el = document.getElementById('statusline'); if (el) el.replaceWith(statusLine()) }
setInterval(() => { if (S.view === 'chat') refreshStatus() }, 1000)


/** Subagents still running and background services started in this chat. */
function activity() {
  const agents = [], jobs = []
  for (const it of items()) {
    if (it.type !== 'tool') continue
    const c = it.card, running = c.status === 'pending' || c.status === 'in_progress'
    const ti = taskInfo(c)
    if (ti && running) for (const t of ti.tasks) agents.push({ id: it.id, cid: c.id, label: t.name ?? 'task' })
    const bg = bgInfo(c)
    if (bg && c.status !== 'failed') jobs.push({ id: it.id, label: bg.name, command: bg.command.slice(0, 40) })
  }
  return { agents, jobs }
}
function bgChip() {
  const { agents, jobs } = activity()
  if (!agents.length && !jobs.length) return null
  const label = [agents.length ? `${agents.length} agent${agents.length > 1 ? 's' : ''}` : '', jobs.length ? `${jobs.length} bg` : ''].filter(Boolean).join(' · ')
  return h('button', { class: `chip-btn jobs${S.menu === 'jobs' ? ' open' : ''}`, title: 'Subagents and background jobs', onclick: () => openMenu('jobs') }, agents.length ? h('span', { class: 'tab-spin' }, SPIN[spinAt]) : h('span', { class: 'live busy' }), h('span', { class: 'label' }, label))
}
// live timers on running agent cards
setInterval(() => { for (const el of document.querySelectorAll('[data-t0]')) if (el.dataset.t0) el.textContent = since(Number(el.dataset.t0)) }, 1000)

// boot last: every const above must exist before the first render
render()
send({ type: 'ready' })
