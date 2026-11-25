// 检查 dist 里的站内链接与资源是否都存在
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('dist');
const BASE = (process.env.BASE_PATH || '/').replace(/\/+$/, '');
const bad = [];
const seen = new Set();

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function exists(urlPath) {
  let clean = urlPath.split('#')[0].split('?')[0];
  if (BASE && clean.startsWith(BASE + '/')) clean = clean.slice(BASE.length);
  const file = path.join(ROOT, decodeURIComponent(clean));
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return true;
  if (fs.existsSync(path.join(file, 'index.html'))) return true;
  return false;
}

for (const file of walk(ROOT).filter((f) => f.endsWith('.html'))) {
  const html = fs.readFileSync(file, 'utf8');
  for (const match of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
    const url = match[1];
    if (url.startsWith('//')) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    if (!exists(url)) bad.push(`${path.relative(ROOT, file)} → ${url}`);
  }
}

console.log(`checked ${seen.size} unique internal URLs`);
if (bad.length) {
  console.log(bad.slice(0, 30).join('\n'));
  process.exit(1);
}
console.log('all internal links resolve');