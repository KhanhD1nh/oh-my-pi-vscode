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
