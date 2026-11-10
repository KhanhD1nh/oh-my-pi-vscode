// Generated from webview/*.js by build.mjs — edit those files, not this one.
// Webview bootstrap: VS Code API, DOM helper h(), SVG icons.
// Oh My Pi webview — Claude Code–style chat. Plain DOM, incremental updates (no full re-render on stream).
// eslint-disable-next-line no-undef
const vscode = acquireVsCodeApi()
const send = msg => vscode.postMessage(msg)
const h = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'html') el.innerHTML = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const kid of kids.flat(9)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)))
  return el
}
const svg = d => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.5'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.innerHTML = d; return s }
const ICON = {
  clock: '<circle cx="8" cy="8" r="5.8"/><path d="M8 4.8V8l2.2 1.4"/>',
  pin: '<path d="M6 2h4l-.6 4 2.6 2.4H4L6.6 6z"/><path d="M8 8.4V14"/>',
  folder: '<path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.5 1.6h4.9A1.5 1.5 0 0 1 14 6.1v5.4a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z"/>',
  branch: '<circle cx="4.5" cy="3.5" r="1.5"/><circle cx="4.5" cy="12.5" r="1.5"/><circle cx="11.5" cy="5.5" r="1.5"/><path d="M4.5 5v6M11.5 7c0 2.5-3 2.5-7 4"/>',
  down: '<path d="M8 3v10M4 9l4 4 4-4"/>', upArrow: '<path d="M8 13V3M4 7l4-4 4 4"/>',
  db: '<ellipse cx="8" cy="4" rx="5" ry="2"/><path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2"/>',
  bolt: '<path d="M9 1.8L3.5 9h4l-1 5.2L12.5 7h-4z"/>',
  plus: '<path d="M8 3v10M3 8h10"/>', history: '<path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9"/><path d="M2.5 2.5v2.6h2.6M8 5v3l2 1.5"/>',
  gear: '<circle cx="8" cy="8" r="2"/><path d="M8 1.8v1.6M8 12.6v1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M1.8 8h1.6M12.6 8h1.6M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1"/>',
  up: '<path d="M8 13V3M4 7l4-4 4 4"/>', stop: '<rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" stroke="none"/>',
  back: '<path d="M10 3L5 8l5 5"/>', chevron: '<path d="M4 6l4 4 4-4"/>', brain: '<path d="M6 3.5a2 2 0 0 0-3 1.7 2 2 0 0 0 0 3.6A2 2 0 0 0 6 12.5V3.5zM10 3.5a2 2 0 0 1 3 1.7 2 2 0 0 1 0 3.6 2 2 0 0 1-3 3.7V3.5z"/>',
  copy: '<rect x="5" y="5" width="8.5" height="8.5" rx="1.5"/><path d="M3 10.5V3.8A1.3 1.3 0 0 1 4.3 2.5H10.5"/>',
  check: '<path d="M3.5 8.5l3 3 6-7"/>',
  terminal: '<rect x="1.8" y="3" width="12.4" height="10" rx="1.6"/><path d="M4.5 6.3l2 1.7-2 1.7M8 10h3.5"/>',
  image: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="6" cy="6.5" r="1"/><path d="M14 11l-3.5-3.5L4 13"/>',
}

// Markdown → HTML for messages (code fences get a copy button).
// ───────────── markdown ─────────────
const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>')
  .replace(/(^|[\s(])((?:[A-Za-z]:)?[\w.@/\\-]+\.[A-Za-z0-9]{1,6})(?::(\d+))?(?=[\s).,;:]|$)/g,
    // Unix-absolute paths (/home/…, /usr/…) come from servers or stack traces and never open here: leave them as text.
    (m, pre, p, line) => /[/\\]/.test(p) && !p.startsWith('/') ? `${pre}<a class="file" data-path="${p}"${line ? ` data-line="${line}"` : ''}>${p}${line ? ':' + line : ''}</a>` : m)
/** A pasted error/log with escaped newlines ("…\n    at foo (…)\n…") reads as one long line; show it as a block. */
const escapedBlob = l => l.length > 160 && (l.match(/\\n/g) ?? []).length >= 3
/** "8:35 PM" today, "Mon 8:35 PM" this week, "Nov 3, 8:35 PM" older. */
function clock(ms) {
  if (!ms) return ''
  const d = new Date(ms), now = new Date()
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === now.toDateString()) return time
  if (now - d < 6 * 864e5) return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`
}
/** "0.4s", "12s", "3m 05s", "1h 02m". */
function took(ms) {
  if (ms == null || ms < 0) return ''
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}
function md(src) {
  const out = []; const L = src.split('\n')
  for (let i = 0; i < L.length; i++) {
    const l = L[i]
    if (/^```/.test(l)) {
      const info = l.slice(3).trim().split(/\s+/), file = info.find(x => /[\\/.]/u.test(x) && !/^\.?\w+$/u.test(x)) ?? (info[0]?.includes('.') && info[0].includes('/') ? info[0] : undefined)
      const lang = (info[0] && info[0] !== file ? info[0] : file?.split('.').pop()) ?? ''
      const b = []; i++; while (i < L.length && !/^```/.test(L[i])) b.push(L[i++])
      out.push(`<div class="codeblock${lang || file ? ' has-lang' : ''}">${lang || file ? `<div class="code-head"><span class="lang">${esc(lang)}</span>${file ? `<a class="file code-file" data-path="${esc(file)}">${esc(file)}</a>` : ''}</div>` : ''}<button class="copy" title="Copy">Copy</button><pre><code>${esc(b.join('\n'))}</code></pre></div>`)
      continue
    }
    const hd = /^(#{1,4})\s+(.*)/.exec(l); if (hd) { out.push(`<h${hd[1].length + 2}>${inline(hd[2])}</h${hd[1].length + 2}>`); continue }
    if (/^\s*[-*]\s+/.test(l)) { const b = []; while (i < L.length && /^\s*[-*]\s+/.test(L[i])) b.push(`<li>${inline(L[i++].replace(/^\s*[-*]\s+/, ''))}</li>`); i--; out.push(`<ul>${b.join('')}</ul>`); continue }
    if (/^\s*\d+\.\s+/.test(l)) { const b = []; while (i < L.length && /^\s*\d+\.\s+/.test(L[i])) b.push(`<li>${inline(L[i++].replace(/^\s*\d+\.\s+/, ''))}</li>`); i--; out.push(`<ol>${b.join('')}</ol>`); continue }
    if (/^\|.*\|\s*$/.test(l)) {
      const rows = []; while (i < L.length && /^\|.*\|\s*$/.test(L[i])) rows.push(L[i++]); i--
      const cells = r => r.trim().slice(1, -1).split('|').map(c => c.trim())
      const body = rows.filter(r => !/^\|[\s:|-]+\|\s*$/.test(r))
      out.push(`<div class="table-wrap"><table>${body.map((r, n) => `<tr>${cells(r).map(c => n === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table></div>`); continue
    }
    if (escapedBlob(l)) {
      const text = l.replace(/\\n/g, '\n').replace(/\\t/g, '  ').replace(/\\"/g, '"')
      out.push(`<div class="codeblock log"><button class="copy" title="Copy">Copy</button><pre><code>${esc(text)}</code></pre></div>`)
      continue
    }
    if (/^>\s?/.test(l)) { out.push(`<blockquote>${inline(l.replace(/^>\s?/, ''))}</blockquote>`); continue }
    if (l.trim()) out.push(`<p>${inline(l)}</p>`)
  }
  return out.join('')
}

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
  if (d._stat) return d._stat
  const ops = lineOps(d.oldText ? d.oldText.split('\n') : [], d.newText.split('\n'))
  return (d._stat = { add: ops.filter(o => o[0] === '+').length, del: ops.filter(o => o[0] === '-').length })
}
/** Line ops between a and b: [' ', line] | ['-', line] | ['+', line]. LCS on the changed middle only. */
function lineOps(a, b) {
  let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++
  let ea = a.length, eb = b.length; while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb-- }
  const A = a.slice(s, ea), B = b.slice(s, eb), ops = a.slice(0, s).map(l => [' ', l])
  // ponytail: O(n·m) table, capped; past the cap the middle shows as all removed then all added ("Open diff" is exact).
  if (A.length * B.length > 250000) { for (const l of A) ops.push(['-', l]); for (const l of B) ops.push(['+', l]) }
  else {
    const T = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1))
    for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) T[i][j] = A[i] === B[j] ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1])
    let i = 0, j = 0
    while (i < A.length || j < B.length) {
      if (i < A.length && j < B.length && A[i] === B[j]) { ops.push([' ', A[i]]); i++; j++ }
      else if (i < A.length && (j === B.length || T[i + 1][j] >= T[i][j + 1])) ops.push(['-', A[i++]])
      else ops.push(['+', B[j++]])
    }
  }
  for (const l of a.slice(ea)) ops.push([' ', l])
  return ops
}
/** Words that changed between one removed and one added line, wrapped in <mark>. */
function wordMarks(x, y) {
  const tx = x.split(/(\s+|[^\w\s])/u).filter(Boolean), ty = y.split(/(\s+|[^\w\s])/u).filter(Boolean)
  let s = 0; while (s < tx.length && s < ty.length && tx[s] === ty[s]) s++
  let ex = tx.length, ey = ty.length; while (ex > s && ey > s && tx[ex - 1] === ty[ey - 1]) { ex--; ey-- }
  const part = (t, e) => [t.slice(0, s).join(''), h('mark', {}, t.slice(s, e).join('')), t.slice(e).join('')]
  return [part(tx, ex), part(ty, ey)]
}
function diffEl(d) {
  const ops = lineOps(d.oldText ? d.oldText.split('\n') : [], d.newText.split('\n'))
  // keep changed lines and 2 lines of context around them; gaps become "⋯"
  const keep = ops.map(() => false)
  ops.forEach(([k], i) => { if (k !== ' ') for (let j = Math.max(0, i - 2); j <= Math.min(ops.length - 1, i + 2); j++) keep[j] = true })
  const rows = []; let gap = false
  for (let i = 0; i < ops.length; i++) {
    if (!keep[i]) { if (!gap && rows.length) rows.push(h('div', { class: 'd gap' }, '⋯')); gap = true; continue }
    gap = false
    const [k, l] = ops[i]
    // a single removed line followed by a single added line: mark the words that changed
    if (k === '-' && ops[i + 1]?.[0] === '+' && ops[i + 2]?.[0] !== '+' && ops[i - 1]?.[0] !== '-') {
      const [mx, my] = wordMarks(l, ops[i + 1][1])
      rows.push(h('div', { class: 'd del' }, h('span', { class: 'd-k' }, '-'), mx), h('div', { class: 'd add' }, h('span', { class: 'd-k' }, '+'), my)); i++; continue
    }
    rows.push(h('div', { class: `d ${k === '+' ? 'add' : k === '-' ? 'del' : 'same'}` }, h('span', { class: 'd-k' }, k === ' ' ? '' : k), l))
  }
  return h('div', { class: 'diff' }, rows)
}
/** Claude Code–style step: bullet on a timeline, verb + target, then an IN/OUT box (bash) or inline diff (edit). */
/**
 * The command waits for something only you can type (passphrase, password, yes/no). omp cannot take keyboard
 * input, so offer the command in a VS Code terminal, typed but not run.
 */
