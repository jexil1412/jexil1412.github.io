# 设计验收 · v3.0（天蓝 · 液态玻璃）

> 日期：2026-11-25 ｜ Node 24.22 ｜ `http://127.0.0.1:3000`
> 状态：**PASS** 有证据 ｜ **PARTIAL** 部分做到 ｜ **BLOCKED** 没做/没测。
> 自动验收：`node scripts/qa-check.mjs` → **36/36**；`node scripts/link-check.mjs` → 15 个页面 / 43 个链接；`node scripts/check-static.mjs` → 41 个静态站内链接全部可达。

| # | 检查项 | 结果 | 证据 / 说明 |
|---|---|---|---|
| 1 | 首页纯净 | PASS | `qa-check`「首页只有字标」；内容区只有 `jexil-mark`，无 h1、无身份句；`v3-home.png` |
| 2 | 无编号 | PASS | `qa-check`「界面无 00/01 编号」；App 封面已重排，去掉了原来的 `NO.01` |
| 3 | 侧栏 | PASS | 264px 玻璃栏，四组手风琴；当前组展开、子项胶囊高亮；`v3-home.png` / `v3-today.png` |
| 4 | 移动抽屉 | PASS | 390 下顶部条 + 全高抽屉 + 遮罩；`v3-drawer.png`。Esc 关闭已在 JS 实现，未做自动化按键测试（见 #18） |
| 5 | 作品 slider | PARTIAL | 3 件作品；已验证下一件/上一件、边界 `disabled`、键盘 ← → 生效。**触摸滑动**走 pointer 事件，未上真机验证 |
| 6 | 关于含作品 | PASS | `/about` 3 个 slide；`/works` → 301 `/about`，`/works/earth` → 301 `/about/works/earth` |
| 7 | 笔记上传 | PARTIAL | API 全链路：上传 → 列表 → 详情渲染（标题/列表/代码块/链接）→ 下载原文；后台文件选择器的完整 UI 手测未做（无头环境不能选文件） |
| 8 | md 安全 | PASS | `<script>alert(1)</script>` 输出为 `&lt;script&gt;`；`javascript:` 链接被剥离；`bad.txt` 返回 400；>1MB 拒绝 |
| 9 | 标签分类 | PASS | frontmatter `tags` 出现在列表、侧栏「笔记」下（最多 5 个）与筛选胶囊 |
| 10 | 今日 | PASS | 四域分组、7 天归档、抓取状态、空态/失败态；`v3-today.png`。领域筛选是同一 query 机制，未逐一点击截图 |
| 11 | 爱好 | PASS | 3 张玻璃卡，无编号，hover/active/focus 样式齐全；`v3-hobbies.png` |
| 12 | 隐私 | PASS | `qa-check`：私密作品消失、直链 404、恢复公开、整站私密 302 到登录、深链同样拦截、未登录 `/admin` 404、私密笔记 404 |
| 13 | 抓取 | PASS | 7/7 源成功；连跑两轮第二轮 `inserted=0`（库内 63 条不变）；日志 `data/fetch.log` |
| 14 | 玻璃规范 | PARTIAL | 只有侧栏/抽屉/顶部条/slider 外框/卡片用 blur；按钮与标签用轻玻璃；slide 内无玻璃。**没有自动统计每屏 blur 层数** |
| 15 | 对比度 | PARTIAL | 墨色 `#0B2A3F` / muted `#3F6478` 压在 ≥.42 白玻璃上，人工看可读；**没有用工具实测 4.5:1** |
| 16 | 降级 | PARTIAL | 写了 `@supports not (backdrop-filter)` 实色回退；没有在禁用该特性的浏览器里实测 |
| 17 | 状态 | PARTIAL | 按钮五态、slider 边界、笔记上传错误、空态、灯箱、确认框均有实现；未逐格截图 |
| 18 | 键盘 | PARTIAL | slider ←/→ 已自动化验证；抽屉 Esc、灯箱 Esc、焦点回位已实现；完整 Tab 走查没做 |
| 19 | 响应式 | PASS | 390 / 768 / 1440 截图；768 下 `innerWidth = scrollWidth = 768`，无横向溢出；阅读列 ≤720px |
| 20 | 性能 | PARTIAL | 零框架、无 CDN、图片 lazy、blur 层数按设计受限；**没有跑 Lighthouse** |
| 21 | 字标完整 | PASS | 从 SVG 路径改为本地 Bodoni MT Italic（fallback Georgia），首页/侧栏/移动顶部条均完整；`v3-home.png` 里 J 顶部衬线与 l 升部无切口 |
| 22 | 游戏审批 | PASS | `qa-check`：Epic 导入后 `pending`、公开页看不到；同意后出现；隐藏后消失；重新同步不改状态 |
| 23 | Steam / Epic | PASS | 本机 Steam 自动识别并同步出 30 款 pending（无需 API key）；Epic 导入、去重、审批已测；`STEAM_API_KEY` 分支未实测 |
| 24 | 动漫聚合 | PARTIAL | B 站公开番剧索引可用（本次刷新 30 条，页面取 12 条）；腾讯/爱奇艺/优酷按约定只做平台入口；全量目录没有承诺 |
| 25 | 音乐版权 | PASS | 9 位歌手 / 54 首歌；51 首有 30 秒官方试听，3 首只有平台链接；`uploads/` 扫描无完整音频；页面无歌词 |
| 26 | 版权与隐私文案 | PASS | 动漫页「版权归原平台」、音乐页「30 秒官方片段，不提供完整音源与歌词」；游戏页不显示待审数量；后台有审批说明 |
| 27 | 浏览器图标 | PASS | 天蓝圆角底 + JXL 艺术字，64 / 128 PNG；`public/favicon.png` |
| 28 | 本机 Steam | PASS | 自动从 `login.vdf` / `localconfig.vdf` 识别本机账号，同步 30 款 pending；未上传凭据；后台只显示「本机已发现」 |
| 29 | 音乐播放 | PASS | 点击 ▶ 后 `audio` readyState=4、`paused=false`；单播放条、一次只播一首；51 首有试听 |
| 30 | 笔记 + 按钮 | PASS | 笔记页有「+ 新建笔记」和右下 FAB；登录后提交标题/标签/摘要/正文 → 跳详情；未登录跳登录 |
| 31 | 文档同步 | PASS | 提示词 v3.3、README、design-qa、deploy 文档均已同步 |
| 32 | 静态构建 | PASS | `build-static` 生成 28 个页面 + 404/sitemap/robots；`check-static` 38 个链接可达；`BASE_PATH=/repo` 构建路径正确 |
| 33 | Pages 部署 | PASS | 已推送并部署：https://jexil1412.github.io/ ；Actions 成功；首页/关于/作品/今日/爱好/音乐/笔记/资源均 200 |
| 34 | 教程栏目 | PASS | `/tutorials` 列表 + `/tutorials/how-to-add-tutorial/` 详情 + `.md` 下载；侧栏在笔记下方；`qa-check` 36/36 |
| 35 | 教程发布 | PASS | `content/tutorials/*.md` 文件式内容；`publish-tutorials.mjs` 自动 add/commit/push；push 后 Actions 重新构建 |

