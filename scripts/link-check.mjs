// 站内链接与图片可达性检查
const base = 'http://127.0.0.1:3000';
const pages = ['/', '/about', '/about/works/earth', '/about/works/eye', '/about/works/mandarin-app', '/today', '/hobbies', '/hobbies/game', '/hobbies/anime', '/hobbies/music', '/notes', '/notes/how-this-site-was-built', '/tutorials', '/tutorials/how-to-add-tutorial', '/login'];
const seen = new Set();
const bad = [];

function collect(html, page) {
  for (const m of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
    const raw = m[1];
    if (raw.startsWith('//') || raw.startsWith('/uploads') || raw.startsWith('/demo')) {
      // 图片和 demo 也检查，但 demo 的 index 用目录形式
      seen.add(raw);
    } else {
      seen.add(raw.split('#')[0]);
    }
  }
}

for (const page of pages) {
  const res = await fetch(base + page);
  if (!res.ok) bad.push(`${page} → ${res.status}`);
  const html = await res.text();
  collect(html, page);
}

for (const path of [...seen].sort()) {
  const target = path.startsWith('/demo') ? path.replace(/\/?$/, '/') : path;
  const res = await fetch(base + target, { redirect: 'follow' });
  if (!res.ok) bad.push(`${target} → ${res.status}`);
}

console.log(`检查 ${pages.length} 个页面 / ${seen.size} 个站内链接`);
console.log(bad.length ? bad.join('\n') : '全部可达');
process.exit(bad.length ? 1 : 0);