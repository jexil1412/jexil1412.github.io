// 本地验收脚本：auth / 隐私 / 上传 / 整站私密 / 抓取幂等
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../lib/db.mjs';

const base = 'http://127.0.0.1:3000';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const login = await fetch(base + '/login', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: 'password=jexil1412',
  redirect: 'manual'
});
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
check('登录成功', login.status === 303 && cookie.startsWith('sid='), `status=${login.status}`);

const H = { cookie };
const action = async (body) => {
  const res = await fetch(base + '/admin/action', {
    method: 'POST',
    headers: { ...H, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
    redirect: 'manual'
  });
  return res.status;
};

// 单条私密
await action({ entity: 'work', action: 'visibility', id: 'work_earth', value: 'private' });
const row = db.prepare('SELECT visibility FROM works WHERE slug = ?').get('earth');
const list = await (await fetch(base + '/about')).text();
const direct = await fetch(base + '/about/works/earth', { redirect: 'manual' });
check('私密作品从列表消失', !list.includes('href="/about/works/earth"') && row.visibility === 'private');
check('私密作品直链 404', direct.status === 404, `status=${direct.status}`);
await action({ entity: 'work', action: 'visibility', id: 'work_earth', value: 'public' });
const listBack = await (await fetch(base + '/about')).text();
check('恢复公开', listBack.includes('/about/works/earth'));

// 首页纯净：只有字标，没有介绍/身份
const home = await (await fetch(base + '/')).text();
const main = (home.match(/<main[\s\S]*?<\/main>/) || [''])[0];
check('首页只有字标', main.includes('class="wordmark') && !/<h1/.test(main) && !/键盘手|喜欢音乐|介绍/.test(main));

// 无编号
const numbered = [];
for (const path of ['/', '/about', '/today', '/hobbies', '/notes']) {
  const html = await (await fetch(base + path)).text();
  if (/(^|>)\s*0\d\s*(<|$)/.test(html) || /NO\.0\d/.test(html)) numbered.push(path);
}
check('界面无 00/01 编号', numbered.length === 0, numbered.join(' '));

// 站外未登录访问后台
const adminAnon = await fetch(base + '/admin', { redirect: 'manual' });
check('未登录 /admin 返回 404', adminAnon.status === 404, `status=${adminAnon.status}`);
const adminHtml = await (await fetch(base + '/admin', { headers: H })).text();
check('登录后后台可打开', adminHtml.includes('笔记') && adminHtml.includes('上传 .md'), `len=${adminHtml.length}`);

// 上传（1x1 JPEG）
const jpeg = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07,
  0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12, 0x13, 0x0F,
  0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C,
  0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D,
  0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01,
  0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01,
  0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
  0x07, 0x08, 0x09, 0x0A, 0x0B, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0x7F,
  0xFF, 0xD9
]);
const upload = await fetch(base + '/api/upload', {
  method: 'POST',
  headers: { ...H, 'content-type': 'application/json' },
  body: JSON.stringify({ dataUrl: 'data:image/jpeg;base64,' + jpeg.toString('base64') })
});
const uploaded = await upload.json();
check('上传接口返回路径', upload.status === 200 && uploaded.path?.startsWith('/uploads/'), uploaded.path || uploaded.error);
if (uploaded.path) fs.unlinkSync('public' + uploaded.path);
const bad = await fetch(base + '/api/upload', {
  method: 'POST',
  headers: { ...H, 'content-type': 'application/json' },
  body: JSON.stringify({ dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })
});
check('拒绝 SVG', bad.status === 400);

// 整站私密
await action({ entity: 'site', action: 'private', value: '1' });
const gated = await fetch(base + '/', { redirect: 'manual' });
check('整站私密未登录跳登录', gated.status === 302 && (gated.headers.get('location') || '').startsWith('/login'));
const gatedDeep = await fetch(base + '/about/works/earth', { redirect: 'manual' });
check('整站私密深链也跳登录', gatedDeep.status === 302);
await action({ entity: 'site', action: 'private', value: '0' });
check('关闭整站私密', (await fetch(base + '/', { redirect: 'manual' })).status === 200);