const SSH = { keys: null, state: {} }
function sshForm(c) {
  if (!/ssh|passphrase/iu.test(c.needsInput)) return null
  if (SSH.keys === null) { SSH.keys = []; send({ type: 'sshKeys' }) }
  const st = SSH.state[c.id] ?? {}
  if (st.ok) return h('div', { class: 'ssh-form ok' }, h('span', { class: 'agent-state done' }, '✓'), `Key loaded into ssh-agent — omp was told to retry.`)
  const pick = h('select', { class: 'ssh-key', 'aria-label': 'SSH key' }, (SSH.keys.length ? SSH.keys : ['~/.ssh/id_ed25519']).map(k => h('option', { value: k, ...k === st.key ? { selected: true } : {} }, k.split(/[\\/]/u).pop())))
  const pass = h('input', { type: 'password', class: 'ssh-pass', placeholder: 'Passphrase', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Passphrase' })
  const go = () => {
    if (!pass.value || st.busy) return
    SSH.state[c.id] = { key: pick.value, busy: true }
    send({ type: 'unlockKey', tab: S.active, key: pick.value, passphrase: pass.value })
    pass.value = ''
    refreshSsh(c.id)
  }
  pass.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go() } e.stopPropagation() })
  return h('div', { class: 'ssh-form' }, pick, pass,
    h('button', { class: 'need-btn primary', disabled: st.busy ? true : undefined, onclick: e => { e.stopPropagation(); go() } }, st.busy ? 'Unlocking…' : 'Unlock key'),
    st.error ? h('span', { class: 'ssh-err', role: 'alert' }, st.error) : null)
}
/** Newest SSH card of the chat still waiting for a key, if any. */
function sshPending() {
  const list = items()
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i]
    if (it.type !== 'tool' || !it.card.needsInput || !/ssh|passphrase/iu.test(it.card.needsInput)) continue
    return SSH.state[it.card.id]?.ok ? null : it.card
  }
  return null
}
/** Pinned above the composer: unlock the key without scrolling back to the card that failed. */
function sshBar() {
  const c = sshPending(); if (!c) return null
  const f = sshForm(c); if (!f) return null
  return h('div', { class: 'ssh-bar', id: 'ssh-bar', role: 'region', 'aria-label': 'Unlock SSH key' },
    h('div', { class: 'ssh-bar-head' }, h('span', { class: 'need-ico', 'aria-hidden': 'true' }, '🔑'), h('b', {}, 'SSH key locked'), h('span', { class: 'muted' }, ` — omp's ssh needs it (${c.needsInput}). The passphrase goes only to ssh-agent.`)),
    f)
}
function refreshSshBar() { const el = document.getElementById('ssh-bar'), fresh = sshBar(); if (el) { if (fresh) { const v = el.querySelector('.ssh-pass')?.value; el.replaceWith(fresh); if (v) fresh.querySelector('.ssh-pass').value = v } else el.remove() } else if (fresh) document.querySelector('.composer-wrap')?.prepend(fresh) }
function refreshSsh(id) { const it = items().find(x => x.type === 'tool' && x.card.id === id); if (it) upsertNode(it); refreshSshBar() }
function inputBanner(c) {
  if (!c.needsInput) return null
  const btn = h('button', { class: 'need-btn secondary', onclick: e => { e.stopPropagation(); send({ type: 'runInTerminal', tab: S.active, toolId: c.id }) } }, svg(ICON.terminal), 'Open in terminal')
  const isSsh = /ssh|passphrase/iu.test(c.needsInput)
  const done = isSsh && SSH.state[c.id]?.ok
  const ssh = done ? h('div', { class: 'ssh-form ok' }, h('span', { class: 'agent-state done' }, '✓'), 'Key loaded into ssh-agent — omp was told to retry.') : null
  return h('div', { class: `need-input${ssh ? ' has-form' : ''}`, role: 'status' },
    h('div', { class: 'need-row' },
      h('span', { class: 'need-ico', 'aria-hidden': 'true' }, '⌨'),
      h('span', { class: 'need-text' }, h('b', {}, 'Needs your input'), isSsh ? ` — ${c.needsInput}. Unlock the key in the box above the message input.` : ` — ${c.needsInput}. omp can't type it for you; run it in a terminal.`),
      isSsh && !done ? h('button', { class: 'need-btn primary', onclick: e => { e.stopPropagation(); refreshSshBar(); const f = document.querySelector('#ssh-bar .ssh-pass'); f?.focus(); f?.scrollIntoView({ block: 'nearest' }) } }, '🔑 Enter passphrase') : null,
      btn),
    ssh)
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


// Webview state (S) and per-tab accessors.
// ───────────── state ─────────────
/** 'panel' = one chat in an editor tab; 'sidebar' = history + settings. */
const MODE = document.body.dataset.mode ?? 'panel'
if (document.body.dataset.session) vscode.setState?.({ ...vscode.getState?.() ?? {}, sessionId: decodeURIComponent(document.body.dataset.session), cwd: decodeURIComponent(document.body.dataset.cwd ?? '') })
const S = {
  view: MODE === 'sidebar' ? 'history' : 'chat', tabs: [], active: undefined, models: [], cwd: '', transcripts: {},
  sessions: [], settings: { status: 'idle', settings: [], models: [], failed: {} },
  query: '', group: 'model', open: new Set(), images: [], menu: null, sessionQuery: '', modelQuery: '',
  files: [], fileQuery: null, menuIndex: 0, drafts: {}, window: {},
}
const tab = () => S.tabs.find(t => t.id === S.active) ?? { busy: false, queued: 0, thinkingLevels: [], modes: [], commands: [], usage: {} }
const items = () => S.transcripts[S.active] ?? []

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
  const pin = h('button', { class: `foot-btn pin-btn${isPinned(it.id) ? ' on' : ''}`, title: isPinned(it.id) ? 'Unpin' : 'Pin to top', 'aria-label': 'Pin', onclick: () => { togglePin(it.id); upsertNode(it) } }, svg(ICON.pin))
  return h('div', { class: 'reply-foot' },
    end ? h('span', { class: 'foot-time', title: new Date(end).toLocaleString() }, clock(end)) : null,
    span && span >= 1000 ? h('span', { class: 'foot-took', title: 'From your message to the end of this reply' }, took(span)) : null,
    copy, pin)
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
    files.size ? h('button', { class: 'turn-diff', title: 'Open every file this turn changed in the diff viewer', onclick: () => send({ type: 'turnDiff', tab: S.active, itemId: list[i].id }) }, `${files.size} file${files.size > 1 ? 's' : ''} `, h('span', { class: 'plus' }, `+${add}`), ' ', h('span', { class: 'minus' }, `−${del}`)) : null,
    failed ? h('span', { class: 'minus' }, `${failed} failed`) : null,
    start && end - start >= 1000 ? h('span', {}, took(end - start)) : null)
}

// ───────────── pinned messages ─────────────
const pinsOf = () => S.active ? ((S.pins ??= {})[S.active] ??= []) : []
const isPinned = id => pinsOf().includes(id)
function togglePin(id) {
  const p = pinsOf(), i = p.indexOf(id)
  if (i >= 0) p.splice(i, 1); else p.push(id)
  vscode.setState?.({ ...vscode.getState?.() ?? {}, pins: S.pins })
  refreshPins()
}
function pinBar() {
  const list = items(), p = pinsOf().map(id => list.find(x => x.id === id)).filter(Boolean)
  if (!p.length) return null
  const open = !!S.pinsOpen
  const first = t => String(t ?? '').replace(/\s+/gu, ' ').trim()
  return h('div', { class: 'pin-bar', id: 'pin-bar' },
    h('button', { class: 'pin-head', 'aria-expanded': open ? 'true' : 'false', onclick: () => { S.pinsOpen = !open; refreshPins() } }, svg(ICON.pin), h('span', {}, `${p.length} pinned`), h('span', { class: 'pin-first' }, first(p.at(-1).text).slice(0, 90))),
    open ? h('div', { class: 'pin-list' }, p.map(it => h('div', { class: 'pin-row' },
      h('button', { class: 'pin-go', title: 'Jump to it', onclick: () => { const n = nodes.get(it.id); if (!n) { S.window[S.active] = items().length; render() } nodes.get(it.id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }) } },
        h('span', { class: 'pin-who' }, it.type === 'user' ? 'You' : 'omp'), first(it.text).slice(0, 160)),
      h('button', { class: 'icon-btn', title: 'Unpin', onclick: () => { togglePin(it.id); const n = nodes.get(it.id); if (n) upsertNode(it) } }, '×')))) : null)
}
function refreshPins() { const el = document.getElementById('pin-bar'), fresh = pinBar(); if (el) { if (fresh) el.replaceWith(fresh); else el.remove() } else if (fresh) transcriptEl?.before(fresh) }

