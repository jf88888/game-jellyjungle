// Reads the raw build prompt (kept verbatim in a <script type="text/plain"> tag
// in index.html so backticks/quotes need no escaping) and renders it to clean HTML.

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Inline markdown: `code`, **bold**, [text](url). Input is already HTML-escaped. */
function inline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function isTableSep(line) {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-');
}

/** Minimal markdown → HTML for the subset used by the brief. */
export function renderPrompt(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { i++; continue; }

    // headings
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = Math.min(h[1].length + 2, 5); // # → h3, ## → h4 ... keeps card scale sane
      out.push(`<h${lvl}>${inline(esc(h[2]))}</h${lvl}>`);
      i++; continue;
    }

    // horizontal rule
    if (/^\s*-{3,}\s*$/.test(line)) { out.push('<hr/>'); i++; continue; }

    // table: collect consecutive pipe rows
    if (line.trim().startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i]); i++; }
      const cells = (r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      let html = '<table>';
      rows.forEach((r, ri) => {
        if (isTableSep(r)) return;
        const tag = ri === 0 ? 'th' : 'td';
        html += '<tr>' + cells(r).map((c) => `<${tag}>${inline(esc(c))}</${tag}>`).join('') + '</tr>';
      });
      html += '</table>';
      out.push(html); continue;
    }

    // bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(esc(lines[i].replace(/^\s*[-*]\s+/, '')))}</li>`);
        i++;
      }
      out.push('<ul>' + items.join('') + '</ul>'); continue;
    }

    // numbered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inline(esc(lines[i].replace(/^\s*\d+\.\s+/, '')))}</li>`);
        i++;
      }
      out.push('<ol>' + items.join('') + '</ol>'); continue;
    }

    // paragraph: merge consecutive plain lines
    const para = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) &&
           !/^(#{1,4})\s+/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) &&
           !/^\s*\d+\.\s+/.test(lines[i]) && !lines[i].trim().startsWith('|') &&
           !/^\s*-{3,}\s*$/.test(lines[i])) {
      para.push(lines[i]); i++;
    }
    out.push(`<p>${inline(esc(para.join(' ')))}</p>`);
  }
  return out.join('\n');
}

export function getPrompt() {
  const el = document.getElementById('prompt-source');
  const raw = (el ? el.textContent : '').replace(/^\s+|\s+$/g, '');
  return { raw, html: renderPrompt(raw) };
}