// 笔记上传 / XSS / 私密 / 删除
const md = `---\ntitle: QA 测试笔记\ntags: 测试\n---\n\n# QA 测试笔记\n\n<script>alert(1)</script>\n\n[危险](javascript:alert(1))\n\n\`\`\`js\nconst a = 1;\n\`\`\`\n`;
const noteRes = await fetch(base + '/api/notes', {
  method: 'POST',
  headers: { ...H, 'content-type': 'application/json' },
  body: JSON.stringify({ filename: 'qa-note-test.md', content: md })
});
const notePayload = await noteRes.json();
const noteSlug = (notePayload.path || '').split('/').pop();
const noteHtml = noteSlug ? await (await fetch(base + '/notes/' + noteSlug)).text() : '';
check('上传 .md 并渲染', noteRes.status === 200 && noteHtml.includes('QA 测试笔记'), notePayload.path || notePayload.error);
check('md 不执行原始 HTML', noteHtml.includes('&lt;script&gt;alert(1)') && !noteHtml.includes('<script>alert(1)'));
check('md 剥离 javascript: 链接', !noteHtml.includes('href="javascript'));
const notMd = await fetch(base + '/api/notes', {
  method: 'POST',
  headers: { ...H, 'content-type': 'application/json' },
  body: JSON.stringify({ filename: 'bad.txt', content: 'x' })
});
check('拒绝非 .md 文件', notMd.status === 400);
if (noteSlug) {
  const noteRow = db.prepare('SELECT id, visibility FROM notes WHERE slug = ?').get(noteSlug);
  await action({ entity: 'note', action: 'visibility', id: noteRow.id, value: 'private' });
  const hidden = await fetch(base + '/notes/' + noteSlug, { redirect: 'manual' });
  check('私密笔记直链 404', hidden.status === 404, `status=${hidden.status}`);
  await action({ entity: 'note', action: 'delete', id: noteRow.id });
  check('删除笔记', !db.prepare('SELECT 1 AS hit FROM notes WHERE slug = ?').get(noteSlug));
}

// 爱好数据：API 鉴权 / Steam 未配置 / Epic 导入 / 审批流
const anonApi = await fetch(base + '/api/games/sync', { method: 'POST' });
check('未登录调用爱好 API 返回 404', anonApi.status === 404, `status=${anonApi.status}`);

const steamRes = await fetch(base + '/api/games/sync', { method: 'POST', headers: H });
const steamBody = await steamRes.json().catch(() => ({}));
check('本机 Steam 同步（无需 API key）', steamRes.status === 200 && steamBody.mode === 'local', `status=${steamRes.status} mode=${steamBody.mode || steamBody.error}`);

const qaGame = 'QA 测试游戏 ' + Date.now();
const importRes = await fetch(base + '/api/games/import', {
  method: 'POST',
  headers: { ...H, 'content-type': 'application/json' },
  body: JSON.stringify({ filename: 'qa-epic.json', content: JSON.stringify([{ name: qaGame, playtime_minutes: 125 }]) })
});
const imported = await importRes.json().catch(() => ({}));
const gameRow = db.prepare('SELECT * FROM games WHERE name = ?').get(qaGame);
const gamePublic1 = await (await fetch(base + '/hobbies/game')).text();
check('Epic 导入后默认待审、不公开', importRes.status === 200 && gameRow?.status === 'pending' && !gamePublic1.includes(qaGame), `status=${gameRow?.status}`);
await action({ entity: 'game', action: 'approve', id: gameRow?.id });
const gamePublic2 = await (await fetch(base + '/hobbies/game')).text();
check('同意后才出现在游戏页', gamePublic2.includes(qaGame));
await action({ entity: 'game', action: 'hide', id: gameRow?.id });
const gamePublic3 = await (await fetch(base + '/hobbies/game')).text();
check('撤回后立刻消失', !gamePublic3.includes(qaGame));
await action({ entity: 'game', action: 'delete', id: gameRow?.id });
check('删除测试游戏', !db.prepare('SELECT 1 AS hit FROM games WHERE id = ?').get(gameRow?.id));

