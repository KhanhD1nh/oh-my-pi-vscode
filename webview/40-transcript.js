// Transcript nodes: incremental upsert, timeline steps, working line.
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
  if (it.type === 'user') return h('div', { class: 'user-wrap' }, it.images?.length ? h('div', { class: 'user-imgs' }, it.images.map(i => thumb(`data:${i.mimeType};base64,${i.data}`))) : null, h('div', { class: `msg user${it.text?.trim() ? '' : ' no-text'}` }, it.text?.trim() ? h('div', { class: 'msg-text', html: md(it.text) }) : null, userActions(it)), it.at ? h('div', { class: 'msg-time', title: new Date(it.at).toLocaleString() }, clock(it.at)) : null)
  const state = it.type === 'tool' ? it.card.status : it.type === 'error' ? 'failed' : it.type === 'notice' ? 'text notice-step' : 'text'
  return h('div', { class: `step ${state}` }, itemBody(it))
}
function itemBody(it) {
  switch (it.type) {
    case 'user': return h('div', { class: 'msg user', html: md(it.text) })
    case 'assistant': return [h('div', { class: 'msg', html: md(it.text) }), replyFoot(it)]
    case 'thought': {
      const open = S.open.has(it.id)
      return h('div', { class: 'thought' }, h('div', { class: 'thought-head', onclick: () => toggle(it.id) }, svg(ICON.brain), open ? 'Thinking' : it.at && it.end && it.end - it.at >= 1000 ? `Thought for ${took(it.end - it.at)}` : 'Thought for a moment', open ? '' : ' ›'),
        open ? h('div', { class: 'thought-body', html: md(it.text) }) : null)
    }
    case 'tool': return toolEl(it.card, it.id)
    case 'error': return h('div', { class: 'msg error' }, it.text)
    case 'notice': return h('div', { class: 'notice' }, h('span', { class: 'notice-ico', 'aria-hidden': 'true' }, '↻'), it.text, it.at ? h('span', { class: 'notice-at' }, clock(it.at)) : null)
    case 'ask': return askEl(it)
    case 'permission': return permissionEl(it)
  }
}
/**
 * Under each reply: when it finished, how long the turn took (from your prompt), Copy for the raw Markdown.
 * Shown on hover while streaming, always once the reply is done.
 */
function replyFoot(it) {
  const end = it.end ?? it.at
  // it.since = your prompt's time, stamped by the host when the reply started; no list scan per reply.
  const span = it.since && end ? end - it.since : null
  const copy = h('button', { class: 'foot-btn copy-reply', title: 'Copy reply (Markdown)', 'aria-label': 'Copy reply' }, svg(ICON.copy))
  copy.dataset.text = it.text
  return h('div', { class: 'reply-foot' },
    end ? h('span', { class: 'foot-time', title: new Date(end).toLocaleString() }, clock(end)) : null,
    span && span >= 1000 ? h('span', { class: 'foot-took', title: 'From your message to the end of this reply' }, took(span)) : null,
    copy)
}
/**
 * A card rebuilt while you read it must not jump: carry every scrolled box (subagent step lists, long
 * outputs, diffs) from the old node into the new one. Step lists are moved over as they are — the same
 * element, so its scroll position and an in-progress scrollbar drag survive; other boxes get their offset back.
 */
