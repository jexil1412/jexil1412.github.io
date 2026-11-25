---
title: 如何新增一篇教程
date: 2026-11-25
tags: 教程, 建站
summary: 把 .md 放进 content/tutorials，推送后 GitHub Actions 自动重新生成教程页。
---

# 如何新增一篇教程

教程栏目的内容**不在数据库里**，而是直接读取 `content/tutorials/` 下的 `.md` 文件。新增一篇教程只要三步。

## 1. 写一个 Markdown 文件

文件名就是网址里的 slug，例如 `css-flex.md` 会生成 `/tutorials/css-flex/`。

文件开头建议写 frontmatter：

```markdown
---
title: CSS Flex 布局速查
date: 2026-11-26
tags: CSS, 布局
summary: 一句话说明这篇教程解决什么问题。
---

# CSS Flex 布局速查

正文……
```

## 2. 放进教程目录

把文件放到：

```
personal-site/content/tutorials/
```

## 3. 推送到 GitHub

在项目目录执行：

```powershell
npm run tutorials:publish
```

它会自动 `git add content/tutorials`、提交并 push。GitHub Actions 收到 push 后会重新构建静态站，教程页就上线了。

也可以自己手动执行：

```powershell
git add content/tutorials
git commit -m "add tutorial"
git push
```

## 另一种方式：直接在 GitHub 上传

打开仓库的 `content/tutorials/` 目录，点 **Add file → Upload files**，上传 `.md` 后提交；Actions 同样会自动重新发布。

## 注意

- 只放 `.md`，不要放图片以外的可执行文件；
- 文件名用小写英文和连字符，例如 `html-form-validation.md`；
- 图片放 `public/uploads/`，Markdown 里用 `/uploads/...` 引用；
- 教程里的链接、代码块会经过安全渲染，原始 HTML 不会执行。