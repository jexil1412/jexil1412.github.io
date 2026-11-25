# Jexil — 天蓝 · 液态玻璃

首页只有一个 **Jexil** 字标（浏览器图标是天蓝底 JXL）；左侧玻璃栏分五组：关于（3 件作品）、今日、爱好（游戏 / 动漫 / 音乐）、笔记（可上传或新建 `.md`）、教程（`content/tutorials/*.md` 自动生成）。
零依赖，Node 24 直接跑，不需要 `npm install`。

## 跑起来

```powershell
cd D:\MYSQL\homework\personal-site
node server.mjs
```

打开 <http://127.0.0.1:3000>。换端口：`$env:PORT=3001; node server.mjs`。

| 入口 | 内容 |
|---|---|
| `/` | 只有 Jexil 字标 |
| `/about` | 作品 slider（框内左右箭头），可按 App / 网页筛选 |
| `/about/works/earth` 等 | 作品详情，可打开本地 demo |
| `/today` | 四个领域的事件，按天归档 |
| `/hobbies` | 3 张玻璃卡，进入三条数据线 |
| `/hobbies/game` | 只显示我同意公开的 Steam / Epic 游戏 |
| `/hobbies/anime` | B 站番剧索引 + 腾讯/爱奇艺/优酷平台入口 |
| `/hobbies/music` | 九位歌手 + 30 秒官方试听 + QQ 音乐链接（旧 `/hobbies/singing` 301） |
| `/notes` | 笔记列表，按标签筛选 |
| `/notes/[slug]` | Markdown 渲染 + 下载原文 |
| `/tutorials` | 教程列表，读取 `content/tutorials/*.md` |
| `/tutorials/[slug]` | 教程详情 + 下载 .md |
| `/login` `/admin` | 站主登录 / 后台 |
| `/works/*` | 301 到 `/about/works/*` |

**默认密码：`jexil1412`**。改密码：启动前设 `ADMIN_PASSWORD`，每次启动同步。

```powershell
$env:ADMIN_PASSWORD='换成你的密码'; node server.mjs
```

## 部署到 GitHub Pages（静态版）

**已上线：<https://jexil1412.github.io/>**（仓库 `jexil1412/jexil1412.github.io`，Pages Source = GitHub Actions）

GitHub Pages 跑不了 Node/SQLite，所以线上是**只读静态版**：作品、今日、爱好、音乐试听、笔记阅读、demo 都能看；后台/登录/上传/审批/新建笔记留在本地。

```powershell
node scripts/export-data.mjs     # 把公开内容导出成 content/public-data.json
node scripts/build-static.mjs    # 生成 dist/
node scripts/serve-static.mjs    # 本地预览 8080
```

仓库里的 `.github/workflows/pages.yml` 会在 push 和每天 08:30（北京时间）自动构建发布；Pages 的 Source 选 **GitHub Actions**。
完整步骤、体积与限制见 [docs/deploy-github-pages.md](docs/deploy-github-pages.md)。

## 笔记（.md）

后台 → 笔记 → 选一个 `.md` 上传（≤1MB，UTF-8）。支持可选 frontmatter：

```markdown
---
title: 标题
date: 2026-11-25
tags: 音乐, 建站
summary: 一句话摘要
---

# 标题

正文……
```

- 没 frontmatter 时：标题取第一个 `# `，再退回文件名。
- slug 由文件名生成；同名追加 `-2`。
- 标签会出现在侧栏「笔记」下（最多 5 个）。
- 渲染在服务端完成：先转义 HTML 再解析 Markdown；原始 HTML 不会执行，`javascript:` 链接被剥离；只允许 `/uploads/` 图片。
- **+ 新建笔记**：笔记页右上角按钮和右下角圆形 `+`，登录后填标题 / 标签 / 摘要 / Markdown 正文即可创建；未登录会先跳登录。
- 示例文件：[docs/example-note.md](docs/example-note.md)。

## 教程（content/tutorials/*.md）

教程不经过数据库：把 `.md` 放进 `content/tutorials/`，构建时自动生成 `/tutorials/` 列表和 `/tutorials/<slug>/` 详情。

```powershell
node scripts/publish-tutorials.mjs      # 自动 git add/commit/push，Actions 重新发布
node scripts/publish-tutorials.mjs --watch  # 监听目录，新增 .md 后自动推送
```

也可以直接在 GitHub 仓库的 `content/tutorials/` 上传 `.md`，push 后自动发布。

## 爱好数据（游戏 / 动漫 / 音乐）

### 游戏：Steam + Epic，逐条审批

- **Steam（默认不需要 API key）**：后台「爱好数据 → 同步 Steam」会**自动读取本机 Steam 的只读记录**（安装目录、最近登录账号、`localconfig.vdf` 的时长/最近游玩、`appmanifest` 里的名称），只读本地文件、不登录、不上传。也可以设 `STEAM_API_KEY` + `STEAM_ID` 走官方 `IPlayerService/GetOwnedGames`。
- **Epic**：官方没有公开游戏库 API，后台「导入 Epic 导出」接受 `.json` 或 `.csv`（≤1MB，≤500 条）：

```json
[{ "name": "游戏名", "playtime_minutes": 125, "last_played": "2026-11-01" }]
```