// Chat view, composer, menus (model, mode, add, slash, files), history / sidebar.
// ───────────── views ─────────────
const app = document.getElementById('app')
const folderName = p => p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p
function tabbar() {
  const bar = h('div', { class: 'tabbar' },
    S.tabs.map((t, i) => h('div', { class: `tabchip${t.id === S.active ? ' on' : ''}${t.unread ? ' unread' : ''}`, title: t.title ?? 'New chat', onclick: () => activate(t.id), onauxclick: e => { if (e.button === 1) send({ type: 'closeTab', tab: t.id }) } },
      piIcon(t),
      h('span', { class: 'tab-label' }, t.title || `Chat ${i + 1}`),
      h('button', { class: 'tab-x', title: 'Close tab', onclick: e => { e.stopPropagation(); send({ type: 'closeTab', tab: t.id }) } }, svg('<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>')))),
    )
  // New tab, History and Settings live in VS Code's view title bar (package.json view/title).
  return h('div', { class: 'topbar tabs-only' }, bar)
}
function backbar(title) {
  if (MODE === 'sidebar' && title === 'History') return h('div', { class: 'topbar' }, h('div', { class: 'title' }, 'Chats'), h('button', { class: 'new-chat', onclick: () => send({ type: 'newTab' }) }, svg(ICON.plus), 'New chat'))
  return h('div', { class: 'topbar' }, h('button', { class: 'back', onclick: () => go(MODE === 'sidebar' ? 'history' : 'chat') }, svg(ICON.back), 'Back'), h('div', { class: 'title' }, title))
}
function activate(id) { if (id === S.active) return; saveDraft(); S.active = id; S.menu = null; S.fade = true; send({ type: 'activate', tab: id }); render() }
function go(view) {
  S.view = view; S.menu = null; S.fade = true
  if (view === 'history') send({ type: 'listSessions' })
  if (view === 'settings' && !S.settings.settings.length) send({ type: 'loadSettings' })
  render()
}
function saveDraft() { const ta = document.getElementById('input'); if (ta && S.active) S.drafts[S.active] = ta.value }

function chatView() {
  // Focusable, labelled region (not a live region: streaming would read every token aloud): Tab lands here with a visible ring; arrows/PgUp/PgDn scroll; Esc goes back to the input.
  transcriptEl = h('div', { class: 'transcript', tabindex: '0', role: 'region', 'aria-label': 'Chat transcript', onkeydown: e => { if (e.key === 'Escape') { e.preventDefault(); document.getElementById('input')?.focus() } } })
  nodes.clear()
  const list = items()
  if (!list.length) {
    transcriptEl.append(h('div', { class: 'empty' }, h('div', { class: 'logo' }, 'π'), h('h2', {}, 'Oh My Pi'),
      h('div', { class: 'muted' }, S.cwd ? `omp in ${folderName(S.cwd)} · each tab runs on its own` : 'omp runs here with your ~/.omp setup.'),
      h('div', { class: 'suggest' }, ['Explain this project structure', 'Find and fix a bug in the current file', 'Write tests for the selected code']
        .map(t => h('button', { onclick: () => { const ta = document.getElementById('input'); ta.value = t; ta.focus() } }, t)))))
  } else {
    const from = Math.max(0, list.length - (S.window[S.active] ?? 200))
    if (from > 0) transcriptEl.append(h('button', { class: 'earlier', onclick: () => { S.window[S.active] = (S.window[S.active] ?? 200) + 200; const t = transcriptEl, h0 = t.scrollHeight; render(); transcriptEl.scrollTop = transcriptEl.scrollHeight - h0 } }, `Show ${Math.min(200, from)} earlier of ${from}`))
    const frag = document.createDocumentFragment()
    const shown = list.slice(from)
    const runs = new Map(toolRuns(shown).map(([a, b]) => [a, b]))
    for (let i = 0; i < shown.length; i++) {
      const end = runs.get(i)
      if (end !== undefined) {
        const its = shown.slice(i, end), key = 'g:' + its[0].id
        frag.append(groupNode(its))
        if (S.open.has(key)) for (const it of its) { const n = itemNode(it); n.classList.add('in-group'); nodes.set(it.id, n); frag.append(n) }
        else for (const it of its) nodes.set(it.id, null)
        i = end - 1; continue
      }
      const it = shown[i]; const n = itemNode(it); nodes.set(it.id, n); frag.append(n)
      if (it.type === 'user') { const s = turnSummary(shown, i); if (s) frag.append(s) }
    }
    transcriptEl.append(frag)
  }
  renderWorking()
  const down = h('button', { class: 'to-latest', id: 'to-latest', title: 'Jump to latest', 'aria-label': 'Jump to latest', onclick: () => transcriptEl.scrollTo({ top: transcriptEl.scrollHeight, behavior: 'smooth' }) }, svg(ICON.chevron))
  transcriptEl.addEventListener('scroll', syncLatest, { passive: true })
  const wrap = h('div', { class: 'composer-wrap' }, down, deadBar(), sshBar(), goalBar(), todoBar(), composer(), statusLine())
  queueMicrotask(() => { transcriptEl.scrollTop = transcriptEl.scrollHeight })
  S.pins ??= vscode.getState?.()?.pins ?? {}
  const pins = pinBar()
  return MODE === 'sidebar' ? [tabbar(), pins, transcriptEl, wrap].filter(Boolean) : [pins, transcriptEl, wrap].filter(Boolean)
}

function modelName(sel) { return S.models.find(m => m.selector === sel)?.name ?? (sel ? sel.split('/').pop() : 'Model') }

const MI = {
  hand: '<path d="M5.5 8V3.8a1 1 0 0 1 2 0V7.5M7.5 7.5V2.8a1 1 0 0 1 2 0v4.7M9.5 7.5V3.8a1 1 0 0 1 2 0V9M11.5 7a1 1 0 0 1 2 0v3a4 4 0 0 1-4 4h-1a4 4 0 0 1-3.3-1.7L3.3 9.8a1 1 0 0 1 1.6-1.2l.6.8"/>',
  shield: '<path d="M8 1.8l5 2v4c0 3-2.2 5.3-5 6.2-2.8-.9-5-3.2-5-6.2v-4z"/><path d="M5.8 8l1.6 1.6 2.9-3"/>',
  code: '<path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5"/>',
  bolt: '<path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z"/>',
  plan: '<path d="M4 2.5h5.5L12 5v8.5H4z"/><path d="M6 7.5h4M6 10h4"/>',
  slash: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M9.5 5 6.5 11"/>',
}
/** omp tools.approvalMode values, in Shift+Tab order. */
const APPROVAL = [
  { id: 'always-ask', name: 'Manual', desc: 'omp asks before every tool call', icon: MI.hand },
  { id: 'always-ask-cached', name: 'Ask once', desc: 'Asks the first time, remembers your answer', icon: MI.shield },
  { id: 'write', name: 'Ask for writes', desc: 'Reads run freely; asks before writing', icon: MI.code },
  { id: 'yolo', name: 'Auto', desc: 'Runs every tool without asking', icon: MI.bolt },
]
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s
function setApproval(id) {
  if (tab().mode === 'plan') send({ type: 'setMode', tab: S.active, value: 'default' })
  S.approval = id; send({ type: 'setApproval', value: id })
}
/** Shift+Tab: next approval mode, then Plan, then back to the first. */
function cycleMode() {
  const t = tab(); const hasPlan = t.modes.some(m => m.id === 'plan')
  const i = t.mode === 'plan' ? APPROVAL.length : APPROVAL.findIndex(x => x.id === S.approval)
  const next = (i + 1) % (APPROVAL.length + (hasPlan ? 1 : 0))
  if (next === APPROVAL.length) send({ type: 'setMode', tab: S.active, value: 'plan' }); else setApproval(APPROVAL[next].id)
  refreshComposer()
}
function pickImage() {
  const inp = h('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none', onchange: () => {
    for (const f of inp.files ?? []) { const r = new FileReader(); r.onload = () => { S.images.push({ mimeType: f.type, data: String(r.result).split(',')[1], url: r.result }); refreshComposer() }; r.readAsDataURL(f) }
    inp.remove()
  } })
  document.body.append(inp); inp.click()
}
function insertAtEnd(ch) { const x = document.getElementById('input'); x.value += (x.value && !/\s$/.test(x.value) ? ' ' : '') + ch; x.focus(); x.setSelectionRange(x.value.length, x.value.length); updateInlineMenus(x); syncAction() }
/** One button: Stop while omp works and the box is empty, otherwise Send (queues while busy). */
function syncAction() {
  const b = document.getElementById('action'); const x = document.getElementById('input'); if (!b || !x) return
  const t = tab(); const stop = t.busy && !x.value.trim() && !S.images.length
  const state = stop ? 'stop' : 'send'; const prev = b.dataset.state; const flip = prev !== undefined && prev !== state; b.dataset.state = state
  b.className = `send${stop ? ' stop' : ''}`
  b.title = stop ? 'Stop (Esc)' : t.busy ? 'Queue message (Enter)' : 'Send (Enter)'
  if (prev === state) return
  const icon = svg(stop ? ICON.stop : ICON.up); if (flip) icon.classList.add('swap'); b.replaceChildren(icon)
}

