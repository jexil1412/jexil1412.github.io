import { db, nowIso } from './db.mjs';

const now = () => nowIso();

const works = [
  {
    slug: 'mandarin-app',
    title: '普通话正音器',
    summary: '一个离线的普通话练习工具：听标准读音、跟读、做听辨测验，把常错的音收进错音本。',
    body: [
      '自己读错了，往往听不出来。这个工具先解决「听」：用离线的神经网络语音念标准读音，你听、跟读，再做听辨测验；错过的字词会被记下来。',
      '里面有 364 条字词，按尖音、n-l、鼻韵、声调、平翘舌、入声、变调、轻声、儿化等 12 类整理，针对河南考生的常见问题。程序不联网，语音引擎和模型都放在本地。',
      '做这个的时候踩过两个坑：Piper 引擎遇到中文路径会直接崩溃，所以启动时会把语音目录复制到纯英文路径再调用；另外微软 Edge 的在线语音拒绝非浏览器客户端，最后走的是完全离线的方案。'
    ].join('\n\n'),
    kind: 'app',
    year: 2026,
    role: '独立开发',
    cover: '/uploads/works/mandarin-app/cover-1600.jpg',
    gallery: [],
    links: [],
    featured: 0,
    sort_order: 1
  },
  {
    slug: 'earth',
    title: '地球',
    summary: '一个能转的地球：真实贴图、云层和昼夜光照，鼠标或手机按着拖就能看。',
    body: [
      '用浏览器画一颗真的地球：地表贴图来自公开的卫星影像，云层单独一层，光照按太阳方向算，边缘有一圈很薄的大气。',
      '拖动可以绕地球看，手机上给了方向盘按钮。没有加载完成的提示，贴图到位之前只有一片黑和一行小字。',
      '做它的主要乐趣不是「像」，而是让相机贴近地表时，地平线能压出一点弧度。'
    ].join('\n\n'),
    kind: 'web',
    year: 2026,
    role: '独立开发',
    cover: '/uploads/works/earth/cover-1600.jpg',
    gallery: [
      { path: '/uploads/works/earth/gallery-1-800.jpg', alt: '地球场景在手机竖屏下的画面', caption: '手机竖屏：方向盘在左下角' }
    ],
    links: [{ label: '打开地球', url: '/demo/earth/' }],
    featured: 1,
    sort_order: 2
  },
  {
    slug: 'eye',
    title: '眼睛',
    summary: '面部追踪驱动的虹膜：眨眼会合上，视线跟着你走；鼠标模式也能玩。',
    body: [
      '用面部关键点驱动一只眼睛：眼睑的开合、虹膜的偏移都跟着镜头前的人走；眨眼时上眼睑先合、下眼睑后合。',
      '眼球不是一个球：虹膜用线条画在 Canvas 上再贴成纹理，虹膜的放射纹、异形瞳孔和宝石切面高光全部用着色器写，所以放大看仍然清楚。',
      '有青绿、绯红、琥珀三套瞳色，按 1 / 2 / 3 切换；没有摄像头时自动切到鼠标模式。'
    ].join('\n\n'),
    kind: 'web',
    year: 2026,
    role: '独立开发',
    cover: '/uploads/works/eye/cover-1600.jpg',
    gallery: [
      { path: '/uploads/works/eye/gallery-1-800.jpg', alt: '眼睛作品的青绿色虹膜', caption: '青绿' },
      { path: '/uploads/works/eye/gallery-2-800.jpg', alt: '眼睛作品的绯红色虹膜', caption: '绯红' },
      { path: '/uploads/works/eye/gallery-3-800.jpg', alt: '眼睛闭眼时的画面', caption: '闭眼' },
      { path: '/uploads/works/eye/gallery-4-800.jpg', alt: '眼睛作品的完整桌面截图', caption: '桌面端' }
    ],
    links: [{ label: '打开眼睛', url: '/demo/eye/' }],
    featured: 0,
    sort_order: 4
  }
];

const hobbies = [
  { slug: 'game', name: '游戏', note: '玩，也看别人玩。', body: '', sort_order: 1 },
  { slug: 'anime', name: '动漫', note: '看，也记分镜。', body: '', sort_order: 2 },
  { slug: 'music', name: '音乐', note: '听歌，也弹一点。', body: '', sort_order: 3 }
];

export function ensureSeed({ force = false } = {}) {
  const count = Number(db.prepare('SELECT COUNT(*) AS n FROM works').get().n);
  if (count > 0 && !force) return false;
  if (force) {
    db.exec('DELETE FROM works; DELETE FROM hobbies;');
  }
  const stamp = now();
  const insertWork = db.prepare(`
    INSERT INTO works (id, slug, title, summary, body, kind, year, role, cover, gallery, links, featured, sort_order, visibility, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'public', ?, ?)
  `);
  for (const w of works) {
    insertWork.run(
      `work_${w.slug}`, w.slug, w.title, w.summary, w.body, w.kind, w.year, w.role,
      w.cover, JSON.stringify(w.gallery), JSON.stringify(w.links), w.featured, w.sort_order, stamp, stamp
    );
  }
  const insertHobby = db.prepare(`
    INSERT INTO hobbies (id, slug, name, note, body, since, cadence, cover, link, sort_order, visibility, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, 'public', ?, ?)
  `);
  for (const h of hobbies) {
    insertHobby.run(`hobby_${h.slug}`, h.slug, h.name, h.note, h.body || '', h.sort_order, stamp, stamp);
  }
  return true;
}