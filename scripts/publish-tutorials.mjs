// 把 content/tutorials 下的新增/修改推送到 GitHub，Actions 会自动重建并发布教程页。
// 用法：node scripts/publish-tutorials.mjs [--watch]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'content', 'tutorials');
const WATCH = process.argv.includes('--watch');

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function publish() {
  if (!fs.existsSync(DIR)) {
    console.log('没有 content/tutorials/ 目录，跳过。');
    return;
  }
  const status = git(['status', '--porcelain', '--', 'content/tutorials']);
  if (!status.trim()) {
    console.log('教程没有变化，不需要推送。');
    return;
  }
  const files = status
    .split('\n')
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
  git(['add', '--', 'content/tutorials']);
  git(['commit', '-m', `tutorials: ${files.join(', ')}`]);
  git(['push', 'origin', 'main']);
  console.log(`已推送 ${files.length} 个教程文件；GitHub Actions 会自动重新发布。`);
}

publish();

if (WATCH) {
  console.log(`监听 ${DIR}，新增/修改 .md 后自动推送（Ctrl+C 停止）。`);
  let timer = null;
  fs.watch(DIR, { recursive: true }, (_event, filename) => {
    if (!filename || !String(filename).toLowerCase().endsWith('.md')) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        publish();
      } catch (error) {
        console.error('推送失败：', error.message);
      }
    }, 1500);
  });
}