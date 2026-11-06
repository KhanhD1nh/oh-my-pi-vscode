// Todo bar and lists, in-chat permission cards.
// ───────────── todo (omp `todo` tool) ─────────────
/** Latest todo list in this chat, from the newest todo tool result. */
function latestTodo() {
  const list = items()
  for (let i = list.length - 1; i >= 0; i--) { const c = list[i].type === 'tool' ? list[i].card : null; if (c?.todo) return c.todo }
  return null
}
const TODO_ICON = { completed: '✓', in_progress: '▸', abandoned: '✕' }
function todoList(phases, compact) {
  return h('div', { class: `todo${compact ? ' compact' : ''}` }, phases.map(p => h('div', { class: 'todo-phase' },
    phases.length > 1 ? h('div', { class: 'todo-name' }, p.name, h('span', { class: 'muted' }, ` ${p.tasks.filter(t => t.status === 'completed').length}/${p.tasks.length}`)) : null,
    p.tasks.map(t => h('div', { class: `todo-item ${t.status}` }, h('span', { class: 'todo-box' }, TODO_ICON[t.status] ?? ''), h('span', {}, t.content))))))
}
/** Pinned above the composer while a list has open items; click to collapse. */
function todoBar() {
  const ph = latestTodo(); if (!ph) return null
  const all = ph.flatMap(p => p.tasks), done = all.filter(t => t.status === 'completed').length
  if (!all.length || done === all.length) return null
  const cur = all.find(t => t.status === 'in_progress')
  const open = !S.todoClosed
  return h('div', { class: 'todobar', id: 'todobar' },
    h('button', { class: 'todobar-head', onclick: () => { S.todoClosed = open; refreshTodo() } }, h('span', { class: `chev${open ? ' open' : ''}` }, '›'),
      h('span', { class: 'todobar-title' }, cur ? cur.content : 'Todo'), h('span', { class: 'muted' }, `${done}/${all.length}`),
      h('span', { class: 'todo-meter' }, h('span', { style: `width:${(done / all.length * 100).toFixed(0)}%` }))),
    open ? todoList(ph, true) : null)
}
function refreshTodo() { const el = document.getElementById('todobar'); const fresh = todoBar(); if (el) { if (fresh) el.replaceWith(fresh); else el.remove() } else if (fresh) document.querySelector('.composer-wrap')?.prepend(fresh) }

// ───────────── permission card ─────────────
function permissionEl(it) {
  const label = o => o.name
  if (it.chosen) {
    const o = it.options.find(x => x.optionId === it.chosen)
    return h('div', { class: 'perm done' }, h('span', { class: 'muted' }, 'Permission'), ' ', it.title, ' · ', h('b', { class: o?.kind?.startsWith('allow') ? 'plus' : 'minus' }, o ? label(o) : 'Cancelled'))
  }
  const order = { allow_once: 0, allow_always: 1, reject_once: 2, reject_always: 3 }
  const opts = [...it.options].sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9))
  return h('div', { class: 'perm' }, h('div', { class: 'perm-q' }, h('span', { class: 'perm-ico' }, '⚠'), h('span', {}, 'omp wants to: ', h('b', {}, it.title))),
    h('div', { class: 'perm-actions' }, opts.map((o, i) => h('button', { class: `perm-btn ${o.kind}`, title: i < 9 ? `Press ${i + 1}` : '', onclick: () => send({ type: 'permit', tab: S.active, itemId: it.id, optionId: o.optionId }) }, i < 9 ? h('span', { class: 'kbd' }, String(i + 1)) : null, label(o))),
      h('button', { class: 'perm-btn cancel', onclick: () => send({ type: 'permit', tab: S.active, itemId: it.id }) }, 'Esc')))
}
/** 1–9 pick an option on the newest open permission card; Esc cancels it (only when the input is empty). */
document.addEventListener('keydown', e => {
  const open = [...items()].reverse().find(x => x.type === 'permission' && !x.chosen); if (!open) return
  const ta = document.getElementById('input'); if (ta && ta.value && document.activeElement === ta) return
  const order = { allow_once: 0, allow_always: 1, reject_once: 2, reject_always: 3 }
  const opts = [...open.options].sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9))
  const n = Number(e.key)
  if (n >= 1 && n <= opts.length) { e.preventDefault(); send({ type: 'permit', tab: S.active, itemId: open.id, optionId: opts[n - 1].optionId }) }
  else if (e.key === 'Escape') { e.preventDefault(); send({ type: 'permit', tab: S.active, itemId: open.id }) }
})


// ───────────── goal ─────────────
/** Goal bar above the input: objective, turn count, state and controls. */
function goalBar() {
  const g = tab().goal; if (!g) return null
  const label = { active: 'Working', paused: 'Paused', done: 'Done', stopped: 'Stopped', limit: 'Limit reached' }[g.status]
  const btn = (text, action, cls = '') => h('button', { class: `goal-btn ${cls}`, onclick: () => send({ type: 'goal', tab: S.active, action }) }, text)
  return h('div', { class: `goalbar ${g.status}`, id: 'goalbar' },
    h('span', { class: 'goal-ico' }, g.status === 'active' && tab().busy ? runDot() : g.status === 'done' ? '✓' : '🎯'),
    h('span', { class: 'goal-text', title: g.objective }, g.objective),
    h('span', { class: 'goal-meta' }, `${label} · turn ${g.turns}/${g.maxTurns}${g.reason ? ` · ${g.reason}` : ''}`),
    g.status === 'active' ? btn('Pause', 'pause') : g.status === 'done' || g.status === 'stopped' ? null : btn(g.status === 'limit' ? 'More turns' : 'Resume', 'resume', 'primary'),
    g.status === 'done' || g.status === 'stopped' ? btn('Dismiss', 'stop', 'muted') : btn('Stop', 'stop', 'muted'))
}
function refreshGoal() { const el = document.getElementById('goalbar'); const fresh = goalBar(); if (el) { if (fresh) el.replaceWith(fresh); else el.remove() } else if (fresh) document.querySelector('.composer-wrap')?.prepend(fresh) }