function keepScrolledParts(old, fresh) {
  // Moving an element out of the page resets its scroll offset, even when it comes straight back: read every
  // offset first, put them back right after the swap (same task, before the next paint, so nothing jumps).
  const restore = []
  // a half-typed passphrase (and the chosen key) survive the card being rebuilt by an omp update
  const pass = old.querySelector('.ssh-pass'), slot = fresh.querySelector('.ssh-pass')
  if (pass && slot) { const v = pass.value, focused = document.activeElement === pass; slot.value = v; restore.push(() => { if (focused) slot.focus() }) }
  const key = old.querySelector('.ssh-key'), keySlot = fresh.querySelector('.ssh-key')
  if (key && keySlot) keySlot.value = key.value
  for (const list of old.querySelectorAll('.agent-steps[data-k]')) {
    const slot = fresh.querySelector(`.agent-steps[data-k="${CSS.escape(list.dataset.k)}"]`)
    if (!slot) continue
    const top = list.scrollTop
    slot.replaceWith(list)
    restore.push(() => { list.scrollTop = top })
  }
  for (const sel of ['.io pre', '.tool-out', '.diff']) {
    const tops = [...old.querySelectorAll(sel)].map(e => e.scrollTop)
    fresh.querySelectorAll(sel).forEach((e, i) => { if (tops[i]) restore.push(() => { e.scrollTop = tops[i] }) })
  }
  return () => { for (const f of restore) f() }
}
function upsertNode(it) {
  if (!transcriptEl) return
  transcriptEl.querySelector('.empty')?.remove()
  if (nodes.has(it.id) && nodes.get(it.id) === null) return // inside a collapsed group
  const old = nodes.get(it.id)
  // Streaming text: swap only the message body's HTML instead of rebuilding the step (keeps the node, its
  // classes and listeners; the browser re-lays out one block, not the whole step).
  if (old && it.type === 'assistant') {
    const body = old.querySelector(':scope > .msg')
    if (body) {
      const html = md(it.text); if (body.innerHTML !== html) body.innerHTML = html
      const foot = old.querySelector(':scope > .reply-foot'); if (foot) foot.replaceWith(replyFoot(it))
      return
    }
  }
  const fresh = itemNode(it)
  if (old) { const restore = keepScrolledParts(old, fresh); old.replaceWith(fresh); restore() } else { fresh.classList.add('enter'); transcriptEl.insertBefore(fresh, transcriptEl.querySelector('.working')) }
  nodes.set(it.id, fresh)
}
/** Upserts arriving within one frame are applied together: one layout per frame however fast tokens come. */
const frameQueue = new Map()
let frameScheduled = false
/** Streaming text is shown at most this often; new steps (tools, cards, prompts) still show at once. */
const STREAM_MS = 80
let lastFlush = 0
function queueUpsert(it, after) {
  frameQueue.set(it.id, { it, after })
  if (frameScheduled) return
  frameScheduled = true
  const streaming = it.type === 'assistant' || it.type === 'thought'
  const wait = streaming ? Math.max(0, STREAM_MS - (performance.now() - lastFlush)) : 0
  // rAF never fires in a hidden page; the timer path keeps a backgrounded chat current for when it is shown.
  setTimeout(() => { if (document.hidden) flushFrame(); else requestAnimationFrame(flushFrame) }, wait)
}
function flushFrame() {
  if (!frameScheduled) return
  frameScheduled = false
  lastFlush = performance.now()
  const batch = [...frameQueue.values()]; frameQueue.clear()
  if (!batch.length) return
  // One layout read before writing and none after: no forced synchronous layout per token.
  const t = transcriptEl
  const near = !t || t.scrollHeight - t.scrollTop - t.clientHeight < 80
  for (const { it } of batch) upsertNode(it)
  for (const { after } of batch) after?.()
  if (t && near) requestAnimationFrame(() => { t.scrollTop = t.scrollHeight })
  else document.getElementById('to-latest')?.classList.add('new')
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
  const run = [...turn].reverse().find(x => x.type === 'tool' && (x.card.status === 'pending' || x.card.status === 'in_progress'))
  const what = run ? (run.card.name === 'wait' ? 'Waiting' : verbOf(run.card)) + (() => { let i = {}; try { i = JSON.parse(run.card.input ?? '{}') } catch {} const s = i.i ?? (run.card.name === 'task' ? '' : run.card.title); return s ? ' · ' + String(s).slice(0, 60) : '' })() : ''
  const verb = last?.type === 'thought' ? 'Thinking…' : what ? what + '…' : last?.type === 'assistant' ? 'Writing…' : 'Working…'
  const tokens = Math.round(chars / 4)
  el.textContent = tokens ? `${verb} · ${tokens.toLocaleString()} tokens` : verb
}
function renderWorking() {
  if (!transcriptEl) return
  transcriptEl.querySelector('.working')?.remove()
  const t = tab()
  if (t.busy) { transcriptEl.append(h('div', { class: 'working' }, h('span', { class: 'work-ico', 'aria-hidden': 'true' }, h('span', { class: 'tab-spin spin-main' }, SPIN[spinAt])), h('span', { class: 'working-label' }), t.queued ? h('span', { class: 'muted' }, ` · ${t.queued} queued`) : null)); updateWorking() }
}

