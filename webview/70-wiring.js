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
}

document.addEventListener('click', (e) => {
  // Copy on code blocks and IN/OUT boxes: the full text (data-text) or what the block shows.
  const cp = e.target.closest?.('.copy')
  if (cp) {
    e.preventDefault(); e.stopPropagation()
    const text = cp.dataset.text ?? cp.parentElement.querySelector('pre')?.innerText ?? ''
    const done = ok => { cp.textContent = ok ? 'Copied' : 'Failed'; cp.classList.toggle('ok', ok); setTimeout(() => { cp.textContent = 'Copy'; cp.classList.remove('ok') }, 1200) }
    // Fallback for contexts without the async clipboard API: a hidden textarea + execCommand.
    const legacy = () => { const t = h('textarea', { style: 'position:fixed;opacity:0' }); t.value = text; document.body.append(t); t.select(); let ok = false; try { ok = document.execCommand('copy') } catch {} t.remove(); done(ok) }
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => done(true), legacy); else legacy()
    return
  }
  const a = e.target.closest?.('a.file')
  if (a) { e.preventDefault(); send({ type: 'openFile', path: a.dataset.path, ...a.dataset.line ? { line: Number(a.dataset.line) } : {} }); return }
  if (S.menu && !e.target.closest('.menu') && !e.target.closest('.chip-btn') && !e.target.closest('#input')) closeMenu()
})

window.addEventListener('message', ({ data: m }) => {
  switch (m.type) {
    case 'tabs': {
      const changedActive = m.active !== S.active
      const structure = S.tabs.map(t => t.id).join() !== m.tabs.map(t => t.id).join()
      S.tabs = m.tabs; S.models = m.models; S.cwd = m.cwd
      if (changedActive) { saveDraft(); S.active = m.active }
      if (S.view === 'chat') { if (changedActive || structure) render(); else refreshComposer() }
      else if (S.view === 'history') render()
      return
    }
    case 'tab': {
      const i = S.tabs.findIndex(t => t.id === m.tab.id)
      if (i < 0) return
      const was = S.tabs[i]
      S.tabs[i] = m.tab
      if (m.tab.busy && !was.busy) { const st = (STAT[m.tab.id] ??= { chars: 0, total: 0, t0: 0, last: 0 }); st.chars = 0; st.t0 = 0 }
      if (m.tab.id === S.active) { refreshStatus(); refreshGoal() }
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
      return
    }
    case 'upsert': {
      const list = (S.transcripts[m.tab] ??= [])
      const i = list.findIndex(x => x.id === m.item.id)
      trackStream(m.tab, m.item, i >= 0 ? list[i].text?.length : 0)
      if (i >= 0) list[i] = m.item; else list.push(m.item)
      if (m.tab === S.active && S.view === 'chat') { stickBottom(() => upsertNode(m.item)); updateWorking(); if (m.item.card?.todo) refreshTodo() }
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