function composer() {
  const t = tab()
  const ta = h('textarea', {
    id: 'input', rows: 1, placeholder: t.busy ? 'Message omp while it works…' : 'Ask omp anything · @ files · / commands',
    onkeydown: e => {
      if ((S.menu === 'slash' || S.menu === 'files') && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(e.key)) return menuKey(e)
      if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); cycleMode(); return }
      // ↑ on the first line / ↓ on the last line walk through prompts already sent in this chat.
      if ((e.key === 'ArrowUp' && !ta.value.slice(0, ta.selectionStart).includes('\n')) || (e.key === 'ArrowDown' && S.histAt !== undefined && !ta.value.slice(ta.selectionEnd).includes('\n'))) {
        const past = items().filter(x => x.type === 'user' && x.text).map(x => x.text)
        if (!past.length) return
        if (S.histAt === undefined) { if (e.key === 'ArrowDown') return; S.histDraft = ta.value; S.histAt = past.length }
        S.histAt = Math.max(0, Math.min(past.length, S.histAt + (e.key === 'ArrowUp' ? -1 : 1)))
        e.preventDefault()
        ta.value = S.histAt === past.length ? (S.histDraft ?? '') : past[S.histAt]
        if (S.histAt === past.length) S.histAt = undefined
        autosize(ta); syncAction(); ta.setSelectionRange(ta.value.length, ta.value.length)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit() }
      if (e.key === 'Escape') { if (S.menu) closeMenu(); else if (t.busy) send({ type: 'cancel', tab: S.active }) }
    },
    oninput: () => { S.histAt = undefined; autosize(ta); updateInlineMenus(ta); syncAction() },
    onpaste: e => {
      for (const f of e.clipboardData?.files ?? []) if (f.type.startsWith('image/')) {
        e.preventDefault()
        const r = new FileReader(); r.onload = () => { S.images.push({ mimeType: f.type, data: String(r.result).split(',')[1], url: r.result }); refreshComposer() }; r.readAsDataURL(f)
      }
    },
  })
  const plan = t.mode === 'plan'
  const ap = APPROVAL.find(x => x.id === S.approval)
  const pct = t.usage?.size ? Math.round((t.usage.used ?? 0) / t.usage.size * 100) : null
  const box = h('div', { class: `composer${t.busy ? ' busy' : ''}`, id: 'composer' },
    S.images.length ? h('div', { class: 'attachments' }, S.images.map((img, i) => h('span', { class: 'attach' }, thumb(img.url), h('button', { onclick: () => { S.images.splice(i, 1); refreshComposer() } }, '×')))) : null,
    ta,
    h('div', { class: 'composer-bar' },
      h('button', { class: `chip-btn icon${S.menu === 'add' ? ' open' : ''}`, title: 'Add', onclick: () => openMenu('add') }, svg(ICON.plus)),
      t.commands.length ? h('button', { class: 'chip-btn icon', title: 'Commands (/)', onclick: () => { const x = document.getElementById('input'); if (!x.value.startsWith('/')) { x.value = '/'; } x.focus(); updateInlineMenus(x); syncAction() } }, svg(MI.slash)) : null,
      h('button', { class: `chip-btn model${S.menu === 'model' ? ' open' : ''}`, title: 'Model', onclick: () => openMenu('model') }, h('span', { class: 'label' }, modelName(t.model)), t.thinking ? h('span', { class: 'sub' }, cap(t.thinking)) : null),
      false && pct !== null ? h('span', { class: 'ctx', title: `${t.usage.used} / ${t.usage.size} tokens${t.usage.cost ? ` · $${t.usage.cost.toFixed(4)}` : ''}` }, `${pct}%`) : null,
      bgChip(),
      h('span', { class: 'grow' }),
      h('button', { class: `chip-btn${S.menu === 'mode' ? ' open' : ''}${plan ? ' plan' : ''}`, title: 'Mode (Shift+Tab)', onclick: () => openMenu('mode') }, svg(plan ? MI.plan : ap?.icon ?? MI.bolt), h('span', { class: 'label' }, plan ? 'Plan' : ap?.name ?? 'Mode'), t.readOnly ? h('span', { class: 'ro-badge', title: 'Read-only chat' }, 'read-only') : null),
      h('button', { id: 'action', class: 'send', onclick: () => { const x = document.getElementById('input'); if (tab().busy && !x.value.trim() && !S.images.length) send({ type: 'cancel', tab: S.active }); else submit() } }, svg(ICON.up))),
    menuEl())
  const menu = box.querySelector('.menu')
  if (menu && S.menuEnter) menu.classList.add('enter')
  S.menuEnter = false
  queueMicrotask(() => { autosize(ta); syncAction() })
  return box
}
function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(240, ta.scrollHeight) + 'px' }
function refreshComposer() {
  const old = document.getElementById('composer'); if (!old) return
  const ta = document.getElementById('input'); const v = ta.value; const pos = ta.selectionStart; const focused = document.activeElement === ta
  const fresh = composer(); old.replaceWith(fresh)
  const nt = document.getElementById('input'); nt.value = v; autosize(nt)
  if (focused) { nt.focus(); nt.setSelectionRange(pos, pos) }
  syncGhost()
}

// menus: model, thinking, /commands, @files
function openMenu(kind) { S.menu = S.menu === kind ? null : kind; S.menuEnter = true; refreshComposer(); if (S.menu === 'model') setTimeout(() => document.getElementById('model-filter')?.focus(), 0) }
function closeMenu() { S.menu = null; S.fileQuery = null; refreshComposer() }
function menuEl() {
  const t = tab()
  if (S.menu === 'model') {
    const q = S.modelQuery.toLowerCase()
    const tok = n => n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}K`
    const price = m => m.cost && (m.cost.input || m.cost.output) ? `$${+m.cost.input.toFixed(2)}/$${+m.cost.output.toFixed(2)} per Mtok` : ''
    const detail = m => [m.selector, m.contextWindow ? `${tok(m.contextWindow)} context` : '', price(m)].filter(Boolean).join(' · ')
    const def = S.models.find(m => m.roles?.includes('default'))
    // Pinned: models with an omp role, then everything from providers you configured yourself (models.yml), current one always.
    const own = new Set(S.models.filter(m => m.roles?.length).map(m => m.provider))
    const pinned = q ? [] : S.models.filter(m => m.roles?.length || own.has(m.provider) || m.selector === t.model)
    const hits = q ? S.models.filter(m => m.name.toLowerCase().includes(q) || m.selector.toLowerCase().includes(q)).slice(0, 80) : []
    const pick = sel => { send({ type: 'setModel', tab: S.active, value: sel }); t.model = sel; S.modelQuery = ''; closeMenu() }
    const row = (m, title, sub) => h('button', { class: `menu-item mode${m.selector === t.model ? ' active' : ''}`, onclick: () => pick(m.selector) },
      h('span', { class: 'mi-text' }, h('b', {}, title ?? m.name, m.roles?.length && !title ? h('span', { class: 'roles' }, m.roles.filter(r => r !== 'default').slice(0, 3).join(' · ')) : null), h('small', {}, sub ?? detail(m))),
      h('span', { class: 'check' }, m.selector === t.model ? '✓' : ''))
    const filter = h('input', { type: 'text', id: 'model-filter', placeholder: `Search all ${S.models.length || ''} models…`, value: S.modelQuery, oninput: e => { S.modelQuery = e.target.value; const pos = e.target.selectionStart; refreshComposer(); const f = document.getElementById('model-filter'); f.focus(); f.setSelectionRange(pos, pos) }, onkeydown: e => { if (e.key === 'Escape') closeMenu() } })
    const lv = t.thinkingLevels; const cur = lv.indexOf(t.thinking ?? '')
    return h('div', { class: 'menu models' },
      h('div', { class: 'menu-group row' }, h('span', {}, 'Select a model')),
      filter,
      !S.models.length ? h('div', { class: 'menu-item muted' }, 'Loading models…') : null,
      def && !q ? row(def, 'Default (recommended)', `Use omp's default model (currently ${def.name})${price(def) ? ' · ' + price(def) : ''}`) : null,
      pinned.filter(m => m !== def).map(m => row(m)),
      hits.map(m => row(m)),
      q && !hits.length ? h('div', { class: 'menu-item muted' }, 'No models match') : null,
      lv.length ? [h('div', { class: 'menu-sep' }), h('div', { class: 'effort' }, svg(ICON.brain), h('span', {}, 'Effort ', h('span', { class: 'muted' }, `(${cap(t.thinking ?? 'auto')})`)), h('span', { class: 'grow' }),
        h('span', { class: 'dots' }, lv.map((l, i) => h('button', { class: `dot${i <= cur ? ' on' : ''}${i === cur ? ' cur' : ''}`, title: cap(l), onclick: e => { e.stopPropagation(); send({ type: 'setThinking', tab: S.active, value: l }); t.thinking = l; refreshComposer() } }))))] : null)
  }
  if (S.menu === 'jobs') {
    if (S.menuEnter) refreshJobs()
    const { agents, jobs } = activity()
    const jump = id => { closeMenu(); const n = nodes.get(id); n?.scrollIntoView({ block: 'center', behavior: 'smooth' }); n?.classList.add('flash'); setTimeout(() => n?.classList.remove('flash'), 900) }
    return h('div', { class: 'menu', style: 'left:6px;min-width:260px' },
      agents.length ? [h('div', { class: 'menu-group' }, `Subagents · ${agents.filter(a => a.running).length} running`), agents.map(a => h('button', { class: 'menu-item agent-item', title: a.task, onclick: () => { closeMenu(); openAgent(a.cid, a.label, a.id) } }, a.running ? runDot() : h('span', { class: `agent-state ${a.failed ? 'failed' : 'done'}` }, a.failed ? '✕' : '✓'), h('span', { class: 'agent-item-name' }, a.label), a.agent ? h('span', { class: 'agent-kind' }, a.agent) : null, h('span', { class: 'desc' }, a.startedAt && (a.endedAt ?? Date.now()) - a.startedAt >= 1000 ? took((a.endedAt ?? Date.now()) - a.startedAt) : ''))), h('div', { class: 'menu-sep' })] : null,
      bgJobs().length ? [h('div', { class: 'menu-group' }, `Background · ${bgJobs().filter(j => j.status === 'running').length} running`), bgJobs().slice(-12).reverse().map(j => h('button', { class: 'menu-item agent-item', title: j.label, onclick: () => { closeMenu(); openJob(j.jobId) } }, jobState(j.status), h('span', { class: 'agent-item-name job-label' }, j.label), h('span', { class: 'desc' }, j.durationMs != null ? took(j.durationMs) : j.status === 'running' && j.at ? took(Date.now() - j.at) : ''))), bgJobs().length > 12 ? h('button', { class: 'menu-item muted', onclick: () => { closeMenu(); openJob(null) } }, `All ${bgJobs().length} jobs…`) : null] : jobs.length ? [h('div', { class: 'menu-group' }, 'Background'), jobs.map(j => h('button', { class: 'menu-item', onclick: () => jump(j.id) }, runDot(), h('span', {}, j.label), h('span', { class: 'desc' }, j.command)))] : null,
      h('div', { class: 'menu-group' }, 'Ask omp'),
      h('button', { class: 'menu-item', onclick: () => { closeMenu(); send({ type: 'prompt', tab: S.active, text: 'read jobs:// and give me the status of every running task and background service' }) } }, 'Check status of all jobs'))
  }
  if (S.menu === 'add') {
    return h('div', { class: 'menu', style: 'left:6px;min-width:210px' },
      h('button', { class: 'menu-item', onclick: () => { closeMenu(); pickImage() } }, svg(ICON.image), 'Upload image'),
      h('button', { class: 'menu-item', onclick: () => { closeMenu(); insertAtEnd('@') } }, h('span', { class: 'mi-ico' }, '@'), 'Mention a file'),
      h('button', { class: 'menu-item', onclick: () => { closeMenu(); send({ type: 'addSelection' }) } }, svg(MI.code), 'Add editor selection'),
      h('div', { class: 'menu-sep' }),
      h('button', { class: 'menu-item', onclick: () => { closeMenu(); openFind() } }, h('span', { class: 'mi-ico' }, '⌕'), 'Find in chat', h('span', { class: 'desc' }, 'Ctrl+F')),
      h('button', { class: 'menu-item', onclick: () => { closeMenu(); send({ type: 'exportChat', tab: S.active, markdown: chatMarkdown() }) } }, h('span', { class: 'mi-ico' }, '⇩'), 'Export chat to Markdown'))
  }
  if (S.menu === 'mode') {
    const plan = t.mode === 'plan'
    const lv = t.thinkingLevels; const cur = lv.indexOf(t.thinking ?? '')
    const row = (on, icon, name, desc, onclick) => h('button', { class: `menu-item mode${on ? ' active' : ''}`, onclick }, svg(icon), h('span', { class: 'mi-text' }, h('b', {}, name), h('small', {}, desc)), h('span', { class: 'check' }, on ? '✓' : ''))
    return h('div', { class: 'menu modes' },
      h('div', { class: 'menu-group row' }, h('span', {}, 'Modes'), h('span', { class: 'kbd' }, '⇧ + Tab to switch')),
      APPROVAL.map(x => row(!plan && x.id === S.approval, x.icon, x.name, x.desc, () => { setApproval(x.id); closeMenu() })),
      t.modes.some(m => m.id === 'plan') ? row(plan, MI.plan, 'Plan', 'Explores the code and presents a plan before editing', () => { send({ type: 'setMode', tab: S.active, value: plan ? 'default' : 'plan' }); closeMenu() }) : null,
      h('div', { class: 'menu-sep' }),
      row(!!t.readOnly, MI.shield, 'Read-only', 'omp reads and searches; every write, delete and command is declined', () => { send({ type: 'readOnly', tab: S.active, on: !t.readOnly }); t.readOnly = !t.readOnly; closeMenu() }),
      row(t.autopilot !== false, MI.bolt, 'Autopilot', 'Keeps going on its own: continues unfinished todo lists and breaks waits that never return', () => { send({ type: 'autopilot', tab: S.active, on: t.autopilot === false }); t.autopilot = t.autopilot === false; closeMenu() }),
      lv.length ? [h('div', { class: 'menu-sep' }), h('div', { class: 'effort' }, svg(ICON.brain), h('span', {}, `Effort (${cap(t.thinking ?? 'auto')})`), h('span', { class: 'grow' }),
        h('span', { class: 'dots' }, lv.map((l, i) => h('button', { class: `dot${i <= cur ? ' on' : ''}${i === cur ? ' cur' : ''}`, title: cap(l), onclick: e => { e.stopPropagation(); send({ type: 'setThinking', tab: S.active, value: l }); t.thinking = l; refreshComposer() } }))))] : null)
  }
  if (S.menu === 'thinking') {
    return h('div', { class: 'menu', style: 'left:60px;min-width:160px' }, h('div', { class: 'menu-group' }, 'Thinking'),
      t.thinkingLevels.map(l => h('button', { class: `menu-item${l === t.thinking ? ' active' : ''}`, onclick: () => { send({ type: 'setThinking', tab: S.active, value: l }); t.thinking = l; closeMenu() } }, h('span', { class: 'check' }, l === t.thinking ? '✓' : ''), l)))
  }
  if (S.menu === 'slash') {
    const hits = slashHits()
    if (!hits.length) return null
    queueMicrotask(() => document.querySelector('.menu.slash .menu-item.active')?.scrollIntoView({ block: 'nearest' }))
    return h('div', { class: 'menu slash', style: 'left:0;right:0' }, h('div', { class: 'menu-group' }, `${hits.length} commands`), hits.map((c, i) => h('button', { class: `menu-item${i === S.menuIndex ? ' active' : ''}`, onclick: () => pickSlash(c) }, h('strong', {}, '/' + c.name), h('span', { class: 'desc' }, c.description ?? ''))))
  }
  if (S.menu === 'files') {
    return h('div', { class: 'menu', style: 'left:0;right:0' },
      h('div', { class: 'menu-group' }, S.fileQuery ? `Files matching “${S.fileQuery}”` : 'Files'),
      !S.files.length ? h('div', { class: 'menu-item muted' }, 'No matching files') : null,
      S.files.map((f, i) => { const parts = f.split('/'); const name = parts.pop(); return h('button', { class: `menu-item${i === S.menuIndex ? ' active' : ''}`, onclick: () => pickFile(f) }, h('span', {}, name), h('span', { class: 'desc' }, parts.join('/'))) }))
  }
  return null
}
const GOAL_CMD = { name: 'goal', description: 'Work on an objective across turns until done (pause / resume / stop)' }
function slashHits() { const ta = document.getElementById('input'); const m = ta && /^\/(\S*)$/.exec(ta.value); if (!m) return []; const q = m[1].toLowerCase(); const all = [GOAL_CMD, ...tab().commands.filter(c => c.name !== 'goal')]; return [...all.filter(c => c.name.toLowerCase().startsWith(q)), ...all.filter(c => !c.name.toLowerCase().startsWith(q) && (c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q)))] }
/** `@query` right before the caret, or null. */
function mentionAt(ta) { const before = ta.value.slice(0, ta.selectionStart); const m = /(^|\s)@([^\s@]*)$/.exec(before); return m ? m[2] : null }
let fileTimer = null
function updateInlineMenus(ta) {
  const mention = mentionAt(ta)
  if (mention !== null) {
    if (S.menu !== 'files') { S.menu = 'files'; S.files = []; S.menuIndex = 0; S.menuEnter = true }
    if (mention !== S.fileQuery) {
      S.fileQuery = mention
      clearTimeout(fileTimer); fileTimer = setTimeout(() => send({ type: 'findFiles', query: mention }), 120)
    }
    refreshComposer(); return
  }
  const wantSlash = /^\/\S*$/.test(ta.value)
  if (wantSlash) { if (S.menu !== 'slash') S.menuEnter = true; S.menu = 'slash'; S.menuIndex = 0; refreshComposer(); return }
  if (S.menu === 'slash' || S.menu === 'files') { S.menu = null; S.fileQuery = null; refreshComposer() }
}
function menuKey(e) {
  const list = S.menu === 'slash' ? slashHits() : S.files
  if (!list.length) return
  e.preventDefault()
  if (e.key === 'ArrowDown') S.menuIndex = (S.menuIndex + 1) % list.length
  else if (e.key === 'ArrowUp') S.menuIndex = (S.menuIndex - 1 + list.length) % list.length
  else return S.menu === 'slash' ? pickSlash(list[S.menuIndex]) : pickFile(list[S.menuIndex])
  refreshComposer()
}
function pickSlash(c) { const ta = document.getElementById('input'); ta.value = `/${c.name} `; S.menu = null; refreshComposer(); document.getElementById('input').focus() }
function pickFile(path) {
  const ta = document.getElementById('input')
  const pos = ta.selectionStart
  const before = ta.value.slice(0, pos).replace(/@([^\s@]*)$/, `@${path} `)
  ta.value = before + ta.value.slice(pos)
  S.menu = null; S.fileQuery = null
  refreshComposer()
  const nt = document.getElementById('input'); nt.focus(); nt.setSelectionRange(before.length, before.length)
}

