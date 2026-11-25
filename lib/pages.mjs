import fs from 'node:fs';
import path from 'node:path';
import { ROOT, PUBLIC_DIR, noteTags } from './db.mjs';
import {
  esc, fmtDateTime, fmtDay, weekday, kindLabel, domainLabel, srcset,
  paragraphs, fmtFullDate, shDay
} from './util.mjs';

const SITE = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'site.json'), 'utf8'));

const DOMAINS = [
  { key: 'ai', label: 'AI' },
  { key: 'music', label: '音乐' },
  { key: 'anime', label: '动漫' },
  { key: 'game', label: '游戏' }
];

const HOBBY_LINKS = [
  { key: 'game', label: '游戏', href: '/hobbies/game' },
  { key: 'anime', label: '动漫', href: '/hobbies/anime' },
  { key: 'music', label: '音乐', href: '/hobbies/music' }
];

function mark(cls = '') {
  return `<span class="wordmark ${cls}" role="img" aria-label="Jexil">Jexil</span>`;
}

function navGroups() {
  const tags = noteTags(5);
  return [
    {
      key: 'about', label: '关于', href: '/about',
      items: [
        { key: '', label: '全部作品', href: '/about' },
        { key: 'app', label: 'App', href: '/about?kind=app' },
        { key: 'web', label: '网页', href: '/about?kind=web' }
      ]
    },
    {
      key: 'today', label: '今日', href: '/today',
      items: DOMAINS.map((d) => ({ key: d.key, label: d.label, href: `/today?domain=${d.key}` }))
    },
    {
      key: 'hobbies', label: '爱好', href: '/hobbies',
      items: HOBBY_LINKS.map((h) => ({ key: h.key, label: h.label, href: h.href }))
    },
    {
      key: 'notes', label: '笔记', href: '/notes',
      items: [
        { key: '', label: '全部', href: '/notes' },
        ...tags.map((tag) => ({ key: `tag:${tag}`, label: `#${tag}`, href: `/notes?tag=${encodeURIComponent(tag)}` }))
      ]
    }
  ];
}

function sidebar({ current, sub }) {
  const groups = navGroups();
  const html = groups.map((group) => {
    const isCurrent = group.key === current;
    const open = group.key === (current || 'about');
    const items = group.items.map((item) => {
      const active = open && item.key === (sub || '');
      return `<li><a class="nav-item${active ? ' is-active' : ''}" href="${item.href}"${active ? ' aria-current="page"' : ''}>${esc(item.label)}</a></li>`;
    }).join('');
    return `<section class="nav-group${open ? ' is-open' : ''}">
      <div class="nav-row">
        <a class="nav-title${isCurrent ? ' is-active' : ''}" href="${group.href}"${isCurrent ? ' aria-current="page"' : ''}>${group.label}</a>
        <button class="nav-toggle" type="button" aria-expanded="${open}" aria-label="展开${group.label}">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        </button>
      </div>
      <ul class="nav-sub">${items}</ul>
    </section>`;
  }).join('');

  return `<aside class="sidebar glass" id="sidebar" aria-label="栏目导航">
    <a class="side-mark" href="/" aria-label="Jexil 首页">${mark('mark-side')}</a>
    <nav class="nav">${html}</nav>
  </aside>`;
}

