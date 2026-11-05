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

const S = {
  view: 'chat', busy: false, items: [], models: [], model: undefined, thinking: undefined, thinkingLevels: [], mode: undefined, modes: [],
  commands: [], usage: {}, sessions: [], sessionId: undefined, settings: { status: 'idle', settings: [], models: [], failed: {} },
  query: '', group: 'model', open: new Set(), images: [], menu: null, sessionQuery: '',
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
function toolEl(c, key) {
  const open = S.open.has(key)
  const t = toolTarget(c)
  const stat = c.diff ? diffStat(c.diff) : null
  const line = h('div', { class: 'tool-line', onclick: () => toggle(key) },
    h('span', { class: `bullet ${c.status}` }),
    h('span', { class: 'tool-verb' }, VERB[c.kind] ?? VERB.other),
    h('span', { class: `tool-target${t.file ? ' file' : ''}`, title: t.file ?? t.text, onclick: t.file ? e => { e.stopPropagation(); send({ type: 'openFile', path: t.file }) } : undefined }, t.text),
    stat ? h('span', { class: 'tool-stat' }, h('span', { class: 'plus' }, `+${stat.add}`), ' ', h('span', { class: 'minus' }, `-${stat.del}`)) : null)
  if (!open) return line
  return h('div', {}, line, h('div', { class: 'tool-detail' },
    c.title && c.title !== t.text ? h('div', { class: 'muted' }, c.title) : null,
    c.diff ? [diffEl(c.diff), h('div', { class: 'tool-actions' }, h('a', { onclick: () => send({ type: 'openDiff', toolId: c.id }) }, 'Open diff'), h('a', { onclick: () => send({ type: 'openFile', path: c.diff.path }) }, 'Open file'))] : null,
    !c.diff && c.output ? h('pre', {}, c.output.length > 4000 ? c.output.slice(0, 4000) + '\n…' : c.output) : null,
    !c.diff && !c.output && c.input ? h('pre', { class: 'muted' }, c.input) : null))
}

// ───────────── chat items (incremental) ─────────────
let transcriptEl = null
const nodes = new Map()
function toggle(key) { S.open.has(key) ? S.open.delete(key) : S.open.add(key); const it = S.items.find(x => x.id === key); if (it) upsertNode(it) }
function itemNode(it) {
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
  }
}
function upsertNode(it) {
  if (!transcriptEl) return
  const fresh = itemNode(it)
  const old = nodes.get(it.id)
  if (old) old.replaceWith(fresh); else transcriptEl.insertBefore(fresh, transcriptEl.querySelector('.working'))
  nodes.set(it.id, fresh)
}
function stickBottom(fn) {
  const t = transcriptEl; const near = !t || t.scrollHeight - t.scrollTop - t.clientHeight < 80
  fn(); if (t && near) t.scrollTop = t.scrollHeight
}
function renderWorking() {
  if (!transcriptEl) return
  transcriptEl.querySelector('.working')?.remove()
  if (S.busy) transcriptEl.append(h('div', { class: 'working' }, h('span', { class: 'spinner' }), 'Working…'))
}

// ───────────── views ─────────────
const app = document.getElementById('app')
function topbar(title, back) {
  return h('div', { class: 'topbar' },
    back ? h('button', { class: 'back', onclick: () => go('chat') }, svg(ICON.back), 'Back') : null,
    h('div', { class: 'title' }, back ? title : (title || '')),
    h('button', { class: 'icon-btn', title: 'New session', onclick: () => send({ type: 'newSession' }) }, svg(ICON.plus)),
    h('button', { class: 'icon-btn', title: 'History', onclick: () => go('history') }, svg(ICON.history)),
    h('button', { class: 'icon-btn', title: 'Settings', onclick: () => go('settings') }, svg(ICON.gear)))
}
function go(view) {
  S.view = view; S.menu = null
  if (view === 'history') send({ type: 'listSessions' })
  if (view === 'settings' && !S.settings.settings.length) send({ type: 'loadSettings' })
  render()
}
function sessionTitle() {
  const first = S.items.find(i => i.type === 'user')
  return first ? first.text.split('\n')[0].slice(0, 60) : ''
}