function submit() {
  const ta = document.getElementById('input')
  const text = ta.value.trim()
  if ((!text && !S.images.length) || !S.active) return
  // /goal <objective> | /goal pause | resume | stop — handled by the extension (omp's goal does not run over ACP).
  const gm = /^\/goal(?:\s+([\s\S]*))?$/u.exec(text)
  if (gm) {
    const arg = (gm[1] ?? '').trim(), word = arg.toLowerCase()
    if (['pause', 'resume', 'stop', 'clear', 'drop'].includes(word)) send({ type: 'goal', tab: S.active, action: word === 'clear' || word === 'drop' ? 'stop' : word })
    else if (arg) send({ type: 'goal', tab: S.active, action: 'start', objective: arg })
    else { ta.value = '/goal '; ta.focus(); return }
    ta.value = ''; S.drafts[S.active] = ''; refreshComposer(); return
  }
  send({ type: 'prompt', tab: S.active, text, images: S.images.map(({ mimeType, data }) => ({ mimeType, data })) })
  ta.value = ''; S.images = []; S.menu = null; S.drafts[S.active] = ''; S.histAt = undefined
  refreshComposer()
}

// history
const money = n => n >= 100 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`
const dur = ms => { if (!ms) return '0s'; const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s` }
const ago = iso => { const d = (Date.now() - Date.parse(iso)) / 1000; return d < 60 ? 'now' : d < 3600 ? `${Math.floor(d / 60)}m` : d < 86400 ? `${Math.floor(d / 3600)}h` : `${Math.floor(d / 86400)}d` }
const cleanTitle = t => (t || 'Untitled session').replace(/^\S*\s*ESC:\s*/u, '').replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, '')
function collapsible(key, title, right, body) {
  S.closed ??= new Set(['empty'])
  const open = !S.closed.has(key)
  return h('div', { class: 'sb-sec' },
    h('button', { class: 'sb-head', onclick: () => { (S.closed ??= new Set()); open ? S.closed.add(key) : S.closed.delete(key); render() } }, h('span', { class: `chev${open ? ' open' : ''}` }, '›'), title, h('span', { class: 'grow' }), right),
    open ? body : null)
}
function historyView() {
  const q = S.sessionQuery.toLowerCase()
  const open = new Set(S.tabs.map(t => t.id))
  const busy = new Set(S.tabs.filter(t => t.busy).map(t => t.id))
  const all = S.sessions
  const sum = all.reduce((a, s) => { const x = s.stats; if (x) { a.cost += x.cost; a.api += x.apiMs; a.wall += x.wallMs ?? 0; a.add += x.added; a.del += x.removed; a.inp += x.input; a.out += x.output; a.prompts += x.prompts } return a }, { cost: 0, api: 0, wall: 0, add: 0, del: 0, inp: 0, out: 0, prompts: 0 })
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayCost = all.filter(s => s.updatedAt && Date.parse(s.updatedAt) >= today.getTime()).reduce((n, s) => n + (s.stats?.cost ?? 0), 0)
  const kv = (k, v) => h('div', { class: 'kv-row' }, h('span', {}, k), h('span', { class: 'v' }, v))
  const usage = collapsible('usage', 'Usage', h('span', { class: 'muted small' }, folderName(S.cwd)), h('div', { class: 'sb-body' },
    kv('Total cost', money(sum.cost)), kv('Today', money(todayCost)),
    kv('Duration (API)', dur(sum.api)), kv('Duration (wall)', dur(sum.wall)),
    kv('Tokens in / out', `${fmtTok(sum.inp)} / ${fmtTok(sum.out)}`),
    kv('Prompts', String(sum.prompts)),
    h('div', { class: 'kv-row col' }, h('span', {}, 'Code changes'), h('span', { class: 'v' }, h('span', { class: 'plus' }, `${sum.add.toLocaleString()} added`), ', ', h('span', { class: 'minus' }, `${sum.del.toLocaleString()} removed`)))))
  const rows = all.filter(s => !q || cleanTitle(s.title).toLowerCase().includes(q) || (s.stats?.model ?? '').toLowerCase().includes(q) || (s.stats?.text ?? '').toLowerCase().includes(q))
  const active = rows.filter(s => open.has(s.sessionId))
  const empty = rows.filter(s => !open.has(s.sessionId) && s.stats && !s.stats.prompts)
  const rest = rows.filter(s => !open.has(s.sessionId) && !empty.includes(s))
  const groups = {}
  for (const s of rest) { const d = s.updatedAt ? new Date(s.updatedAt) : null; (groups[d ? relDay(d) : 'Older'] ??= []).push(s) }
  const row = s => {
    const x = s.stats
    const meta = [x?.model ? x.model.split('/').pop() : '', x?.prompts ? `${x.prompts} prompt${x.prompts > 1 ? 's' : ''}` : '', x?.cost ? money(x.cost) : ''].filter(Boolean).join(' · ')
    return h('button', { class: `session${open.has(s.sessionId) ? ' current' : ''}`, title: s.title ?? '', onclick: () => send({ type: 'loadSession', sessionId: s.sessionId }) },
      h('div', { class: 'srow' }, open.has(s.sessionId) ? h('span', { class: `live${busy.has(s.sessionId) ? ' busy' : ''}` }) : null,
        h('span', { class: 'session-title' }, cleanTitle(s.title)), h('span', { class: 'when' }, s.updatedAt ? ago(s.updatedAt) : '')),
      meta || x?.added || x?.removed ? h('div', { class: 'session-meta' }, meta, x && (x.added || x.removed) ? h('span', { class: 'diffstat' }, h('span', { class: 'plus' }, `+${x.added}`), ' ', h('span', { class: 'minus' }, `-${x.removed}`)) : null) : null)
  }
  const search = h('input', { type: 'search', class: 'search', placeholder: 'Search titles and prompts…', value: S.sessionQuery, oninput: e => { S.sessionQuery = e.target.value; const p = e.target.selectionStart; render(); const f = document.querySelector('.search'); f.focus(); f.setSelectionRange(p, p) } })
  const sessions = collapsible('sessions', 'Sessions', h('span', { class: 'count' }, String(all.length)), h('div', { class: 'sb-body' },
    h('button', { class: 'sb-new', onclick: () => send({ type: 'newTab' }) }, svg(ICON.plus), 'New session'),
    search,
    !all.length ? h('div', { class: 'muted', style: 'padding:8px 4px' }, `No omp sessions in ${folderName(S.cwd)} yet.`) : null,
    active.length ? [h('div', { class: 'day' }, h('span', {}, 'Active'), h('span', { class: 'count' }, String(active.length))), active.map(row)] : null,
    Object.entries(groups).map(([day, list]) => [h('div', { class: 'day' }, h('span', {}, day), h('span', { class: 'count' }, String(list.length))), list.map(row)]),
    empty.length ? h('div', { class: 'sb-sub' }, collapsible('empty', 'Empty sessions', h('span', { class: 'count' }, String(empty.length)), h('div', {}, empty.map(row)))) : null))
  return [h('div', { class: 'page sidebar' }, usage, sessions)]
}
function relDay(d) {
  const day = 864e5, now = new Date(); const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (d.getTime() >= t0) return 'Today'
  if (d.getTime() >= t0 - day) return 'Yesterday'
  if (d.getTime() >= t0 - 6 * day) return 'This week'
  return d.toLocaleDateString()
}

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

