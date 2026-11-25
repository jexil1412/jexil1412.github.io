// 一键发布到 GitHub Pages
//   预演：node deploy-pages.mjs --dry-run
//   发布：GITHUB_TOKEN=ghp_xxx node deploy-pages.mjs [repo-name]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('./dist/', import.meta.url));
const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DRY = process.argv.includes('--dry-run');
const REPO = ARGS[0] || 'earth-view';
const API = 'https://api.github.com';
const TOKEN = process.env.GITHUB_TOKEN;

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

// ---------- 预演：不需要 token ----------
const files = walk(DIST).map((f) => ({
  abs: f,
  rel: relative(DIST, f).split('\\').join('/'),
  bytes: statSync(f).size,
}));
const total = files.reduce((s, f) => s + f.bytes, 0);

if (DRY) {
  console.log(`dist: ${DIST}`);
  console.log(`目标仓库: ${REPO}`);
  console.log(`待上传 ${files.length} 个文件，共 ${(total / 1048576).toFixed(2)} MB\n`);
  for (const f of files) console.log(`  ${f.rel.padEnd(24)} ${(f.bytes / 1024).toFixed(0).padStart(6)} KB`);
  const big = files.filter((f) => f.bytes > 1048576);
  if (big.length) console.log('\n注意：>1 MB 的文件走 Contents API 也没问题（base64 后单文件上限 100 MB）');
  console.log('\n预演结束，未发送任何网络请求。');
  process.exit(0);
}

if (!TOKEN) {
  console.error('缺少 GITHUB_TOKEN。用法：GITHUB_TOKEN=ghp_xxx node deploy-pages.mjs [repo-name]');
  process.exit(1);
}

const gh = async (method, path, body) => {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'dsh-deploy',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) {
    const msg = json && typeof json === 'object' ? json.message || '' : String(json).slice(0, 200);
    const err = new Error(`${method} ${path} -> ${res.status} ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json;
};

const hint = (e) => {
  if (e.status === 401) return 'token 无效或已过期（重新生成 classic token，勾 repo）';
  if (e.status === 403) return '权限不足或触发限流（classic token 必须勾 repo；fine-grained 需要 Contents+Pages+Administration 读写）';
  if (e.status === 404) return '资源不存在（也可能是 token 没有该仓库权限）';
  return '';
};

const main = async () => {
  const me = await gh('GET', '/user');
  const owner = me.login;
  console.log(`账号：${owner}`);
  console.log(`文件：${files.length} 个，共 ${(total / 1048576).toFixed(2)} MB`);

  // 1. 仓库
  let branch = 'main';
  let repo = null;
  try {
    repo = await gh('GET', `/repos/${owner}/${REPO}`);
    console.log(`仓库已存在：${owner}/${REPO}`);
  } catch (e) {
    if (e.status !== 404) throw e;
    repo = await gh('POST', '/user/repos', {
      name: REPO,
      private: false,
      has_issues: false,
      has_wiki: false,
      has_projects: false,
      auto_init: true, // 关键：让仓库先有一个 commit，否则 contents 写入分支会 422
      description: 'WebGL2 实时地球：真实贴图 + 单次散射大气 + 真实 UTC 太阳方位',
    });
    console.log(`已创建公开仓库：${owner}/${REPO}`);
  }
  if (repo && repo.default_branch) branch = repo.default_branch;
  console.log(`分支：${branch}`);

  // 2. 上传（逐个文件走 Contents API）
  let done = 0;
  for (const f of files) {
    const data = readFileSync(f.abs).toString('base64');
    let sha;
    try {
      const cur = await gh('GET', `/repos/${owner}/${REPO}/contents/${f.rel}?ref=${branch}`);
      sha = cur.sha;
    } catch { /* 新文件 */ }
    await gh('PUT', `/repos/${owner}/${REPO}/contents/${f.rel}`, {
      message: `${sha ? 'update' : 'add'} ${f.rel}`,
      content: data,
      ...(sha ? { sha } : {}),
      branch,
    });
    done++;
    console.log(`  [${String(done).padStart(2)}/${files.length}] ${f.rel} (${(f.bytes / 1024).toFixed(0)} KB)`);
  }

  // 3. 开启 Pages
  const src = { source: { branch, path: '/' } };
  try {
    await gh('POST', `/repos/${owner}/${REPO}/pages`, src);
    console.log('已开启 GitHub Pages');
  } catch (e) {
    if (e.status === 409) {
      await gh('PUT', `/repos/${owner}/${REPO}/pages`, src);
      console.log('Pages 已存在，已更新源');
    } else if (e.status === 422) {
      console.log('Pages 返回 422（通常表示已开启/构建中），继续等待');
    } else throw e;
  }

  // 4. 等构建
  const fallback = `https://${owner.toLowerCase()}.github.io/${REPO}/`;
  let url = fallback;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    try {
      const p = await gh('GET', `/repos/${owner}/${REPO}/pages`);
      if (p.html_url) url = p.html_url.endsWith('/') ? p.html_url : p.html_url + '/';
      console.log(`  构建状态：${p.status || '排队中'}  (${(i + 1) * 6}s)`);
      if (p.status === 'built') break;
      if (p.status === 'errored') { console.log('  构建报错，看仓库 Actions/Pages 日志'); break; }
    } catch (e) { console.log('  查询状态失败：' + e.message); }
  }

  // 5. 真访问一次
  await new Promise((r) => setTimeout(r, 4000));
  try {
    const res = await fetch(url + '?cb=' + Date.now(), { headers: { 'Cache-Control': 'no-cache' } });
    const html = await res.text();
    const ok = res.ok && /<canvas|WebGL/i.test(html);
    console.log(`\n线上自检：HTTP ${res.status}，页面内容${ok ? '正常' : '可能还没生效'}`);
  } catch (e) { console.log(`\n线上自检失败：${e.message}`); }

  console.log(`\n访问地址：${url}`);
};

main().catch((e) => {
  const h = hint(e);
  console.error(`发布失败：${e.message}${h ? `\n  → ${h}` : ''}`);
  process.exit(1);
});
