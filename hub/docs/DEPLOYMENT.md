# 预览站发布准备

目标账号：`Z-hang729`。用户选择先用普通仓库检查效果，保留 `Z-hang729.github.io` 主页仓库。

用户确认的仓库名称为 `Z-hang-Homepage`。

以下均为拟使用的地址，尚未代表仓库或网站已经存在：

- Repository: `https://github.com/Z-hang729/Z-hang-Homepage`
- Pages: `https://Z-hang729.github.io/Z-hang-Homepage/`
- Production base: `/Z-hang-Homepage/`

## 当前可审查成果

`hub/` 中保留独立 Astro 源码、锁定的依赖、Demo 内容、CLI 导入、本地管理、静态构建与自动检查。父目录中的旧 Sites 源码、数据库和文件未改动。

`.github/workflows/deploy.yml` 位于父 Git 仓库的根目录，构建 `hub/` 并发布 `hub/dist/`。Workflow 使用 GitHub Actions 的短期令牌，没有浏览器 token 或提交到代码的访问密钥。

## 授权后的步骤

1. 验证 GitHub 登录账号确实为 `Z-hang729`，检查目标仓库是否已存在，读取 Pages 设置。
2. 新建或使用目标普通仓库。已有仓库不能覆盖历史或 force push；先检查远程分支。
3. 按仓库结构提交新站 `hub/` 和根目录的 workflow；旧站私人数据库、`.local/`、依赖、构建产物与访问密钥不进入仓库。
4. 设置 GitHub Pages Source 为 GitHub Actions；工作流读取实际 Pages origin/base，必要时配置 Variables。
5. Push 后等待 Actions build 和 deployment 成功，访问真实 Pages 地址，检查首页、搜索、主题、图片、PDF、课程阅读页及 `/admin/` 只读状态。
6. 记录真实 deployment URL、commit 与验证状态。上述步骤完成前，只能称为“本地版本完成，发布准备完成”。

如果整个父仓库包含不宜公开的旧资料，可在明确检查后只将新站内容放入独立的发布 checkout，保持相同 `hub/` 与 workflow 结构。不得上传旧数据库及对象存储。

## 本地预览

在 `hub/` 运行 `npm run build` 后运行 `npm run preview -- --port 4322`，默认地址 `http://127.0.0.1:4322/`。`npm run admin -- --port 4321` 提供本地写入管理。

`.env.example` 记录拟使用的 GitHub 配置。要本地模拟仓库子路径，可复制为 `.env`，重新 build，然后访问 `/Z-hang-Homepage/`。本地根路径预览时不要复制生产 base，或将 `.env` 的 `SITE_BASE_PATH` 设置为 `/`。
