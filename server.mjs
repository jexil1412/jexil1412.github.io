import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  db, ROOT, PUBLIC_DIR, UPLOAD_DIR, DATA_DIR, getSetting, setSetting, upsertSources,
  works, featuredWorks, workBySlug, workById, hobbies, hobbyById,
  eventsByDay, latestPerDomain, eventDays, eventsAll, sourcesAll, counts,
  notes, noteBySlug, noteTags,
  games, gameStats, setGameStatus, deleteGame,
  animeSources, animeItems, artists, songsByArtist, songsAll,
  nowIso
} from './lib/db.mjs';
import {
  layout, homePage, aboutPage, workPage, todayPage, hobbiesPage, gamePage, animePage, musicPage,
  notesPage, notePage, tutorialsPage, tutorialPage, adminPage, workFormPage, hobbyFormPage, noteFormPage, loginPage, notFoundPage, DOMAINS
} from './lib/pages.mjs';
import { listTutorials, tutorialBySlug } from './lib/tutorials.mjs';
import { renderMarkdown, parseFrontmatter } from './lib/markdown.mjs';
import { createNote } from './lib/note-create.mjs';
import { syncSteam, importEpic, steamConfig } from './lib/steam.mjs';
import { refreshAnime } from './lib/anime.mjs';
import { ensureHobbySeed } from './lib/hobby-data.mjs';
import {
  ensureAdmin, verifyPassword, issueSession, clearSession, isAdmin,
  loginAllowed, recordFailure
} from './lib/auth.mjs';
import { runFetch } from './lib/fetch.mjs';
import { ensureSeed } from './lib/seed.mjs';
import { SOURCES } from './config/sources.mjs';
import { esc, shDay, addDays, fmtDateTime } from './lib/util.mjs';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';

ensureAdmin();
upsertSources(SOURCES);
ensureSeed();
ensureHobbySeed();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.md': 'text/plain; charset=utf-8'
};

function send(res, status, body, type = 'text/html; charset=utf-8') {
  res.writeHead(status, {
    'content-type': type,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin'
  });
  res.end(body);
}

const html = (res, body, status = 200) => send(res, status, body);
const redirect = (res, to, status = 303) => { res.writeHead(status, { location: to }); res.end(); };

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function formBody(raw) {
  const params = new URLSearchParams(raw);
  const out = {};
  for (const [key, value] of params) out[key] = value;
  return out;
}

function safeJoin(base, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const file = path.normalize(path.join(base, decoded.replace(/^\/+/, '')));
  return file.startsWith(base) ? file : null;
}

function serveStatic(req, res, pathname) {
  let file = safeJoin(PUBLIC_DIR, pathname);
  if (!file) return false;
  try {
    let stat = fs.statSync(file);
    if (stat.isDirectory()) {
      file = path.join(file, 'index.html');
      stat = fs.statSync(file);
    }
    if (!stat.isFile()) return false;
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': pathname.startsWith('/uploads/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff'
    });
    fs.createReadStream(file).pipe(res);
    return true;
  } catch {
    return false;
  }
}

function isStaticPath(pathname) {
  return pathname === '/style.css' || pathname === '/site.js' || pathname === '/favicon.svg'
    || pathname === '/favicon.png' || pathname === '/favicon-128.png'
    || pathname.startsWith('/uploads/') || pathname.startsWith('/demo/');
}

