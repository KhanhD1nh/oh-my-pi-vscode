// Tool cards: verbs, diffs, subagent (task) cards, background jobs.
// ───────────── tools ─────────────
const VERB = { read: 'Read', edit: 'Update', delete: 'Delete', move: 'Move', search: 'Search', execute: 'Bash', think: 'Think', fetch: 'Fetch', other: 'Tool' }
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
      h('span', { class: 'agent-ico' }, running ? h('span', { class: 'tab-spin' }, SPIN[spinAt]) : c.status === 'failed' ? '✕' : '✓'),
      h('span', { class: 'agent-name' }, t.name ?? 'task'), t.agent ? h('span', { class: 'agent-kind' }, t.agent) : null,
      h('span', { class: 'agent-task' }, String(t.task ?? '').split('\n')[0]),
      got?.steps.length ? h('span', { class: 'agent-count' }, `${got.steps.filter(s => s.tool).length} steps${got.cost ? ` · $${got.cost.toFixed(2)}` : ''}`) : null)
    if (!isOpen) return row
    return h('div', {}, row, h('div', { class: 'agent-steps', 'data-k': k }, agentStepNodes(got)))
  })
  return h('div', { class: 'tool agent' }, head, h('div', { class: 'agents' }, rows),
    open && c.output ? h('pre', { class: 'tool-out' }, c.output.slice(0, 20000)) : null,
    !open && c.output && !running ? h('a', { class: 'io-more', onclick: () => toggle(key) }, 'Show result') : null)
}
function toolEl(c, key) {
  if (c.todo) return h('div', { class: 'tool' }, h('div', { class: 'tool-line', onclick: () => toggle(key) }, h('span', { class: 'tool-verb' }, 'Todo'), h('span', { class: 'tool-target' }, c.title)), S.open.has(key) ? todoList(c.todo) : null)
  const ti = taskInfo(c)
  if (ti) return agentEl(c, key, ti)
  const bg = bgInfo(c)
  if (bg) {
    const line = h('div', { class: 'tool-line', onclick: () => toggle(key) },
      h('span', { class: 'tool-verb' }, 'Background'), h('span', { class: 'tool-target' }, bg.name === 'background' ? (c.title || bg.command).slice(0, 80) : bg.name),
      h('span', { class: `bg-pill ${c.status}` }, c.status === 'completed' ? 'done' : c.status === 'failed' ? 'failed' : 'running'))
    return h('div', { class: 'tool' }, line, h('div', { class: 'io' }, h('div', { class: 'io-row' }, h('span', { class: 'io-k' }, 'IN'), h('pre', { class: 'io-v' }, bg.command)),
      S.open.has(key) && c.output ? h('div', { class: 'io-row' }, h('span', { class: 'io-k' }, 'OUT'), h('pre', { class: 'io-v' }, c.output.slice(0, 20000))) : null))
  }

  const open = S.open.has(key)
  const t = toolTarget(c)
  const bash = c.kind === 'execute'
  let cmd = ''; try { cmd = JSON.parse(c.input ?? '{}').command ?? '' } catch {}
  const head = bash && c.title && c.title !== cmd ? c.title : t.text
  const stat = c.diff ? diffStat(c.diff) : null
  const line = h('div', { class: 'tool-line', onclick: () => toggle(key) },
    h('span', { class: 'tool-verb' }, VERB[c.kind] ?? VERB.other),
    h('span', { class: `tool-target${t.file ? ' file' : ''}`, title: t.file ?? t.text, onclick: t.file ? e => { e.stopPropagation(); send({ type: 'openFile', path: t.file }) } : undefined }, head),
    stat ? h('span', { class: 'tool-stat' }, h('span', { class: 'plus' }, `+${stat.add}`), ' ', h('span', { class: 'minus' }, `-${stat.del}`)) : null)
  const clip = (txt, n) => { const l = txt.split('\n'); return !open && l.length > n ? { text: l.slice(0, n).join('\n'), more: l.length - n } : { text: txt.length > 20000 ? txt.slice(0, 20000) + '\n…' : txt } }
  let body = null
  if (bash) {
    const out = c.output ? clip(c.output, 6) : null
    body = h('div', { class: 'io' },
      h('div', { class: 'io-row' }, h('span', { class: 'io-k' }, 'IN'), h('div', { class: 'io-v codeblock' }, copyBtn(cmd || c.title || ''), h('pre', {}, clip(cmd || c.title || '', 4).text))),
      out ? h('div', { class: 'io-row' }, h('span', { class: 'io-k' }, 'OUT'), h('div', { class: 'io-v codeblock' }, copyBtn(c.output), h('pre', {}, out.text), out.more ? h('a', { class: 'io-more', onclick: () => toggle(key) }, `+${out.more} lines`) : null)) : null)
  } else if (c.diff) {
    body = h('div', {}, diffEl(c.diff), h('div', { class: 'tool-actions' }, h('a', { onclick: () => send({ type: 'openDiff', tab: S.active, toolId: c.id }) }, 'Open diff'), h('a', { onclick: () => send({ type: 'openFile', path: c.diff.path }) }, 'Open file')))
  } else if (open && (c.output || c.input)) {
    body = h('pre', { class: 'tool-out' }, (c.output || c.input).slice(0, 20000))
  }
  return h('div', { class: 'tool' }, line, body)
}