// render(), global click handling, host → webview messages.
// ───────────── render / wiring ─────────────
function render() {
  saveDraft()
  app.innerHTML = ''
  transcriptEl = null; settingsList = null
  const parts = S.view === 'chat' ? chatView() : S.view === 'history' ? historyView() : settingsView()
  app.append(...[parts].flat())
  if (S.fade) { app.children[1]?.classList.add('fade'); S.fade = false }
  const ta = document.getElementById('input')
  if (ta && S.active) { ta.value = S.drafts[S.active] ?? ''; autosize(ta) }
  if (S.view === 'chat') syncGhost()
  if (agentView.open && S.view === 'chat') renderAgentPanel()
  if (jobView.open && S.view === 'chat') renderJobPanel()
}

document.addEventListener('click', (e) => {
  // Copy on code blocks and IN/OUT boxes: the full text (data-text) or what the block shows.
  const cp = e.target.closest?.('.copy, .copy-reply')
  if (cp) {
    e.preventDefault(); e.stopPropagation()
    const text = cp.dataset.text ?? cp.parentElement.querySelector('pre')?.innerText ?? ''
    const iconOnly = cp.classList.contains('copy-reply')
    const done = ok => {
      if (iconOnly) { cp.replaceChildren(svg(ok ? ICON.check : ICON.copy)); cp.classList.toggle('ok', ok); cp.title = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { cp.replaceChildren(svg(ICON.copy)); cp.classList.remove('ok'); cp.title = 'Copy reply (Markdown)' }, 1400); return }
      cp.textContent = ok ? 'Copied' : 'Failed'; cp.classList.toggle('ok', ok); setTimeout(() => { cp.textContent = 'Copy'; cp.classList.remove('ok') }, 1200)
    }
    // Fallback for contexts without the async clipboard API: a hidden textarea + execCommand.
    const legacy = () => { const t = h('textarea', { style: 'position:fixed;opacity:0' }); t.value = text; document.body.append(t); t.select(); let ok = false; try { ok = document.execCommand('copy') } catch {} t.remove(); done(ok) }
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => done(true), legacy); else legacy()
    return
  }
  const a = e.target.closest?.('a.file')
  if (a) { e.preventDefault(); send({ type: 'openFile', path: a.dataset.path, ...a.dataset.line ? { line: Number(a.dataset.line) } : {} }); return }
  if (S.menu && !e.target.closest('.menu') && !e.target.closest('.chip-btn') && !(e.target.closest('#input') && (S.menu === 'slash' || S.menu === 'files'))) closeMenu()
})

