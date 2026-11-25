import { animeSources, upsertAnimeItem, touchAnimeSource } from './db.mjs';

const TIMEOUT = 15000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function clean(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// B 站公开的番剧索引（season index），只取标题/封面/简介/链接。
async function fetchBilibili() {
  const url = 'https://api.bilibili.com/pgc/season/index/result?season_type=1&st=1&sort=0&page=1&pagesize=30&type=1&area=-1&year=-1&is_finish=-1&copyright=-1';
  const response = await fetch(url, {
    headers: { 'user-agent': UA, referer: 'https://www.bilibili.com/' },
    signal: AbortSignal.timeout(TIMEOUT)
  });
  if (!response.ok) throw new Error(`B 站接口返回 ${response.status}`);
  const data = await response.json().catch(() => ({}));
  if (data.code !== 0) throw new Error(`B 站接口 ${data.code} ${data.message || ''}`.trim());
  const list = data?.data?.list;
  if (!Array.isArray(list)) throw new Error('B 站接口没有返回列表');
  return list.slice(0, 30).map((item) => {
    const summary = [item.subTitle, item.index_show, item.score ? `${item.score} 分` : '']
      .filter(Boolean).join(' · ');
    return {
      platform: 'bilibili',
      external_id: String(item.season_id || item.media_id || item.title).slice(0, 80),
      title: clean(item.title, 160),
      url: item.link || 'https://www.bilibili.com/anime/',
      cover: String(item.cover || '').replace(/^http:/, 'https:'),
      summary: clean(summary, 120),
      published_at: null
    };
  }).filter((item) => item.title);
}

export async function refreshAnime() {
  const sources = animeSources().filter((source) => source.enabled);
  const results = [];
  for (const source of sources) {
    if (source.mode !== 'api') {
      results.push({ platform: source.platform, name: source.name, mode: 'link', skipped: true });
      continue;
    }
    try {
      const items = await fetchBilibili();
      let count = 0;
      for (const item of items) {
        if (upsertAnimeItem(item)) count += 1;
      }
      touchAnimeSource(source.platform, true);
      results.push({ platform: source.platform, name: source.name, count });
    } catch (error) {
      touchAnimeSource(source.platform, false, error.message);
      results.push({ platform: source.platform, name: source.name, error: error.message });
    }
  }
  return results;
}