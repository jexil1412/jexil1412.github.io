// 从本地库导出可公开的快照，供静态构建使用。
// 不包含：待审/隐藏游戏、私密作品/笔记、设置、密码、登录态。
import fs from 'node:fs';
import { db } from '../lib/db.mjs';

const works = db.prepare("SELECT * FROM works WHERE visibility = 'public' ORDER BY sort_order, title").all();
const hobbies = db.prepare("SELECT * FROM hobbies WHERE visibility = 'public' ORDER BY sort_order").all();
const notes = db.prepare("SELECT * FROM notes WHERE visibility = 'public' ORDER BY created_at DESC").all();
const games = db.prepare("SELECT * FROM games WHERE status = 'approved' ORDER BY playtime_minutes DESC").all();
const artists = db.prepare('SELECT * FROM artists ORDER BY sort_order, name').all();
const songs = db.prepare('SELECT * FROM songs ORDER BY sort_order, artist, title').all();
const animeSources = db.prepare('SELECT * FROM anime_sources ORDER BY sort_order, platform').all();
const animeItems = db.prepare('SELECT * FROM anime_items ORDER BY COALESCE(published_at, fetched_at) DESC LIMIT 30').all();
const events = db.prepare("SELECT * FROM events WHERE visibility = 'public' ORDER BY day DESC, published_at DESC LIMIT 200").all();

const snapshot = {
  generatedAt: new Date().toISOString(),
  works,
  hobbies,
  notes,
  games,
  artists,
  songs,
  animeSources,
  animeItems,
  events
};

fs.mkdirSync('content', { recursive: true });
fs.writeFileSync('content/public-data.json', JSON.stringify(snapshot, null, 2));
console.log({
  works: works.length,
  hobbies: hobbies.length,
  notes: notes.length,
  games: games.length,
  songs: songs.length,
  anime: animeItems.length,
  events: events.length
});