window.addEventListener('message', ({ data: m }) => {
  switch (m.type) {
    case 'tabs': {
      const changedActive = m.active !== S.active
      const structure = S.tabs.map(t => t.id).join() !== m.tabs.map(t => t.id).join()
      S.tabs = m.tabs; S.models = m.models; S.cwd = m.cwd
      if (changedActive) { saveDraft(); S.active = m.active; refreshJobs() }
      if (S.view === 'chat') { if (changedActive || structure) render(); else refreshComposer() }
      else if (S.view === 'history') render()
      return
    }
    case 'tab': {
      const i = S.tabs.findIndex(t => t.id === m.tab.id)
      if (i < 0) return
      const was = S.tabs[i]
      S.tabs[i] = m.tab
      if (!m.tab.busy && was.busy && m.tab.id === S.active && S.view === 'chat') { const t = transcriptEl, atEnd = t && t.scrollHeight - t.scrollTop - t.clientHeight < 80; render(); if (atEnd && transcriptEl) transcriptEl.scrollTop = transcriptEl.scrollHeight }
      if (!m.tab.busy && was.busy && m.tab.id === S.active) { refreshJobs(); if (S.menu === 'jobs') S.menu = null }
      if (m.tab.busy && !was.busy) { const st = (STAT[m.tab.id] ??= { chars: 0, total: 0, t0: 0, last: 0 }); st.chars = 0; st.t0 = 0 }
      if (m.tab.id === S.active) { refreshStatus(); refreshGoal(); refreshDeadBar() }
      if (S.view !== 'chat') return
      // Tab strip (spinner / unread / title) always; composer and spinner only for the active tab.
      const strip = document.querySelector('.tabbar')
      if (strip) strip.replaceWith(tabbar().querySelector('.tabbar'))
      if (m.tab.id === S.active) { refreshComposer(); if (was.busy !== m.tab.busy || was.queued !== m.tab.queued) stickBottom(renderWorking) }
      return
    }
    case 'reset': {
      const same = JSON.stringify(S.transcripts[m.tab] ?? null) === JSON.stringify(m.items)
      S.transcripts[m.tab] = m.items
      if (!same && m.tab === S.active && S.view === 'chat') { S.open.clear(); render() }
      if (m.tab === S.active) refreshJobs()
      return
    }
    case 'upsert': {
      const list = (S.transcripts[m.tab] ??= [])
      const i = list.findIndex(x => x.id === m.item.id)
      trackStream(m.tab, m.item, i >= 0 ? list[i].text?.length : 0)
      if (m.item.card && bgInfo(m.item.card) && m.tab === S.active && (i < 0 || list[i].card?.status !== m.item.card.status)) refreshJobs()
      if (i >= 0) list[i] = m.item; else list.push(m.item)
      if (m.tab === S.active && S.view === 'chat') queueUpsert(m.item, () => { updateWorking(); if (m.item.card?.todo) refreshTodo(); if (m.item.card?.needsInput) refreshSshBar() })
      return
    }
    case 'files': if (S.menu === 'files' && m.query === S.fileQuery) { S.files = m.files; S.menuIndex = 0; refreshComposer() } return
    case 'sessions': S.sessions = m.rows; if (S.view === 'history') render(); return
    case 'settings': {
      const firstLoad = !S.settings.settings.length
      S.settings = m
      if (S.view !== 'settings') return
      if (firstLoad || m.status !== 'ready') render(); else renderSettingsList()
      return
    }
    case 'prediction': S.predict ??= {}; S.predict[m.tab] = m.text; if (m.tab === S.active) syncGhost(); return
    case 'sshLocked': for (const id of Object.keys(SSH.state)) if (SSH.state[id]?.ok) delete SSH.state[id]; return
    case 'sshKeys': SSH.keys = m.keys; for (const it of items()) if (it.type === 'tool' && it.card.needsInput) refreshSsh(it.card.id); return
    case 'unlocked': {
      for (const [id, st] of Object.entries(SSH.state)) if (st.busy && st.key === m.key) SSH.state[id] = m.ok ? { ok: true } : { key: m.key, error: m.message }
      // one key unlocks every SSH card of the chat
      if (m.ok) for (const it of items()) if (it.type === 'tool' && it.card.needsInput && /ssh|passphrase/iu.test(it.card.needsInput)) SSH.state[it.card.id] = { ok: true }
      for (const id of Object.keys(SSH.state)) refreshSsh(id)
      return
    }
    case 'jobs': { if (m.tab !== S.active) return; const same = JSON.stringify(JOBS[m.tab]) === JSON.stringify(m.jobs); JOBS[m.tab] = m.jobs; if (!same) { refreshComposer(); renderJobPanel(); if (S.view === 'chat') for (const it of items()) if (it.type === 'tool' && bgInfo(it.card) && nodes.has(it.id)) upsertNode(it) } return }
    case 'agentConversation': {
      const o = agentView.open
      if (!o || o.toolId !== m.toolId || o.name !== m.name) return
      const same = agentView.data && JSON.stringify(agentView.data.entries) === JSON.stringify(m.entries) && agentView.data.cost === m.cost
      agentView.data = m
      if (!same || !document.getElementById('agent-panel')) renderAgentPanel()
      return
    }
    case 'agentSteps': {
      const k = `${m.toolId}:${m.name}`
      const prev = S.steps?.[k]
      ;(S.steps ??= {})[k] = m
      if (S.view !== 'chat') return
      // Unchanged log: touch nothing (keeps the scrollbar still). Changed: patch the list in place.
      if (prev && prev.steps.length === m.steps.length && prev.steps.every((s, i) => s.status === m.steps[i].status && s.label === m.steps[i].label)) return
      if (patchAgentSteps(k, m)) return
      const it = items().find(x => x.type === 'tool' && x.card.id === m.toolId); if (it) upsertNode(it)
      return
    }
    case 'approval': S.approval = m.value; if (S.view === 'chat') refreshComposer(); return
    case 'view': go(m.view); return
    case 'insert': {
      if (S.view !== 'chat') go('chat')
      const ta = document.getElementById('input')
      // Dropped @mentions continue the line; added selections start a new one.
      if (m.replace) { ta.value = m.text; S.images = (m.images ?? []).map(i => ({ ...i, url: `data:${i.mimeType};base64,${i.data}` })); refreshComposer() }
      else { const sep = !ta.value ? '' : m.inline ? (/\s$/.test(ta.value) ? '' : ' ') : '\n'; ta.value = ta.value + sep + m.text }
      const input = document.getElementById('input'); autosize(input); syncAction(); input.focus(); input.setSelectionRange(input.value.length, input.value.length)
    }
  }
})


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
    h('button', { class: 'menu-item', onclick: () => { S.userMenu = null; togglePin(it.id); upsertNode(it) } }, isPinned(it.id) ? 'Unpin' : 'Pin to top'),
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
  // per question: "Other" picked (its text box shown); omp reads a non-empty <k>__other as the answer
  const otherOn = {}
  const answered = k => otherOn[k] ? !!String(val[k + '__other'] ?? '').trim() : !(val[k] === undefined || val[k] === '' || (Array.isArray(val[k]) && !val[k].length))
  const check = () => { if (submit) submit.disabled = props.some(([k]) => (otherOn[k] || (it.schema.required ?? []).includes(k)) && !answered(k)) }
  const blocks = props.map(([k, p], qi) => {
    const o = opts(p)
    const chosen = done ? [c[k]].flat().filter(v => v !== undefined) : null
    const isRec = v => p.default != null && v === p.default && !/recommended/iu.test(String((o ?? []).find(x => x.v === v)?.t ?? ''))
    const ot = other(k)
    let body, otherBox = null
    if (o) {
      const multi = p.type === 'array'
      if (multi && !done) val[k] ??= []
      const otherText = done && ot ? String(c[ot[0]] ?? '').trim() : ''
      // the free-text box belongs to the "Other" choice: hidden until that choice is picked
      const box = ot && !done ? h('input', { type: 'text', class: 'field q-other', hidden: true, placeholder: 'Type your own answer', 'aria-label': 'Other answer', oninput: e => { val[ot[0]] = e.target.value; check() } }) : null
      const sync = group => group.querySelectorAll('.q-opt').forEach(l => l.classList.toggle('on', l.querySelector('input').checked))
      const row = (x, on, pick) => h('label', { class: 'q-opt' + (on ? ' on' : '') + (done ? ' ro' : '') },
        h('input', { type: multi ? 'checkbox' : 'radio', name: it.id + k, ...on ? { checked: true } : {}, ...done ? { disabled: true } : {}, onchange: e => { pick(e.target.checked); check(); sync(e.target.closest('.q-opts')) } }),
        h('span', { class: 'q-opt-text' }, h('b', {}, x.t, isRec(x.v) ? ' (Recommended)' : null), x.d ? h('small', {}, x.d) : null))
      const setOther = on => {
        otherOn[k] = on
        if (!box) return
        box.hidden = !on
        if (on) queueMicrotask(() => box.focus()); else { box.value = ''; delete val[ot[0]] }
      }
      const rows = o.map(x => row(x, done ? !otherText && chosen.includes(x.v) : multi ? val[k].includes(x.v) : val[k] === x.v, checked => {
        if (multi) val[k] = checked ? [...val[k], x.v] : val[k].filter(v => v !== x.v)
        else { val[k] = x.v; setOther(false) }
      }))
      if (ot) rows.push(row({ v: '__other', t: 'Other', d: done && otherText ? otherText : null }, !!otherText, checked => {
        // single choice: "Other" replaces the pick; multi: it adds to the picks
        if (!multi) delete val[k]
        setOther(multi ? checked : true)
      }))
      body = h('div', { class: 'q-opts', role: multi ? 'group' : 'radiogroup', 'aria-label': p.title || k }, rows)
      otherBox = box
    } else if (p.type === 'boolean') {
      if (!done) val[k] ??= false
      const on = done ? !!c[k] : val[k]
      body = h('label', { class: 'q-opt' + (on ? ' on' : '') + (done ? ' ro' : '') }, h('input', { type: 'checkbox', ...on ? { checked: true } : {}, ...done ? { disabled: true } : {}, onchange: e => { val[k] = e.target.checked; check() } }), h('span', { class: 'q-opt-text' }, h('b', {}, 'Yes')))
    } else {
      body = done ? h('div', { class: 'q-text-ans' }, String(c[k] ?? '—')) : h('textarea', { class: 'field ask-text', rows: 2, placeholder: 'Type your answer…', oninput: e => { val[k] = p.type === 'number' || p.type === 'integer' ? Number(e.target.value) : e.target.value; check() } })
    }
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
    t.turnCost ? seg('turn-cost', '', '$' + t.turnCost.toFixed(t.turnCost < 1 ? 3 : 2) + ' this request', 'Cost of your last message, including autopilot and goal turns it set off') : null,
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
  const keep = old?.querySelector('.jp-out > .codeblock pre')?.scrollTop ?? 0
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
      h('div', { class: 'jp-out-head' }, jobState(sel.status), h('b', {}, sel.label), h('span', { class: 'muted' }, ` · ${sel.status}${sel.at ? ' · started ' + clock(sel.at) : ''}${sel.durationMs != null ? ' · ' + took(sel.durationMs) : ''}`)),
      sel.command ? h('div', { class: 'jp-cmd' }, h('div', { class: 'jp-k' }, 'Command', sel.cwd ? h('span', { class: 'jp-cwd', title: sel.cwd }, ` · in ${sel.cwd}`) : null), h('div', { class: 'codeblock' }, copyBtn(sel.command), h('pre', {}, sel.command))) : null,
      sel.status === 'running' ? h('div', { class: 'jp-actions' },
        h('button', { class: 'need-btn secondary', title: 'omp reads the job and shows its latest output in the chat', onclick: () => { send({ type: 'jobAction', tab: S.active, jobId: sel.jobId, action: 'peek' }); closeJobs() } }, 'Show live output'),
        h('button', { class: 'need-btn danger', title: 'Stop this job (asks first)', onclick: () => send({ type: 'jobAction', tab: S.active, jobId: sel.jobId, action: 'kill' }) }, 'Stop job')) : null,
      h('div', { class: 'jp-k' }, 'Output'),
      sel.output ? h('div', { class: 'codeblock' }, copyBtn(sel.output), h('pre', {}, sel.output))
        : h('div', { class: 'muted ap-empty' }, sel.status === 'running' ? 'Still running — omp keeps the live output in memory; “Show live output” asks omp to print it in the chat.' : 'No output.')) : null)
  if (old) old.replaceWith(panel); else { app.append(panel); panel.classList.add('enter'); queueMicrotask(() => panel.querySelector('.jp-row.on, .jp-row')?.focus()) }
  const pre = panel.querySelector('.jp-out > .codeblock pre'); if (pre) pre.scrollTop = keep
}

// Esc closes an open agent/jobs panel wherever focus is (the panel covers the chat, so it owns Esc).
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return
  if (document.getElementById('agent-panel')) { e.preventDefault(); e.stopPropagation(); closeAgent() }
  else if (document.getElementById('job-panel')) { e.preventDefault(); e.stopPropagation(); closeJobs() }
}, true)

