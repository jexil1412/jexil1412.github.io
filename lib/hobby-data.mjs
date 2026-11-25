import { db, newId, upsertAnimeSources } from './db.mjs';
import { ANIME_SOURCES } from '../config/anime-sources.mjs';

const ARTISTS = ['李荣浩', '王力宏', '方大同', '薛之谦', '张杰', '许嵩', '邓紫棋', '陈奕迅', '梁博'];

const SONGS = {
  李荣浩: ['模特', '李白', '年少有为', '喜剧之王', '戒烟', '麻雀'],
  王力宏: ['唯一', '大城小爱', '你不知道的事', '心中的日月', '龙的传人', '缘分一道桥'],
  方大同: ['特别的人', '三人游', '爱爱爱', '春风吹', '红豆', '危险世界'],
  薛之谦: ['演员', '丑八怪', '刚刚好', '认真的雪', '绅士', '天外来物'],
  张杰: ['逆战', '这，就是爱', '天下', '明天过后', '勿忘心安', '剑心'],
  许嵩: ['有何不可', '素颜', '断桥残雪', '庐州月', '雅俗共赏', '玫瑰花的葬礼'],
  邓紫棋: ['泡沫', '光年之外', '来自天堂的魔鬼', '句号', '倒数', '喜欢你'],
  陈奕迅: ['十年', '浮夸', '富士山下', '好久不见', 'K歌之王', '爱情转移'],
  梁博: ['男孩', '出现又离开', '日落大道', '我不知道', '给我一点温度', '不堪一击']
};

function searchLink(title, artist) {
  const query = encodeURIComponent(`${title} ${artist}`);
  return [{ name: 'QQ 音乐', url: `https://y.qq.com/n/ryqq/search?w=${query}` }];
}

// 只写元数据：歌名 / 歌手 / 合法平台搜索链接。没有音频，没有歌词。
export function ensureHobbySeed() {
  const artistStmt = db.prepare(`INSERT INTO artists (id, name, sort_order) VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET sort_order = excluded.sort_order`);
  const songStmt = db.prepare(`INSERT INTO songs (id, artist, title, album, year, links, source, sort_order)
    VALUES (?, ?, ?, '', NULL, ?, 'manual', ?)
    ON CONFLICT(artist, title) DO NOTHING`);

  ARTISTS.forEach((name, index) => {
    artistStmt.run(newId('artist'), name, index + 1);
    (SONGS[name] || []).forEach((title, songIndex) => {
      songStmt.run(newId('song'), name, title, JSON.stringify(searchLink(title, name)), index * 100 + songIndex);
    });
  });

  upsertAnimeSources(ANIME_SOURCES);
}