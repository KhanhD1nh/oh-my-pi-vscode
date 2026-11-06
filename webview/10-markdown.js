// Markdown → HTML for messages (code fences get a copy button).
// ───────────── markdown ─────────────
const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>')
  .replace(/(^|[\s(])((?:[A-Za-z]:)?[\w.@/\\-]+\.[A-Za-z0-9]{1,6})(?::(\d+))?(?=[\s).,;:]|$)/g,
    (m, pre, p, line) => /[/\\]/.test(p) ? `${pre}<a class="file" data-path="${p}"${line ? ` data-line="${line}"` : ''}>${p}${line ? ':' + line : ''}</a>` : m)
function md(src) {
  const out = []; const L = src.split('\n')
  for (let i = 0; i < L.length; i++) {
    const l = L[i]
    if (/^```/.test(l)) {
      const lang = l.slice(3).trim().split(/\s/)[0]
      const b = []; i++; while (i < L.length && !/^```/.test(L[i])) b.push(L[i++])
      out.push(`<div class="codeblock">${lang ? `<span class="lang">${esc(lang)}</span>` : ''}<button class="copy" title="Copy">Copy</button><pre><code>${esc(b.join('\n'))}</code></pre></div>`)
      continue
    }
    const hd = /^(#{1,4})\s+(.*)/.exec(l); if (hd) { out.push(`<h${hd[1].length + 2}>${inline(hd[2])}</h${hd[1].length + 2}>`); continue }
    if (/^\s*[-*]\s+/.test(l)) { const b = []; while (i < L.length && /^\s*[-*]\s+/.test(L[i])) b.push(`<li>${inline(L[i++].replace(/^\s*[-*]\s+/, ''))}</li>`); i--; out.push(`<ul>${b.join('')}</ul>`); continue }
    if (/^\s*\d+\.\s+/.test(l)) { const b = []; while (i < L.length && /^\s*\d+\.\s+/.test(L[i])) b.push(`<li>${inline(L[i++].replace(/^\s*\d+\.\s+/, ''))}</li>`); i--; out.push(`<ol>${b.join('')}</ol>`); continue }
    if (/^\|.*\|\s*$/.test(l)) {
      const rows = []; while (i < L.length && /^\|.*\|\s*$/.test(L[i])) rows.push(L[i++]); i--
      const cells = r => r.trim().slice(1, -1).split('|').map(c => c.trim())
      const body = rows.filter(r => !/^\|[\s:|-]+\|\s*$/.test(r))
      out.push(`<table>${body.map((r, n) => `<tr>${cells(r).map(c => n === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table>`); continue
    }
    if (/^>\s?/.test(l)) { out.push(`<blockquote>${inline(l.replace(/^>\s?/, ''))}</blockquote>`); continue }
    if (l.trim()) out.push(`<p>${inline(l)}</p>`)
  }
  return out.join('')
}
