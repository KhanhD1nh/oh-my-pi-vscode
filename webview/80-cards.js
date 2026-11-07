// Tab icon, fork/rewind menu, spinner, plan approval and ask forms, images.
/** Tab icon: π; while running, 3 dots orbit in a small circle to its right. */
function piIcon(t) {
  const pi = svg('<path fill="currentColor" stroke="none" transform="scale(.6667)" d="M3 6.5C3 5.1 4.1 4 5.5 4H20a1.5 1.5 0 0 1 0 3h-3v8.5c0 .6.4 1 1 1 .4 0 .7-.2 1-.4a1.4 1.4 0 0 1 2 2c-.8.8-1.9 1.3-3 1.3-2.3 0-4-1.6-4-3.9V7H10v12.5a1.5 1.5 0 0 1-3 0V7h-1.5c-.8 0-1.5.7-1.5 1.5a1.5 1.5 0 0 1-3 0v-2Z"/>')
  pi.setAttribute('class', `tab-ico${t.busy ? ' busy' : ''}${t.unread ? ' unread' : ''}`)
  if (!t.busy) return pi
  const dots = runDot()
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

// CLI-style braille spinner. Only the main "Working…" line animates (.tab-spin.spin-main); every other running
// marker is a still dot, so one thing moves on screen instead of five. 10 frames/s, and no work at all when
// nothing is running.
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
let spinAt = 0
/**
 * Every periodic UI update goes through this one ticker: spinner (each tick), clocks and status (once a
 * second). It stops while the page is hidden — a background chat tab or a collapsed panel costs nothing —
 * and catches up in one go when shown again.
 */
const EVERY_SECOND = []
let tickN = 0, ticker = null
function tick() {
  tickN++
  const live = document.querySelectorAll('.tab-spin.spin-main')
  if (live.length) { spinAt = (spinAt + 1) % SPIN.length; for (const el of live) el.textContent = SPIN[spinAt] }
  if (tickN % 10 === 0) for (const f of EVERY_SECOND) f()
}
function setTicker(on) {
  if (on && !ticker) { ticker = setInterval(tick, 100); for (const f of EVERY_SECOND) f() }
  if (!on && ticker) { clearInterval(ticker); ticker = null }
}
document.addEventListener('visibilitychange', () => setTicker(!document.hidden))
setTicker(!document.hidden)
/** Still marker for secondary "running" places (subagent rows, goal bar, chips). */
function runDot() { return h('span', { class: 'run-dot', 'aria-hidden': 'true' }) }

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
  if (it.hold === 'ssh') return h('div', { class: 'notice' }, h('span', { class: 'notice-ico', 'aria-hidden': 'true' }, it.answer ? '✓' : '🔑'), it.answer ? 'SSH key loaded — omp continues' : 'omp is waiting for you to unlock the SSH key (box above the input)')
  const plan = planApproval(it)
  if (plan) return plan
  // omp adds "<id>__other" free-text fields next to each choice question; they render as an "Other" box
  const all = Object.entries(it.schema.properties ?? {})
  const props = all.filter(([k]) => !k.endsWith('__other'))
  const other = k => all.find(([o]) => o === k + '__other')
  const opts = p => p.oneOf?.map(o => ({ v: o.const, t: o.title, d: o.description })) ?? p.enum?.map(v => ({ v, t: v })) ?? p.items?.anyOf?.map(o => ({ v: o.const, t: o.title, d: o.description })) ?? p.items?.enum?.map(v => ({ v, t: v })) ?? null
  const done = !!it.answer
  const c = it.answer?.content ?? {}
  const val = {}
  if (!done) for (const [k, p] of all) if (p.default != null) val[k] = p.default
  const n = props.length
  const key = 'ask:' + it.id
  // answered cards can fold to their header; open ones are always shown
  const open = !done || !S.open.has(key)
  const status = done ? (it.answer.action === 'accept' ? 'Answered' : 'Skipped') : 'Waiting for your answer'
  const toggle = () => { S.open.has(key) ? S.open.delete(key) : S.open.add(key); upsertNode(it) }
  const head = h('div', { class: 'q-head', ...done ? { role: 'button', tabindex: '0', 'aria-expanded': open ? 'true' : 'false', onclick: toggle, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } } } : {} },
    h('div', { class: 'q-title' }, 'Question'),
    h('div', { class: 'q-sub' }, status + ' · ' + n + ' question' + (n === 1 ? '' : 's'), done ? h('span', { class: 'q-chev' + (open ? ' open' : '') }, '⌃') : null))
  if (!open) return h('div', { class: 'q done' }, head)
  const submit = done ? null : h('button', { class: 'ask-submit', onclick: () => send({ type: 'answer', tab: S.active, itemId: it.id, action: 'accept', content: val }) }, 'Submit')
  const check = () => { if (submit) submit.disabled = (it.schema.required ?? []).some(k => val[k] === undefined || val[k] === '' || (Array.isArray(val[k]) && !val[k].length)) && !props.some(([k]) => val[k + '__other']) }
  const blocks = props.map(([k, p], qi) => {
    const o = opts(p)
    const chosen = done ? [c[k]].flat().filter(v => v !== undefined) : null
    const isRec = v => p.default != null && v === p.default && !/recommended/iu.test(String((o ?? []).find(x => x.v === v)?.t ?? ''))
    let body
    if (o) {
      const multi = p.type === 'array'
      if (multi && !done) val[k] ??= []
      body = h('div', { class: 'q-opts', role: multi ? 'group' : 'radiogroup', 'aria-label': p.title || k }, o.map(x => {
        const on = done ? chosen.includes(x.v) : multi ? val[k].includes(x.v) : val[k] === x.v
        return h('label', { class: 'q-opt' + (on ? ' on' : '') + (done ? ' ro' : '') },
          h('input', { type: multi ? 'checkbox' : 'radio', name: it.id + k, ...on ? { checked: true } : {}, ...done ? { disabled: true } : {},
            onchange: e => {
              if (multi) val[k] = e.target.checked ? [...val[k], x.v] : val[k].filter(v => v !== x.v); else val[k] = x.v
              check()
              e.target.closest('.q-opts').querySelectorAll('.q-opt').forEach(l => l.classList.toggle('on', l.querySelector('input').checked))
            } }),
          h('span', { class: 'q-opt-text' }, h('b', {}, x.t, isRec(x.v) ? ' (Recommended)' : null), x.d ? h('small', {}, x.d) : null))
      }))
    } else if (p.type === 'boolean') {
      if (!done) val[k] ??= false
      const on = done ? !!c[k] : val[k]
      body = h('label', { class: 'q-opt' + (on ? ' on' : '') + (done ? ' ro' : '') }, h('input', { type: 'checkbox', ...on ? { checked: true } : {}, ...done ? { disabled: true } : {}, onchange: e => { val[k] = e.target.checked; check() } }), h('span', { class: 'q-opt-text' }, h('b', {}, 'Yes')))
    } else {
      body = done ? h('div', { class: 'q-text-ans' }, String(c[k] ?? '—')) : h('textarea', { class: 'field ask-text', rows: 2, placeholder: 'Type your answer…', oninput: e => { val[k] = p.type === 'number' || p.type === 'integer' ? Number(e.target.value) : e.target.value; check() } })
    }
    const ot = other(k)
    const otherBox = !ot ? null : done ? (c[ot[0]] ? h('div', { class: 'q-text-ans' }, h('span', { class: 'muted' }, 'Other: '), String(c[ot[0]])) : null)
      : h('input', { type: 'text', class: 'field q-other', placeholder: 'Other — type your own answer', oninput: e => { val[ot[0]] = e.target.value; check() } })
    return h('div', { class: 'q-block' },
      h('div', { class: 'q-question' }, n > 1 ? h('span', { class: 'ask-n' }, String(qi + 1)) : null, p.title || k),
      p.description && p.description !== p.title ? h('div', { class: 'ask-d' }, p.description) : null,
      body, otherBox)
  })
  queueMicrotask(check)
  // with one question the message usually repeats it: show the message only when it says something else
  const msg = n === 1 && props[0][1].title && it.message.trim() === String(props[0][1].title).trim() ? null : h('div', { class: 'ask-msg', html: md(it.message) })
  return h('div', { class: 'q' + (done ? ' done' : '') }, head,
    h('div', { class: 'q-card' }, msg, blocks,
      done ? (it.answer.action !== 'accept' ? h('div', { class: 'muted' }, 'Skipped') : null)
        : h('div', { class: 'ask-actions' }, h('button', { class: 'ask-skip', onclick: () => send({ type: 'answer', tab: S.active, itemId: it.id, action: 'decline' }) }, 'Skip'), submit)))
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
