// Status line, subagent/background activity chip, live subagent steps, copy helper.
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
    t.stats ? seg('tin', '↓', fmtTok(t.stats.input), 'Input tokens (omp session)') : null,
    t.stats || s.total ? seg('out', '↑', t.stats && !t.busy ? fmtTok(t.stats.output) : fmtTok((t.stats?.output ?? 0) + Math.round(s.chars / 4)), 'Output tokens (omp session' + (t.busy ? ' + streaming estimate)' : ')')) : null,
    t.stats?.cacheRead ? seg('cache', '⛁', fmtTok(t.stats.cacheRead), `Cache read${t.stats.input + t.stats.cacheRead ? ` · ${(t.stats.cacheRead / (t.stats.input + t.stats.cacheRead) * 100).toFixed(0)}% hit` : ''}`) : null,
    seg('rate', '⚡', rate ? `${rate} tok/s` : t.stats?.apiMs ? `${(t.stats.output / (t.stats.apiMs / 1000)).toFixed(1)} tok/s` : '', rate ? 'Output speed now (estimated)' : 'Average model speed (omp session)'),
    seg('cost', '', (u.cost ?? t.stats?.cost) ? '$' + (u.cost ?? t.stats.cost).toFixed((u.cost ?? t.stats.cost) < 1 ? 3 : 2) : '', 'Session cost (omp)'))
}
/** Rebuild the status line only when what it shows changed (it is asked every second). */
function refreshStatus() {
  const el = document.getElementById('statusline'); if (!el) return
  const fresh = statusLine()
  if (fresh.textContent === el.textContent && fresh.innerHTML === el.innerHTML) return
  el.replaceWith(fresh)
}
EVERY_SECOND.push(() => { if (S.view === 'chat') refreshStatus() })


/** Subagents still running and background services started in this chat. */
function activity() {
  const agents = [], jobs = []
  for (const it of items()) {
    if (it.type !== 'tool') continue
    const c = it.card, running = c.status === 'pending' || c.status === 'in_progress'
    const ti = taskInfo(c)
    if (ti && running) for (const t of ti.tasks) agents.push({ id: it.id, cid: c.id, label: t.name ?? 'task' })
    const bg = bgInfo(c)
    if (bg && running) jobs.push({ id: it.id, label: bg.name, command: bg.command.slice(0, 40) })
  }
  return { agents, jobs }
}
function bgChip() {
  const { agents, jobs } = activity()
  if (!agents.length && !jobs.length) return null
  const label = [agents.length ? `${agents.length} agent${agents.length > 1 ? 's' : ''}` : '', jobs.length ? `${jobs.length} bg` : ''].filter(Boolean).join(' · ')
  return h('button', { class: `chip-btn jobs${S.menu === 'jobs' ? ' open' : ''}`, title: 'Subagents and background jobs', onclick: () => openMenu('jobs') }, agents.length ? runDot() : h('span', { class: 'live busy' }), h('span', { class: 'label' }, label))
}
// live timers on running tool lines and agent cards
EVERY_SECOND.push(() => { for (const el of document.querySelectorAll('.tool-time.ticking[data-since]')) { const v = took(Date.now() - Number(el.dataset.since)); if (el.textContent !== v) el.textContent = v } })
EVERY_SECOND.push(() => { for (const el of document.querySelectorAll('[data-t0]')) if (el.dataset.t0) { const v = since(Number(el.dataset.t0)); if (el.textContent !== v) el.textContent = v } })


/** Open/close one subagent row; while open and running, re-read its log every 2s. */
const agentPolls = new Map()
function toggleAgent(k, toolId, name, cardKey) {
  if (S.open.has(k)) { S.open.delete(k); clearInterval(agentPolls.get(k)); agentPolls.delete(k) }
  else {
    S.open.add(k)
    const ask = () => send({ type: 'agentSteps', tab: S.active, toolId, name })
    ask()
    agentPolls.set(k, setInterval(() => {
      if (document.hidden) return // no log reads for a chat nobody is looking at
      const it = items().find(x => x.id === cardKey)
      if (!S.open.has(k) || !it || (it.card.status !== 'pending' && it.card.status !== 'in_progress')) { clearInterval(agentPolls.get(k)); agentPolls.delete(k); if (S.open.has(k)) ask() }
      else ask()
    }, 2000))
  }
  const it = items().find(x => x.id === cardKey); if (it) upsertNode(it)
}


/** Copy button that copies `text` exactly (not the clipped view). */
function copyBtn(text) { const b = h('button', { class: 'copy', title: 'Copy' }, 'Copy'); b.dataset.text = text ?? ''; return b }

