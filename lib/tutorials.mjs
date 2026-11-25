// 教程：直接读取 content/tutorials/*.md，不依赖数据库。
// 新增一个 .md 文件即多一篇教程；构建静态站时会生成 /tutorials/<slug>/。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from './markdown.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TUTORIAL_DIR = path.join(ROOT, 'content', 'tutorials');

function readOne(file) {
  const raw = fs.readFileSync(path.join(TUTORIAL_DIR, file), 'utf8');
  const { data, body } = parseFrontmatter(raw);
  const slug = file.replace(/\.md$/i, '').toLowerCase();
  const tags = String(data.tags || '')
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  return {
    slug,
    title: String(data.title || slug),
    summary: String(data.summary || ''),
    date: String(data.date || ''),
    tags,
    body,
    raw
  };
}

export function listTutorials() {
  if (!fs.existsSync(TUTORIAL_DIR)) return [];
  return fs
    .readdirSync(TUTORIAL_DIR)
    .filter((file) => file.toLowerCase().endsWith('.md'))
    .map(readOne)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.title.localeCompare(b.title, 'zh-CN'));
}

export function tutorialBySlug(slug) {
  return listTutorials().find((item) => item.slug === slug) || null;
}