// 事件源：2026-11-25 在本机网络实测可用（见 docs/content-inventory.md）
// 只放公开 RSS/Atom；不可用的源不要加回来。
export const SOURCES = [
  { id: 'hn-ai',        domain: 'ai',    name: 'Hacker News',      feed_url: 'https://hnrss.org/newest?q=AI', sort_order: 1 },
  { id: 'verge-ai',     domain: 'ai',    name: 'The Verge',        feed_url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', sort_order: 2 },
  { id: 'pitchfork',    domain: 'music', name: 'Pitchfork',        feed_url: 'https://pitchfork.com/feed/feed-news/rss', sort_order: 3 },
  { id: 'mal',          domain: 'anime', name: 'MyAnimeList',      feed_url: 'https://myanimelist.net/rss/news.xml', sort_order: 4 },
  { id: 'animecorner',  domain: 'anime', name: 'Anime Corner',     feed_url: 'https://animecorner.me/feed/', sort_order: 5 },
  { id: 'gamespot',     domain: 'game',  name: 'GameSpot',         feed_url: 'https://www.gamespot.com/feeds/mashup/', sort_order: 6 },
  { id: 'gcores',       domain: 'game',  name: '机核',             feed_url: 'https://www.gcores.com/rss', sort_order: 7 }
];

export const DOMAINS = [
  { key: 'ai', label: 'AI' },
  { key: 'music', label: '音乐' },
  { key: 'anime', label: '动漫' },
  { key: 'game', label: '游戏' }
];