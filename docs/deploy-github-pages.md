# 部署到 GitHub Pages（静态版）

> 已上线：<https://jexil1412.github.io/>  
> 仓库：<https://github.com/jexil1412/jexil1412.github.io>（Pages Source = GitHub Actions）
>
> 目标：国内一般能打开、完全免费、每天自动更新「今日」。
> 代价：线上是只读展示；后台、登录、上传、游戏审批、+ 新建笔记只在本地用。

## 一、仓库与 Pages

1. 在 GitHub 新建一个仓库（建议 public；免费账号的 Pages 只对 public 仓库开放）。
2. 推送本项目（包含 `public/demo`，约 130MB）：

```powershell
cd D:\MYSQL\homework\personal-site
git init -b main
git add .
git commit -m "Jexil static site"
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

3. 打开仓库 **Settings → Pages → Build and deployment → Source**，选 **GitHub Actions**。
4. 推送后 Actions 会自动跑 `Deploy static site to GitHub Pages`；成功后地址是：

```
https://<你的用户名>.github.io/<仓库名>/
```

如果仓库名就是 `<你的用户名>.github.io`，地址是根域名，构建会把手写路径自动处理成根。

## 二、每天自动更新「今日」

`.github/workflows/pages.yml` 已配置：

- push 到 `main` 时构建；
- 每天 `00:30 UTC`（北京 08:30）跑一次 `node scripts/build-static.mjs --fetch`，抓 7 个事件源后重新发布；
- 也可以在 Actions 页面手动 **Run workflow**。

抓取失败不会让构建失败（`runFetch` 按源降级）。

## 三、本地改了内容怎么上线

静态站不读数据库，线上内容来自 `content/public-data.json`。本地后台改完作品/笔记/音乐/游戏审批后：

```powershell
node scripts/export-data.mjs      # 重新导出公开快照（只含 public/approved）
node scripts/build-static.mjs     # 本地预览构建（可选）
git add content/public-data.json
git commit -m "content update"
git push
```

GitHub Actions 会重新发布。

## 四、本地预览

```powershell
node scripts/build-static.mjs
node scripts/serve-static.mjs 8080
# http://127.0.0.1:8080
```

检查死链：

```powershell
node scripts/check-static.mjs
```

## 五、静态版和本地版的差别

| 功能 | 本地 Node 版 | GitHub Pages |
|---|---|---|
| 首页 / 关于 / 作品 / 今日 / 爱好 / 音乐试听 / 笔记阅读 | ✅ | ✅ |
| 作品 demo（地球 / 眼睛） | ✅ | ✅（静态文件） |
| 每日事件自动更新 | ✅ | ✅ Actions 定时 |
| 登录 / 后台 / 上传图片 / 游戏审批 / 新建笔记 | ✅ | ❌（本地用） |
| 笔记 + 按钮 | ✅ | 已隐藏 |
| Steam 本机同步 | ✅ | ❌（云端读不到本机；用导出的快照） |

## 六、体积与限制

- `public/demo/earth` 约 109MB、`eye` 约 24MB；GitHub Pages 单文件限制 100MB（当前最大 14MB，没问题），仓库建议 <1GB（当前约 135MB）。
- 首次打开地球 demo 会比较慢（8K 贴图）；想更快可以把 `public/demo/earth/assets/*8k.jpg` 压到 4K，或把 demo 移到外部对象存储。
- B 站封面是外链，可能被防盗链拦成占位。
- 音乐试听是 iTunes 30 秒片段，需要访问 `audio-ssl.itunes.apple.com`；打不开时只显示平台链接。
- 定时任务使用 GitHub Actions 免费额度，每天一次远低于限额。

## 七、自定义域名（可选）

Pages → Custom domain 填域名，按提示加 CNAME；`BASE_PATH` 仍按仓库名计算，若绑定根域名后资源 404，把 `.github/workflows/pages.yml` 里的 `BASE_PATH` 改成 `/` 再推一次。