export function layout({ title = '', description = '', current = '', sub = '', body = '', admin = false, msg = '' }) {
  const pageTitle = title ? `${title} — Jexil` : 'Jexil';
  const desc = description || 'Jexil';
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(pageTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#C9E7FF">
<link rel="icon" href="/favicon.png" type="image/png" sizes="64x64">
<link rel="apple-touch-icon" href="/favicon-128.png">
<link rel="stylesheet" href="/style.css">
</head>
<body class="app">
<a class="skip" href="#main">跳到主内容</a>
${sidebar({ current, sub })}
<header class="topbar glass">
  <a class="top-mark" href="/" aria-label="Jexil 首页">${mark('mark-top')}</a>
  <button class="menu-btn glass-btn" type="button" aria-label="打开栏目" aria-expanded="false" data-menu>
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 6h14M3 10h14M3 14h14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
  </button>
</header>
<div class="scrim" data-scrim hidden></div>
<main id="main" class="content">
${admin ? `<div class="admin-bar"><span>后台</span><a href="/">看站点</a><a href="/logout">退出</a></div>` : ''}
${body}
</main>
${msg ? `<div class="toast" role="status">${esc(msg)}</div>` : ''}
<script src="/site.js" defer></script>
</body>
</html>`;
}

function pageHead(title, extra = '') {
  return `<header class="page-head"><h1 class="page-title">${title}</h1>${extra ? `<div class="page-tools">${extra}</div>` : ''}</header>`;
}

function pills(items, active) {
  return `<nav class="pills" aria-label="筛选">${items.map(([key, label, href]) =>
    `<a class="pill${active === key ? ' is-on' : ''}" href="${href}"${active === key ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('')}</nav>`;
}

export function homePage() {
  return layout({
    body: `<section class="home"><div class="home-mark">${mark('mark-hero')}</div></section>`
  });
}

function slide(work) {
  const cover = work.cover
    ? `<img ${imgAttrs(work.cover, '(max-width: 767px) 100vw, 60vw')} alt="${esc(work.title)}：${esc(work.summary)}" loading="lazy">`
    : `<span class="slide-empty">${esc(work.title)}</span>`;
  const open = (work.links || []).find((l) => l.url);
  return `<article class="slide">
    <div class="slide-media">${cover}</div>
    <div class="slide-body">
      <h2 class="slide-title">${esc(work.title)}</h2>
      <p class="slide-meta">${[work.year, kindLabel(work.kind)].filter(Boolean).map(esc).join(' · ')}</p>
      <p class="slide-summary">${esc(work.summary)}</p>
      <div class="slide-actions">
        <a class="btn glass-btn hilight" href="/about/works/${esc(work.slug)}">看看</a>
        ${open ? `<a class="btn glass-btn ghost hilight" href="${esc(open.url)}" target="_blank" rel="noopener noreferrer">${esc(open.label || '打开')} ↗</a>` : ''}
      </div>
    </div>
  </article>`;
}

function arrows() {
  return `<button class="slider-arrow is-prev" type="button" aria-label="上一件">
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M12 4l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <button class="slider-arrow is-next" type="button" aria-label="下一件">
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M8 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>`;
}

export function aboutPage({ works, kind = '' }) {
  const filtered = kind ? works.filter((w) => w.kind === kind) : works;
  const filter = pills([
    ['', '全部', '/about'],
    ['app', 'App', '/about?kind=app'],
    ['web', '网页', '/about?kind=web']
  ], kind);
  let slider = '';
  if (filtered.length) {
    slider = `<div class="frame glass" data-slider>
      <div class="slider-viewport"><div class="slider-track">${filtered.map(slide).join('')}</div></div>
      ${arrows()}
      <div class="dots" role="tablist" aria-label="作品切换">${filtered.map((w, i) =>
        `<button class="dot${i === 0 ? ' is-active' : ''}" type="button" aria-label="切换到${esc(w.title)}"${i === 0 ? ' aria-current="true"' : ''}></button>`).join('')}</div>
    </div>`;
  } else {
    slider = `<p class="empty-note">这个分类下还没有作品。</p>`;
  }
  return layout({
    title: '关于',
    current: 'about',
    sub: kind,
    body: `${pageHead('关于', filter)}${slider}`
  });
}

function img800(p) {
  const variant = String(p || '').replace(/-1600\.(jpg|jpeg|png|webp)$/i, '-800.$1');
  return variant !== p && fs.existsSync(path.join(PUBLIC_DIR, variant)) ? variant : '';
}

function fileVersion(p) {
  try { return Math.floor(fs.statSync(path.join(PUBLIC_DIR, p)).mtimeMs).toString(36); } catch { return ''; }
}

function vurl(p) {
  const v = fileVersion(p);
  return v ? `${p}?v=${v}` : p;
}

function imgAttrs(p, sizes = '100vw') {
  const small = img800(p);
  return small
    ? `src="${esc(vurl(small))}" srcset="${esc(vurl(small))} 800w, ${esc(vurl(p))} 1600w" sizes="${sizes}"`
    : `src="${esc(vurl(p))}"`;
}

export function workPage({ work, index, total, prev, next }) {
  const gallery = (work.gallery || []).map((g, i) => `<figure class="figure">
    <button class="zoom" type="button" data-full="${esc(g.path)}" data-alt="${esc(g.alt || '')}">
      <img src="${esc(vurl(g.path))}" alt="${esc(g.alt || work.title + ' 图 ' + (i + 1))}" loading="lazy">
    </button>
    ${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ''}
  </figure>`).join('');
  const links = (work.links || []).filter((l) => l.url).map((l) =>
    `<a class="btn glass-btn hilight" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>`).join('');
  const body = `<article class="article">
    <nav class="crumbs"><a href="/about">← 关于</a><span>${esc(work.title)}</span></nav>
    <header class="article-head">
      <h1 class="page-title">${esc(work.title)}</h1>
      <p class="meta-line">${[work.year, kindLabel(work.kind), work.role].filter(Boolean).map(esc).join(' · ')}</p>
      <p class="summary">${esc(work.summary)}</p>
    </header>
    ${work.cover ? `<figure class="media-frame"><img ${imgAttrs(work.cover)} alt="${esc(work.title)}：${esc(work.summary)}"></figure>` : ''}
    <div class="prose">${paragraphs(work.body).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
    ${gallery ? `<section class="gallery">${gallery}</section>` : ''}
    ${links ? `<p class="links">${links}</p>` : ''}
    <nav class="article-nav">
      ${prev ? `<a class="linkbtn" href="/about/works/${esc(prev.slug)}">← ${esc(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a class="linkbtn" href="/about/works/${esc(next.slug)}">${esc(next.title)} →</a>` : '<span></span>'}
    </nav>
  </article>`;
  return layout({ title: work.title, description: work.summary, current: 'about', body });
}

export function todayPage({ day, domain, groups, archive, status }) {
  const filter = pills([
    ['', '全部', '/today'],
    ...DOMAINS.map((d) => [d.key, d.label, `/today?domain=${d.key}`])
  ], domain);
  const sections = groups.map((g) => {
    const rows = g.events.map((e) => `<li class="event-row">
      <a class="event-title" href="${esc(e.source_url)}" target="_blank" rel="noopener noreferrer">${esc(e.title)}${e.pinned ? ' <span class="pin">置顶</span>' : ''}</a>
      ${e.summary ? `<p class="event-summary">${esc(e.summary)}</p>` : ''}
      <p class="event-meta">${esc(e.source_name)} · ${esc(fmtDateTime(e.published_at))}</p>
    </li>`).join('');
    return `<section class="event-group">
      <div class="event-group-head"><h2>${g.label}</h2><span>${g.events.length} 条</span></div>
      <ul class="event-list">${rows}</ul>
    </section>`;
  }).join('');
  const archiveHtml = archive.length ? `<details class="archive">
    <summary>更早（最近 7 天）</summary>
    ${archive.map((d) => `<div class="archive-day">
      <h3>${esc(d.day)} ${esc(weekday(d.day))}</h3>
      <ul>${d.events.map((e) => `<li><a href="${esc(e.source_url)}" target="_blank" rel="noopener noreferrer">${esc(e.title)}</a><span>${esc(e.source_name)}</span></li>`).join('')}</ul>
    </div>`).join('')}
  </details>` : '';
  const body = `${pageHead('今日', filter)}
    <p class="today-status">${esc(day)} ${esc(weekday(day))} · ${esc(status.ok)}/${esc(status.total)} 个源成功 · ${esc(status.at)}</p>
    ${status.failed ? `<p class="today-status is-warn">本次抓取失败：${esc(status.failed)}，显示最近的缓存。</p>` : ''}
    ${sections || `<p class="empty-note">这一天还没有抓到内容。</p>`}
    ${archiveHtml}`;
  return layout({ title: '今日', current: 'today', sub: domain, body });
}

export function hobbiesPage({ hobbies }) {
  const cards = hobbies.map((hobby) => `<a class="glass-card hilight hobby-card" href="/hobbies/${esc(hobby.slug)}">
    <h2 class="hobby-name">${esc(hobby.name)}</h2>
    <p class="hobby-note">${esc(hobby.note)}</p>
    <span class="hobby-go">看看 →</span>
  </a>`).join('');
  return layout({
    title: '爱好', current: 'hobbies',
    body: `${pageHead('爱好')}<div class="hobby-grid">${cards}</div>`
  });
}

function hours(minutes) {
  return (Number(minutes || 0) / 60).toFixed(1);
}

function recent(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function gamePage({ games }) {
  const cards = games.map((game) => `<article class="glass-card game-card">
    ${game.cover ? `<img class="game-cover" src="${esc(game.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="game-cover is-empty"></div>'}
    <div class="game-body">
      <p class="game-platform">${game.source === 'steam' ? 'Steam' : 'Epic'}</p>
      <h2 class="game-name">${esc(game.name)}</h2>
      <p class="game-meta">${hours(game.playtime_minutes)} 小时${recent(game.last_played_at) ? ' · 最近 ' + recent(game.last_played_at) : ''}</p>
      ${game.store_url ? `<a class="game-link" href="${esc(game.store_url)}" target="_blank" rel="noopener noreferrer">去商店 ↗</a>` : ''}
    </div>
  </article>`).join('');
  return layout({
    title: '游戏', current: 'hobbies', sub: 'game',
    body: `${pageHead('游戏')}<p class="page-note">只显示我同意公开的游戏。不同步、不公开的都不会出现在这里。</p>
      ${games.length ? `<div class="game-grid">${cards}</div>` : '<p class="empty-note">还没有公开的游戏。</p>'}`
  });
}

export function animePage({ sources, items, platform = '' }) {
  const pillsHtml = pills([
    ['', '全部', '/hobbies/anime'],
    ...sources.map((source) => [source.platform, source.name, `/hobbies/anime?platform=${source.platform}`])
  ], platform);
  const cards = items.map((item) => `<article class="glass-card anime-card">
    ${item.cover ? `<img class="anime-cover" src="${esc(item.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
    <div class="anime-body">
      <p class="anime-meta">${esc(sources.find((s) => s.platform === item.platform)?.name || item.platform)}${item.published_at ? ' · ' + recent(item.published_at) : ''}</p>
      <h2 class="anime-title"><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h2>
      ${item.summary ? `<p class="anime-summary">${esc(item.summary)}</p>` : ''}
    </div>
  </article>`).join('');
  const entries = sources.map((source) => `<a class="entry-card glass-card hilight" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">
    <span class="entry-name">${esc(source.name)}</span>
    <span class="entry-note">${source.mode === 'api' ? '公开接口' : '平台入口'}</span>
  </a>`).join('');
  return layout({
    title: '动漫', current: 'hobbies', sub: 'anime',
    body: `${pageHead('动漫', pillsHtml)}${cards ? `<div class="anime-grid">${cards}</div>` : '<p class="empty-note">还没有抓到公开条目，可以先从平台入口去看。</p>'}
      <h2 class="section-sub">平台入口</h2>
      <div class="source-grid">${entries}</div>
      <p class="page-note">只显示最近 12 条公开索引，更多去平台入口看。资讯版权归原平台，本站只做索引；不抓播放源、不登录、不绕过反爬。</p>`
  });
}

export function musicPage({ artists, songs }) {
  const blocks = artists.map((artist) => {
    const list = songs.get(artist.name) || [];
    return `<section class="artist-block" id="artist-${esc(artist.name)}">
      <h2 class="artist-name">${esc(artist.name)}</h2>
      <ul class="song-list">${list.map((song) => `<li class="song-row">
        <span class="song-title">${esc(song.title)}</span>
        <span class="song-actions">
          ${song.preview_url ? `<button class="song-play" type="button" data-src="${esc(song.preview_url)}" data-title="${esc(song.artist)} — ${esc(song.title)}" aria-label="试听 ${esc(song.title)}"><span aria-hidden="true">▶</span></button>` : ''}
          ${(song.links || []).map((link) => `<a class="song-link" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.name)} ↗</a>`).join(' ')}
        </span>
      </li>`).join('')}</ul>
    </section>`;
  }).join('');
  return layout({
    title: '音乐', current: 'hobbies', sub: 'music',
    body: `${pageHead('音乐')}<div class="artists">${blocks}</div>
      <div class="player glass" hidden>
        <span class="player-title"></span>
        <audio preload="none"></audio>
        <button class="player-close" type="button" aria-label="关闭播放器">×</button>
      </div>
      <p class="page-note">试听是平台提供的 30 秒官方片段；本站不提供完整音源与歌词，版权归原权利人。</p>`
  });
}

export function notesPage({ notes, tag, tags, admin = false }) {
  const filter = pills([
    ['', '全部', '/notes'],
    ...tags.map((t) => [`tag:${t}`, `#${t}`, `/notes?tag=${encodeURIComponent(t)}`])
  ], tag ? `tag:${tag}` : '');
  const addHref = admin ? '/admin/note/new' : '/login?next=' + encodeURIComponent('/admin/note/new');
  const tools = `<div class="notes-tools">${filter}<a class="btn glass-btn hilight" href="${addHref}">+ 新建笔记</a></div>`;
  const cards = notes.map((note) => `<a class="glass-card hilight note-card" href="/notes/${esc(note.slug)}">
    <h2 class="note-title">${esc(note.title)}</h2>
    ${note.summary ? `<p class="note-summary">${esc(note.summary)}</p>` : ''}
    <p class="note-meta">${esc(fmtFullDate(note.created_at))}${note.tags.length ? ' · ' + note.tags.map((t) => '#' + t).join(' ') : ''}</p>
  </a>`).join('');
  return layout({
    title: '笔记', current: 'notes', sub: tag ? `tag:${tag}` : '',
    body: `${pageHead('笔记', tools)}${notes.length ? `<div class="notes-grid">${cards}</div>` : '<p class="empty-note">还没有笔记。</p>'}
      <a class="fab glass-btn hilight" href="${addHref}" aria-label="新建笔记">+</a>`
  });
}

export function notePage({ note, html }) {
  return layout({
    title: note.title, current: 'notes', sub: note.tags[0] ? `tag:${note.tags[0]}` : '',
    body: `<article class="note-article">
      <nav class="crumbs"><a href="/notes">← 笔记</a><a href="/notes/${esc(note.slug)}.md">下载 .md</a></nav>
      <header class="article-head">
        <h1 class="page-title">${esc(note.title)}</h1>
        <p class="meta-line">${esc(fmtFullDate(note.created_at))}${note.tags.length ? ' · ' + note.tags.map((t) => '#' + t).join(' ') : ''}</p>
      </header>
      <div class="markdown glass-panel">${html}</div>
    </article>`
  });
}

export function loginPage({ error = '', next = '/' }) {
  return layout({
    title: '登录',
    body: `<section class="login glass">
      <h1 class="page-title">登录</h1>
      <p class="page-desc">只有站主需要登录。</p>
      ${error ? `<p class="form-error">${esc(error)}</p>` : ''}
      <form class="stack" method="post" action="/login">
        <input type="hidden" name="next" value="${esc(next)}">
        <label class="field"><span>密码</span><input type="password" name="password" autocomplete="current-password" required autofocus></label>
        <button class="btn glass-btn hilight" type="submit">进入</button>
      </form>
    </section>`
  });
}

export function notFoundPage() {
  return layout({
    title: '404',
    body: `<section class="notfound">
      <h1 class="page-title">这一页不存在</h1>
      <p class="page-desc">可能是链接旧了，或者内容被设成了私密。</p>
      <p><a class="btn glass-btn hilight" href="/">回首页</a></p>
    </section>`
  });
}

function actionForm(entity, action, id, value, label, extra = '') {
  return `<form class="inline" method="post" action="/admin/action">
    <input type="hidden" name="entity" value="${entity}">
    <input type="hidden" name="action" value="${action}">
    <input type="hidden" name="id" value="${esc(id)}">
    ${value !== undefined ? `<input type="hidden" name="value" value="${esc(value)}">` : ''}
    <button class="linkbtn" type="submit" ${extra}>${label}</button>
  </form>`;
}

export function adminPage({ works, hobbies, events, sources, notes, settings, stats, gamesAll = [], gameStats = { pending: 0, approved: 0, hidden: 0 }, steam = { configured: false }, animeSources = [], songsCount = 0, artistsCount = 0, msg = '' }) {
  const workRows = works.map((w) => `<tr>
    <td>${esc(w.title)}<span class="cell-sub">/${esc(w.slug)}</span></td>
    <td><span class="tag ${w.visibility}">${w.visibility === 'public' ? '公开' : '私密'}</span></td>
    <td>${esc((w.updated_at || '').slice(0, 10))}</td>
    <td class="row-actions">
      ${actionForm('work', 'up', w.id, undefined, '↑')}
      ${actionForm('work', 'down', w.id, undefined, '↓')}
      ${actionForm('work', 'visibility', w.id, w.visibility === 'public' ? 'private' : 'public', w.visibility === 'public' ? '设私密' : '设公开')}
      <a class="linkbtn" href="/admin/work/${esc(w.id)}">编辑</a>
      ${actionForm('work', 'delete', w.id, undefined, '删除', `data-confirm="删除《${esc(w.title)}》？这一步不能撤销。"`)}
    </td>
  </tr>`).join('');

  const hobbyRows = hobbies.map((h) => `<tr>
    <td>${esc(h.name)}<span class="cell-sub">/${esc(h.slug)}</span></td>
    <td><span class="tag ${h.visibility}">${h.visibility === 'public' ? '公开' : '私密'}</span></td>
    <td class="row-actions">
      ${actionForm('hobby', 'up', h.id, undefined, '↑')}
      ${actionForm('hobby', 'down', h.id, undefined, '↓')}
      ${actionForm('hobby', 'visibility', h.id, h.visibility === 'public' ? 'private' : 'public', h.visibility === 'public' ? '设私密' : '设公开')}
      <a class="linkbtn" href="/admin/hobby/${esc(h.id)}">编辑</a>
      ${actionForm('hobby', 'delete', h.id, undefined, '删除', `data-confirm="删除爱好《${esc(h.name)}》？"`)}
    </td>
  </tr>`).join('');

  const noteRows = notes.map((n) => `<tr>
    <td>${esc(n.title)}<span class="cell-sub">/notes/${esc(n.slug)}</span></td>
    <td>${n.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join(' ') || '—'}</td>
    <td><span class="tag ${n.visibility}">${n.visibility === 'public' ? '公开' : '私密'}</span></td>
    <td class="row-actions">
      ${actionForm('note', 'visibility', n.id, n.visibility === 'public' ? 'private' : 'public', n.visibility === 'public' ? '设私密' : '设公开')}
      ${actionForm('note', 'delete', n.id, undefined, '删除', 'data-confirm="删除这篇笔记？"')}
    </td>
  </tr>`).join('');

  const eventRows = events.slice(0, 30).map((e) => `<tr>
    <td>${esc(e.title)}<span class="cell-sub">${esc(e.day)} · ${esc(e.source_name)}</span></td>
    <td>${domainLabel(e.domain)}</td>
    <td><span class="tag ${e.visibility}">${e.visibility === 'public' ? '公开' : '私密'}</span>${e.pinned ? ' <span class="tag pin">置顶</span>' : ''}</td>
    <td class="row-actions">
      ${actionForm('event', 'pin', e.id, undefined, e.pinned ? '取消置顶' : '置顶')}
      ${actionForm('event', 'visibility', e.id, e.visibility === 'public' ? 'private' : 'public', e.visibility === 'public' ? '隐藏' : '公开')}
      ${actionForm('event', 'delete', e.id, undefined, '删除', 'data-confirm="删除这条事件？"')}
    </td>
  </tr>`).join('');

  const sourceRows = sources.map((s) => `<tr>
    <td>${esc(s.name)}<span class="cell-sub">${esc(s.domain)}</span></td>
    <td>${s.last_ok_at ? esc(fmtDateTime(s.last_ok_at)) : '—'}</td>
    <td class="err">${s.last_error ? esc(s.last_error) : ''}</td>
    <td class="row-actions">${actionForm('source', 'toggle', s.id, s.enabled ? '0' : '1', s.enabled ? '停用' : '启用')}</td>
  </tr>`).join('');

  const statusLabel = { pending: '待审', approved: '已公开', hidden: '已隐藏' };
  const gameRows = gamesAll.map((game) => `<tr>
    <td>${esc(game.name)}<span class="cell-sub">${game.source} · ${hours(game.playtime_minutes)} 小时</span></td>
    <td><span class="tag ${game.status === 'approved' ? 'public' : game.status === 'hidden' ? 'private' : ''}">${statusLabel[game.status] || game.status}</span></td>
    <td class="row-actions">
      ${game.status !== 'approved' ? actionForm('game', 'approve', game.id, undefined, '同意公开') : ''}
      ${game.status !== 'hidden' ? actionForm('game', 'hide', game.id, undefined, '隐藏') : ''}
      ${actionForm('game', 'delete', game.id, undefined, '删除', `data-confirm="从列表移除《${esc(game.name)}》？"`)}
    </td>
  </tr>`).join('');

  const animeSourceRows = animeSources.map((source) => `<tr>
    <td>${esc(source.name)}<span class="cell-sub">${esc(source.mode === 'api' ? '公开接口' : '仅入口')}</span></td>
    <td>${source.last_ok_at ? esc(fmtDateTime(source.last_ok_at)) : '—'}</td>
    <td class="err">${source.last_error ? esc(source.last_error) : ''}</td>
    <td><a class="linkbtn" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">打开 ↗</a></td>
  </tr>`).join('');

  const body = `${pageHead('后台')}
    <p class="today-status">${stats.works} 件作品 · ${stats.hobbies} 个爱好 · ${stats.notes} 篇笔记 · ${stats.events} 条事件</p>
    ${msg ? `<p class="admin-msg">${esc(msg)}</p>` : ''}
    <nav class="admin-tabs">${['作品', '今日', '爱好', '爱好数据', '笔记', '设置'].map((label, i) =>
      `<a href="#${['works', 'events', 'hobbies', 'hobby-data', 'notes', 'settings'][i]}">${label}</a>`).join('')}</nav>

    <section id="works" class="admin-block glass-panel">
      <div class="admin-block-head"><h2>作品</h2><a class="btn glass-btn" href="/admin/work/new">新建作品</a></div>
      <table class="admin-table"><thead><tr><th>标题</th><th>可见性</th><th>更新</th><th>操作</th></tr></thead><tbody>${workRows}</tbody></table>
    </section>

    <section id="hobbies" class="admin-block glass-panel">
      <div class="admin-block-head"><h2>爱好</h2><a class="btn glass-btn" href="/admin/hobby/new">新建爱好</a></div>
      <table class="admin-table"><thead><tr><th>名称</th><th>可见性</th><th>操作</th></tr></thead><tbody>${hobbyRows}</tbody></table>
    </section>

    <section id="hobby-data" class="admin-block glass-panel">
      <div class="admin-block-head"><h2>爱好数据</h2><span class="admin-hint">Steam ${steam.mode === 'api' ? 'API 已配置' : steam.mode === 'local' ? '本机已发现' : '未发现'} · 待审 ${gameStats.pending} 款</span></div>

      <div class="admin-sub">
        <h3>游戏</h3>
        <p class="admin-hint">同步只写库；新游戏默认待审，同意后才公开。默认读取本机 Steam 的只读记录（不需要 API key）；也可设 STEAM_API_KEY / STEAM_ID 走官方 API。Epic 用账号数据导出文件（JSON/CSV）。</p>
        <div class="admin-actions">
          <form data-api="/api/games/sync"><button class="btn glass-btn" type="submit">同步 Steam</button></form>
          <form class="md-upload" data-epic-import>
            <input type="file" accept=".json,.csv" required>
            <button class="btn glass-btn" type="submit">导入 Epic 导出</button>
            <p class="upload-error" role="status"></p>
          </form>
        </div>
        <table class="admin-table"><thead><tr><th>游戏</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>${gameRows || '<tr><td colspan="3">还没有同步或导入游戏。</td></tr>'}</tbody></table>
      </div>

      <div class="admin-sub">
        <h3>动漫</h3>
        <p class="admin-hint">B 站走公开接口；腾讯 / 爱奇艺 / 优酷没有公开目录接口，只做平台入口。</p>
        <form data-api="/api/anime/refresh"><button class="btn glass-btn" type="submit">刷新四平台</button></form>
        <table class="admin-table"><thead><tr><th>平台</th><th>上次成功</th><th>错误</th><th>入口</th></tr></thead><tbody>${animeSourceRows}</tbody></table>
      </div>

      <div class="admin-sub">
        <h3>唱歌</h3>
        <p class="admin-hint">${artistsCount} 位歌手 / ${songsCount} 首歌；只有歌名与平台外链，没有音频与歌词。</p>
      </div>
    </section>

    <section id="notes" class="admin-block glass-panel">
      <div class="admin-block-head"><h2>笔记</h2><span class="admin-hint">上传 .md，≤1MB</span></div>
      <form class="md-upload" data-md-upload>
        <input type="file" accept=".md,text/markdown" required>
        <button class="btn glass-btn hilight" type="submit">上传 .md</button>
        <p class="upload-error" role="status"></p>
      </form>
      <table class="admin-table"><thead><tr><th>标题</th><th>标签</th><th>可见性</th><th>操作</th></tr></thead><tbody>${noteRows || '<tr><td colspan="4">还没有笔记。</td></tr>'}</tbody></table>
    </section>

    <section id="events" class="admin-block glass-panel">
      <div class="admin-block-head"><h2>今日事件</h2><form method="post" action="/admin/fetch"><button class="btn glass-btn" type="submit">立即抓取</button></form></div>
      <p class="admin-hint">最近 30 条；日志在 data/fetch.log。</p>
      <table class="admin-table"><thead><tr><th>标题</th><th>领域</th><th>状态</th><th>操作</th></tr></thead><tbody>${eventRows || '<tr><td colspan="4">还没有事件。</td></tr>'}</tbody></table>
    </section>

    <section id="sources" class="admin-block glass-panel">
      <div class="admin-block-head"><h2>源</h2><span class="admin-hint">${sources.filter((s) => s.enabled).length}/${sources.length} 启用</span></div>
      <table class="admin-table"><thead><tr><th>源</th><th>上次成功</th><th>错误</th><th>操作</th></tr></thead><tbody>${sourceRows}</tbody></table>
    </section>

    <section id="settings" class="admin-block glass-panel">
      <div class="admin-block-head"><h2>设置</h2></div>
      <form class="settings-form" method="post" action="/admin/action">
        <input type="hidden" name="entity" value="site">
        <input type="hidden" name="action" value="private">
        <input type="hidden" name="value" value="${settings.sitePrivate ? '0' : '1'}">
        <p>整站私密：<strong>${settings.sitePrivate ? '开' : '关'}</strong>。开启后未登录访问公开页会跳到登录。</p>
        <button class="btn glass-btn" type="submit">${settings.sitePrivate ? '关闭整站私密' : '开启整站私密'}</button>
      </form>
    </section>`;
  return layout({ title: '后台', body, admin: true, msg });
}

export function workFormPage({ work }) {
  const isNew = !work;
  const w = work || { id: '', slug: '', title: '', summary: '', body: '', kind: 'web', year: new Date().getFullYear(), role: '', cover: '', gallery: [], links: [], featured: 0, sort_order: 99, visibility: 'public' };
  const firstLink = (w.links || [])[0] || { label: '', url: '' };
  const body = `${pageHead(isNew ? '新建作品' : '编辑作品')}
  <form class="editor glass-panel" method="post" action="/admin/work/save">
    <input type="hidden" name="id" value="${esc(w.id)}">
    <div class="editor-grid">
      <div class="editor-main">
        <label class="field"><span>标题</span><input name="title" value="${esc(w.title)}" required></label>
        <label class="field"><span>slug</span><input name="slug" value="${esc(w.slug)}" required pattern="[a-z0-9-]+"></label>
        <label class="field"><span>一句话摘要</span><input name="summary" value="${esc(w.summary)}" required></label>
        <label class="field"><span>正文（空行分段）</span><textarea name="body" rows="10">${esc(w.body)}</textarea></label>
        <div class="field-row">
          <label class="field"><span>类型</span><select name="kind">${['web', 'app', 'other'].map((k) => `<option value="${k}"${w.kind === k ? ' selected' : ''}>${kindLabel(k)}</option>`).join('')}</select></label>
          <label class="field"><span>年份</span><input type="number" name="year" value="${esc(w.year || '')}"></label>
          <label class="field"><span>我的角色</span><input name="role" value="${esc(w.role || '')}"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>链接文字</span><input name="link_label" value="${esc(firstLink.label || '')}"></label>
          <label class="field"><span>链接地址</span><input name="link_url" value="${esc(firstLink.url || '')}"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>排序</span><input type="number" name="sort_order" value="${esc(w.sort_order)}"></label>
          <label class="field"><span>可见性</span><select name="visibility"><option value="public"${w.visibility === 'public' ? ' selected' : ''}>公开</option><option value="private"${w.visibility === 'private' ? ' selected' : ''}>私密</option></select></label>
        </div>
        <div class="actions"><button class="btn glass-btn hilight" type="submit">保存</button><a class="linkbtn" href="/admin">取消</a></div>
      </div>
      <aside class="editor-side">
        <div class="field">
          <span>封面</span>
          <input type="hidden" name="cover" id="cover" value="${esc(w.cover || '')}">
          <input type="file" accept="image/jpeg,image/png,image/webp" data-upload="cover" data-target="#cover" data-preview="#cover-preview">
          <div class="preview-box"><img id="cover-preview" src="${esc(w.cover || '')}" alt="" ${w.cover ? '' : 'hidden'}></div>
        </div>
        <div class="field">
          <span>图集（可多选）</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple data-upload="gallery" data-target="#gallery">
          <input type="hidden" name="gallery" id="gallery" value="${esc(JSON.stringify(w.gallery || []))}">
          <div id="gallery-list" class="gallery-list"></div>
        </div>
      </aside>
    </div>
  </form>`;
  return layout({ title: isNew ? '新建作品' : '编辑作品', body, admin: true });
}

export function hobbyFormPage({ hobby }) {
  const isNew = !hobby;
  const h = hobby || { id: '', slug: '', name: '', note: '', body: '', sort_order: 99, visibility: 'public' };
  const body = `${pageHead(isNew ? '新建爱好' : '编辑爱好')}
  <form class="editor glass-panel" method="post" action="/admin/hobby/save">
    <input type="hidden" name="id" value="${esc(h.id)}">
    <div class="editor-main">
      <label class="field"><span>名称</span><input name="name" value="${esc(h.name)}" required></label>
      <label class="field"><span>slug</span><input name="slug" value="${esc(h.slug)}" required pattern="[a-z0-9-]+"></label>
      <label class="field"><span>一句话</span><input name="note" value="${esc(h.note)}" required></label>
      <div class="field-row">
        <label class="field"><span>排序</span><input type="number" name="sort_order" value="${esc(h.sort_order)}"></label>
        <label class="field"><span>可见性</span><select name="visibility"><option value="public"${h.visibility === 'public' ? ' selected' : ''}>公开</option><option value="private"${h.visibility === 'private' ? ' selected' : ''}>私密</option></select></label>
      </div>
      <div class="actions"><button class="btn glass-btn hilight" type="submit">保存</button><a class="linkbtn" href="/admin">取消</a></div>
    </div>
  </form>`;
  return layout({ title: isNew ? '新建爱好' : '编辑爱好', body, admin: true });
}

export function noteFormPage({ error = '' } = {}) {
  return layout({
    title: '新建笔记',
    admin: true,
    body: `${pageHead('新建笔记')}
    ${error ? `<p class="form-error">${esc(error)}</p>` : ''}
    <form class="editor glass-panel" method="post" action="/admin/note/save">
      <div class="editor-main">
        <label class="field"><span>标题</span><input name="title" required maxlength="120" placeholder="这篇笔记叫什么"></label>
        <label class="field"><span>标签（逗号分隔，可选）</span><input name="tags" placeholder="建站, 音乐"></label>
        <label class="field"><span>摘要（可选，≤120 字）</span><input name="summary" maxlength="120"></label>
        <label class="field"><span>正文（Markdown）</span><textarea name="body" rows="16" required placeholder="支持标题、列表、代码块、链接……"></textarea></label>
        <div class="actions"><button class="btn glass-btn hilight" type="submit">保存</button><a class="linkbtn" href="/notes">取消</a></div>
      </div>
    </form>`
  });
}

export { DOMAINS };