import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const DB_FILE = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(DATA_DIR, 'app.db');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
export const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'web',
  year INTEGER,
  role TEXT NOT NULL DEFAULT '',
  cover TEXT,
  gallery TEXT NOT NULL DEFAULT '[]',
  links TEXT NOT NULL DEFAULT '[]',
  featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'public',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hobbies (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  note TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  since TEXT,
  cadence TEXT,
  cover TEXT,
  link TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'public',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  url_hash TEXT NOT NULL UNIQUE,
  published_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  day TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_day_domain ON events(day, domain);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body_md TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  source_filename TEXT,
  bytes INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'public',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  name TEXT NOT NULL,
  feed_url TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_ok_at TEXT,
  last_error TEXT,
  last_error_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  cover TEXT NOT NULL DEFAULT '',
  playtime_minutes INTEGER NOT NULL DEFAULT 0,
  last_played_at TEXT,
  store_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  approved_at TEXT,
  synced_at TEXT NOT NULL,
  UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);

CREATE TABLE IF NOT EXISTS anime_sources (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'link',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_ok_at TEXT,
  last_error TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS anime_items (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  cover TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  UNIQUE (platform, external_id)
);
CREATE INDEX IF NOT EXISTS idx_anime_platform ON anime_items(platform, published_at DESC);

CREATE TABLE IF NOT EXISTS artists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  album TEXT NOT NULL DEFAULT '',
  year INTEGER,
  links TEXT NOT NULL DEFAULT '[]',
  preview_url TEXT NOT NULL DEFAULT '',
  preview_track TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (artist, title)
);
`);

try { db.exec("ALTER TABLE songs ADD COLUMN preview_url TEXT NOT NULL DEFAULT ''"); } catch { /* 已有该列 */ }
try { db.exec("ALTER TABLE songs ADD COLUMN preview_track TEXT NOT NULL DEFAULT ''"); } catch { /* 已有该列 */ }

const nowIso = () => new Date().toISOString();

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function workRow(r) {
  if (!r) return null;
  return { ...r, gallery: parseJson(r.gallery, []), links: parseJson(r.links, []) };
}

export function works(includePrivate = false) {
  const sql = `SELECT * FROM works ${includePrivate ? '' : "WHERE visibility = 'public'"} ORDER BY sort_order ASC, year DESC, title ASC`;
  return db.prepare(sql).all().map(workRow);
}

export function featuredWorks(includePrivate = false, limit = 4) {
  const list = works(includePrivate);
  const featured = list.filter((w) => w.featured);
  const rest = list.filter((w) => !w.featured);
  return [...featured, ...rest].slice(0, limit);
}

export function workBySlug(slug, includePrivate = false) {
  const r = db.prepare('SELECT * FROM works WHERE slug = ?').get(slug);
  if (!r) return null;
  if (r.visibility !== 'public' && !includePrivate) return null;
  return workRow(r);
}

export function workById(id) {
  return workRow(db.prepare('SELECT * FROM works WHERE id = ?').get(id));
}

export function hobbies(includePrivate = false) {
  const sql = `SELECT * FROM hobbies ${includePrivate ? '' : "WHERE visibility = 'public'"} ORDER BY sort_order ASC, name ASC`;
  return db.prepare(sql).all();
}

export function hobbyById(id) {
  return db.prepare('SELECT * FROM hobbies WHERE id = ?').get(id) || null;
}

export function eventsByDay(day, domain = null, includePrivate = false) {
  const args = [day];
  let sql = `SELECT * FROM events WHERE day = ?`;
  if (!includePrivate) sql += " AND visibility = 'public'";
  if (domain) { sql += ' AND domain = ?'; args.push(domain); }
  sql += ' ORDER BY pinned DESC, published_at DESC';
  return db.prepare(sql).all(...args);
}

export function latestEvents(includePrivate = false, limit = 40) {
  const sql = `SELECT * FROM events ${includePrivate ? '' : "WHERE visibility = 'public'"} ORDER BY published_at DESC LIMIT ?`;
  return db.prepare(sql).all(limit);
}

export function latestPerDomain(sinceDay, includePrivate = false) {
  const out = {};
  for (const row of db.prepare(
    `SELECT * FROM events WHERE day >= ? ${includePrivate ? '' : "AND visibility = 'public'"} ORDER BY published_at DESC`
  ).all(sinceDay)) {
    if (!out[row.domain]) out[row.domain] = row;
  }
  return out;
}

export function eventDays(limit = 7, includePrivate = false) {
  return db.prepare(
    `SELECT day, COUNT(*) AS n FROM events ${includePrivate ? '' : "WHERE visibility = 'public'"} GROUP BY day ORDER BY day DESC LIMIT ?`
  ).all(limit);
}

export function eventsAll(limit = 60) {
  return db.prepare('SELECT * FROM events ORDER BY published_at DESC LIMIT ?').all(limit);
}

export function sourcesAll() {
  return db.prepare('SELECT * FROM sources ORDER BY sort_order ASC, name ASC').all();
}

export function sourcesEnabled() {
  return db.prepare('SELECT * FROM sources WHERE enabled = 1 ORDER BY sort_order ASC').all();
}

export function upsertSources(list) {
  const stmt = db.prepare(`
    INSERT INTO sources(id, domain, name, feed_url, enabled, sort_order)
    VALUES(?, ?, ?, ?, 1, ?)
    ON CONFLICT(feed_url) DO UPDATE SET domain = excluded.domain, name = excluded.name, sort_order = excluded.sort_order
  `);
  for (const s of list) stmt.run(s.id, s.domain, s.name, s.feed_url, s.sort_order ?? 0);
}

export function counts(includePrivate = true) {
  const clause = includePrivate ? '' : "WHERE visibility = 'public'";
  const w = db.prepare(`SELECT COUNT(*) AS n FROM works ${clause}`).get().n;
  const h = db.prepare(`SELECT COUNT(*) AS n FROM hobbies ${clause}`).get().n;
  const e = db.prepare(`SELECT COUNT(*) AS n FROM events ${clause}`).get().n;
  const n = db.prepare(`SELECT COUNT(*) AS n FROM notes ${clause}`).get().n;
  return { works: Number(w), hobbies: Number(h), events: Number(e), notes: Number(n) };
}

export function notes(includePrivate = false, tag = '') {
  const rows = db.prepare(
    `SELECT * FROM notes ${includePrivate ? '' : "WHERE visibility = 'public'"} ORDER BY created_at DESC`
  ).all().map((row) => ({ ...row, tags: parseJson(row.tags, []) }));
  if (!tag) return rows;
  return rows.filter((row) => row.tags.includes(tag));
}

export function noteBySlug(slug, includePrivate = false) {
  const row = db.prepare('SELECT * FROM notes WHERE slug = ?').get(slug);
  if (!row) return null;
  if (row.visibility !== 'public' && !includePrivate) return null;
  return { ...row, tags: parseJson(row.tags, []) };
}

export function noteTags(limit = 5) {
  const counts = new Map();
  for (const row of db.prepare("SELECT tags FROM notes WHERE visibility = 'public'").all()) {
    for (const tag of parseJson(row.tags, [])) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag]) => tag);
}

export function newId(prefix) {
  return `${prefix}_${nowIso().replace(/[-:.TZ]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ---------- 爱好：游戏 ---------- */

export function games(includeAll = false) {
  const rows = includeAll
    ? db.prepare(`SELECT * FROM games ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, playtime_minutes DESC, name`).all()
    : db.prepare("SELECT * FROM games WHERE status = 'approved' ORDER BY playtime_minutes DESC, name").all();
  return rows.map((row) => ({ ...row, playtime_minutes: Number(row.playtime_minutes) }));
}

export function gameById(id) {
  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(id);
  return row ? { ...row, playtime_minutes: Number(row.playtime_minutes) } : null;
}

export function gameStats() {
  const rows = db.prepare('SELECT status, COUNT(*) AS n FROM games GROUP BY status').all();
  const out = { pending: 0, approved: 0, hidden: 0, total: 0 };
  for (const row of rows) {
    out[row.status] = Number(row.n);
    out.total += Number(row.n);
  }
  return out;
}

export function upsertGame(game) {
  const existing = db.prepare('SELECT id FROM games WHERE source = ? AND external_id = ?').get(game.source, game.external_id);
  const stamp = nowIso();
  if (existing) {
    db.prepare(`UPDATE games SET name = ?, cover = ?, playtime_minutes = ?, last_played_at = ?,
      store_url = ?, synced_at = ? WHERE id = ?`)
      .run(game.name, game.cover || '', game.playtime_minutes || 0, game.last_played_at || null, game.store_url || '', stamp, existing.id);
    return { status: 'updated', id: existing.id };
  }
  const id = newId('game');
  db.prepare(`INSERT INTO games (id, source, external_id, name, cover, playtime_minutes, last_played_at, store_url, status, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
    .run(id, game.source, game.external_id, game.name, game.cover || '', game.playtime_minutes || 0, game.last_played_at || null, game.store_url || '', stamp);
  return { status: 'added', id };
}

export function setGameStatus(id, status) {
  if (!['pending', 'approved', 'hidden'].includes(status)) return;
  db.prepare('UPDATE games SET status = ?, approved_at = ? WHERE id = ?')
    .run(status, status === 'approved' ? nowIso() : null, id);
}

export function deleteGame(id) {
  db.prepare('DELETE FROM games WHERE id = ?').run(id);
}

/* ---------- 爱好：动漫 ---------- */

export function animeSources() {
  return db.prepare('SELECT * FROM anime_sources ORDER BY sort_order, platform').all();
}

export function upsertAnimeSources(list) {
  const stmt = db.prepare(`INSERT INTO anime_sources (id, platform, name, url, mode, enabled, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(platform) DO UPDATE SET name = excluded.name, url = excluded.url, mode = excluded.mode,
      sort_order = excluded.sort_order`);
  for (const source of list) {
    stmt.run(newId('asrc'), source.platform, source.name, source.url, source.mode || 'link', source.enabled === false ? 0 : 1, source.sort_order || 0);
  }
}

export function touchAnimeSource(platform, ok, error = '') {
  if (ok) {
    db.prepare('UPDATE anime_sources SET last_ok_at = ?, last_error = NULL WHERE platform = ?').run(nowIso(), platform);
  } else {
    db.prepare('UPDATE anime_sources SET last_error = ? WHERE platform = ?').run(String(error).slice(0, 200), platform);
  }
}

export function animeItems(platform = null, limit = 80) {
  const rows = platform
    ? db.prepare('SELECT * FROM anime_items WHERE platform = ? ORDER BY COALESCE(published_at, fetched_at) DESC LIMIT ?').all(platform, limit)
    : db.prepare('SELECT * FROM anime_items ORDER BY COALESCE(published_at, fetched_at) DESC LIMIT ?').all(limit);
  return rows;
}

export function upsertAnimeItem(item) {
  const result = db.prepare(`INSERT INTO anime_items (id, platform, external_id, title, url, cover, summary, published_at, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(platform, external_id) DO UPDATE SET title = excluded.title, url = excluded.url,
      cover = excluded.cover, summary = excluded.summary, published_at = excluded.published_at`)
    .run(newId('anime'), item.platform, item.external_id, item.title, item.url, item.cover || '', item.summary || '', item.published_at || null, nowIso());
  return Number(result.changes) > 0;
}

/* ---------- 爱好：唱歌 ---------- */

export function artists() {
  return db.prepare('SELECT * FROM artists ORDER BY sort_order, name').all();
}

export function songsAll() {
  return db.prepare('SELECT * FROM songs ORDER BY sort_order, artist, title').all()
    .map((row) => ({ ...row, links: parseJson(row.links, []) }));
}

export function songsByArtist() {
  const map = new Map();
  for (const song of songsAll()) {
    if (!map.has(song.artist)) map.set(song.artist, []);
    map.get(song.artist).push(song);
  }
  return map;
}

export { nowIso };
export const dbPath = path.join(DATA_DIR, 'app.db');