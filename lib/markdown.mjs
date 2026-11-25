// 极简 Markdown 渲染器：先转义 HTML，再解析；不放过原始 HTML。
import { esc } from './util.mjs';

function inline(text) {
  const stash = [];
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;
  let s = esc(text);

  s = s.replace(/`([^`]+)`/g, (_, code) => keep(`<code>${code}</code>`));

  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, alt, url) => {
    if (!url.startsWith('/uploads/')) return alt;
    return keep(`<img src="${url}" alt="${alt}" loading="lazy">`);
  });

  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, label, url) => {
    if (!/^(https?:\/\/|\/|#)/.test(url)) return label;
    const external = /^https?:\/\//.test(url);
    return keep(`<a href="${url}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`);
  });

  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  return s.replace(/\u0000(\d+)\u0000/g, (_, index) => stash[Number(index)]);
}

function isBlockStart(line) {
  return /^(#{1,4}\s|```|>\s?|([-*+]|\d+\.)\s|\s*$)/.test(line) || /^(-\s*){3,}$/.test(line.trim());
}

function parseList(lines, start, ordered) {
  const items = [];
  let i = start;
  const re = ordered ? /^\d+\.\s+/ : /^[-*+]\s+/;
  while (i < lines.length) {
    const line = lines[i];
    if (!re.test(line)) break;
    let item = line.replace(re, '');
    i += 1;
    const nested = [];
    while (i < lines.length && /^\s{2,}/.test(lines[i]) && !re.test(lines[i].trim())) {
      const inner = lines[i].trim();
      if (inner) nested.push(inner);
      i += 1;
    }
    items.push({ text: item, nested });
  }
  const tag = ordered ? 'ol' : 'ul';
  const body = items.map((item) => {
    const sub = item.nested.length ? `<ul>${item.nested.map((n) => `<li>${inline(n)}</li>`).join('')}</ul>` : '';
    return `<li>${inline(item.text)}${sub}</li>`;
  }).join('');
  return { html: `<${tag}>${body}</${tag}>`, next: i };
}

export function renderMarkdown(markdown, { title = '' } = {}) {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let skippedTitle = false;

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const code = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      out.push(`<pre><code${lang ? ` class="language-${esc(lang)}"` : ''}>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }

    if (!line.trim()) { i += 1; continue; }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      i += 1;
      if (level === 1 && !skippedTitle && title && text === title) { skippedTitle = true; continue; }
      out.push(`<h${level}>${inline(text)}</h${level}>`);
      continue;
    }

    if (/^(-\s*){3,}$/.test(line.trim())) { out.push('<hr>'); i += 1; continue; }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${quote.map((q) => inline(q)).join('<br>')}</blockquote>`);
      continue;
    }

    if (/^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\.\s+/.test(line);
      const list = parseList(lines, i, ordered);
      out.push(list.html);
      i = list.next;
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim()) {
      const next = lines[i];
      if (paragraph.length && (/^#{1,4}\s/.test(next) || /^```/.test(next) || /^>\s?/.test(next) || /^([-*+]|\d+\.)\s+/.test(next))) break;
      paragraph.push(next);
      i += 1;
    }
    out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
  }

  return out.join('\n');
}

export function parseFrontmatter(raw) {
  const text = String(raw || '').replace(/\r\n?/g, '\n');
  if (!text.startsWith('---\n')) return { data: {}, body: text };
  const end = text.indexOf('\n---', 4);
  if (end < 0) return { data: {}, body: text };
  const head = text.slice(4, end);
  const body = text.slice(end + 4).replace(/^\n/, '');
  const data = {};
  for (const line of head.split('\n')) {
    const match = /^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, value] = match;
    if (key === 'tags') {
      data.tags = value.replace(/^\[|\]$/g, '').split(',').map((v) => v.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      data[key] = value.replace(/^["']|["']$/g, '');
    }
  }
  return { data, body };
}