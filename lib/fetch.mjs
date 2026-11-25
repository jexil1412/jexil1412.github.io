import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR, nowIso, setSetting } from './db.mjs';
import { cleanText, shDay, addDays } from './util.mjs';

const UA = 'Jexil1412Bot/1.0 (+http://localhost:3000)';
const TIMEOUT_MS = 15000;
const WINDOW_DAYS = 7;
const MAX_PER_DOMAIN_DAY = 6;
const KEEP_DAYS = 60;

function log(line) {
  fs.appendFileSync(path.join(DATA_DIR, 'fetch.log'), `${new Date().toISOString()} ${line}\n`);
}

function pick(block, re) {
  const m = block.match(re);
  return m ? m[1] : '';
}

export function canonicalUrl(raw) {
  try {
    const u = new URL(String(raw).trim());
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_.+|ref|fbclid|gclid)$/i.test(key)) u.searchParams.delete(key);
    }
    u.hostname = u.hostname.toLowerCase();
    return u.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function firstLink(block) {
  const text = cleanText(pick(block, /<link[^>]*>([\s\S]*?)<\/link>/i)).trim();
  if (text) return text;
  const href = pick(block, /<link[^>]*href=["']([^"']+)["']/i).trim();
  return href;
}

function firstDate(block) {
  const raw = cleanText(
    pick(block, /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
    pick(block, /<published[^>]*>([\s\S]*?)<\/published>/i) ||
    pick(block, /<updated[^>]*>([\s\S]*?)<\/updated>/i) ||
    pick(block, /<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i)
  ).trim();
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

function firstSummary(block) {
  for (const tag of ['description', 'summary', 'content:encoded', 'content']) {
    const raw = pick(block, new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    let text = cleanText(raw, 120);
    // Hacker News 的 description 只有链接和分数，没有摘要
    if (/^(Article URL|Comments URL|Points:|# Comments)/i.test(text)) text = '';
    if (text) return text;
  }
  return '';
}

export function parseFeed(xml) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  const items = [];
  for (const block of blocks) {
    const title = cleanText(pick(block, /<title[^>]*>([\s\S]*?)<\/title>/i), 120);
    const link = firstLink(block);
    if (!title || !link) continue;
    const canonical = canonicalUrl(link);
    if (!canonical) continue;
    const published = firstDate(block) || new Date();
    items.push({
      title,
      link: canonical,
      summary: firstSummary(block),
      published
    });
  }
  return items;
}

const insertEvent = db.prepare(`
  INSERT OR IGNORE INTO events
    (id, domain, title, summary, source_name, source_url, url_hash, published_at, fetched_at, day, visibility, pinned, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'public', 0, ?)
`);

const touchOk = db.prepare('UPDATE sources SET last_ok_at = ?, last_error = NULL WHERE id = ?');
const touchError = db.prepare('UPDATE sources SET last_error = ?, last_error_at = ? WHERE id = ?');

export async function fetchSource(source) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(source.feed_url, {
      headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml, */*' },
      redirect: 'follow',
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = parseFeed(xml);
    const now = nowIso();
    const cutoff = Date.now() - WINDOW_DAYS * 86400 * 1000;
    let inserted = 0;
    const countDomain = db.prepare('SELECT COUNT(*) AS n FROM events WHERE day = ? AND domain = ?');
    const countSource = db.prepare('SELECT COUNT(*) AS n FROM events WHERE day = ? AND domain = ? AND source_name = ?');
    for (const item of items) {
      if (item.published.getTime() < cutoff) continue;
      const day = shDay(item.published);
      if (countDomain.get(day, source.domain).n >= MAX_PER_DOMAIN_DAY) continue;
      if (countSource.get(day, source.domain, source.name).n >= 3) continue;
      const result = insertEvent.run(
        crypto.randomUUID(), source.domain, item.title, item.summary, source.name,
        item.link, sha256(item.link), item.published.toISOString(), now, day, now
      );
      if (result.changes > 0) inserted += 1;
    }
    touchOk.run(now, source.id);
    log(`ok source=${source.id} items=${items.length} inserted=${inserted}`);
    return { ok: true, inserted };
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'timeout' : String(error.message || error);
    touchError.run(message, nowIso(), source.id);
    log(`FAIL source=${source.id} error=${message}`);
    return { ok: false, error: message, inserted: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export async function runFetch() {
  const sources = db.prepare('SELECT * FROM sources WHERE enabled = 1 ORDER BY sort_order ASC').all();
  const errors = [];
  let inserted = 0;
  let ok = 0;
  for (const source of sources) {
    const result = await fetchSource(source);
    if (result.ok) ok += 1; else errors.push(`${source.name}: ${result.error}`);
    inserted += result.inserted;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  db.prepare(`DELETE FROM events WHERE pinned = 0 AND day < ?`).run(addDays(shDay(), -KEEP_DAYS));
  const finished = nowIso();
  setSetting('last_fetch_at', finished);
  setSetting('last_fetch_ok', String(ok));
  setSetting('last_fetch_total', String(sources.length));
  setSetting('last_fetch_inserted', String(inserted));
  log(`run sources=${ok}/${sources.length} inserted=${inserted}`);
  return { ok: ok === sources.length, sources: { ok, total: sources.length }, inserted, errors };
}