## v3.4 教程栏目与四页提交版

- **教程**：侧栏「笔记」下方新增「教程」；读取 `content/tutorials/*.md`，生成列表与详情，支持 .md 下载。
- **发布**：`node scripts/publish-tutorials.mjs` 自动 commit/push；也可在 GitHub 直接上传 .md。
- **四页静态版**：另做 `网页制作结课作业_4页版/`，纯 HTML/CSS/JS、相对路径、5 种交互、带注释，可双击运行。

## v3.3 部署（GitHub Pages 静态版）

- `export-data` 导出公开快照；`build-static` 生成 28 个静态页面 + 资源（133MB，含 demo）。
- Actions 工作流：push + 每天 08:30（北京时间）抓事件后发布；Pages Source 选 GitHub Actions。
- 线上只读：登录/后台/上传/审批/+ 新建笔记不可用，`+` 在构建时删除。
- **已上线**：https://jexil1412.github.io/ （仓库 jexil1412/jexil1412.github.io，Source = GitHub Actions，Actions 部署成功）。

## v3.2 本次改动

- **Steam 不再要 API key**：自动读本机 Steam 安装目录、账号与 `localconfig.vdf` 时长，同步出 30 款 pending；API key 分支保留但未实测。
- **删除指尖花园**：数据库、封面/图集、demo 都移除，关于页剩 3 件作品。
- **唱歌 → 音乐**：`/hobbies/music`，9 位歌手 / 54 首歌，51 首有 iTunes 30 秒官方试听；页面底部单播放器。
- **浏览器图标**：天蓝底 JXL 艺术字（`public/favicon.png` + 128）。
- **笔记 +**：列表页右上按钮 + 右下 FAB，登录后可新建。
- **仍未做**：Steam API key 分支实测、动漫定时任务（有脚本，未排班）、笔记在线编辑。

## 与 v2 的差异

1. 首页从「陈述 + 今日」改成**只有字标**，身份句不再出现在任何页面。
2. 作品从顶级模块移入「关于」，旧 `/works/*` 301。
3. 全站取消 00/01 编号；App 封面重新生成。
4. 导航从顶部移到左侧，新增子项与移动抽屉。
5. 新增「笔记」模块（.md 上传、frontmatter、安全渲染、标签）。
6. 视觉从索引卡换成天蓝 + 液态玻璃；字标改为本地 Bodoni MT Italic，浏览器图标为天蓝底 JXL。

## 截图索引

| 文件 | 内容 |
|---|---|
| `docs/shots/v3-home.png` | 首页 1440 |
| `docs/shots/v3-home-mobile.png` | 首页 390 |
| `docs/shots/v3-drawer.png` | 移动抽屉展开 390 |
| `docs/shots/v3-about.png` | 关于 + 作品 slider 1440 |
| `docs/shots/v3-about-768.png` | 关于 768 |
| `docs/shots/v3-work.png` | 地球详情 1440（整页） |
| `docs/shots/v3-today.png` | 今日 1440（整页） |
| `docs/shots/v3-hobbies.png` | 爱好 1440 |
| `docs/shots/v3-game.png` | 游戏（空态）1440 |
| `docs/shots/v3-anime.png` | 动漫：B 站索引 + 平台入口 1440 |
| `docs/shots/v3-music.png` | 音乐：九位歌手 + 播放条 1440 |
| `docs/shots/v3-anime-mobile.png` | 动漫 390 |
| `docs/shots/v3-music-mobile.png` | 音乐 390 |
| `public/favicon-128.png` | 浏览器图标 JXL |
| `docs/shots/v3-notes.png` | 笔记列表 1440 |
| `docs/shots/v3-tutorials.png` | 教程列表 1440 |
| `docs/shots/v3-tutorial.png` | 教程详情 1440 |
| `docs/shots/v3-note.png` | 笔记详情（代码块）1440 |

## 仍待补

- 爱好的三句具体描述（后台可改）
- 作品的一句话 / 年份（§2 的 `{{待补}}`）
- 真机触摸 slider、完整键盘走查、Lighthouse、玻璃对比度工具实测
- 笔记在线编辑（现在是重新上传）