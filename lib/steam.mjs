import { upsertGame } from './db.mjs';
import { detectSteam, syncSteamLocal } from './steam-local.mjs';

const TIMEOUT = 15000;

export function steamConfig() {
  const key = (process.env.STEAM_API_KEY || '').trim();
  const id = (process.env.STEAM_ID || '').trim();
  const local = detectSteam();
  return {
    configured: Boolean(key && id) || local.found,
    mode: key && id ? 'api' : local.found ? 'local' : 'none',
    hasKey: Boolean(key),
    hasId: Boolean(id),
    local
  };
}

export async function syncSteam() {
  const key = (process.env.STEAM_API_KEY || '').trim();
  const steamId = (process.env.STEAM_ID || '').trim();
  if (!key || !steamId) {
    // 没有 API key 时用本机 Steam 的只读记录（不需要账号密码）。
    const result = await syncSteamLocal();
    return { ...result, mode: 'local' };
  }
  const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/');
  url.searchParams.set('key', key);
  url.searchParams.set('steamid', steamId);
  url.searchParams.set('include_appinfo', '1');
  url.searchParams.set('include_played_free_games', '1');
  url.searchParams.set('format', 'json');

  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  } catch (error) {
    throw new Error(`Steam 请求失败：${error.message}`);
  }
  if (!response.ok) throw new Error(`Steam API 返回 ${response.status}`);
  const data = await response.json().catch(() => ({}));
  const list = data?.response?.games;
  if (!Array.isArray(list)) {
    return { added: 0, updated: 0, total: 0, private: true };
  }

  let added = 0;
  let updated = 0;
  for (const game of list) {
    const appid = Number(game.appid);
    if (!appid || !game.name) continue;
    const played = Number(game.playtime_forever || 0);
    const last = Number(game.rtime_last_played || 0);
    const result = upsertGame({
      source: 'steam',
      external_id: String(appid),
      name: String(game.name),
      cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
      playtime_minutes: played,
      last_played_at: last ? new Date(last * 1000).toISOString() : null,
      store_url: `https://store.steampowered.com/app/${appid}/`
    });
    if (result.status === 'added') added += 1; else updated += 1;
  }
  return { added, updated, total: list.length, private: false };
}

function parsePlaytime(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const n = Number(String(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function externalId(entry) {
  const raw = entry.id || entry.appName || entry.external_id || entry.name || entry.title;
  return String(raw || '').trim();
}

function normalizeEpic(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const name = String(entry.name || entry.title || '').trim();
  if (!name) return null;
  const id = externalId(entry) || name;
  return {
    source: 'epic',
    external_id: id.slice(0, 120),
    name: name.slice(0, 160),
    cover: String(entry.cover || '').slice(0, 500),
    playtime_minutes: parsePlaytime(entry.playtime_minutes ?? entry.playtime ?? entry.minutes),
    last_played_at: entry.last_played || entry.lastPlayed || null,
    store_url: String(entry.store_url || entry.url || '').slice(0, 500)
  };
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const index = (names) => names.map((n) => header.indexOf(n)).find((i) => i >= 0);
  const nameIndex = index(['name', 'title']);
  if (nameIndex < 0) throw new Error('CSV 缺少 name 列');
  const idIndex = index(['id', 'external_id', 'appname']);
  const ptIndex = index(['playtime_minutes', 'playtime', 'minutes']);
  const lastIndex = index(['last_played', 'lastplayed', 'last_played_at']);
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''));
    return {
      name: cells[nameIndex],
      id: idIndex >= 0 ? cells[idIndex] : '',
      playtime_minutes: ptIndex >= 0 ? cells[ptIndex] : 0,
      last_played: lastIndex >= 0 ? cells[lastIndex] : null
    };
  });
}

export function importEpic(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('文件是空的');
  let entries;
  if (raw.startsWith('[') || raw.startsWith('{')) {
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error('JSON 解析失败'); }
    entries = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.games) ? parsed.games : null);
    if (!entries) throw new Error('JSON 需要是数组，或 { "games": [...] }');
  } else {
    entries = parseCsv(raw);
  }
  if (entries.length > 500) throw new Error('一次最多导入 500 条');
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const entry of entries) {
    const game = normalizeEpic(entry);
    if (!game) { skipped += 1; continue; }
    const result = upsertGame(game);
    if (result.status === 'added') added += 1; else updated += 1;
  }
  return { added, updated, skipped, total: entries.length };
}