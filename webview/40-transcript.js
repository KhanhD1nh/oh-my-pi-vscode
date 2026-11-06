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
  if (it.type === 'user') return h('div', { class: 'user-wrap' }, it.images?.length ? h('div', { class: 'user-imgs' }, it.images.map(i => thumb(`data:${i.mimeType};base64,${i.data}`))) : null, h('div', { class: 'msg user' }, it.text ? h('div', { class: 'msg-text', html: md(it.text) }) : null, userActions(it)), it.at ? h('div', { class: 'msg-time', title: new Date(it.at).toLocaleString() }, clock(it.at)) : null)
  const state = it.type === 'tool' ? it.card.status : it.type === 'error' ? 'failed' : 'text'
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
function upsertNode(it) {
  if (!transcriptEl) return
  transcriptEl.querySelector('.empty')?.remove()
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
  if (old) old.replaceWith(fresh); else { fresh.classList.add('enter'); transcriptEl.insertBefore(fresh, transcriptEl.querySelector('.working')) }
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
  if (t.busy) { transcriptEl.append(h('div', { class: 'working' }, h('span', { class: 'work-ico', 'aria-hidden': 'true' }, h('span', { class: 'tab-spin spin-main' }, SPIN[spinAt])), h('span', { class: 'working-label' }), t.queued ? h('span', { class: 'muted' }, ` · ${t.queued} queued`) : null)); updateWorking() }
}
