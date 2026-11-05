// Oh My Pi chat webview. Plain DOM; state comes from the extension host via postMessage.
// eslint-disable-next-line no-undef
const vscode = acquireVsCodeApi()
const $ = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue
    if (k === 'class') el.className = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k === 'html') el.innerHTML = v
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)))
  return el
}
const send = msg => vscode.postMessage(msg)

const state = {
  view: 'chat', busy: false, items: [], models: [], model: undefined, thinking: undefined, thinkingLevels: [],
  mode: undefined, modes: [], commands: [], usage: {}, sessions: [], settings: { status: 'idle', settings: [], models: [], failed: {} },
  query: '', group: 'model', expanded: new Set(), images: [],
}

// ---------- markdown (small, safe) ----------
const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/(^|[\s(])((?:[A-Za-z]:)?[\w./\\-]+\.[A-Za-z0-9]{1,6})(?::(\d+))?(?=[\s).,;:]|$)/g,
      (m, pre, p, line) => p.includes('/') || p.includes('\\') ? `${pre}<a class="file" data-path="${p}"${line ? ` data-line="${line}"` : ''}>${p}${line ? ':' + line : ''}</a>` : m)
}
function markdown(src) {
  const out = []
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const fence = /^```(\w*)/.exec(l)
    if (fence) {
      const buf = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++])
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`)
      continue
    }
    const h = /^(#{1,4})\s+(.*)/.exec(l)
    if (h) { out.push(`<h${h[1].length + 2}>${inline(h[2])}</h${h[1].length + 2}>`); continue }
    if (/^\s*[-*]\s+/.test(l)) {
      const buf = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) buf.push(`<li>${inline(lines[i++].replace(/^\s*[-*]\s+/, ''))}</li>`)
      i--; out.push(`<ul>${buf.join('')}</ul>`); continue
    }
    if (/^\s*\d+\.\s+/.test(l)) {
      const buf = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) buf.push(`<li>${inline(lines[i++].replace(/^\s*\d+\.\s+/, ''))}</li>`)
      i--; out.push(`<ol>${buf.join('')}</ol>`); continue
    }
    if (/^\|.*\|$/.test(l.trim())) {
      const rows = []
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) rows.push(lines[i++])
      i--
      const cells = r => r.trim().slice(1, -1).split('|').map(c => c.trim())
      const body = rows.filter(r => !/^\|[\s:-]+\|/.test(r.trim()) || !/^[\s|:-]+$/.test(r))
      out.push(`<table>${body.map((r, n) => `<tr>${cells(r).map(c => n === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table>`)
      continue
    }
    if (/^>\s?/.test(l)) { out.push(`<blockquote>${inline(l.replace(/^>\s?/, ''))}</blockquote>`); continue }
    if (l.trim() === '') { out.push(''); continue }
    out.push(`<p>${inline(l)}</p>`)
  }
  return out.join('\n')
}

// ---------- rendering ----------
const app = document.getElementById('app')
const icons = { read: '📄', edit: '✏️', delete: '🗑', move: '↔', search: '🔍', execute: '▶', think: '💭', fetch: '🌐', other: '⚙' }

function toolEl(card) {
  const open = state.expanded.has(card.id)
  const statusIcon = card.status === 'completed' ? '✓' : card.status === 'failed' ? '✗' : '…'
  const rel = card.path ? card.path.replace(/\\/g, '/').split('/').slice(-2).join('/') : ''
  return $('div', { class: `tool ${card.status}` },
    $('div', { class: 'tool-head', onclick: () => { open ? state.expanded.delete(card.id) : state.expanded.add(card.id); render() } },
      $('span', { class: 'tool-icon' }, icons[card.kind] ?? icons.other),
      $('span', { class: 'tool-title' }, card.title),
      rel ? $('a', { class: 'file tool-path', 'data-path': card.path, onclick: e => { e.stopPropagation(); send({ type: 'openFile', path: card.path }) } }, rel) : null,
      card.diff ? $('button', { class: 'link', onclick: e => { e.stopPropagation(); send({ type: 'openDiff', toolId: card.id }) } }, 'diff') : null,
      $('span', { class: `tool-status s-${card.status}` }, statusIcon)),
    open ? $('div', { class: 'tool-body' },
      card.diff ? diffEl(card.diff) : null,
      card.input ? $('pre', { class: 'tool-input' }, card.input) : null,
      card.output ? $('pre', { class: 'tool-output' }, card.output) : null) : null)
}

function diffEl(d) {
  const a = d.oldText.split('\n'), b = d.newText.split('\n')
  const rows = []
  // ponytail: prefix/suffix trim, not a full LCS diff; omp edits are small hunks.
  let s = 0
  while (s < a.length && s < b.length && a[s] === b[s]) s++
  let ea = a.length - 1, eb = b.length - 1
  while (ea >= s && eb >= s && a[ea] === b[eb]) { ea--; eb-- }
  for (let i = Math.max(0, s - 2); i < s; i++) rows.push($('div', { class: 'd ctx' }, ' ' + a[i]))
  for (let i = s; i <= ea; i++) rows.push($('div', { class: 'd del' }, '-' + a[i]))
  for (let i = s; i <= eb; i++) rows.push($('div', { class: 'd add' }, '+' + b[i]))
  return $('div', { class: 'diff' }, rows)
}

function itemEl(item) {
  switch (item.type) {
    case 'user': return $('div', { class: 'msg user' }, $('div', { class: 'bubble', html: markdown(item.text) }))
    case 'assistant': return $('div', { class: 'msg assistant', html: markdown(item.text) })
    case 'thought': {
      const open = state.expanded.has(item.id)
      return $('div', { class: 'thought' },
        $('div', { class: 'thought-head', onclick: () => { open ? state.expanded.delete(item.id) : state.expanded.add(item.id); render() } }, open ? '▾ Thinking' : '▸ Thinking'),
        open ? $('div', { class: 'thought-body', html: markdown(item.text) }) : null)
    }
    case 'tool': return toolEl(item.card)
    case 'error': return $('div', { class: 'msg error' }, item.text)
  }
}

function modelLabel(sel) {
  const m = state.models.find(x => x.selector === sel)
  return m ? m.name : sel ?? 'Model'
}

function composer() {
  const ta = $('textarea', {
    id: 'input', rows: 3, placeholder: state.busy ? 'omp is working… (Esc to stop)' : 'Ask omp…  (Enter to send, Shift+Enter for newline, / for commands)',
    onkeydown: e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit() }
      if (e.key === 'Escape' && state.busy) send({ type: 'cancel' })
    },
    oninput: () => renderSlash(),
    onpaste: e => {
      for (const f of e.clipboardData?.files ?? []) if (f.type.startsWith('image/')) {
        const r = new FileReader()
        r.onload = () => { state.images.push({ mimeType: f.type, data: String(r.result).split(',')[1] }); render() }
        r.readAsDataURL(f)
      }
    },
  })
  const models = $('select', { class: 'pick', title: 'Model', onchange: e => send({ type: 'setModel', value: e.target.value }) },
    state.model && !state.models.some(m => m.selector === state.model) ? $('option', { value: state.model, selected: true }, state.model) : null,
    groupedModels())
  const thinking = state.thinkingLevels.length
    ? $('select', { class: 'pick', title: 'Thinking', onchange: e => send({ type: 'setThinking', value: e.target.value }) },
      state.thinkingLevels.map(l => $('option', { value: l, selected: l === state.thinking }, `🧠 ${l}`)))
    : null
  const mode = state.modes.length > 1
    ? $('select', { class: 'pick', title: 'Mode', onchange: e => send({ type: 'setMode', value: e.target.value }) },
      state.modes.map(m => $('option', { value: m.id, selected: m.id === state.mode }, m.name)))
    : null
  const usage = state.usage.size ? $('span', { class: 'usage' }, `${Math.round((state.usage.used ?? 0) / state.usage.size * 100)}% ctx${state.usage.cost ? ` · $${state.usage.cost.toFixed(3)}` : ''}`) : null
  return $('div', { class: 'composer' },
    $('div', { id: 'slash' }),
    state.images.length ? $('div', { class: 'attachments' }, state.images.map((img, i) => $('span', { class: 'chip' }, `🖼 image ${i + 1}`, $('button', { class: 'link', onclick: () => { state.images.splice(i, 1); render() } }, '×')))) : null,
    ta,
    $('div', { class: 'bar' }, mode, models, thinking, $('span', { class: 'grow' }), usage,
      state.busy
        ? $('button', { class: 'send stop', title: 'Stop (Esc)', onclick: () => send({ type: 'cancel' }) }, '■')
        : $('button', { class: 'send', title: 'Send (Enter)', onclick: submit }, '↑')))
}

function groupedModels() {
  const byProvider = {}
  for (const m of state.models) (byProvider[m.provider] ??= []).push(m)
  return Object.entries(byProvider).map(([p, list]) => $('optgroup', { label: p }, list.map(m => $('option', { value: m.selector, selected: m.selector === state.model }, m.name))))
}

function renderSlash() {
  const box = document.getElementById('slash')
  const ta = document.getElementById('input')
  if (!box || !ta) return
  box.innerHTML = ''
  const m = /^\/(\S*)$/.exec(ta.value)
  if (!m) return
  const hits = state.commands.filter(c => c.name.startsWith(m[1])).slice(0, 8)
  for (const c of hits) box.append($('div', { class: 'slash-item', onclick: () => { ta.value = `/${c.name} `; box.innerHTML = ''; ta.focus() } }, $('b', {}, '/' + c.name), ' ', c.description ?? ''))
}

function submit() {
  const ta = document.getElementById('input')
  const text = ta.value.trim()
  if ((!text && !state.images.length) || state.busy) return
  send({ type: 'prompt', text, images: state.images })
  ta.value = ''
  state.images = []
}

function header() {
  const tab = (id, label) => $('button', { class: `tab ${state.view === id ? 'on' : ''}`, onclick: () => { state.view = id; if (id === 'history') send({ type: 'listSessions' }); if (id === 'settings') send({ type: 'loadSettings' }); render() } }, label)
  return $('div', { class: 'header' }, tab('chat', 'Chat'), tab('history', 'History'), tab('settings', 'Settings'),
    $('span', { class: 'grow' }), $('button', { class: 'link', title: 'New session', onclick: () => send({ type: 'newSession' }) }, '+ New'))
}

function chatView() {
  const list = $('div', { class: 'transcript', id: 'transcript' },
    state.items.length ? state.items.map(itemEl) : $('div', { class: 'empty' }, $('div', { class: 'logo' }, 'π'), $('div', {}, 'Oh My Pi'), $('div', { class: 'hint' }, 'omp runs here with your ~/.omp config. Select code and press Ctrl+Alt+K to add it.')),
    state.busy ? $('div', { class: 'working' }, $('span', { class: 'dot' }), 'Working…') : null)
  return [list, composer()]
}

function historyView() {
  return $('div', { class: 'history' },
    state.sessions.length === 0 ? $('div', { class: 'hint' }, 'No omp sessions in this folder yet.') : null,
    state.sessions.map(s => $('div', { class: 'session', onclick: () => send({ type: 'loadSession', sessionId: s.sessionId }) },
      $('div', { class: 'session-title' }, s.title || '(untitled)'),
      $('div', { class: 'hint' }, s.updatedAt ? new Date(s.updatedAt).toLocaleString() : ''))))
}

// ---------- settings ----------
const GROUPS = ['model', 'providers', 'interaction', 'context', 'memory', 'tools', 'tasks', 'files', 'shell', 'appearance', 'internal']
const isModelKey = k => k === 'modelRoles' || k === 'retry.fallbackChains' || /(^|\.)(model|smolModel|slowModel|planModel)$/.test(k)
const EFFORTS = ['', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

function setSetting(key, value) { send({ type: 'setSetting', key, value }) }

function modelPicker(value, onChange, allowEmpty) {
  const colon = value.lastIndexOf(':')
  const [base, effort] = colon > 0 && !value.slice(colon).includes(']') && !value.slice(colon + 1).includes('/') ? [value.slice(0, colon), value.slice(colon + 1)] : [value, '']
  const emit = (b, e) => onChange(b === '' ? '' : e ? `${b}:${e}` : b)
  const models = state.settings.models
  return $('span', { class: 'pair' },
    $('select', { onchange: e => emit(e.target.value, effort) },
      allowEmpty ? $('option', { value: '' }, '— none —') : null,
      base && !models.some(m => m.selector === base) ? $('option', { value: base, selected: true }, base) : null,
      models.map(m => $('option', { value: m.selector, selected: m.selector === base }, `${m.name} — ${m.provider}`))),
    $('select', { onchange: e => emit(base, e.target.value), disabled: base === '' }, EFFORTS.map(x => $('option', { value: x, selected: x === effort }, x || 'effort: default'))))
}

function controlFor(s) {
  const disabled = state.settings.saving === s.key || s.redacted
  const text = typeof s.value === 'string' ? s.value : s.value == null ? '' : JSON.stringify(s.value)
  const commit = el => {
    const v = el.value
    if (v === text) return
    setSetting(s.key, s.type === 'number' ? Number(v) : v)
  }
  if (s.type === 'boolean') return $('input', { type: 'checkbox', class: 'switch', checked: s.value === true, disabled, onchange: e => setSetting(s.key, e.target.checked) })
  if (s.type === 'enum') return $('select', { disabled, onchange: e => setSetting(s.key, e.target.value) }, (s.options ?? []).map(o => $('option', { value: o, selected: o === s.value }, o)))
  if (s.type === 'record' && isModelKey(s.key)) {
    const rec = s.value ?? {}
    return $('div', { class: 'roles' }, Object.entries(rec).map(([role, v]) => $('div', { class: 'role-row' }, $('span', { class: 'role' }, role),
      Array.isArray(v)
        ? $('span', { class: 'chain' }, v.map((sel, i) => modelPicker(sel, n => { const list = [...v]; if (n === '') list.splice(i, 1); else list[i] = n; setSetting(s.key, { ...rec, [role]: list }) }, true)),
          $('button', { class: 'link', onclick: () => setSetting(s.key, { ...rec, [role]: [...v, state.settings.models[0]?.selector ?? ''] }) }, '+ fallback'))
        : modelPicker(String(v), n => setSetting(s.key, { ...rec, [role]: n })))))
  }
  if (s.type === 'string' && isModelKey(s.key)) return modelPicker(text, v => setSetting(s.key, v), true)
  if (s.choices?.kind === 'select') return $('select', { disabled, onchange: e => setSetting(s.key, e.target.value) },
    s.choices.values.includes(text) ? null : $('option', { value: text, selected: true }, text || '— none —'),
    s.choices.values.map(o => $('option', { value: o, selected: o === text }, o || '— none —')))
  if (s.choices?.kind === 'multi') {
    const list = Array.isArray(s.value) ? s.value.map(String) : []
    const rest = s.choices.values.filter(v => !list.includes(v))
    return $('div', { class: 'multi' },
      $('div', { class: 'chips' }, list.length ? null : $('span', { class: 'hint' }, 'Nothing selected'),
        list.map((v, i) => $('span', { class: 'chip' },
          i > 0 ? $('button', { class: 'link', onclick: () => { const n = [...list]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setSetting(s.key, n) } }, '‹') : null,
          v,
          i < list.length - 1 ? $('button', { class: 'link', onclick: () => { const n = [...list]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setSetting(s.key, n) } }, '›') : null,
          $('button', { class: 'link', onclick: () => setSetting(s.key, list.filter(x => x !== v)) }, '×')))),
      rest.length ? $('select', { onchange: e => { if (e.target.value) setSetting(s.key, [...list, e.target.value]) } }, $('option', { value: '' }, '+ Add'), rest.map(v => $('option', { value: v }, v))) : null)
  }
  if (s.type === 'array' && (s.value == null || (Array.isArray(s.value) && s.value.every(x => typeof x === 'string')))) {
    const list = Array.isArray(s.value) ? s.value : []
    const input = $('input', { type: 'text', placeholder: 'New value…', onkeydown: e => { if (e.key === 'Enter' && input.value.trim()) setSetting(s.key, [...list, input.value.trim()]) } })
    return $('div', { class: 'multi' }, list.map((v, i) => $('div', { class: 'list-row' }, $('code', {}, v), $('button', { class: 'link', onclick: () => setSetting(s.key, list.filter((_, j) => j !== i)) }, '×'))), input)
  }
  if (s.type === 'record' && (s.value == null || Object.values(s.value).every(x => typeof x === 'string' || typeof x === 'number'))) {
    const rec = s.value ?? {}
    const approval = s.key === 'tools.approval'
    const k = approval ? $('select', {}, $('option', { value: '' }, 'tool…'), ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'find', 'lsp', 'web_search', 'web_fetch', 'browser', 'task', 'eval'].filter(t => !(t in rec)).map(t => $('option', { value: t }, t))) : $('input', { type: 'text', placeholder: 'key' })
    const v = approval ? $('select', {}, ['allow', 'prompt', 'deny'].map(o => $('option', { value: o }, o))) : $('input', { type: 'text', placeholder: 'value' })
    return $('div', { class: 'roles' },
      Object.entries(rec).map(([key, val]) => $('div', { class: 'role-row' }, $('span', { class: 'role' }, key), $('code', {}, String(val)), $('button', { class: 'link', onclick: () => { const n = { ...rec }; delete n[key]; setSetting(s.key, n) } }, '×'))),
      $('div', { class: 'role-row' }, k, v, $('button', { class: 'link', onclick: () => { if (!k.value || !v.value) return; const num = Number(v.value); setSetting(s.key, { ...rec, [k.value]: !approval && Number.isFinite(num) ? num : v.value }) } }, '+ Add')))
  }
  if (s.type === 'array' || s.type === 'record') {
    const ta = $('textarea', { rows: 4, class: 'json', onblur: e => { try { setSetting(s.key, JSON.parse(e.target.value)) } catch { /* keep draft */ } } })
    ta.value = s.value == null ? '' : JSON.stringify(s.value, null, 2)
    return ta
  }
  const input = $('input', { type: s.type === 'number' ? 'number' : /token|key|password|secret/i.test(s.key) ? 'password' : 'text', disabled, onblur: e => commit(e.target), onkeydown: e => { if (e.key === 'Enter') commit(e.target) } })
  input.value = text
  return input
}

function settingsView() {
  const st = state.settings
  if (st.status === 'loading' && !st.settings.length) return $('div', { class: 'hint pad' }, 'Loading omp settings…')
  if (st.status === 'error') return $('div', { class: 'pad' }, $('div', { class: 'error' }, st.error), $('button', { onclick: () => send({ type: 'loadSettings' }) }, 'Retry'))
  const q = state.query.trim().toLowerCase()
  const groups = GROUPS.filter(g => st.settings.some(s => s.group === g))
  const shown = st.settings.filter(s => q ? s.key.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) : s.group === (groups.includes(state.group) ? state.group : groups[0]))
  const search = $('input', { type: 'search', class: 'search', placeholder: 'Search omp settings…', oninput: e => { state.query = e.target.value; renderKeepFocus('search') }, id: 'search' })
  search.value = state.query
  return $('div', { class: 'settings' },
    $('div', { class: 'hint' }, 'Saved to ~/.omp/agent/config.yml (same file as the omp TUI). Applies to new sessions.'),
    search,
    q ? $('div', { class: 'hint' }, `${shown.length} results`) : $('div', { class: 'tabs' }, groups.map(g => $('button', { class: `tab ${g === state.group ? 'on' : ''}`, onclick: () => { state.group = g; render() } }, g))),
    shown.map(s => $('div', { class: `row ${s.type === 'record' || s.type === 'array' ? 'wide' : ''}` },
      $('div', { class: 'meta' }, $('code', {}, s.key), s.description ? $('div', { class: 'hint' }, s.description) : null, st.failed?.[s.key] ? $('div', { class: 'error' }, st.failed[s.key]) : null),
      $('div', { class: 'control' }, controlFor(s), $('button', { class: 'link', title: 'Reset to default', onclick: () => send({ type: 'resetSetting', key: s.key }) }, '↺')))))
}

function renderKeepFocus(id) {
  const el = document.getElementById(id)
  const pos = el?.selectionStart
  render()
  const again = document.getElementById(id)
  if (again) { again.focus(); if (pos != null) again.setSelectionRange(pos, pos) }
}

function render() {
  const draft = document.getElementById('input')?.value
  const t = document.getElementById('transcript')
  const atBottom = !t || t.scrollHeight - t.scrollTop - t.clientHeight < 60
  app.innerHTML = ''
  app.append(header())
  if (state.view === 'chat') app.append(...chatView())
  if (state.view === 'history') app.append(historyView())
  if (state.view === 'settings') app.append(settingsView())
  const input = document.getElementById('input')
  if (input && draft !== undefined) input.value = draft
  const t2 = document.getElementById('transcript')
  if (t2 && atBottom) t2.scrollTop = t2.scrollHeight
}

// ---------- wiring ----------
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a.file')
  if (a) { e.preventDefault(); send({ type: 'openFile', path: a.dataset.path, ...a.dataset.line ? { line: Number(a.dataset.line) } : {} }) }
})

window.addEventListener('message', ({ data: m }) => {
  switch (m.type) {
    case 'state': Object.assign(state, { busy: m.busy, models: m.models, model: m.model, thinking: m.thinking, thinkingLevels: m.thinkingLevels, mode: m.mode, modes: m.modes, commands: m.commands }); break
    case 'reset': state.items = m.items; state.usage = {}; break
    case 'upsert': {
      const i = state.items.findIndex(x => x.id === m.item.id)
      if (i >= 0) state.items[i] = m.item; else state.items.push(m.item)
      break
    }
    case 'usage': state.usage = m; break
    case 'sessions': state.sessions = m.rows; break
    case 'settings': state.settings = m; break
    case 'view': state.view = m.view; if (m.view === 'history') send({ type: 'listSessions' }); if (m.view === 'settings') send({ type: 'loadSettings' }); break
    case 'insert': {
      state.view = 'chat'; render()
      const ta = document.getElementById('input')
      ta.value = (ta.value ? ta.value + '\n' : '') + m.text
      ta.focus()
      return
    }
  }
  render()
})

render()
send({ type: 'ready' })