// ───────────── omp stopped ─────────────
function deadBar() {
  if (!tab().dead) return null
  return h('div', { class: 'dead-bar', id: 'dead-bar', role: 'alert' }, h('span', {}, h('b', {}, 'omp stopped.'), ' Its process exited; your chat is kept.'),
    h('button', { class: 'need-btn primary', onclick: () => send({ type: 'restartOmp', tab: S.active }) }, 'Restart omp'))
}
function refreshDeadBar() { const el = document.getElementById('dead-bar'), fresh = deadBar(); if (el) { if (fresh) el.replaceWith(fresh); else el.remove() } else if (fresh) document.querySelector('.composer-wrap')?.prepend(fresh) }

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
  const open = !!S.todoOpen?.[S.active]
  return h('div', { class: 'todobar', id: 'todobar' },
    h('button', { class: 'todobar-head', 'aria-expanded': open ? 'true' : 'false', onclick: () => { (S.todoOpen ??= {})[S.active] = !open; refreshTodo() } }, h('span', { class: `chev${open ? ' open' : ''}` }, '›'),
      h('span', { class: 'todobar-ico', 'aria-hidden': 'true' }, cur ? '▸' : '○'), h('span', { class: 'todobar-title' }, cur ? cur.content : all.find(t => t.status === 'pending')?.content ?? 'Todo'), h('span', { class: 'todobar-count' }, `${done}/${all.length}`),
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

// Drag & drop, find in chat, Markdown export.
// ───────────── drag & drop ─────────────
// Images become attachments; files dragged from the VS Code explorer or the OS become @mentions.
// Shift must be held while dropping into a webview in VS Code (editor drop rule), so the hint says so.
let dragDepth = 0
const dropHint = () => document.getElementById('composer')?.classList.toggle('drop', dragDepth > 0)
document.addEventListener('dragenter', e => { if (S.view !== 'chat') return; e.preventDefault(); dragDepth++; dropHint() })
document.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); dropHint() })
document.addEventListener('dragover', e => { if (S.view === 'chat') e.preventDefault() })
document.addEventListener('drop', e => {
  if (S.view !== 'chat') return
  e.preventDefault(); dragDepth = 0; dropHint()
  const dt = e.dataTransfer; if (!dt) return
  const paths = []
  for (const f of dt.files ?? []) {
    if (f.type.startsWith('image/')) { const r = new FileReader(); r.onload = () => { S.images.push({ mimeType: f.type, data: String(r.result).split(',')[1], url: r.result }); refreshComposer() }; r.readAsDataURL(f) }
    else if (f.path) paths.push(f.path)
  }
  // Explorer gives text/uri-list; an editor tab gives VS Code's own lists (ResourceURLs is a JSON array)
  let uris = (dt.getData('text/uri-list') || dt.getData('application/vnd.code.uri-list') || '').split(/\r?\n/u).filter(u => u && !u.startsWith('#'))
  if (!uris.length) { try { uris = JSON.parse(dt.getData('ResourceURLs') || dt.getData('resourceurls') || '[]') } catch { uris = [] } }
  // an editor tab: CodeEditors = [{ resource: { external: 'file:///…' | scheme, path } }]
  if (!uris.length) { try { for (const ed of JSON.parse(dt.getData('CodeEditors') || dt.getData('codeeditors') || '[]')) { const r = ed?.resource; if (typeof r?.external === 'string') uris.push(r.external); else if (r?.path) uris.push('file://' + (r.path.startsWith('/') ? '' : '/') + r.path) } } catch {} }
  // CodeFiles = ["d:\\path\\file"] (plain paths)
  if (!uris.length) { try { for (const f of JSON.parse(dt.getData('CodeFiles') || dt.getData('codefiles') || '[]')) if (typeof f === 'string') paths.push(f) } catch {} }
  if (!uris.length && !paths.length) send({ type: 'log', line: `drop: nothing usable; types=${[...dt.types].join(',')}` })
  // decode first: VS Code writes the drive colon as %3A (file:///d%3A/…)
  for (const u of uris) { try { const url = new URL(u); if (url.protocol === 'file:') paths.push(decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/u, '$1')) } catch {} }
  // last resort: a plain absolute path as text
  if (!paths.length) { const t = (dt.getData('text/plain') || '').trim(); if (/^([A-Za-z]:[\\/]|\/)[^\n]+$/u.test(t)) paths.push(t) }
  if (paths.length) send({ type: 'mentionPaths', paths })
})

// ───────────── find in chat (Ctrl+F) and export ─────────────
function findBar() {
  const input = h('input', { type: 'search', id: 'find-input', placeholder: 'Find in chat…', value: S.find ?? '', oninput: e => { S.find = e.target.value; S.findAt = 0; runFind() }, onkeydown: e => { if (e.key === 'Enter') { S.findAt = (S.findAt ?? 0) + (e.shiftKey ? -1 : 1); runFind() } if (e.key === 'Escape') closeFind() } })
  return h('div', { class: 'findbar', id: 'findbar' }, input, h('span', { class: 'muted find-count', id: 'find-count' }),
    h('button', { class: 'icon-btn', title: 'Previous (Shift+Enter)', onclick: () => { S.findAt--; runFind() } }, '↑'),
    h('button', { class: 'icon-btn', title: 'Next (Enter)', onclick: () => { S.findAt++; runFind() } }, '↓'),
    h('button', { class: 'icon-btn', title: 'Close (Esc)', onclick: closeFind }, '×'))
}
function openFind() { if (S.view !== 'chat' || !transcriptEl) return; if (!document.getElementById('findbar')) transcriptEl.before(findBar()); const i = document.getElementById('find-input'); i.focus(); i.select(); runFind() }
function closeFind() { document.getElementById('findbar')?.remove(); S.find = ''; clearMarks(); document.getElementById('input')?.focus() }
function clearMarks() { for (const m of transcriptEl?.querySelectorAll('mark.hit') ?? []) m.replaceWith(document.createTextNode(m.textContent)); transcriptEl?.normalize() }
/** Text of an item as find sees it (prompt, reply, tool title / command / output). */
const findText = it => it.type === 'tool' ? [it.card.title, it.card.input, it.card.output].filter(Boolean).join('\n') : it.text ?? it.message ?? ''
/** Make every item that matches `q` rendered: widen the window and unfold groups that hold a match. @returns true if it re-rendered. */
function revealMatches(q) {
  const list = items(); let changed = false
  const hitIdx = list.map((it, i) => findText(it).toLowerCase().includes(q) ? i : -1).filter(i => i >= 0)
  if (!hitIdx.length) return false
  const need = list.length - hitIdx[0]
  if (need > (S.window[S.active] ?? 200)) { S.window[S.active] = need; changed = true }
  for (const i of hitIdx) {
    // the group key is the first item of its run: walk back over groupable items
    let j = i; while (j > 0 && groupable(list[j - 1])) j--
    const key = 'g:' + list[j].id
    if (groupable(list[i]) && !S.open.has(key)) { S.open.add(key); changed = true }
  }
  if (changed) { const bar = document.getElementById('findbar'); const v = document.getElementById('find-input')?.value; render(); if (bar && !document.getElementById('findbar')) { transcriptEl.before(findBar()); const i = document.getElementById('find-input'); if (i) { i.value = v ?? ''; i.focus() } } }
  return changed
}
function runFind() {
  clearMarks()
  const q = (S.find ?? '').toLowerCase(), count = document.getElementById('find-count')
  if (!q || !transcriptEl) { if (count) count.textContent = ''; return }
  if (revealMatches(q)) return runFind()
  // revealMatches() has made every matching item rendered (older ones and folded groups included)
  const hits = []
  const walker = document.createTreeWalker(transcriptEl, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement?.closest('button, .copy') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT })
  const texts = []; while (walker.nextNode()) texts.push(walker.currentNode)
  for (const t of texts) {
    let v = t.nodeValue, i = v.toLowerCase().indexOf(q), node = t
    while (i >= 0) {
      const mid = node.splitText(i), rest = mid.splitText(q.length)
      const m = document.createElement('mark'); m.className = 'hit'; m.textContent = mid.nodeValue; mid.replaceWith(m); hits.push(m)
      node = rest; v = rest.nodeValue; i = v.toLowerCase().indexOf(q)
    }
  }
  if (count) count.textContent = hits.length ? `${((S.findAt % hits.length) + hits.length) % hits.length + 1}/${hits.length}` : '0'
  if (!hits.length) return
  const cur = hits[((S.findAt % hits.length) + hits.length) % hits.length]
  cur.classList.add('cur'); cur.scrollIntoView({ block: 'center' })
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && MODE === 'panel') { e.preventDefault(); openFind() }
})

/** Markdown of this chat: prompts, replies, tool lines with their commands; thinking left out. */
function chatMarkdown() {
  const t = tab()
  const out = [`# ${(t.title ?? 'OMP chat').replace(/^\S*\s*ESC:\s*/u, '')}`, '']
  for (const it of items()) {
    if (it.type === 'user') out.push('## You', '', it.text, '')
    else if (it.type === 'assistant') out.push(it.text, '')
    else if (it.type === 'error') out.push(`> **Error:** ${it.text}`, '')
    else if (it.type === 'tool') {
      const c = it.card; let cmd = ''; try { cmd = JSON.parse(c.input ?? '{}').command ?? '' } catch {}
      out.push(`- **${VERB[c.kind] ?? c.name}** ${c.path ?? c.title}${c.status === 'failed' ? ' _(failed)_' : ''}`)
      if (cmd) out.push('', '  ```sh', ...cmd.split('\n').map(l => '  ' + l), '  ```')
      out.push('')
    } else if (it.type === 'ask' && it.answer?.content) out.push(`> ${it.message.split('\n')[0]} → ${Object.values(it.answer.content).flat().join(', ')}`, '')
  }
  return out.join('\n')
}

// Ctrl+Shift+J: background jobs panel · Ctrl+Shift+A: subagents menu · Alt+↑ / Alt+↓: previous / next prompt
document.addEventListener('keydown', e => {
  if (S.view !== 'chat') return
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.shiftKey && e.key.toLowerCase() === 'j') { e.preventDefault(); jobView.open ? closeJobs() : openJob(null) }
  else if (mod && e.shiftKey && e.key.toLowerCase() === 'a') { e.preventDefault(); openMenu('jobs') }
  else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && transcriptEl) {
    e.preventDefault()
    const prompts = [...transcriptEl.querySelectorAll('.user-wrap')]
    const top = transcriptEl.getBoundingClientRect().top
    const at = prompts.map(n => n.getBoundingClientRect().top - top)
    const next = e.key === 'ArrowUp' ? prompts[at.findLastIndex(y => y < -4)] : prompts[at.findIndex(y => y > 4)]
    next?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
})

// ───────────── next-message prediction (ghost text) ─────────────
/** Shown only while the input is empty; Tab or → (at the end) takes it, typing anything hides it. */
function syncGhost() {
  const ta = document.getElementById('input'); if (!ta) return
  let g = document.getElementById('ghost')
  const text = S.predict?.[S.active] ?? ''
  const show = text && !ta.value && !tab().busy && !S.menu
  if (!show) { g?.remove(); ta.removeAttribute('data-ghost'); return }
  if (!g) {
    g = h('div', { id: 'ghost', class: 'ghost', 'aria-hidden': 'true' })
    ta.parentElement.insertBefore(g, ta)
  }
  g.replaceChildren(h('span', {}, text), h('span', { class: 'ghost-key' }, 'Tab'))
  ta.setAttribute('data-ghost', '1')
  ta.setAttribute('aria-description', `Suggestion: ${text}. Press Tab to use it.`)
}
function takeGhost(ta) {
  const text = S.predict?.[S.active]; if (!text) return false
  ta.value = text; S.predict[S.active] = ''
  ta.dispatchEvent(new Event('input', { bubbles: true }))
  ta.setSelectionRange(text.length, text.length)
  syncGhost(); return true
}
document.addEventListener('keydown', e => {
  const ta = e.target; if (!(ta instanceof HTMLTextAreaElement) || ta.id !== 'input' || ta.value || !document.getElementById('ghost')) return
  if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'ArrowRight') { if (takeGhost(ta)) e.preventDefault() }
  else if (e.key === 'Escape') { S.predict[S.active] = ''; syncGhost() }
}, true)
document.addEventListener('input', e => { if (e.target?.id === 'input') syncGhost() })

// Boot: must run after every declaration above.
// boot last: every const above must exist before the first render
render()
send({ type: 'ready' })
