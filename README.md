# Z-hang-Homepage

Z-hang's personal homepage.

新学术网站源文件位于 [hub/](hub/README.md)，包括 Astro 静态页面、内容与附件、Owner 编辑界面，以及独立的 GitHub 认证后端。

GitHub Pages 目标为普通仓库 `Z-hang729/Z-hang-Homepage`，由 `.github/workflows/deploy.yml` 构建 `hub/dist/`。Sites 用于发布同一新网站的预览版本；`.openai/hosting.json` 不启用旧版数据库或文件存储。

旧网站的页面、应用和数据库 schema 已从当前源码删除。Phase 1 的本地备份分支 `backup/pre-owner-cms` 保留恢复记录；新网站没有读取或迁移旧内容。

在 `hub/` 运行 `npm.cmd ci`、`npm.cmd run dev` 开始开发。详见 [Owner CMS](hub/docs/OWNER-CMS.md)、[安全说明](hub/docs/SECURITY.md) 和 [验证记录](hub/docs/VERIFICATION.md)。线上 GitHub 编辑需完成后端与 GitHub App 配置；本地编辑已可用。