const animeRes = await fetch(base + '/api/anime/refresh', { method: 'POST', headers: H });
const animeBody = await animeRes.json().catch(() => ({}));
check('动漫刷新接口可用', animeRes.status === 200 && Array.isArray(animeBody.results) && animeBody.results.length === 4, JSON.stringify(animeBody.results || animeBody.error));

const animeHtml = await (await fetch(base + '/hobbies/anime')).text();
check('动漫页有平台入口与版权说明', ['B 站', '腾讯视频', '爱奇艺', '优酷'].every((name) => animeHtml.includes(name)) && animeHtml.includes('版权归原平台'));

const singingHtml = await (await fetch(base + '/hobbies/music')).text();
const artistNames = ['李荣浩', '王力宏', '方大同', '薛之谦', '张杰', '许嵩', '邓紫棋', '陈奕迅', '梁博'];
check('音乐页九位歌手齐全', artistNames.every((name) => singingHtml.includes(name)) && singingHtml.includes('30 秒官方'));
check('音乐页有试听按钮', (singingHtml.match(/class="song-play"/g) || []).length > 0);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
const audioFiles = walk('public/uploads').filter((file) => /\.(mp3|wav|flac|m4a|aac|ogg)$/i.test(file));
check('上传目录没有音频文件', audioFiles.length === 0, audioFiles.join(' '));

const before = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
const run1 = await (await fetch(base + '/api/fetch', { method: 'POST', headers: H })).json();
const mid = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
const run2 = await (await fetch(base + '/api/fetch', { method: 'POST', headers: H })).json();
const after = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
check('抓取两轮均有源成功', run1.sources.ok > 0 && run2.sources.ok > 0, `${run1.sources.ok}/${run1.sources.total} → ${run2.sources.ok}/${run2.sources.total}`);
check('重复抓取不重复入库', after - mid <= 2, `before=${before} afterRun1=${mid} afterRun2=${after} inserted=${run2.inserted}`);

// 作品保存（走后台表单）
const earth = db.prepare('SELECT * FROM works WHERE slug = ?').get('earth');
const links = JSON.parse(earth.links || '[]');
const saveRes = await fetch(base + '/admin/work/save', {
  method: 'POST',
  headers: { ...H, 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    id: earth.id,
    title: earth.title,
    slug: earth.slug,
    summary: earth.summary,
    body: earth.body,
    kind: earth.kind,
    year: String(earth.year),
    role: earth.role,
    cover: earth.cover,
    gallery: earth.gallery,
    link_label: links[0]?.label || '',
    link_url: links[0]?.url || '',
    sort_order: String(earth.sort_order),
    featured: '1',
    visibility: earth.visibility
  }).toString(),
  redirect: 'manual'
});
const saved = db.prepare('SELECT title, updated_at FROM works WHERE slug = ?').get('earth');
check('后台作品表单保存', saveRes.status === 303 && saved.title === '地球', `status=${saveRes.status} updated=${saved.updated_at}`);

// 排序
const orderBefore = db.prepare('SELECT slug FROM works ORDER BY sort_order, title').all().map((r) => r.slug);
const second = db.prepare('SELECT id, slug FROM works ORDER BY sort_order, title').all()[1];
await action({ entity: 'work', action: 'up', id: second.id });
const orderAfter = db.prepare('SELECT slug FROM works ORDER BY sort_order, title').all().map((r) => r.slug);
await action({ entity: 'work', action: 'down', id: second.id });
const orderRestored = db.prepare('SELECT slug FROM works ORDER BY sort_order, title').all().map((r) => r.slug);
check('排序 ↑ 生效并恢复', orderAfter[0] === second.slug && orderRestored.join() === orderBefore.join(), `${orderBefore.join(' → ')} | ${orderAfter.join(' → ')}`);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);