function chatView() {
  transcriptEl = h('div', { class: 'transcript' })
  nodes.clear()
  if (!S.items.length) {
    transcriptEl.append(h('div', { class: 'empty' }, h('div', { class: 'logo' }, 'π'), h('h2', {}, 'Oh My Pi'),
      h('div', { class: 'muted' }, 'omp runs here with your ~/.omp setup.'),
      h('div', { class: 'suggest' }, ['Explain this project structure', 'Find and fix a bug in the current file', 'Write tests for the selected code']
        .map(t => h('button', { onclick: () => { const ta = document.getElementById('input'); ta.value = t; ta.focus() } }, t)))))
  } else {
    for (const it of S.items) { const n = itemNode(it); nodes.set(it.id, n); transcriptEl.append(n) }
  }
  renderWorking()
  const wrap = h('div', { class: 'composer-wrap' }, composer())
  queueMicrotask(() => { transcriptEl.scrollTop = transcriptEl.scrollHeight })
  return [topbar(sessionTitle()), transcriptEl, wrap]
}

function modelName(sel) { return S.models.find(m => m.selector === sel)?.name ?? (sel ? sel.split('/').pop() : 'Model') }

function composer() {
  const ta = h('textarea', {
    id: 'input', rows: 1, placeholder: S.busy ? 'Queue a message, or Esc to stop' : 'Ask omp anything, / for commands',
    onkeydown: e => {
      if (S.menu === 'slash' && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(e.key)) return slashKey(e)
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit() }
      if (e.key === 'Escape') { if (S.menu) closeMenu(); else if (S.busy) send({ type: 'cancel' }) }
    },
    oninput: () => { autosize(ta); updateSlash(ta) },
    onpaste: e => {
      for (const f of e.clipboardData?.files ?? []) if (f.type.startsWith('image/')) {
        e.preventDefault()
        const r = new FileReader(); r.onload = () => { S.images.push({ mimeType: f.type, data: String(r.result).split(',')[1], url: r.result }); refreshComposer() }; r.readAsDataURL(f)
      }
    },
  })
  const plan = S.mode === 'plan'
  const pct = S.usage.size ? Math.round((S.usage.used ?? 0) / S.usage.size * 100) : null
  const box = h('div', { class: 'composer', id: 'composer' },
    S.images.length ? h('div', { class: 'attachments' }, S.images.map((img, i) => h('span', { class: 'attach' }, h('img', { src: img.url }), h('button', { onclick: () => { S.images.splice(i, 1); refreshComposer() } }, '×')))) : null,
    ta,
    h('div', { class: 'composer-bar' },
      S.modes.length > 1 ? h('button', { class: `chip-btn${plan ? ' plan' : ''}`, title: 'Plan mode (read-only planning)', onclick: () => send({ type: 'setMode', value: plan ? 'default' : 'plan' }) }, plan ? '⏸ Plan mode' : 'Plan') : null,
      h('button', { class: `chip-btn${S.menu === 'model' ? ' open' : ''}`, onclick: () => openMenu('model') }, h('span', { class: 'label' }, modelName(S.model)), svg(ICON.chevron)),
      S.thinkingLevels.length ? h('button', { class: `chip-btn${S.menu === 'thinking' ? ' open' : ''}`, onclick: () => openMenu('thinking') }, svg(ICON.brain), h('span', { class: 'label' }, S.thinking ?? 'auto')) : null,
      h('span', { class: 'grow' }),
      pct !== null ? h('span', { class: 'ctx', title: `${S.usage.used} / ${S.usage.size} tokens${S.usage.cost ? ` · $${S.usage.cost.toFixed(4)}` : ''}` }, `${pct}%`) : null,
      S.busy
        ? h('button', { class: 'send stop', title: 'Stop (Esc)', onclick: () => send({ type: 'cancel' }) }, svg(ICON.stop))
        : h('button', { class: 'send', title: 'Send (Enter)', onclick: submit }, svg(ICON.up))),
    menuEl())
  queueMicrotask(() => autosize(ta))
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

