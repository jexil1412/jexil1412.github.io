// 静态构建：从 content/public-data.json 建临时库 → 渲染 HTML → 输出 dist/
// 用法：node scripts/build-static.mjs [--fetch]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, process.env.STATIC_OUT || 'dist');
const TMP = path.join(ROOT, '.static-tmp');
const SNAPSHOT = path.join(ROOT, 'content', 'public-data.json');
const BASE = (process.env.BASE_PATH || '/').replace(/\/+$/, '');
const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const FETCH = process.argv.includes('--fetch');

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
process.env.DB_FILE = path.join(TMP, 'static.db');

const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
const dbm = await import('../lib/db.mjs');
const db = dbm.db;

// ---------- 灌入公开数据 ----------
const insertWork = db.prepare(`INSERT INTO works
  (id, slug, title, summary, body, kind, year, role, cover, gallery, links, featured, sort_order, visibility, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'public', ?, ?)`);
for (const w of snapshot.works || []) {
  insertWork.run(w.id, w.slug, w.title, w.summary, w.body || '', w.kind || 'web', w.year || null, w.role || '',
    w.cover || null, w.gallery || '[]', w.links || '[]', w.featured || 0, w.sort_order || 0, w.created_at, w.updated_at);
}

const insertHobby = db.prepare(`INSERT INTO hobbies
  (id, slug, name, note, body, since, cadence, cover, link, sort_order, visibility, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, 'public', ?, ?)`);
for (const h of snapshot.hobbies || []) {
  insertHobby.run(h.id, h.slug, h.name, h.note, h.body || '', h.sort_order || 0, h.created_at, h.updated_at);
}

const insertNote = db.prepare(`INSERT INTO notes
  (id, slug, title, summary, body_md, tags, source_filename, bytes, visibility, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'public', ?, ?)`);
for (const n of snapshot.notes || []) {
  insertNote.run(n.id, n.slug, n.title, n.summary || '', n.body_md, n.tags || '[]', n.source_filename || '', n.bytes || 0, n.created_at, n.updated_at);
}

const insertGame = db.prepare(`INSERT INTO games
  (id, source, external_id, name, cover, playtime_minutes, last_played_at, store_url, status, approved_at, synced_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)`);
for (const g of snapshot.games || []) {
  insertGame.run(g.id, g.source, g.external_id, g.name, g.cover || '', g.playtime_minutes || 0,
    g.last_played_at || null, g.store_url || '', g.approved_at || g.synced_at || null, g.synced_at);
}

const insertArtist = db.prepare('INSERT INTO artists (id, name, sort_order) VALUES (?, ?, ?)');
for (const a of snapshot.artists || []) insertArtist.run(a.id, a.name, a.sort_order || 0);

const insertSong = db.prepare(`INSERT INTO songs
  (id, artist, title, album, year, links, preview_url, preview_track, source, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
for (const s of snapshot.songs || []) {
  insertSong.run(s.id, s.artist, s.title, s.album || '', s.year || null, s.links || '[]',
    s.preview_url || '', s.preview_track || '', s.source || 'manual', s.sort_order || 0);
}

const insertAnimeSource = db.prepare(`INSERT INTO anime_sources
  (id, platform, name, url, mode, enabled, last_ok_at, last_error, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
for (const s of snapshot.animeSources || []) {
  insertAnimeSource.run(s.id, s.platform, s.name, s.url, s.mode || 'link', s.enabled === 0 ? 0 : 1,
    s.last_ok_at || null, s.last_error || null, s.sort_order || 0);
}

const insertAnime = db.prepare(`INSERT INTO anime_items
  (id, platform, external_id, title, url, cover, summary, published_at, fetched_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
for (const a of snapshot.animeItems || []) {
  insertAnime.run(a.id, a.platform, a.external_id, a.title, a.url, a.cover || '', a.summary || '',
    a.published_at || null, a.fetched_at);
}

const insertEvent = db.prepare(`INSERT OR IGNORE INTO events
  (id, domain, title, summary, source_name, source_url, url_hash, published_at, fetched_at, day, visibility, pinned, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'public', ?, ?)`);
for (const e of snapshot.events || []) {
  insertEvent.run(e.id, e.domain, e.title, e.summary || '', e.source_name, e.source_url, e.url_hash,
    e.published_at, e.fetched_at, e.day, e.pinned || 0, e.created_at);
}

if (FETCH) {
  console.log('fetching events...');
  const { SOURCES } = await import('../config/sources.mjs');
  dbm.upsertSources(SOURCES);
  const { runFetch } = await import('../lib/fetch.mjs');
  const result = await runFetch();
  console.log('fetch result:', result);
}

// ---------- 渲染 ----------
const pages = await import('../lib/pages.mjs');
const { renderMarkdown, parseFrontmatter } = await import('../lib/markdown.mjs');
const {
  works, hobbies, notes, noteBySlug, noteTags, games, animeSources, animeItems,
  artists, songsByArtist, eventsByDay, eventDays, sourcesAll, getSetting
} = dbm;
const { esc, shDay, fmtDateTime } = await import('../lib/util.mjs');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
// 静态资源整体复制（demo、uploads、CSS、JS、favicon）
fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });

function rewrite(html) {
  let h = html;
  h = h.replace(/<a class="btn glass-btn hilight" href="[^"]*">\+ 新建笔记<\/a>/g, '');
  h = h.replace(/<a class="fab[^>]*>\+<\/a>/g, '');
  h = h.replace(/(href|src|srcset|action|content)="\//g, `$1="${BASE}/`);
  for (const [from, to] of [
    [`${BASE}/about?kind=app`, `${BASE}/about/app/`],
    [`${BASE}/about?kind=web`, `${BASE}/about/web/`],
    ...pages.DOMAINS.map((d) => [`${BASE}/today?domain=${d.key}`, `${BASE}/today/${d.key}/`]),
    ...animeSources().map((s) => [`${BASE}/hobbies/anime?platform=${s.platform}`, `${BASE}/hobbies/anime/${s.platform}/`])
  ]) {
    h = h.split(`href="${from}"`).join(`href="${to}"`);
  }
  h = h.replace(new RegExp(`href="${BASE}/notes\\?tag=[^"]*"`, 'g'), `href="${BASE}/notes/"`);
  h = h.replaceAll(', /uploads/', `, ${BASE}/uploads/`);
  h = h.replaceAll(', /demo/', `, ${BASE}/demo/`);
  return h;
}

function writePage(route, html) {
  const clean = route.replace(/^\/+|\/+$/g, '');
  const dir = path.join(OUT, clean);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), rewrite(html));
}

