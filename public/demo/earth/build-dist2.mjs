// 把根目录的 js/ + index.html 组装成 dist2/，并把贴图清单改写成 dist 的轻量命名
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'D:\\01\\starry\\earth';
const DIST = join(ROOT, 'dist2');
mkdirSync(join(DIST, 'js'), { recursive: true });

const DIST_TEX = `const TEX = [
  ['uDay', 'assets/day.jpg', 0, 0],
  ['uClouds', 'assets/clouds.jpg', 1, 1],
  ['uLights', 'assets/lights.jpg', 2, 0],
  ['uSpec', 'assets/spec.jpg', 3, 0],
  ['uNorm', 'assets/normal.jpg', 4, 0],
  ['uMoon', 'assets/moon.jpg', 5, 0],
];`;

let main = readFileSync(join(ROOT, 'js', 'main.js'), 'utf8');
const before = main;
main = main.replace(/const TEX = \[[\s\S]*?\];/, DIST_TEX);
if (main === before) throw new Error('TEX 数组没匹配到，别强行继续');
writeFileSync(join(DIST, 'js', 'main.js'), main, 'utf8');

copyFileSync(join(ROOT, 'js', 'shaders.js'), join(DIST, 'js', 'shaders.js'));
copyFileSync(join(ROOT, 'index.html'), join(DIST, 'index.html'));

const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
let total = 0;
for (const f of walk(DIST)) {
  const rel = f.slice(DIST.length + 1).split('\\').join('/');
  if (rel.startsWith('assets')) continue;
  const sz = statSync(f).size; total += sz;
  console.log(`  ${rel.padEnd(16)} ${(sz / 1024).toFixed(0).padStart(5)} KB`);
}
console.log('代码文件合计', (total / 1024).toFixed(0), 'KB');
