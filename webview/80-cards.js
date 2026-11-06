// Tab icon, fork/rewind menu, spinner, plan approval and ask forms, images.
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
    h('button', { class: 'menu-item', title: 'Go back to before this message in this tab and put it in the input to edit', onclick: () => pick({ type: 'editFrom', tab: S.active, itemId: it.id }) }, 'Fork conversation from here'),
    h('button', { class: 'menu-item', title: 'Undo file edits omp made after this message', onclick: () => pick({ type: 'rewind', tab: S.active, itemId: it.id }) }, 'Rewind code to here'),
    h('button', { class: 'menu-item', title: 'Both: undo the file edits and go back to this message', onclick: () => pick({ type: 'editFrom', tab: S.active, itemId: it.id, rewindCode: true }) }, 'Fork conversation and rewind code'),
    h('div', { class: 'menu-sep' }),
    h('button', { class: 'menu-item', title: 'Copy the whole chat so far into a new tab', onclick: () => pick({ type: 'fork', tab: S.active }) }, 'Duplicate chat in new tab')) : null)
}
document.addEventListener('click', e => { if (S.userMenu && !e.target.closest('.ua')) { const it = items().find(x => x.id === S.userMenu); S.userMenu = null; if (it) upsertNode(it) } })

// CLI-style braille spinner beside π on running tabs; one shared timer.
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
let spinAt = 0
setInterval(() => { spinAt = (spinAt + 1) % SPIN.length; for (const el of document.querySelectorAll('.tab-spin')) el.textContent = SPIN[spinAt] }, 80)

/** omp `ask` tool: a form of choices; the answer goes back to omp. */
/** omp's plan approval arrives as a one-question ask: "Approve plan "<file>" and start implementation?" + plan head. */
function planApproval(it) {
  const m = /^Approve plan "([^"]+)" and start implementation\?\n\n?([\s\S]*)$/u.exec(it.message ?? '')
  const props = Object.entries(it.schema.properties ?? {})
  if (!m || props.length !== 1) return null
  const [key, p] = props[0]
  const values = p.enum ?? p.oneOf?.map(o => o.const) ?? []
  if (values.length < 2) return null
  const yes = values.find(v => /approve|accept|yes|start|implement/i.test(v)) ?? values[0]
  const no = values.find(v => v !== yes)
  const answer = v => send({ type: 'answer', tab: S.active, itemId: it.id, action: 'accept', content: { [key]: v } })
  const picked = it.answer?.content?.[key]
  return h('div', { class: `plan-card${it.answer ? ' done' : ''}` },
    h('div', { class: 'plan-head' }, svg(MI.plan), h('b', {}, 'Plan ready'), h('span', { class: 'muted' }, m[1])),
    h('div', { class: 'plan-body msg', html: md(m[2]) }),
    it.answer ? h('div', { class: 'plan-result' }, it.answer.action !== 'accept' ? 'Skipped' : picked === yes ? h('span', { class: 'plus' }, '✓ Approved — implementing') : h('span', { class: 'minus' }, '✕ Kept planning'))
      : h('div', { class: 'plan-actions' },
        h('button', { class: 'ask-submit', onclick: () => answer(yes) }, 'Approve & start'),
        no ? h('button', { class: 'ask-skip', onclick: () => answer(no) }, 'Keep planning') : null))
}
function askEl(it) {
  const plan = planApproval(it)
  if (plan) return plan
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
