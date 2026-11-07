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
  const uris = (dt.getData('text/uri-list') || dt.getData('application/vnd.code.uri-list') || '').split(/\r?\n/u).filter(u => u && !u.startsWith('#'))
  for (const u of uris) { try { const url = new URL(u); if (url.protocol === 'file:') paths.push(decodeURIComponent(url.pathname.replace(/^\/([A-Za-z]:)/u, '$1'))) } catch {} }
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
function runFind() {
  clearMarks()
  const q = (S.find ?? '').toLowerCase(), count = document.getElementById('find-count')
  if (!q || !transcriptEl) { if (count) count.textContent = ''; return }
  // Find covers what is rendered; older items load when you click "Show earlier".
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
