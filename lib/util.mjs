export const TZ = 'Asia/Shanghai';

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function stripTags(html) {
  return decodeEntities(String(html ?? '').replace(/<[^>]*>/g, ' '));
}

export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;|&lsquo;/g, '’')
    .replace(/&ldquo;|&rdquo;/g, '“');
}

export function cleanText(value, max = 0) {
  let s = stripTags(stripTags(decodeEntities(decodeEntities(value)))).replace(/\s+/g, ' ').trim();
  if (max && [...s].length > max) s = [...s].slice(0, max).join('') + '…';
  return s;
}

export function shDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(day, delta) {
  const d = new Date(`${day}T00:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + delta);
  return shDay(d);
}

export function fmtDay(day) {
  if (!day) return '';
  const [y, m, d] = String(day).split('-');
  return `${y}-${m}-${d}`;
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = new Intl.DateTimeFormat('zh-CN', {
    timeZone: TZ, month: '2-digit', day: '2-digit'
  }).format(d);
  const time = new Intl.DateTimeFormat('zh-CN', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(d);
  return `${date.replace('/', '-')} ${time}`;
}

export function fmtFullDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: TZ, year: 'numeric', month: 'long', day: 'numeric'
  }).format(d);
}

export function weekday(day) {
  const d = new Date(`${day}T12:00:00+08:00`);
  return new Intl.DateTimeFormat('zh-CN', { timeZone: TZ, weekday: 'long' }).format(d);
}

export function kindLabel(kind) {
  return { app: 'App', web: '网页', other: '其他' }[kind] || kind;
}

export function domainLabel(key) {
  return { ai: 'AI', music: '音乐', anime: '动漫', game: '游戏' }[key] || key;
}

export function srcset(path) {
  if (!path) return '';
  return path.replace(/-1600\.(jpg|jpeg|png|webp)$/i, '-800.$1');
}

export function paragraphs(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function pct(n) {
  return Math.max(0, Math.min(100, Number(n) || 0));
}

export function hostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}