// menus
let slashIndex = 0
function openMenu(kind) { S.menu = S.menu === kind ? null : kind; refreshComposer(); if (S.menu === 'model') setTimeout(() => document.getElementById('model-filter')?.focus(), 0) }
function closeMenu() { S.menu = null; refreshComposer() }
function menuEl() {
  if (S.menu === 'model') {
    const q = (S.modelQuery ?? '').toLowerCase()
    const by = {}
    for (const m of S.models) if (!q || m.name.toLowerCase().includes(q) || m.selector.toLowerCase().includes(q)) (by[m.provider] ??= []).push(m)
    const filter = h('input', { type: 'text', id: 'model-filter', placeholder: 'Filter models…', value: S.modelQuery ?? '', oninput: e => { S.modelQuery = e.target.value; const pos = e.target.selectionStart; refreshComposer(); const f = document.getElementById('model-filter'); f.focus(); f.setSelectionRange(pos, pos) }, onkeydown: e => { if (e.key === 'Escape') closeMenu() } })
    return h('div', { class: 'menu', style: 'left:6px' }, filter,
      !S.models.length ? h('div', { class: 'menu-group' }, 'Loading models…') : null,
      Object.entries(by).map(([p, list]) => [h('div', { class: 'menu-group' }, p), list.slice(0, 60).map(m => h('button', { class: `menu-item${m.selector === S.model ? ' active' : ''}`, onclick: () => { send({ type: 'setModel', value: m.selector }); S.model = m.selector; S.modelQuery = ''; closeMenu() } }, h('span', { class: 'check' }, m.selector === S.model ? '✓' : ''), m.name))]))
  }
  if (S.menu === 'thinking') {
    return h('div', { class: 'menu', style: 'left:60px;min-width:160px' }, h('div', { class: 'menu-group' }, 'Thinking'),
      S.thinkingLevels.map(l => h('button', { class: `menu-item${l === S.thinking ? ' active' : ''}`, onclick: () => { send({ type: 'setThinking', value: l }); S.thinking = l; closeMenu() } }, h('span', { class: 'check' }, l === S.thinking ? '✓' : ''), l)))
  }
  if (S.menu === 'slash') {
    const hits = slashHits()
    if (!hits.length) return null
    return h('div', { class: 'menu', style: 'left:0;right:0' }, hits.map((c, i) => h('button', { class: `menu-item${i === slashIndex ? ' active' : ''}`, onclick: () => pickSlash(c) }, h('strong', {}, '/' + c.name), h('span', { class: 'desc' }, c.description ?? ''))))
  }
  return null
}
function slashHits() { const ta = document.getElementById('input'); const m = ta && /^\/(\S*)$/.exec(ta.value); return m ? S.commands.filter(c => c.name.startsWith(m[1])).slice(0, 10) : [] }
function updateSlash(ta) {
  const want = /^\/\S*$/.test(ta.value) && S.commands.length ? 'slash' : null
  if (want !== S.menu && (want === 'slash' || S.menu === 'slash')) { S.menu = want; slashIndex = 0; refreshComposer() }
  else if (want === 'slash') { slashIndex = 0; refreshComposer() }
}
function slashKey(e) {
  const hits = slashHits(); if (!hits.length) return
  e.preventDefault()
  if (e.key === 'ArrowDown') slashIndex = (slashIndex + 1) % hits.length
  else if (e.key === 'ArrowUp') slashIndex = (slashIndex - 1 + hits.length) % hits.length
  else return pickSlash(hits[slashIndex])
  refreshComposer()
}
function pickSlash(c) { const ta = document.getElementById('input'); ta.value = `/${c.name} `; S.menu = null; refreshComposer(); document.getElementById('input').focus() }

function submit() {
  const ta = document.getElementById('input')
  const text = ta.value.trim()
  if (!text && !S.images.length) return
  send({ type: 'prompt', text, images: S.images.map(({ mimeType, data }) => ({ mimeType, data })) })
  ta.value = ''; S.images = []; S.menu = null
  refreshComposer()
}

