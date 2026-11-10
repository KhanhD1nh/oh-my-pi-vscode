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
      // a file copied in the Explorer (Ctrl+C) or a pasted absolute path becomes an @mention
      const cd = e.clipboardData
      const listed = (cd?.getData('code/file-list') || cd?.getData('text/uri-list') || '').split(/\r?\n/u).filter(u => /^file:/u.test(u))
      const plain = (cd?.getData('text/plain') || '').trim()
      const asPath = !listed.length && /^([A-Za-z]:[\\/]|\/)[^\n*?"<>|]+\.[\w-]+$/u.test(plain) ? [plain] : []
      const paths = [...listed.map(u => { try { return decodeURIComponent(new URL(u).pathname).replace(/^\/([A-Za-z]:)/u, '$1') } catch { return '' } }).filter(Boolean), ...asPath]
      if (paths.length) { e.preventDefault(); send({ type: 'mentionPaths', paths }); return }
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
