// 给歌曲补 30 秒官方试听地址（iTunes Search API），只存 URL，不下载音频。
import { db } from '../lib/db.mjs';

const rows = db.prepare("SELECT id, artist, title FROM songs WHERE preview_url = '' ORDER BY sort_order").all();
console.log('missing previews:', rows.length);
let found = 0;
let missed = 0;

for (const row of rows) {
  const term = `${row.title} ${row.artist}`;
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=3&country=us`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const data = await response.json();
    const candidates = Array.isArray(data.results) ? data.results : [];
    const hit = candidates.find((item) => item.previewUrl && item.artistName && item.trackName) || null;
    if (hit) {
      db.prepare('UPDATE songs SET preview_url = ? WHERE id = ?').run(hit.previewUrl, row.id);
      found += 1;
      console.log('ok', row.artist, row.title, '→', hit.trackName);
    } else {
      missed += 1;
      console.log('miss', row.artist, row.title);
    }
  } catch (error) {
    missed += 1;
    console.log('err', row.artist, row.title, error.message);
  }
  await new Promise((resolve) => setTimeout(resolve, 350));
}

console.log({ found, missed });
process.exit(0);