// history
function historyView() {
  const q = S.sessionQuery.toLowerCase()
  const rows = S.sessions.filter(s => !q || (s.title ?? '').toLowerCase().includes(q))
  const groups = {}
  for (const s of rows) { const d = s.updatedAt ? new Date(s.updatedAt) : null; const key = d ? relDay(d) : 'Older'; (groups[key] ??= []).push(s) }
  const search = h('input', { type: 'search', class: 'search', placeholder: 'Search sessions…', value: S.sessionQuery, oninput: e => { S.sessionQuery = e.target.value; const p = e.target.selectionStart; render(); const f = document.querySelector('.search'); f.focus(); f.setSelectionRange(p, p) } })
  return [topbar('History', true), h('div', { class: 'page' }, search,
    !S.sessions.length ? h('div', { class: 'muted', style: 'padding:10px' }, 'No omp sessions in this folder yet.') : null,
    Object.entries(groups).map(([day, list]) => [h('div', { class: 'day' }, day), list.map(s => h('button', { class: `session${s.sessionId === S.sessionId ? ' current' : ''}`, onclick: () => send({ type: 'loadSession', sessionId: s.sessionId }) },
      h('div', { class: 'session-title' }, (s.title || 'Untitled session').replace(/^\S*\s*ESC:\s*/, '')),
      h('div', { class: 'session-meta' }, s.updatedAt ? new Date(s.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')))]))]
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
    return [topbar('Settings', true), body]
  }
  const groups = GROUPS.filter(([g]) => st.settings.some(s => s.group === g))
  const search = h('input', { type: 'search', class: 'search', placeholder: `Search ${st.settings.length} omp settings…`, value: S.query, oninput: e => { S.query = e.target.value; settingsPage = 1; cats.style.display = S.query ? 'none' : ''; renderSettingsList() } })
  const cats = h('div', { class: 'cats', style: S.query ? 'display:none' : '' }, groups.map(([g, label]) => h('button', { class: `cat${g === S.group ? ' on' : ''}`, onclick: e => { S.group = g; settingsPage = 1; for (const c of cats.children) c.classList.toggle('on', c === e.currentTarget); renderSettingsList() } }, label)))
  settingsList = h('div', { class: 'settings-layout' })
  body.append(h('div', { class: 'muted', style: 'font-size:.86em' }, 'Saved to ~/.omp/agent/config.yml — the same file the omp TUI uses.'), search, cats, settingsList)
  renderSettingsList()
  return [topbar('Settings', true), body]
}

// ───────────── render / wiring ─────────────
function render() {
  const draft = document.getElementById('input')?.value
  app.innerHTML = ''
  transcriptEl = null; settingsList = null
  const parts = S.view === 'chat' ? chatView() : S.view === 'history' ? historyView() : settingsView()
  app.append(...[parts].flat())
  if (draft !== undefined && document.getElementById('input')) { const ta = document.getElementById('input'); ta.value = draft; autosize(ta) }
}

document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a.file')
  if (a) { e.preventDefault(); send({ type: 'openFile', path: a.dataset.path, ...a.dataset.line ? { line: Number(a.dataset.line) } : {} }); return }
  if (S.menu && S.menu !== 'slash' && !e.target.closest('.menu') && !e.target.closest('.chip-btn')) closeMenu()
})

window.addEventListener('message', ({ data: m }) => {
  switch (m.type) {
    case 'state': {
      const was = S.busy
      Object.assign(S, { busy: m.busy, models: m.models, model: m.model, thinking: m.thinking, thinkingLevels: m.thinkingLevels, mode: m.mode, modes: m.modes, commands: m.commands, sessionId: m.sessionId })
      if (S.view === 'chat') { refreshComposer(); if (was !== S.busy) stickBottom(renderWorking) }
      return
    }
    case 'reset': S.items = m.items; S.usage = {}; S.open.clear(); if (S.view === 'chat') render(); return
    case 'upsert': {
      const i = S.items.findIndex(x => x.id === m.item.id)
      const first = !S.items.length
      if (i >= 0) S.items[i] = m.item; else S.items.push(m.item)
      if (S.view !== 'chat') return
      if (first) { render(); return }
      stickBottom(() => upsertNode(m.item))
      if (m.item.type === 'user') document.querySelector('.topbar .title').textContent = sessionTitle()
      return
    }
    case 'usage': S.usage = m; if (S.view === 'chat') refreshComposer(); return
    case 'sessions': S.sessions = m.rows; if (S.view === 'history') render(); return
    case 'settings': {
      const firstLoad = !S.settings.settings.length
      S.settings = m
      if (S.view !== 'settings') return
      if (firstLoad || m.status !== 'ready') render(); else renderSettingsList()
      return
    }
    case 'view': go(m.view); return
    case 'insert': {
      if (S.view !== 'chat') go('chat')
      const ta = document.getElementById('input')
      ta.value = (ta.value ? ta.value + '\n' : '') + m.text; autosize(ta); ta.focus()
    }
  }
})

render()
send({ type: 'ready' })
