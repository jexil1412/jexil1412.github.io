import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { upsertGame, ROOT } from './db.mjs';

const CACHE_FILE = path.join(ROOT, 'data', 'steam-names.json');
const ACCOUNT_OFFSET = 76561197960265728n;

function tokenize(text) {
  const tokens = [];
  for (let i = 0; i < text.length;) {
    const ch = text[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === '{' || ch === '}') { tokens.push(ch); i += 1; continue; }
    if (ch === '"') {
      let value = '';
      i += 1;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length) { value += text[i + 1]; i += 2; continue; }
        value += text[i];
        i += 1;
      }
      i += 1;
      tokens.push(value);
      continue;
    }
    let value = '';
    while (i < text.length && !/[\s{}"]/.test(text[i])) { value += text[i]; i += 1; }
    tokens.push(value);
  }
  return tokens;
}

function parseVdf(text) {
  const tokens = tokenize(text);
  let i = 0;
  const parseObject = () => {
    const obj = {};
    while (i < tokens.length) {
      const key = tokens[i++];
      if (key === '}') return obj;
      if (tokens[i] === '{') {
        i += 1;
        obj[key] = parseObject();
      } else {
        obj[key] = tokens[i++] ?? '';
      }
    }
    return obj;
  };
  const root = parseObject();
  return root;
}

function findApps(node) {
  if (!node || typeof node !== 'object') return null;
  for (const key of Object.keys(node)) {
    if (key === 'apps' && node[key] && typeof node[key] === 'object') {
      const values = Object.values(node[key]);
      if (values.some((v) => v && typeof v === 'object' && ('Playtime' in v || 'LastPlayed' in v))) return node[key];
    }
  }
  for (const value of Object.values(node)) {
    const found = findApps(value);
    if (found) return found;
  }
  return null;
}

function steamPathFromRegistry() {
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { encoding: 'utf8' });
    const match = /SteamPath\s+REG_SZ\s+(.+)$/m.exec(out);
    if (match) return match[1].trim().replace(/\//g, '\\');
  } catch { /* ignore */ }
  return '';
}

function detectPaths() {
  const candidates = [
    steamPathFromRegistry(),
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    'D:\\Steam',
    'D:\\steam'
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'config', 'loginusers.vdf'))) return dir;
  }
  return '';
}

function readLoginUsers(steamDir) {
  const file = path.join(steamDir, 'config', 'loginusers.vdf');
  const tree = parseVdf(fs.readFileSync(file, 'utf8'));
  const users = tree?.users || {};
  const list = Object.entries(users).filter(([id]) => /^\d{17}$/.test(id)).map(([id, data]) => ({
    steamId: id,
    persona: String(data.PersonaName || ''),
    mostRecent: String(data.MostRecent || '0') === '1'
  }));
  list.sort((a, b) => Number(b.mostRecent) - Number(a.mostRecent));
  return list;
}

function readManifests(steamDir) {
  const names = new Map();
  const appsDir = path.join(steamDir, 'steamapps');
  if (!fs.existsSync(appsDir)) return names;
  for (const file of fs.readdirSync(appsDir)) {
    if (!/^appmanifest_\d+\.acf$/.test(file)) continue;
    const text = fs.readFileSync(path.join(appsDir, file), 'utf8');
    const appid = /"appid"\s+"(\d+)"/.exec(text)?.[1];
    const name = /"name"\s+"([^"]+)"/.exec(text)?.[1];
    if (appid && name) names.set(appid, name);
  }
  return names;
}

function loadNameCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return {}; }
}

function saveNameCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

async function storeName(appid) {
  // Steam 商店的证书链在 Node 默认 CA 里可能缺中间证书；这里只取公开标题，
  // 对这一个 host 放宽校验，避免同步因为 TLS 失败而中断。
  return new Promise((resolve) => {
    const req = https.request({
      host: 'store.steampowered.com',
      path: `/api/appdetails?appids=${appid}&filters=basic&l=schinese`,
      method: 'GET',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        accept: 'application/json'
      },
      rejectUnauthorized: false,
      timeout: 10000
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve(data?.[appid]?.data?.name || '');
        } catch {
          resolve('');
        }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(''); });
    req.on('error', () => resolve(''));
    req.end();
  });
}

export function detectSteam() {
  const steamDir = detectPaths();
  if (!steamDir) return { found: false, error: '没有找到本机 Steam 安装目录' };
  let users = [];
  try { users = readLoginUsers(steamDir); } catch (error) {
    return { found: false, error: `读取 Steam 账号失败：${error.message}` };
  }
  const user = users[0];
  if (!user) return { found: false, error: '本机 Steam 没有登录记录' };
  const accountId = (BigInt(user.steamId) - ACCOUNT_OFFSET).toString();
  const localconfig = path.join(steamDir, 'userdata', accountId, 'config', 'localconfig.vdf');
  return {
    found: true,
    steamDir,
    steamId: user.steamId,
    accountId,
    persona: user.persona,
    localconfig,
    hasLocalConfig: fs.existsSync(localconfig)
  };
}

export async function syncSteamLocal() {
  const info = detectSteam();
  if (!info.found) {
    const error = new Error(info.error);
    error.code = 'NOT_CONFIGURED';
    throw error;
  }
  if (!info.hasLocalConfig) {
    const error = new Error('没有找到 Steam 本地游戏记录（先登录一次 Steam 客户端）');
    error.code = 'NOT_CONFIGURED';
    throw error;
  }
  const tree = parseVdf(fs.readFileSync(info.localconfig, 'utf8'));
  const apps = findApps(tree);
  if (!apps) {
    const error = new Error('Steam 本地配置里没有游戏记录');
    error.code = 'NOT_CONFIGURED';
    throw error;
  }
  const manifestNames = readManifests(info.steamDir);
  const cache = loadNameCache();
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const [appid, data] of Object.entries(apps)) {
    if (!/^\d+$/.test(appid)) continue;
    const playtime = Number(data.Playtime || 0);
    if (!playtime) { skipped += 1; continue; }
    let name = manifestNames.get(appid) || cache[appid] || '';
    if (!name) {
      name = await storeName(appid);
      if (name) { cache[appid] = name; await new Promise((resolve) => setTimeout(resolve, 400)); }
    }
    if (!name) { skipped += 1; continue; }
    const last = Number(data.LastPlayed || 0);
    const result = upsertGame({
      source: 'steam',
      external_id: appid,
      name,
      cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
      playtime_minutes: playtime,
      last_played_at: last ? new Date(last * 1000).toISOString() : null,
      store_url: `https://store.steampowered.com/app/${appid}/`
    });
    if (result.status === 'added') added += 1; else updated += 1;
  }
  saveNameCache(cache);
  return {
    added,
    updated,
    skipped,
    total: added + updated,
    mode: 'local',
    steamId: info.steamId,
    persona: info.persona
  };
}