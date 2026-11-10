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
