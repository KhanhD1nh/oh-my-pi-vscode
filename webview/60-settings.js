// Settings view: omp config with choice controls.
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
