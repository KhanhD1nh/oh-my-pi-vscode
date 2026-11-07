// Tool cards: verbs, diffs, subagent (task) cards, background jobs.
// ───────────── tools ─────────────
const VERB = { read: 'Read', edit: 'Update', delete: 'Delete', move: 'Move', search: 'Search', execute: 'Bash', think: 'Think', fetch: 'Fetch', other: 'Tool' }
/** omp tool name → verb shown on the step (kind alone says "other" for most of them). */
const NAME_VERB = { bash: 'Bash', read: 'Read', write: 'Write', edit: 'Update', grep: 'Search', glob: 'Find', find: 'Find', eval: 'Eval', wait: 'Wait', ask: 'Ask', fetch: 'Fetch', web_search: 'Web', browser: 'Browser', lsp: 'LSP', notebook: 'Notebook', todo: 'Todo', task: 'Agents', job: 'Job', jobs: 'Jobs', memory: 'Memory', python: 'Python', ast_grep: 'AST search', image: 'Image' }
const verbOf = c => NAME_VERB[c.name] ?? (c.name && c.name !== 'tool' && c.kind === 'other' ? cap(c.name.replace(/_/g, ' ')) : VERB[c.kind] ?? VERB.other)
/** Background job id from omp's "Backgrounded as job bg_N" result. */
const jobIdOf = c => /\bjob (bg_\d+)/u.exec(c.output ?? '')?.[1]
/** "modules/fleet/fleet.service.ts" → dim "modules/fleet/" + bold "fleet.service.ts". */
function pathParts(p) {
  const i = p.lastIndexOf('/')
  return i < 0 ? h('span', { class: 'p-name' }, p) : [h('span', { class: 'p-dir' }, p.slice(0, i + 1)), h('span', { class: 'p-name' }, p.slice(i + 1))]
}
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
/** Claude Code–style step: bullet on a timeline, verb + target, then an IN/OUT box (bash) or inline diff (edit). */
/**
 * The command waits for something only you can type (passphrase, password, yes/no). omp cannot take keyboard
 * input, so offer the command in a VS Code terminal, typed but not run.
 */
