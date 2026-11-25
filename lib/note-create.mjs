import { db, newId } from './db.mjs';

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// 后台「+ 新建笔记」用：标题/标签/摘要/正文 → 带 frontmatter 的 Markdown 入库。
export function createNote({ title, tags = [], summary = '', body = '' }) {
  const cleanTitle = String(title || '').trim().slice(0, 120);
  const cleanBody = String(body || '').trim();
  if (!cleanTitle) throw new Error('标题不能为空');
  if (!cleanBody) throw new Error('正文不能为空');
  const tagList = (Array.isArray(tags) ? tags : String(tags || '').split(','))
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .slice(0, 8);

  const base = slugify(cleanTitle) || `note-${Date.now().toString(36)}`;
  let slug = base;
  let suffix = 2;
  while (db.prepare('SELECT 1 AS hit FROM notes WHERE slug = ?').get(slug)) slug = `${base}-${suffix++}`;

  const head = [
    '---',
    `title: ${cleanTitle}`,
    tagList.length ? `tags: ${tagList.join(', ')}` : '',
    summary ? `summary: ${String(summary).trim().slice(0, 120)}` : '',
    '---',
    ''
  ].filter((line) => line !== '').join('\n');
  const content = `${head}\n# ${cleanTitle}\n\n${cleanBody}\n`;
  const plain = cleanBody.replace(/[#*_>`[\]()!|~-]/g, ' ').replace(/\s+/g, ' ').trim();
  const finalSummary = String(summary || plain).slice(0, 120);
  const stamp = new Date().toISOString();
  db.prepare(`INSERT INTO notes (id, slug, title, summary, body_md, tags, source_filename, bytes, visibility, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'public', ?, ?)`)
    .run(newId('note'), slug, cleanTitle, finalSummary, content, JSON.stringify(tagList), `${slug}.md`, Buffer.byteLength(content), stamp, stamp);
  return slug;
}