const allWorks = works(false);
writePage('/', pages.homePage());
writePage('/about/', pages.aboutPage({ works: allWorks, kind: '' }));
writePage('/about/app/', pages.aboutPage({ works: allWorks, kind: 'app' }));
writePage('/about/web/', pages.aboutPage({ works: allWorks, kind: 'web' }));
allWorks.forEach((work, index) => {
  writePage(`/about/works/${work.slug}/`, pages.workPage({
    work,
    index,
    total: allWorks.length,
    prev: index > 0 ? allWorks[index - 1] : null,
    next: index < allWorks.length - 1 ? allWorks[index + 1] : null
  }));
});

// 今日（全部 + 四个领域）
const today = shDay();
const domainKeys = ['', ...pages.DOMAINS.map((d) => d.key)];
for (const domain of domainKeys) {
  const groups = [];
  for (const d of pages.DOMAINS) {
    if (domain && d.key !== domain) continue;
    const list = eventsByDay(today, d.key, false);
    if (list.length) groups.push({ ...d, events: list });
  }
  const archive = [];
  for (const d of eventDays(8, false)) {
    if (d.day === today) continue;
    const list = eventsByDay(d.day, domain || null, false);
    if (list.length) archive.push({ day: d.day, events: list });
  }
  const at = getSetting('last_fetch_at', '');
  const ok = getSetting('last_fetch_ok', '0');
  const total = getSetting('last_fetch_total', String(sourcesAll().length));
  const failed = sourcesAll().filter((s) => s.last_error).length;
  writePage(`/today/${domain ? domain + '/' : ''}`, pages.todayPage({
    day: today,
    domain,
    groups,
    archive,
    status: { at: at ? fmtDateTime(at) : '还没抓取过', ok, total, failed: failed ? `${failed} 个源异常` : '', admin: false }
  }));
}

writePage('/hobbies/', pages.hobbiesPage({ hobbies: hobbies(false) }));
writePage('/hobbies/game/', pages.gamePage({ games: games(false) }));

const animeAll = animeSources();
writePage('/hobbies/anime/', pages.animePage({ sources: animeAll, items: animeItems(null, 12), platform: '' }));
for (const source of animeAll) {
  writePage(`/hobbies/anime/${source.platform}/`, pages.animePage({
    sources: animeAll,
    items: animeItems(source.platform, 12),
    platform: source.platform
  }));
}

writePage('/hobbies/music/', pages.musicPage({ artists: artists(), songs: songsByArtist() }));

const allTags = noteTags(10);
for (const tag of ['', ...allTags]) {
  writePage(tag ? `/notes/tag/${tag}/` : '/notes/', pages.notesPage({
    notes: notes(false, tag),
    tag,
    tags: allTags,
    admin: false
  }));
}
for (const note of notes(false)) {
  const { body } = parseFrontmatter(note.body_md);
  writePage(`/notes/${note.slug}/`, pages.notePage({ note, html: renderMarkdown(body, { title: note.title }) }));
  fs.writeFileSync(path.join(OUT, 'notes', `${note.slug}.md`), note.body_md);
}

// 404 / robots / sitemap / nojekyll
fs.writeFileSync(path.join(OUT, '404.html'), rewrite(pages.notFoundPage()));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}${BASE}/sitemap.xml\n`);

const routes = ['', 'about/', 'today/', 'hobbies/', 'hobbies/game/', 'hobbies/anime/', 'hobbies/music/', 'notes/',
  ...allWorks.map((w) => `about/works/${w.slug}/`),
  ...animeAll.map((s) => `hobbies/anime/${s.platform}/`),
  ...notes(false).map((n) => `notes/${n.slug}/`)];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map((route) => `  <url><loc>${SITE_URL}${BASE}/${route}${route.endsWith('/') || route === '' ? '' : '/'}</loc></url>`).join('\n')}
</urlset>`;
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), sitemap);

try { db.close(); } catch { /* ignore */ }
fs.rmSync(TMP, { recursive: true, force: true });
const size = fs.readdirSync(OUT).reduce((sum, name) => {
  const stat = fs.statSync(path.join(OUT, name));
  return sum + (stat.isDirectory() ? 0 : stat.size);
}, 0);
console.log(`static build done → ${OUT} (top-level ${(size / 1024 / 1024).toFixed(1)} MB)`);
console.log(`base=${BASE || '/'} site=${SITE_URL}`);