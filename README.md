# Z-hang-Homepage

Z-hang's personal homepage.

新学术网站源文件位于 [hub/](hub/README.md)，包括 Astro 静态页面、内容与附件、Owner 编辑界面，以及独立的 GitHub 认证后端。

GitHub Pages 目标为普通仓库 `Z-hang729/Z-hang-Homepage`，由 `.github/workflows/deploy.yml` 构建 `hub/dist/`。

在 `hub/` 运行 `npm.cmd ci`、`npm.cmd run dev` 开始开发。详见 [Owner CMS](hub/docs/OWNER-CMS.md)、[安全说明](hub/docs/SECURITY.md) 和 [验证记录](hub/docs/VERIFICATION.md)。线上后端与 GitHub App 已配置，可在 [Owner 入口](https://z-hang729.github.io/Z-hang-Homepage/owner/) 使用 GitHub 登录、编辑并发布；本地编辑也可用。