function inputBanner(c) {
  if (!c.needsInput) return null
  const btn = h('button', { class: 'need-btn', onclick: e => { e.stopPropagation(); send({ type: 'runInTerminal', tab: S.active, toolId: c.id }) } }, svg(ICON.terminal), 'Open in terminal')
  return h('div', { class: 'need-input', role: 'status' },
    h('span', { class: 'need-ico', 'aria-hidden': 'true' }, '⌨'),
    h('span', { class: 'need-text' }, h('b', {}, 'Needs your input'), ` — ${c.needsInput}. omp can't type it for you; run it in a terminal.`),
    btn)
}
/** Duration on a tool line: live while running (ticks once a second), fixed when done; hidden under 1 s. */
function toolTime(c) {
  if (!c.startedAt) return null
  const running = c.status === 'pending' || c.status === 'in_progress'
  const ms = (c.endedAt ?? Date.now()) - c.startedAt
  if (!running && ms < 1000) return null
  const el = h('span', { class: `tool-time${running ? ' ticking' : ''}`, title: `Started ${new Date(c.startedAt).toLocaleTimeString()}` }, running && ms < 1000 ? '' : took(ms))
  if (running) el.dataset.since = String(c.startedAt)
  return el
}
/** omp `task` tool: one or more subagents. */
function taskInfo(c) {
  if (c.name !== 'task') return null
  let i = {}; try { i = JSON.parse(c.input ?? '{}') } catch {}
  const tasks = Array.isArray(i.tasks) ? i.tasks : i.task ? [{ name: i.name, agent: i.agent, task: i.task }] : []
  return tasks.length ? { tasks, context: i.context } : null
}
/** bash with `async` or a service `name` keeps running after the tool returns. */
function bgInfo(c) {
  if (c.kind !== 'execute' && c.name !== 'bash') return null
  let i = {}; try { i = JSON.parse(c.input ?? '{}') } catch {}
  return i.async || i.name ? { name: i.name || 'background', command: i.command ?? '' } : null
}
const since = ms => { const s = Math.max(0, Math.floor((Date.now() - ms) / 1000)); return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s` }
const T0 = new Map()
/** Every step of one subagent (the list scrolls; nothing is cut off). */
function agentStepNodes(got) {
  if (!got) return [h('div', { class: 'muted' }, 'Reading subagent log…')]
  if (!got.steps.length) return [h('div', { class: 'muted' }, 'No steps yet')]
  return [...got.steps.map(s => h('div', { class: `astep ${s.status}` }, h('span', { class: 'astep-dot' }), s.tool ? h('span', { class: 'astep-tool' }, cap(s.tool)) : null, h('span', { class: 'astep-label' }, s.label))),
    got.model ? h('div', { class: 'astep-model muted' }, got.model) : null].filter(Boolean)
}
/**
 * Refresh an open step list in place. Rebuilding the whole card every poll reset the scroll and fought a
 * dragged scrollbar, so only the list contents change: the reader's position is kept, and the list follows
 * new steps only while it was already at the bottom.
 */
function patchAgentSteps(k, got) {
  const el = document.querySelector(`.agent-steps[data-k="${CSS.escape(k)}"]`)
  if (!el) return false
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8
  const top = el.scrollTop
  el.replaceChildren(...agentStepNodes(got))
  el.scrollTop = atBottom ? el.scrollHeight : top
  const count = el.parentElement?.querySelector('.agent-count')
  if (count && got?.steps.length) count.textContent = `${got.steps.filter(s => s.tool).length} steps${got.cost ? ` · $${got.cost.toFixed(2)}` : ''}`
  return true
}
function agentEl(c, key, info) {
  const open = S.open.has(key)
  const running = c.status === 'pending' || c.status === 'in_progress'
  if (!T0.has(c.id)) T0.set(c.id, Date.now())
  const n = info.tasks.length
  const head = h('div', { class: 'tool-line', onclick: () => toggle(key) },
    h('span', { class: 'tool-verb' }, n > 1 ? `${n} agents` : 'Agent'),
    h('span', { class: 'tool-target' }, c.title),
    h('span', { class: 'tool-stat muted', 'data-t0': running ? String(T0.get(c.id)) : '' }, running ? since(T0.get(c.id)) : c.status === 'failed' ? 'failed' : 'done'))
  const rows = info.tasks.map(t => {
    const k = `${c.id}:${t.name}`, isOpen = S.open.has(k), got = S.steps?.[k]
    const row = h('div', { class: `agent-row ${c.status}${isOpen ? ' open' : ''}`, onclick: e => { e.stopPropagation(); toggleAgent(k, c.id, t.name, key) } },
      h('span', { class: 'agent-ico' }, running ? runDot() : c.status === 'failed' ? '✕' : '✓'),
      h('span', { class: 'agent-name' }, t.name ?? 'task'), t.agent ? h('span', { class: 'agent-kind' }, t.agent) : null,
      h('span', { class: 'agent-task' }, String(t.task ?? '').split('\n')[0]),
      h('button', { class: 'agent-open', title: 'Open this agent\'s conversation', onclick: e => { e.stopPropagation(); openAgent(c.id, t.name, key) } }, 'View'),
      got?.steps.length ? h('span', { class: 'agent-count' }, `${got.steps.filter(s => s.tool).length} steps${got.cost ? ` · $${got.cost.toFixed(2)}` : ''}`) : null)
    if (!isOpen) return row
    return h('div', {}, row, h('div', { class: 'agent-steps', 'data-k': k }, agentStepNodes(got)))
  })
  return h('div', { class: 'tool agent' }, head, h('div', { class: 'agents' }, rows),
    open && c.output ? h('pre', { class: 'tool-out' }, c.output.slice(0, 20000)) : null,
    !open && c.output && !running ? h('a', { class: 'io-more', onclick: () => toggle(key) }, 'Show result') : null)
}
function toolEl(c, key) {
  if (c.todo) {
    const all = c.todo.flatMap(p => p.tasks), done = all.filter(t => t.status === 'completed').length
    const cur = all.find(t => t.status === 'in_progress')
    let i = {}; try { i = JSON.parse(c.input ?? '{}') } catch {}
    return h('div', { class: 'tool todo-step' }, h('div', { class: 'tool-line', onclick: () => toggle(key) }, h('span', { class: 'tool-verb' }, 'Todo'),
      h('span', { class: 'tool-target' }, i.i ?? (cur ? cur.content : c.title)),
      all.length ? h('span', { class: 'todo-mini', title: `${done} of ${all.length} done` }, h('span', { class: 'todo-meter' }, h('span', { style: `width:${(done / all.length * 100).toFixed(0)}%` })), `${done}/${all.length}`) : null),
      S.open.has(key) ? todoList(c.todo) : null)
  }
  const ti = taskInfo(c)
  if (ti) return agentEl(c, key, ti)
  const bg = bgInfo(c)
  if (bg) {
    const id = jobIdOf(c)
    const job = id ? bgJobs().find(j => j.jobId === id) : undefined
    // the tool call returns as soon as the job starts; the job's own state comes from the session file
    const state = job?.status ?? (c.status === 'failed' ? 'failed' : 'running')
    const label = bg.name !== 'background' ? bg.name : c.title && c.title !== bg.command && !c.title.startsWith('$') ? c.title : ''
    const open = S.open.has(key)
    const line = h('div', { class: 'tool-line', onclick: () => toggle(key) },
      h('span', { class: 'tool-verb' }, 'Background'),
      h('span', { class: 'tool-target', title: bg.command }, label || h('code', { class: 'bg-cmd' }, bg.command.split('\n')[0].slice(0, 120))),
      id ? h('span', { class: 'job-id' }, id) : null,
      h('span', { class: `bg-pill ${state}` }, state === 'running' ? runDot() : null, state === 'completed' ? 'done' : state),
      job?.durationMs != null ? h('span', { class: 'tool-time' }, took(job.durationMs)) : null,
      id ? h('button', { class: 'bg-open', title: 'Show this job and its output', onclick: e => { e.stopPropagation(); openJob(id) } }, 'Output') : null)
    // the command box only when the line shows a label (else it would repeat the command) or when opened
    const showCmd = open || (label && bg.command)
    return h('div', { class: `tool bg ${state}` }, line, inputBanner(c) || showCmd ? h('div', { class: 'io' }, inputBanner(c),
      showCmd ? h('div', { class: 'io-row' }, h('span', { class: 'io-k' }, 'IN'), h('div', { class: 'io-v codeblock' }, copyBtn(bg.command), h('pre', {}, bg.command))) : null,
      open && job?.output ? h('div', { class: 'io-row' }, h('span', { class: 'io-k' }, 'OUT'), h('div', { class: 'io-v codeblock' }, copyBtn(job.output), h('pre', {}, job.output.slice(0, 20000)))) : null) : null)
  }

  if (c.name === 'wait') {
    let i = {}; try { i = JSON.parse(c.input ?? '{}') } catch {}
    const ids = [i.jobId, i.job, ...(Array.isArray(i.jobs) ? i.jobs : []), ...(Array.isArray(i.ids) ? i.ids : [])].filter(x => typeof x === 'string')
    const running = c.status === 'pending' || c.status === 'in_progress'
    return h('div', { class: 'tool wait' }, h('div', { class: 'tool-line' },
      h('span', { class: 'tool-verb' }, 'Wait'), h('span', { class: 'tool-target' }, i.i ?? c.title ?? 'for background work'),
      ids.map(x => h('button', { class: 'job-id link', title: 'Show this job', onclick: e => { e.stopPropagation(); openJob(x) } }, x)),
      running ? h('span', { class: 'wait-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')) : null,
      toolTime(c)))
  }
  const open = S.open.has(key)
  const t = toolTarget(c)
  const bash = c.kind === 'execute'
  let cmd = ''; try { cmd = JSON.parse(c.input ?? '{}').command ?? '' } catch {}
  const head = bash && c.title && c.title !== cmd ? c.title : t.text
  const stat = c.diff ? diffStat(c.diff) : null
  const line = h('div', { class: 'tool-line', onclick: () => toggle(key) },
    h('span', { class: 'tool-verb' }, verbOf(c)),
    h('span', { class: `tool-target${t.file ? ' file' : ''}`, title: t.file ?? t.text, onclick: t.file ? e => { e.stopPropagation(); send({ type: 'openFile', path: t.file }) } : undefined }, t.file && head === t.text ? pathParts(t.text) : head),
    stat ? h('span', { class: 'tool-stat' }, h('span', { class: 'plus' }, `+${stat.add}`), ' ', h('span', { class: 'minus' }, `-${stat.del}`)) : null,
    toolTime(c))
  const clip = (txt, n) => { const l = txt.split('\n'); return !open && l.length > n ? { text: l.slice(0, n).join('\n'), more: l.length - n } : { text: txt.length > 20000 ? txt.slice(0, 20000) + '\n…' : txt } }
  let body = null
  if (bash) {
    const out = c.output ? clip(c.output, 6) : null
    body = h('div', { class: 'io' }, inputBanner(c),
      h('div', { class: 'io-row' }, h('span', { class: 'io-k' }, 'IN'), h('div', { class: 'io-v codeblock' }, copyBtn(cmd || c.title || ''), h('pre', {}, clip(cmd || c.title || '', 4).text))),
      out ? h('div', { class: 'io-row' }, h('span', { class: 'io-k' }, 'OUT'), h('div', { class: 'io-v codeblock' }, copyBtn(c.output), h('pre', {}, out.text), out.more ? h('a', { class: 'io-more', onclick: () => toggle(key) }, `+${out.more} lines`) : null)) : null)
  } else if (c.diff) {
    body = h('div', {}, diffEl(c.diff), h('div', { class: 'tool-actions' }, h('a', { onclick: () => send({ type: 'openDiff', tab: S.active, toolId: c.id }) }, 'Open diff'), h('a', { onclick: () => send({ type: 'openFile', path: c.diff.path }) }, 'Open file')))
  } else if (open && (c.output || c.input)) {
    body = h('pre', { class: 'tool-out' }, (c.output || c.input).slice(0, 20000))
  }
  return h('div', { class: 'tool' }, line, body)
}

