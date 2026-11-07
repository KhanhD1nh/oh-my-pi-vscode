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
  const seg = (cls, icon, text, title) => text ? h('span', { class: `seg ${cls}`, title }, icon ? h('span', { class: 'seg-i' }, ICON[icon] ? svg(ICON[icon]) : icon) : null, text) : null
  const u = t.usage ?? {}
  const pct = u.size ? (u.used ?? 0) / u.size * 100 : null
  const secs = s.t0 && s.last > s.t0 ? (s.last - s.t0) / 1000 : 0
  const rate = t.busy && secs > 1 ? (s.chars / 4 / secs).toFixed(1) : null
  return h('div', { class: 'statusline', id: 'statusline' },
    seg('time', 'clock', t.startedAt ? fmtDur(Date.now() - t.startedAt) : '', 'Tab open for'),
    seg('path', 'folder', t.folder ?? '', S.cwd),
    seg('git', 'branch', t.branch ?? '', 'Git branch'),
    h('span', { class: 'grow' }),
    seg('ctx', '', pct === null ? '' : `${pct.toFixed(1)}% · ${fmtTok(u.used ?? 0)}/${fmtTok(u.size)}`, 'Context used (omp)'),
    t.stats ? seg('tin', 'down', fmtTok(t.stats.input), 'Input tokens (omp session)') : null,
    t.stats || s.total ? seg('out', 'upArrow', t.stats && !t.busy ? fmtTok(t.stats.output) : fmtTok((t.stats?.output ?? 0) + Math.round(s.chars / 4)), 'Output tokens (omp session' + (t.busy ? ' + streaming estimate)' : ')')) : null,
    t.stats?.cacheRead ? seg('cache', 'db', fmtTok(t.stats.cacheRead), `Cache read${t.stats.input + t.stats.cacheRead ? ` · ${(t.stats.cacheRead / (t.stats.input + t.stats.cacheRead) * 100).toFixed(0)}% hit` : ''}`) : null,
    seg('rate', 'bolt', rate ? `${rate} tok/s` : t.stats?.apiMs ? `${(t.stats.output / (t.stats.apiMs / 1000)).toFixed(1)} tok/s` : '', rate ? 'Output speed now (estimated)' : 'Average model speed (omp session)'),
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
    if (ti) for (const t of ti.tasks) agents.push({ id: it.id, cid: c.id, label: t.name ?? 'task', agent: t.agent, task: String(t.task ?? '').split('\n').find(l => l.trim() && !/^#/u.test(l.trim())) ?? '', running, failed: c.status === 'failed', startedAt: c.startedAt, endedAt: c.endedAt })
    const bg = bgInfo(c)
    if (bg && running) jobs.push({ id: it.id, label: bg.name, command: bg.command.slice(0, 40) })
  }
  return { agents, jobs }
}
function bgChip() {
  const { agents, jobs: cards } = activity()
  const jobs = bgJobs().length ? bgJobs() : cards.map(c => ({ status: 'running' }))
  if (!agents.length && !jobs.length) return null
  // "2 running" first and bold; totals after it, dimmed — the totals are history, not what runs now
  const live = agents.filter(a => a.running).length + jobs.filter(j => j.status === 'running').length
  const totals = [agents.length ? `${agents.length} agent${agents.length > 1 ? 's' : ''}` : '', jobs.length ? `${jobs.length} bg` : ''].filter(Boolean).join(' · ')
  const label = live ? [h('b', { class: 'chip-live' }, `${live} running`), h('span', { class: 'chip-total' }, ` · ${totals}`)] : [h('span', { class: 'chip-total' }, `${totals} · done`)]
  const failed = jobs.filter(j => j.status === 'failed').length + agents.filter(a => a.failed).length
  return h('button', { class: `chip-btn jobs${S.menu === 'jobs' ? ' open' : ''}${failed ? ' has-failed' : ''}${live ? '' : ' idle'}`, title: live ? `${live} running now · ${totals} in this chat` : `Nothing running · ${totals} in this chat`, onclick: () => openMenu('jobs') }, agents.some(a => a.running) || jobs.some(j => j.status === 'running') ? runDot() : (agents.length || jobs.length) ? h('span', { class: 'agent-state done', 'aria-hidden': 'true' }, '✓') : h('span', { class: 'live busy' }), h('span', { class: 'label' }, label), failed ? h('span', { class: 'chip-failed', title: `${failed} failed` }, `${failed} ✕`) : null)
}
let jobTick = 0
EVERY_SECOND.push(() => { if (S.view === 'chat' && tab()?.busy && ++jobTick % 5 === 0) refreshJobs() })
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


// ───────────── agent conversation panel ─────────────
/** One subagent's own conversation, over the chat: assignment, thinking, replies, tools with IN/OUT. */
const agentView = { open: null, data: null, poll: null, follow: true }
function openAgent(toolId, name, cardKey) {
  agentView.open = { toolId, name, cardKey }
  agentView.data = null
  agentView.follow = true
  renderAgentPanel()
  const ask = () => send({ type: 'agentConversation', tab: S.active, toolId, name })
  ask()
  clearInterval(agentView.poll)
  agentView.poll = setInterval(() => {
    if (document.hidden || !agentView.open) return
    const it = items().find(x => x.id === cardKey)
    ask()
    if (!it || (it.card.status !== 'pending' && it.card.status !== 'in_progress')) { clearInterval(agentView.poll); agentView.poll = null }
  }, 2000)
}
function closeAgent() {
  clearInterval(agentView.poll); agentView.poll = null
  agentView.open = null; agentView.data = null
  document.getElementById('agent-panel')?.remove()
  document.getElementById('input')?.focus()
}
function agentEntryEl(e) {
  if (e.kind === 'prompt') return h('div', { class: 'ae ae-prompt' }, h('div', { class: 'ae-label' }, 'Assignment'), h('div', { class: 'msg', html: md(e.text) }))
  if (e.kind === 'thinking') return h('details', { class: 'ae ae-think' }, h('summary', {}, svg(ICON.brain), 'Thinking'), h('div', { class: 'thought-body', html: md(e.text) }))
  if (e.kind === 'text') return h('div', { class: 'ae ae-text msg', html: md(e.text) })
  const open = e.status === 'running'
  return h('details', { class: `ae ae-tool ${e.status}`, ...open ? { open: true } : {} },
    h('summary', {}, h('span', { class: `ae-dot ${e.status}` }), h('span', { class: 'tool-verb' }, cap(e.name)), h('span', { class: 'tool-target' }, e.label)),
    h('div', { class: 'io' },
      e.input ? h('div', { class: 'io-row' }, h('span', { class: 'io-k' }, 'IN'), h('div', { class: 'io-v codeblock' }, copyBtn(e.input), h('pre', {}, e.input))) : null,
      e.output ? h('div', { class: 'io-row' }, h('span', { class: 'io-k' }, 'OUT'), h('div', { class: 'io-v codeblock' }, copyBtn(e.output), h('pre', {}, e.output))) : null))
}
function renderAgentPanel() {
  const o = agentView.open; if (!o) return
  const d = agentView.data
  const a = activity().agents.find(x => x.cid === o.toolId && x.label === o.name)
  const old = document.getElementById('agent-panel')
  const oldBody = old?.querySelector('.ap-body')
  const keepTop = oldBody ? oldBody.scrollTop : 0
  const atBottom = oldBody ? oldBody.scrollHeight - oldBody.scrollTop - oldBody.clientHeight < 40 : true
  // keep open/closed state of each tool entry across refreshes
  const openState = old ? [...old.querySelectorAll('.ap-body > details')].map(x => x.open) : []
  const status = a?.running ? 'running' : a?.failed ? 'failed' : 'done'
  const head = h('div', { class: 'ap-head' },
    h('button', { class: 'icon-btn', title: 'Back to the chat (Esc)', onclick: closeAgent }, svg(ICON.back)),
    h('div', { class: 'ap-title' },
      h('div', { class: 'ap-name' }, a?.running ? runDot() : h('span', { class: `agent-state ${status}` }, status === 'failed' ? '✕' : '✓'), h('b', {}, o.name), a?.agent ? h('span', { class: 'agent-kind' }, a.agent) : null),
      h('div', { class: 'ap-meta' }, [a?.startedAt ? took((a.endedAt ?? Date.now()) - a.startedAt) : '', d?.model ? d.model.split('/').pop() : '', d?.cost ? '$' + d.cost.toFixed(2) : '', d ? `${d.entries.filter(e => e.kind === 'tool').length} tool calls` : ''].filter(Boolean).join(' · '))),
    h('button', { class: 'icon-btn', title: 'Show in chat', onclick: () => { const n = nodes.get(o.cardKey); closeAgent(); n?.scrollIntoView({ block: 'center', behavior: 'smooth' }) } }, svg(ICON.chevron)))
  const body = h('div', { class: 'ap-body', tabindex: '0', role: 'region', 'aria-label': `${o.name} conversation` },
    !d ? h('div', { class: 'muted ap-empty' }, 'Reading the agent log…')
      : d.missing ? h('div', { class: 'muted ap-empty' }, 'No log for this agent yet. omp writes it when the agent starts.')
      : !d.entries.length ? h('div', { class: 'muted ap-empty' }, 'Nothing yet.')
      : d.entries.map(agentEntryEl))
  const panel = h('div', { class: 'agent-panel', id: 'agent-panel', onkeydown: e => { if (e.key === 'Escape') { e.preventDefault(); closeAgent() } } }, head, body)
  if (old) old.replaceWith(panel); else { app.append(panel); panel.classList.add('enter'); queueMicrotask(() => body.focus()) }
  body.querySelectorAll(':scope > details').forEach((x, i) => { if (openState[i] !== undefined) x.open = openState[i] })
  body.scrollTop = atBottom && agentView.follow ? body.scrollHeight : keepTop
  body.addEventListener('scroll', () => { agentView.follow = body.scrollHeight - body.scrollTop - body.clientHeight < 40 })
}

// ───────────── background jobs ─────────────
/** Jobs of the active chat from omp's session file (refreshed when the chip menu opens and after each turn). */
const JOBS = {}
const bgJobs = () => (JOBS[S.active] ?? []).filter(j => j.type !== 'task')
function refreshJobs() { if (S.active) send({ type: 'jobs', tab: S.active }) }
function jobState(status) {
  if (status === 'running') return runDot()
  return h('span', { class: `agent-state ${status === 'failed' ? 'failed' : 'done'}` }, status === 'failed' ? '✕' : '✓')
}
/** Full-panel view of background jobs: a list on top, the selected job's command and output below. */
const jobView = { open: false, id: null, filter: 'all' }
function openJob(id) { jobView.open = true; jobView.id = id; refreshJobs(); renderJobPanel() }
function closeJobs() { jobView.open = false; document.getElementById('job-panel')?.remove(); document.getElementById('input')?.focus() }
function renderJobPanel() {
  if (!jobView.open) return
  const all = bgJobs()
  const list = jobView.filter === 'all' ? all : all.filter(j => j.status === jobView.filter)
  const sel = all.find(j => j.jobId === jobView.id) ?? list.at(-1)
  const count = s => all.filter(j => j.status === s).length
  const tab = (key, label) => h('button', { class: `cat${jobView.filter === key ? ' on' : ''}`, onclick: () => { jobView.filter = key; renderJobPanel() } }, label)
  const old = document.getElementById('job-panel')
  const keep = old?.querySelector('.jp-out pre')?.scrollTop ?? 0
  const panel = h('div', { class: 'agent-panel', id: 'job-panel', onkeydown: e => { if (e.key === 'Escape') { e.preventDefault(); closeJobs() } } },
    h('div', { class: 'ap-head' },
      h('button', { class: 'icon-btn', title: 'Back to the chat (Esc)', onclick: closeJobs }, svg(ICON.back)),
      h('div', { class: 'ap-title' }, h('div', { class: 'ap-name' }, h('b', {}, 'Background jobs')), h('div', { class: 'ap-meta' }, `${all.length} in this chat · ${count('running')} running · ${count('failed')} failed`)),
      h('button', { class: 'icon-btn', title: 'Refresh', onclick: refreshJobs }, svg(ICON.history))),
    h('div', { class: 'jp-tabs cats' }, tab('all', `All ${all.length}`), tab('running', `Running ${count('running')}`), tab('failed', `Failed ${count('failed')}`), tab('completed', `Done ${count('completed')}`)),
    h('div', { class: 'jp-list', role: 'listbox', 'aria-label': 'Background jobs' },
      !list.length ? h('div', { class: 'muted ap-empty' }, all.length ? 'No jobs in this filter.' : 'No background jobs in this chat yet.') :
        [...list].reverse().map(j => h('button', { class: `jp-row${sel?.jobId === j.jobId ? ' on' : ''}`, role: 'option', 'aria-selected': sel?.jobId === j.jobId ? 'true' : 'false', onclick: () => { jobView.id = j.jobId; renderJobPanel() } },
          jobState(j.status), h('span', { class: 'jp-label' }, j.label), h('span', { class: 'jp-id' }, j.jobId),
          h('span', { class: 'desc' }, j.durationMs != null ? took(j.durationMs) : j.status === 'running' && j.at ? took(Date.now() - j.at) : '')))),
    sel ? h('div', { class: 'jp-out' },
      h('div', { class: 'jp-out-head' }, jobState(sel.status), h('b', {}, sel.label), h('span', { class: 'muted' }, ` · ${sel.status}${sel.at ? ' · started ' + clock(sel.at) : ''}`)),
      sel.output ? h('div', { class: 'codeblock' }, copyBtn(sel.output), h('pre', {}, sel.output))
        : h('div', { class: 'muted ap-empty' }, sel.status === 'running' ? 'Still running — its output arrives when it finishes.' : 'No output.')) : null)
  if (old) old.replaceWith(panel); else { app.append(panel); panel.classList.add('enter'); queueMicrotask(() => panel.querySelector('.jp-row.on, .jp-row')?.focus()) }
  const pre = panel.querySelector('.jp-out pre'); if (pre) pre.scrollTop = keep
}

// Esc closes an open agent/jobs panel wherever focus is (the panel covers the chat, so it owns Esc).
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return
  if (document.getElementById('agent-panel')) { e.preventDefault(); e.stopPropagation(); closeAgent() }
  else if (document.getElementById('job-panel')) { e.preventDefault(); e.stopPropagation(); closeJobs() }
}, true)