```csv
name,playtime_minutes,last_played
游戏名,125,2026-11-01
```

- **审批**：同步/导入的新游戏一律 `pending`，公开页看不到；后台逐条「同意公开」后才出现，「隐藏」立即撤回；重新同步只更新时长，不改状态。

### 动漫

- **B 站**：后台「刷新四平台」调用公开番剧索引接口，取 12 条标题/封面/简介/链接，存本地库；图片走 B 站 CDN，可能被防盗链拦，失败显示占位。
- **腾讯视频 / 爱奇艺 / 优酷**：没有公开目录接口，只做平台入口卡片，不做抓取、不绕反爬。
- 页面每张卡都链回原平台，页脚有版权说明。

### 唱歌

- 九位歌手（李荣浩 / 王力宏 / 方大同 / 薛之谦 / 张杰 / 许嵩 / 邓紫棋 / 陈奕迅 / 梁博），54 首歌。
- 只存歌名、歌手、QQ 音乐搜索链接；**没有音频、没有歌词**。

定时刷新（可选，每天 08:30）：

```powershell
node scripts/refresh-hobbies.mjs
schtasks /Create /SC DAILY /ST 08:30 /TN "Jexil-Hobbies" /TR "D:\MYSQL\homework\personal-site\scripts\refresh-hobbies.mjs" /F
```

## 每日事件

```powershell
node scripts/fetch-events.mjs        # 抓一次
node scripts/check-sources.mjs       # 检查 7 个源
```

7 个源：HN AI、The Verge AI、Pitchfork、MyAnimeList、Anime Corner、GameSpot、机核。
规则：7 天窗口、URL 去重、每源每域每天 ≤3、每域每天 ≤6、摘要 ≤120 字、不抓全文与图片。
日志 `data/fetch.log`；每日 08:00 排班：

```powershell
schtasks /Create /SC DAILY /ST 08:00 /TN "Jexil-Fetch" /TR "D:\MYSQL\homework\personal-site\scripts\fetch-daily.cmd" /F
```

## 数据与备份

| 路径 | 内容 |
|---|---|
| `data/app.db` | SQLite（works / hobbies / events / notes / sources / settings） |
| `data/secret.txt` | 会话签名密钥 |
| `data/fetch.log` | 抓取日志 |
| `public/uploads/` | 上传的图片 |
| `content/site.json` | 站点名 |

备份 = 复制 `data/` + `public/uploads/`。

## 目录

```
personal-site/
├─ server.mjs              # 路由 / SSR / 登录 / 上传 / 抓取
├─ lib/                    # db / auth / fetch / pages / markdown / steam / anime / note / util
├─ config/sources.mjs      # 7 个事件源
├─ content/site.json
├─ public/                 # style.css / site.js / favicon / uploads / demo
├─ data/
├─ scripts/                # seed / fetch / qa-check / link-check / cdp-shot
├─ docs/                   # 设计契约 / 验收 / 截图 / 示例笔记
└─ README.md
```

## 已知限制

1. **零依赖路线**：Node 24 + `node:sqlite` + 手写 SSR/CSS；没有 Next.js / Tailwind，也没有构建步骤。原因是本机 npm 缓存目录受限。
2. **Markdown 是极简渲染器**：支持标题/段落/列表/代码块/引用/链接/本地图片，不支持表格与内嵌 HTML。
3. **笔记可以新建、改可见性、删除**，但没有在线编辑已有笔记；改内容请重新上传一个同名文件（会生成 `-2`）。
4. **图片上传只有一份**：前端 canvas 压到长边 1600 的 JPEG，没有 800 缩略图。
5. **玻璃降级**：不支持 `backdrop-filter` 的浏览器用实色面板（`@supports`），没有逐浏览器实测。
6. **键盘只验证了 slider 左右键**；完整 Tab 走查与 Lighthouse 没跑。
7. 爱好的三句话仍是默认占位文案（后台可改）；作品的一句话与年份来自现有项目资料。
8. 事件源依赖外网，国内网络下 The Verge / GameSpot / Pitchfork 可能慢；失败时页面降级。
9. **Steam 本机记录已实测**：不设 API key 就同步到 30 款 pending 游戏（只读本机文件）；`STEAM_API_KEY` 分支未实测。Epic 导入和审批流已用测试数据跑通。
10. **Epic 只能手动导入导出文件**；腾讯 / 爱奇艺 / 优酷只做平台入口，B 站只取 12 条公开索引，不承诺全量。
11. 音乐是手工元数据（9 位歌手 / 54 首）+ 30 秒试听，51 首有试听、3 首只有平台链接；没有完整音频与歌词；B 站封面为外链，可能被防盗链拦。
12. **GitHub Pages 是静态版**：没有登录/后台/上传/审批/新建笔记；线上内容更新要走 `export-data → git push`；+ 按钮在静态构建里隐藏。

## 验收

```powershell
node scripts/qa-check.mjs     # 36 项：隐私 / 上传 / 笔记 XSS / 教程 / 游戏审批 / 动漫 / 音乐 / 抓取
node scripts/link-check.mjs   # 15 个页面、43 个链接
node scripts/check-static.mjs # 静态构建的站内链接与资源（41 个）
```

截图在 `docs/shots/v3-*.png`；验收记录在 `docs/design-qa.md`。