/** "↓" over the composer while you read further up; it pulses when something new arrived below. */
function syncLatest() {
  const b = document.getElementById('to-latest'); const t = transcriptEl; if (!b || !t) return
  const away = t.scrollHeight - t.scrollTop - t.clientHeight > 160
  b.classList.toggle('show', away)
  if (!away) b.classList.remove('new')
}

// ───────────── grouped tool runs ─────────────
const GROUP_MIN = 4
const groupable = it => it.type === 'tool' && (it.card.status === 'completed' || it.card.status === 'failed') && !it.card.todo && !taskInfo(it.card) && !bgInfo(it.card) && !it.card.needsInput
/** Runs of finished tool steps in `list` (indexes), excluding the tail of the current turn while it runs. */
function toolRuns(list) {
  const runs = []; let start = -1
  const close = end => { if (start >= 0 && end - start >= GROUP_MIN) runs.push([start, end]); start = -1 }
  list.forEach((it, i) => { if (groupable(it)) { if (start < 0) start = i } else close(i) })
  // while busy, the newest run stays expanded: you are watching it happen
  if (start >= 0 && !tab().busy) close(list.length); else start = -1
  return runs
}
function groupSummary(its) {
  const by = new Map(); for (const it of its) { const v = verbOf(it.card); by.set(v, (by.get(v) ?? 0) + 1) }
  const t0 = Math.min(...its.map(x => x.card.startedAt ?? Infinity)), t1 = Math.max(...its.map(x => x.card.endedAt ?? 0))
  return { parts: [...by].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${n} ${v}`), ms: isFinite(t0) && t1 > t0 ? t1 - t0 : 0 }
}
function groupNode(its) {
  const key = 'g:' + its[0].id
  const open = S.open.has(key)
  const { parts, ms } = groupSummary(its)
  const el = h('div', { class: `step completed tool-group${open ? ' open' : ''}`, 'data-group': key },
    h('div', { class: 'tool-line group-line', role: 'button', tabindex: '0', 'aria-expanded': open ? 'true' : 'false', onclick: () => toggleGroup(key), onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroup(key) } } },
      h('span', { class: 'chev' + (open ? ' open' : '') }, '›'),
      h('span', { class: 'tool-verb' }, `${its.length} steps`),
      h('span', { class: 'tool-target' }, parts.slice(0, 4).join(' · ') + (parts.length > 4 ? ' …' : '')),
      its.some(x => x.card.status === 'failed') ? h('span', { class: 'group-failed' }, `${its.filter(x => x.card.status === 'failed').length} failed`) : null,
      ms >= 1000 ? h('span', { class: 'tool-time' }, took(ms)) : null))
  return el
}
function toggleGroup(key) { S.open.has(key) ? S.open.delete(key) : S.open.add(key); const t = transcriptEl, top = t?.scrollTop; render(); if (t && transcriptEl) transcriptEl.scrollTop = top }

/** "23 tools · 4 files (+120 −30) · 3m 12s" under a prompt once its turn is over. */
function turnSummary(list, i) {
  let j = i + 1; while (j < list.length && list[j].type !== 'user') j++
  if (j === list.length && tab().busy) return null
  const turn = list.slice(i + 1, j)
  const tools = turn.filter(x => x.type === 'tool')
  if (tools.length < 2) return null
  const files = new Map()
  for (const x of tools) if (x.card.diff) { const s = diffStat(x.card.diff), f = files.get(x.card.diff.path) ?? { add: 0, del: 0 }; f.add += s.add; f.del += s.del; files.set(x.card.diff.path, f) }
  const add = [...files.values()].reduce((n, f) => n + f.add, 0), del = [...files.values()].reduce((n, f) => n + f.del, 0)
  const failed = tools.filter(x => x.card.status === 'failed').length
  const start = list[i].at, end = Math.max(0, ...turn.map(x => x.end ?? x.card?.endedAt ?? x.at ?? 0))
  return h('div', { class: 'turn-sum', title: [...files.keys()].join('\n') },
    h('span', {}, `${tools.length} tools`),
    files.size ? h('span', {}, `${files.size} file${files.size > 1 ? 's' : ''} `, h('span', { class: 'plus' }, `+${add}`), ' ', h('span', { class: 'minus' }, `−${del}`)) : null,
    failed ? h('span', { class: 'minus' }, `${failed} failed`) : null,
    start && end - start >= 1000 ? h('span', {}, took(end - start)) : null)
}