function sitemapXml() {
  const base = 'http://localhost:' + PORT;
  const urls = ['/', '/about', '/today', '/hobbies', '/notes'];
  for (const w of works(false)) urls.push(`/about/works/${w.slug}`);
  for (const n of notes(false)) urls.push(`/notes/${n.slug}`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${base}${esc(u)}</loc></url>`).join('\n')}
</urlset>`;
}

function nextPublic(pathname, search = '') {
  return pathname + search;
}

async function handle(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const query = url.searchParams;

  if (isStaticPath(pathname)) {
    if (serveStatic(req, res, pathname)) return;
    html(res, notFoundPage(), 404);
    return;
  }

  const admin = isAdmin(req);
  const privateMode = getSetting('site_private') === '1';
  const allowAnon = pathname === '/login' || pathname === '/favicon.svg';
  if (privateMode && !admin && !allowAnon) {
    redirect(res, `/login?next=${encodeURIComponent(nextPublic(pathname, url.search))}`, 302);
    return;
  }

  if (pathname.startsWith('/api/') && !admin) {
    return send(res, 404, JSON.stringify({ error: 'not found' }), 'application/json');
  }

  const method = req.method || 'GET';

  if (method === 'GET' && pathname === '/') {
    return html(res, homePage());
  }

  if (method === 'GET' && pathname === '/works') {
    return redirect(res, '/about', 301);
  }

  if (method === 'GET' && pathname.startsWith('/works/')) {
    const slug = decodeURIComponent(pathname.slice('/works/'.length));
    return redirect(res, `/about/works/${encodeURIComponent(slug)}`, 301);
  }

  if (method === 'GET' && pathname === '/about') {
    const kind = ['app', 'web'].includes(query.get('kind')) ? query.get('kind') : '';
    return html(res, aboutPage({ works: works(admin), kind }));
  }

  if (method === 'GET' && pathname.startsWith('/about/works/')) {
    const slug = decodeURIComponent(pathname.slice('/about/works/'.length));
    const all = works(admin);
    const work = workBySlug(slug, admin);
    if (!work) return html(res, notFoundPage(), 404);
    const index = all.findIndex((w) => w.slug === slug);
    return html(res, workPage({
      work,
      index: Math.max(index, 0),
      total: all.length,
      prev: index > 0 ? all[index - 1] : null,
      next: index >= 0 && index < all.length - 1 ? all[index + 1] : null
    }));
  }

  if (method === 'GET' && pathname === '/today') {
    const today = shDay();
    const domain = DOMAINS.some((d) => d.key === query.get('domain')) ? query.get('domain') : '';
    const groups = [];
    for (const d of DOMAINS) {
      if (domain && d.key !== domain) continue;
      const list = eventsByDay(today, d.key, admin);
      if (list.length) groups.push({ ...d, events: list });
    }
    const archive = [];
    for (const d of eventDays(8, admin)) {
      if (d.day === today) continue;
      const list = eventsByDay(d.day, domain || null, admin);
      if (list.length) archive.push({ day: d.day, events: list });
    }
    const at = getSetting('last_fetch_at', '');
    const ok = getSetting('last_fetch_ok', '0');
    const total = getSetting('last_fetch_total', String(sourcesAll().length));
    const failedSources = sourcesAll().filter((s) => s.last_error).length;
    return html(res, todayPage({
      day: today,
      domain,
      groups,
      archive,
      status: {
        at: at ? fmtDateTime(at) : '还没抓取过',
        ok,
        total,
        failed: failedSources ? `${failedSources} 个源异常` : '',
        admin
      }
    }));
  }

  if (method === 'GET' && pathname === '/hobbies') return html(res, hobbiesPage({ hobbies: hobbies(false) }));

  if (method === 'GET' && pathname === '/hobbies/game') {
    return html(res, gamePage({ games: games(false) }));
  }

  if (method === 'GET' && pathname === '/hobbies/anime') {
    const sources = animeSources();
    const requested = query.get('platform') || '';
    const platform = sources.some((source) => source.platform === requested) ? requested : '';
    return html(res, animePage({ sources, items: animeItems(platform || null, 12), platform }));
  }

  if (method === 'GET' && pathname === '/hobbies/singing') {
    return redirect(res, '/hobbies/music', 301);
  }

  if (method === 'GET' && pathname === '/hobbies/music') {
    return html(res, musicPage({ artists: artists(), songs: songsByArtist() }));
  }

  if (method === 'GET' && pathname === '/notes') {
    const tag = query.get('tag') || '';
    return html(res, notesPage({ notes: notes(admin, tag), tag, tags: noteTags(10), admin }));
  }

  if (method === 'GET' && pathname.startsWith('/notes/') && pathname.endsWith('.md')) {
    const slug = decodeURIComponent(pathname.slice('/notes/'.length, -3));
    const note = noteBySlug(slug, admin);
    if (!note) return html(res, notFoundPage(), 404);
    res.writeHead(200, {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="${note.slug}.md"`
    });
    return res.end(note.body_md);
  }

  if (method === 'GET' && pathname.startsWith('/notes/')) {
    const slug = decodeURIComponent(pathname.slice('/notes/'.length));
    const note = noteBySlug(slug, admin);
    if (!note) return html(res, notFoundPage(), 404);
    const { body } = parseFrontmatter(note.body_md);
    return html(res, notePage({ note, html: renderMarkdown(body, { title: note.title }) }));
  }

  if (method === 'GET' && pathname === '/tutorials') {
    return html(res, tutorialsPage({ tutorials: listTutorials() }));
  }

  if (method === 'GET' && pathname.startsWith('/tutorials/') && pathname.endsWith('.md')) {
    const slug = decodeURIComponent(pathname.slice('/tutorials/'.length, -3));
    const tutorial = tutorialBySlug(slug);
    if (!tutorial) return html(res, notFoundPage(), 404);
    res.writeHead(200, {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="${tutorial.slug}.md"`
    });
    return res.end(tutorial.raw);
  }

  if (method === 'GET' && pathname.startsWith('/tutorials/')) {
    const slug = decodeURIComponent(pathname.slice('/tutorials/'.length));
    const tutorial = tutorialBySlug(slug);
    if (!tutorial) return html(res, notFoundPage(), 404);
    const { body } = parseFrontmatter(tutorial.raw);
    return html(res, tutorialPage({ tutorial, html: renderMarkdown(body, { title: tutorial.title }) }));
  }

  if (method === 'GET' && pathname === '/login') {
    const next = query.get('next') || '/';
    return html(res, loginPage({ next: next.startsWith('/') && !next.startsWith('//') ? next : '/' }));
  }

  if (method === 'POST' && pathname === '/login') {
    const body = formBody(await readBody(req));
    const ip = req.socket.remoteAddress || 'local';
    const next = body.next && body.next.startsWith('/') && !body.next.startsWith('//') ? body.next : '/';
    if (!loginAllowed(ip)) {
      return html(res, loginPage({ error: '试错次数太多，等 15 分钟再试。', next }), 429);
    }
    if (verifyPassword(body.password || '', getSetting('admin_hash', ''))) {
      issueSession(res);
      return redirect(res, next, 303);
    }
    recordFailure(ip);
    return html(res, loginPage({ error: '密码不对。', next }), 401);
  }

  if (method === 'GET' && pathname === '/logout') {
    clearSession(res);
    return redirect(res, '/', 303);
  }

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (!admin) return html(res, notFoundPage(), 404);
  }

  if (method === 'GET' && pathname === '/admin') {
    const sitePrivate = getSetting('site_private') === '1';
    return html(res, adminPage({
      works: works(true),
      hobbies: hobbies(true),
      events: eventsAll(40),
      sources: sourcesAll(),
      notes: notes(true),
      settings: { sitePrivate },
      stats: counts(true),
      gamesAll: games(true),
      gameStats: gameStats(),
      steam: steamConfig(),
      animeSources: animeSources(),
      songsCount: songsAll().length,
      artistsCount: artists().length,
      msg: query.get('msg') || ''
    }));
  }

  if (method === 'GET' && pathname === '/admin/note/new') {
    return html(res, noteFormPage({ error: query.get('error') || '' }));
  }

  if (method === 'POST' && pathname === '/admin/note/save') {
    const body = formBody(await readBody(req));
    try {
      const slug = createNote({
        title: body.title,
        tags: body.tags,
        summary: body.summary,
        body: body.body
      });
      return redirect(res, `/notes/${slug}`, 303);
    } catch (error) {
      return redirect(res, '/admin/note/new?error=' + encodeURIComponent(error.message), 303);
    }
  }

  if (method === 'GET' && pathname === '/admin/work/new') {
    return html(res, workFormPage({ work: null, msg: query.get('msg') || '' }));
  }

  if (method === 'GET' && pathname.startsWith('/admin/work/')) {
    const id = decodeURIComponent(pathname.slice('/admin/work/'.length));
    const work = workById(id);
    if (!work) return html(res, notFoundPage(), 404);
    return html(res, workFormPage({ work, msg: query.get('msg') || '' }));
  }

  if (method === 'POST' && pathname === '/admin/work/save') {
    const body = formBody(await readBody(req));
    const links = body.link_url ? [{ label: body.link_label || '打开', url: body.link_url }] : [];
    let gallery = [];
    try { gallery = JSON.parse(body.gallery || '[]'); } catch { gallery = []; }
    gallery = gallery.filter((g) => g && g.path);
    const stamp = nowIso();
    const fields = [
      body.title || '未命名', body.slug || 'work-' + Date.now(), body.summary || '',
      body.body || '', body.kind || 'web', body.year ? Number(body.year) : null,
      body.role || '', body.cover || null, JSON.stringify(gallery), JSON.stringify(links),
      body.featured ? 1 : 0, Number(body.sort_order || 99), body.visibility === 'private' ? 'private' : 'public'
    ];
    try {
      if (body.id) {
        db.prepare(`UPDATE works SET title=?, slug=?, summary=?, body=?, kind=?, year=?, role=?, cover=?, gallery=?, links=?, featured=?, sort_order=?, visibility=?, updated_at=? WHERE id=?`)
          .run(...fields, stamp, body.id);
      } else {
        db.prepare(`INSERT INTO works (title, slug, summary, body, kind, year, role, cover, gallery, links, featured, sort_order, visibility, created_at, updated_at, id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(...fields, stamp, stamp, crypto.randomUUID());
      }
    } catch (error) {
      const msg = String(error.message).includes('UNIQUE') ? 'slug 重复了，换一个。' : '保存失败：' + error.message;
      return redirect(res, `/admin?msg=${encodeURIComponent(msg)}`, 303);
    }
    return redirect(res, '/admin?msg=' + encodeURIComponent('作品已保存'), 303);
  }

  if (method === 'GET' && pathname === '/admin/hobby/new') {
    return html(res, hobbyFormPage({ hobby: null, msg: query.get('msg') || '' }));
  }

  if (method === 'GET' && pathname.startsWith('/admin/hobby/')) {
    const id = decodeURIComponent(pathname.slice('/admin/hobby/'.length));
    const hobby = hobbyById(id);
    if (!hobby) return html(res, notFoundPage(), 404);
    return html(res, hobbyFormPage({ hobby, msg: query.get('msg') || '' }));
  }

  if (method === 'POST' && pathname === '/admin/hobby/save') {
    const body = formBody(await readBody(req));
    const stamp = nowIso();
    const fields = [
      body.name || '未命名', body.slug || 'hobby-' + Date.now(), body.note || '',
      body.body || '', body.since || null, body.cadence || null, body.cover || null,
      body.link || null, Number(body.sort_order || 99), body.visibility === 'private' ? 'private' : 'public'
    ];
    try {
      if (body.id) {
        db.prepare(`UPDATE hobbies SET name=?, slug=?, note=?, body=?, since=?, cadence=?, cover=?, link=?, sort_order=?, visibility=?, updated_at=? WHERE id=?`)
          .run(...fields, stamp, body.id);
      } else {
        db.prepare(`INSERT INTO hobbies (name, slug, note, body, since, cadence, cover, link, sort_order, visibility, created_at, updated_at, id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(...fields, stamp, stamp, crypto.randomUUID());
      }
    } catch (error) {
      const msg = String(error.message).includes('UNIQUE') ? 'slug 重复了，换一个。' : '保存失败：' + error.message;
      return redirect(res, `/admin?msg=${encodeURIComponent(msg)}`, 303);
    }
    return redirect(res, '/admin?msg=' + encodeURIComponent('爱好已保存'), 303);
  }

  if (method === 'POST' && pathname === '/admin/action') {
    const body = formBody(await readBody(req));
    const { entity, action, id } = body;
    if (entity === 'game' && id) {
      if (action === 'approve') setGameStatus(id, 'approved');
      else if (action === 'hide') setGameStatus(id, 'hidden');
      else if (action === 'delete') deleteGame(id);
      return redirect(res, '/admin?msg=' + encodeURIComponent('游戏状态已更新'), 303);
    }
    const table = entity === 'work' ? 'works' : entity === 'hobby' ? 'hobbies' : entity === 'event' ? 'events' : entity === 'source' ? 'sources' : entity === 'note' ? 'notes' : null;
    if (table && id) {
      if (action === 'delete') {
        db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
      } else if (action === 'visibility') {
        db.prepare(`UPDATE ${table} SET visibility = ? WHERE id = ?`).run(body.value === 'private' ? 'private' : 'public', id);
      } else if (action === 'pin') {
        db.prepare('UPDATE events SET pinned = CASE pinned WHEN 1 THEN 0 ELSE 1 END WHERE id = ?').run(id);
      } else if (action === 'toggle' && table === 'sources') {
        db.prepare('UPDATE sources SET enabled = CASE enabled WHEN 1 THEN 0 ELSE 1 END WHERE id = ?').run(id);
      } else if ((action === 'up' || action === 'down') && (table === 'works' || table === 'hobbies')) {
        const rows = db.prepare(`SELECT id, sort_order FROM ${table} ORDER BY sort_order ASC, title ASC`).all();
        const i = rows.findIndex((r) => r.id === id);
        const j = action === 'up' ? i - 1 : i + 1;
        if (i >= 0 && j >= 0 && j < rows.length) {
          const a = rows[i].sort_order;
          const b = rows[j].sort_order;
          db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`).run(b, rows[i].id);
          db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`).run(a, rows[j].id);
        }
      }
    }
    if (entity === 'site' && action === 'private') {
      setSetting('site_private', body.value === '1' ? '1' : '0');
    }
    return redirect(res, '/admin?msg=' + encodeURIComponent('已更新'), 303);
  }

  if (method === 'POST' && pathname === '/admin/fetch') {
    const result = await runFetch();
    const msg = `抓取完成：${result.sources.ok}/${result.sources.total} 源成功，新增 ${result.inserted} 条`;
    return redirect(res, '/admin?msg=' + encodeURIComponent(msg), 303);
  }

  if (method === 'POST' && pathname === '/api/notes') {
    const raw = await readBody(req, 2 * 1024 * 1024);
    let payload;
    try { payload = JSON.parse(raw); } catch { return send(res, 400, JSON.stringify({ error: 'bad json' }), 'application/json'); }
    const filename = String(payload.filename || '').trim();
    const content = String(payload.content || '');
    if (!/\.md$/i.test(filename)) return send(res, 400, JSON.stringify({ error: '只支持 .md 文件' }), 'application/json');
    if (!content.trim()) return send(res, 400, JSON.stringify({ error: '文件是空的' }), 'application/json');
    if (Buffer.byteLength(content, 'utf8') > 1024 * 1024) return send(res, 400, JSON.stringify({ error: '文件超过 1MB' }), 'application/json');

    const { data, body } = parseFrontmatter(content);
    const h1 = /^#\s+(.+)$/m.exec(body);
    const title = String(data.title || (h1 ? h1[1] : '') || filename.replace(/\.md$/i, '')).slice(0, 120);
    const baseSlug = filename.replace(/\.md$/i, '').toLowerCase()
      .normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'note';
    let slug = baseSlug;
    let suffix = 2;
    while (db.prepare('SELECT 1 AS hit FROM notes WHERE slug = ?').get(slug)) slug = `${baseSlug}-${suffix++}`;
    const plain = body.replace(/^#.*$/gm, '').replace(/[#*_>`[\]()!|~-]/g, ' ').replace(/\s+/g, ' ').trim();
    const summary = String(data.summary || plain).slice(0, 120);
    const tags = Array.isArray(data.tags) ? data.tags.slice(0, 8) : [];
    const stamp = nowIso();
    db.prepare(`INSERT INTO notes (id, slug, title, summary, body_md, tags, source_filename, bytes, visibility, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'public', ?, ?)`)
      .run(crypto.randomUUID(), slug, title, summary, content, JSON.stringify(tags), filename, Buffer.byteLength(content), stamp, stamp);
    return send(res, 200, JSON.stringify({ path: `/notes/${slug}` }), 'application/json');
  }

  if (method === 'POST' && pathname === '/api/games/sync') {
    try {
      const result = await syncSteam();
      return send(res, 200, JSON.stringify({ ok: true, ...result }), 'application/json');
    } catch (error) {
      const status = error.code === 'NOT_CONFIGURED' ? 400 : 502;
      return send(res, status, JSON.stringify({ ok: false, error: error.message }), 'application/json');
    }
  }

  if (method === 'POST' && pathname === '/api/games/import') {
    const raw = await readBody(req, 2 * 1024 * 1024);
    let payload;
    try { payload = JSON.parse(raw); } catch { return send(res, 400, JSON.stringify({ error: 'bad json' }), 'application/json'); }
    const filename = String(payload.filename || 'epic.json');
    if (!/\.(json|csv)$/i.test(filename)) {
      return send(res, 400, JSON.stringify({ error: '只支持 .json / .csv' }), 'application/json');
    }
    try {
      const result = importEpic(payload.content);
      return send(res, 200, JSON.stringify({ ok: true, ...result }), 'application/json');
    } catch (error) {
      return send(res, 400, JSON.stringify({ ok: false, error: error.message }), 'application/json');
    }
  }

  if (method === 'POST' && pathname === '/api/games/approve') {
    const raw = await readBody(req, 64 * 1024);
    let payload;
    try { payload = JSON.parse(raw); } catch { return send(res, 400, JSON.stringify({ error: 'bad json' }), 'application/json'); }
    if (!payload.id) return send(res, 400, JSON.stringify({ error: 'id required' }), 'application/json');
    setGameStatus(String(payload.id), payload.value === 'hidden' ? 'hidden' : 'approved');
    return send(res, 200, JSON.stringify({ ok: true }), 'application/json');
  }

  if (method === 'POST' && pathname === '/api/anime/refresh') {
    const results = await refreshAnime();
    return send(res, 200, JSON.stringify({ ok: true, results }), 'application/json');
  }

  if (method === 'POST' && pathname === '/api/upload') {
    const raw = await readBody(req, 12 * 1024 * 1024);
    let payload;
    try { payload = JSON.parse(raw); } catch { return send(res, 400, JSON.stringify({ error: 'bad json' }), 'application/json'); }
    const dataUrl = String(payload.dataUrl || '');
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) return send(res, 400, JSON.stringify({ error: '只支持 JPG / PNG / WebP' }), 'application/json');
    const mime = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 8 * 1024 * 1024) return send(res, 400, JSON.stringify({ error: '图片超过 8MB' }), 'application/json');
    const isJpeg = mime === 'image/jpeg' && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng = mime === 'image/png' && buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isWebp = mime === 'image/webp' && buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP';
    if (!(isJpeg || isPng || isWebp)) return send(res, 400, JSON.stringify({ error: '文件内容与类型不符' }), 'application/json');
    const ext = isJpeg ? 'jpg' : isPng ? 'png' : 'webp';
    const now = new Date();
    const dir = path.join(UPLOAD_DIR, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
    fs.mkdirSync(dir, { recursive: true });
    const name = `${crypto.randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(dir, name), buffer);
    return send(res, 200, JSON.stringify({
      path: `/uploads/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${name}`
    }), 'application/json');
  }

  if (method === 'POST' && pathname === '/api/fetch') {
    const result = await runFetch();
    return send(res, 200, JSON.stringify(result), 'application/json');
  }

  if (method === 'GET' && pathname === '/sitemap.xml') {
    return send(res, 200, sitemapXml(), 'application/xml; charset=utf-8');
  }

  if (method === 'GET' && pathname === '/robots.txt') {
    return send(res, 200, `User-agent: *\nAllow: /\nSitemap: http://localhost:${PORT}/sitemap.xml\n`, 'text/plain; charset=utf-8');
  }

  return html(res, notFoundPage(), 404);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error('[error]', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><meta charset="utf-8"><title>500</title><p>服务出了点问题。 <a href="/">回首页</a></p>');
    } else {
      res.end();
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Jexil1412 site → http://${HOST}:${PORT}`);
});