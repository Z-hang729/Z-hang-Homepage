# Owner CMS 维护说明

本阶段在现有 Astro 网站上增加 Owner Editing Mode。公开页面继续静态构建并由 GitHub Pages 提供；编辑器和认证服务不负责公开页面的正常访问。

## 目标与当前部署状态

- 仓库：[`Z-hang729/Z-hang-Homepage`](https://github.com/Z-hang729/Z-hang-Homepage)，已按所有者确认改为公开。
- Pages：[`https://z-hang729.github.io/Z-hang-Homepage/`](https://z-hang729.github.io/Z-hang-Homepage/)，2026-10-04 已真实部署并通过浏览器检查；首版 commit 为 `d0da71da523efffb82cac8dc5ac3e8d7447e7b16`。
- GitHub 账号数字 ID：`326471613`，于 2026-10-03 通过公开 `GET https://api.github.com/users/Z-hang729` 核实。数字 ID 用于服务端 owner allowlist；用户名用于展示。
- Repository ID 为 `1404136587`，已通过本人账号访问的官方 API 核实；较早的匿名 404 对应仓库当时的私有状态。
- 使用官方 Git Credential Manager 完成账号连接；桌面界面操作使用 Windows 辅助功能，不读取用户浏览器 cookie 或凭据数据库。
- Sites 的原地址已用新站完整替换，保持原有仅所有者可访问的设置；新站不使用旧 D1 / R2 内容。预览地址为 [`https://zhang-academic-notebook.hang-zhai-729.chatgpt.site/`](https://zhang-academic-notebook.hang-zhai-729.chatgpt.site/)。
- GitHub App 已创建，ID `5184269`、slug `z-hang-homepage-owner-cms`，并已仅安装到本站仓库，Installation ID 为 `167835885`。短期用户令牌到期已开启、webhook 已关闭；两个秘密已通过官方 Wrangler 写入后台 Secrets，未进入源码或文件。后台地址为 `https://z-hang-owner-cms.zhang-owner-worker.workers.dev`，当前 version `85b28fd8-fbc6-4b68-9167-96ddb3966dec`。真实 GitHub Owner 登录、网页整批发布、精确 SHA 部署、网页删除与清理部署均已验证，10 项匿名门禁检查通过。公开构建 URL 配置已回读确认。

## 架构

公开访问：`Visitor → GitHub Pages → Astro 静态 HTML / Pagefind / 公开附件`。

编辑发布：`Owner 浏览器 → 独立认证与 GitHub 写入服务 → 网站仓库 → GitHub Actions → GitHub Pages`。

GitHub 仓库仍然是内容的最终来源。编辑器读取现有 `src/data/` 与 `src/content/`，保持 Markdown / MDX / YAML 格式；现有内容无需重新输入。公开页面仅按需加载 owner 功能。

认证服务选择具有仓库范围权限的 GitHub App，使用 OAuth web flow 与 PKCE S256。它在服务端验证 GitHub 返回的数字账号 ID；短期 user access token 在服务端 AES-GCM 加密保存，不保存 refresh token，不使用 App private key。浏览器只得到应用会话，不能得到 GitHub 写入 token。

backend 为独立 Cloudflare Worker，SQLite Durable Object 只保存 OAuth state、加密会话与发布幂等元数据。GitHub 仍保存全部网站内容。

## 直接导入、图片与管理概览

`Upload folder` 可直接创建新的 Research、Course 或 Project。确认文件夹建议的标题、日期与分类；课程还需确认学期。README 概览、cover、paper 的识别选择会与新父页面、原始附件和 lecture 阅读副本一起进入一个草稿批次。最终限额包含生成的阅读页，不会先创建或发布一个不完整的父条目。

Avatar / Cover 表单提供图片选择与预览；About 的头像、条目封面和正文图片提供 `Edit image`。允许的图片必须通过签名、MIME 和大小校验，保存原始字节。`Replace Image` 可复用已有上传路径，`Upload New` 使用新路径。移除图片引用默认保留原件；实际删除上传文件需输入原文件名，并通过其他内容引用检查。图片与内容引用一起进入发布审查。

Owner workspace 展示三类条目数量、上传资产合计与 GitHub 报告的仓库大小。资产合计反映当前草稿；仓库大小由 GitHub 提供并包含历史，不作为上传额度。最新 commit 与其具体 SHA 的 build / Pages deployment 分别显示；状态读取失败时显示不可用，不推断成功。可直接打开 Repository 和 Actions，也可手动刷新发布状态。

静态站通过顶层 popup 打开 Worker `/bridge/?client_origin=<本站origin>`。popup 使用 Worker 自身的 first-party cookie；本站与 bridge 通过固定 `zhang-owner` postMessage 协议沟通，双方严格验证 origin 与 source。Worker API 不启用跨源 CORS，也不依赖第三方 cookie。

## 日常操作

1. 从网站 Owner Login 进入 GitHub 身份认证；账户本人完成 GitHub 要求的密码、2FA 或授权确认。
2. 登录后进入 Edit Mode。只有已验证 owner 可以看见编辑控件；所有写入 API 仍单独执行服务端授权。
3. 在首页点击 Edit 修改姓名、简介等；复杂列表通过结构化编辑器维护。
4. 在 Research / Notes / Projects 中新建或编辑条目。标题与 slug 分离，修改标题保持现有 URL；修改 slug 必须明确审查 URL 变化。
5. 上传单个文件或文件夹前审查分类、允许文件、略过原因和总体大小。科研原始数据应保存在原数据存储中，网站保存外部访问链接。
6. 修改先进入 Draft，不逐字符提交 GitHub。可预览、撤销或丢弃未发布变化。
7. Publish 前审查新增、修改和删除文件的汇总。删除条目需要明确确认；审查后一次提交整组变化。
8. 内容已写入 GitHub与网站已部署是两个不同状态。等待 Actions 成功，并通过新部署地址检查效果。

具体按钮与接口会随实现完善；生产未配置时不能将本地演示会话等同于 GitHub owner 登录。

## 草稿与冲突

草稿保存本次编辑开始时的仓库 HEAD SHA。发布前服务端重新读取 HEAD；如已有其他提交，阻止直接发布，先 Reload / Review Conflict，再重建草稿。

单次发布使用 GitHub GraphQL `createCommitOnBranch(expectedHeadOid)` 一次创建 Git commit。服务端 Durable Object 串行处理发布，使用请求幂等键和内容摘要防止重复提交。成功写入后的 commit 链接可用于查看历史。Actions build 失败时应显示“内容已保存，部署失败”，保留日志链接和 commit 信息，不显示网站已经上线。

## 文件与内容

主要数据位置保持为：

| 类型 | 仓库路径 |
| --- | --- |
| 个人信息 | `hub/src/data/profile.yaml` |
| 导航 | `hub/src/data/navigation.yaml` |
| 首页 section 配置 | `hub/src/data/homepage.yaml` |
| Research | `hub/src/content/research/<slug>/index.md` 或 `index.mdx` |
| Notes | `hub/src/content/notes/<slug>/index.md` 或 `index.mdx` |
| Projects | `hub/src/content/projects/<slug>/index.md` 或 `index.mdx` |
| Research Log | `hub/src/content/logs/<slug>/<date>.md` |
| 公开上传附件 | `hub/public/uploads/<kind>/<slug>/...` |

现有 MDX 可以通过开发者工作流继续维护。仅修改 metadata 时保持其原始 body；浏览器编辑 body 时将已支持的 Figure / Callout / EquationBlock / Citation / DatasetLink / GitHubRepo / PDFViewer 转为普通 Markdown，原文另存于 `public/uploads/files/owner-originals/`。不支持的组件或 JavaScript 表达式明确拒绝，不删除原文。

浏览器导入资料时保留来源层次与原始附件，生成不执行 MDX / HTML 的 Markdown 阅读副本并重写相对链接。README、封面与论文识别仅提出建议；选择用于正文、封面或资源链接需要 owner 确认。

Owner 单次上传/发布限制为：单附件 10 MiB、单可编辑文本 1 MiB、整批 20 MiB、最多 250 个变更文件。小型 FITS 与 ZIP 可作为附件下载，验证文件签名；不解压 ZIP、不执行代码。大型数据使用外部链接。Phase 1 CLI 文件夹导入有独立的 100 MiB / 1000 文件限制，不能与网页发布上限混用。

首页默认 section ID 顺序：`hero`、`current-focus`、`about`、`research`、`research-updates`、`notes`、`timeline`、`projects`、`contact`。每项保存 `order`、`visible`，可选 `title`。相邻 hero / current-focus 与 research-updates / notes 保持原视觉组合；重排或隐藏后按配置重新构建。

Research / Notes / Projects 使用 `order` 优先、更新日期次之排序，未指定时 order 为 0。页面中的 `data-owner-field`、`data-owner-section`、`data-owner-entry` 等只标记编辑位置；认证通过前不显示编辑控件。

## 配置与 Secrets

生产 backend URL 属于公开配置。`GITHUB_CLIENT_SECRET` 与 `SESSION_ENCRYPTION_KEY`（64 位十六进制随机值）只进入 Cloudflare Worker secrets；任何 GitHub 写入 token 只留在 backend，不进入 Astro public 配置、`PUBLIC_*`、Git、HTML、bundle 或浏览器 localStorage。会话最长 2 小时，需要重新登录时不保留长期 refresh token。

`.env.example` / backend 示例文件只记录配置键，不写真实 secret。正式部署时验证本机配置文件被 Git 忽略。

GitHub App 限定安装在网站仓库。必要 repository permissions 为 Contents: write，Metadata / Actions / Deployments: read。服务端检查 installation 仅选择一个目标仓库，并验证 App ID、installation ID、repository ID 与预期配置相符；超范围权限或其他仓库安装不能用于编辑本站。

backend 非 secret 配置键：`GITHUB_CLIENT_ID`、`GITHUB_APP_ID`、`GITHUB_INSTALLATION_ID`、`TARGET_REPOSITORY_ID`、`OWNER_GITHUB_ID`、`REPO_OWNER`、`REPO_NAME`、`BRANCH`、`WORKER_ORIGIN`、`ALLOWED_SITE_ORIGINS`。其中 repo / App / installation 数字 ID 需要从实际资源读取，不能填猜测值。完整示例放在 `owner-backend/wrangler.example.jsonc`。

公开站构建参数 `PUBLIC_OWNER_BACKEND_URL` 填实际 Worker origin。为空时生产 Owner Login 显示尚未配置，访客静态访问照常工作。OAuth callback 固定为 `<WORKER_ORIGIN>/auth/callback`，App 开启短期 user token expiration、关闭 webhook，只安装到目标网站仓库。

### Backend 检查与部署

在 `hub/owner-backend/` 中：

```sh
npm ci
npm run dry-run
npm run test:runtime
```

配置实际资源后，将 `wrangler.example.jsonc` 复制为被忽略的 `wrangler.jsonc`，填入真实的公开 ID / URL。然后使用平台 secret 输入流程保存秘密：

```sh
npx wrangler secret put GITHUB_CLIENT_SECRET --config wrangler.jsonc
npx wrangler secret put SESSION_ENCRYPTION_KEY --config wrangler.jsonc
npm run deploy
```

secret 的值不得写入命令文本、示例配置或聊天。用户已授权本项目必要的 GitHub App / Secret、Cloudflare Worker 和账户配置操作；开发团队可通过官方流程处理这些已授权操作。遇到必须由账户本人完成的密码、2FA 或平台另行要求的确认时，再通知本人处理。

## 本地开发与检查

保留原有工作流：在 `hub/` 中运行 `npm ci`、`npm run check`、`npm test`、`npm run build`。

`npm run admin` 是 Phase 1 的 loopback 本地管理入口，只能在开发服务器中写入本机源码。它不提供生产 owner 登录，也不应作为公开 backend 使用。

开发服务器新增本地 Owner 适配器，只有 loopback、同源、正确 CSRF 的请求可写入。在 `/owner/` 选择 Edit this local copy 后，Publish 的真实结果是 `saved-local`：只保存本机文件，不产生 GitHub commit 或生产部署。它验证 UI / 数据维护流程，不能代替生产 GitHub owner 登录。

本地 snapshot 包含 Git HEAD 与允许内容的字节摘要，确保开发者手工修改也触发冲突。临时发布先暂存、重新检查基线，再原子替换；失败回滚。测试必须使用隔离夹具，不把临时研究条目或测试秘密提交到公开内容。

## 备份与恢复

Phase 2 前已保存本地快照：

- commit：`fd9ac2d8768454207af1d1a35bab51a1884f5c80`。
- branch：`backup/pre-owner-cms`。
- 旧站历史仍保留。快照只新增 Phase 1 `hub/` 与根部署 workflow，不含 `node_modules/`、`dist/`、`.local/`、`.env`。

查看旧版本：`git show backup/pre-owner-cms:hub/src/data/profile.yaml`。恢复某个文件可以先导出旧版，审查差异后创建新的恢复 commit；不要用 force push 覆盖网站历史。

CMS 或认证服务不可用时，仍可直接在 GitHub 编辑 Markdown / YAML 并由 Actions 构建。静态公开网站持续访问，不依赖认证服务在线。

公开新仓库前检查父仓库旧站历史。若含私人数据库或不应公开的旧文件，使用干净发布 checkout，仅保留 `hub/` 与部署 workflow；不得将旧站数据或本地附件缓存自动推送到远程。

## 排查顺序

1. 无法登录：检查 backend URL、OAuth callback、App 安装仓库、owner 数字 ID、会话密钥和必要的本人授权。
2. 无法保存：查看 API 具体错误。会话过期后重新登录，保留草稿；路径、文件类型与体积错误先调整内容。
3. HEAD 冲突：查看仓库最新 commit，重新读取并审查本次编辑，禁止静默覆盖。
4. commit 成功而未上线：查看该 SHA 的 Actions / Pages deployment，确认构建日志、base path 和公开附件链接。
5. 编辑器出错：保留草稿备份，使用开发者工作流修复内容；公开站构建不应依赖 CMS 服务。

## 本阶段验证记录

截至 2026-10-04 的模块检查与浏览器验证：

- Owner model 与本地接口测试通过：CRUD、课程子文档与原件归档、slug / tags / sections、既有 MDX 转换、上传类型与大小、路径保护、expected SHA、loopback / Origin / CSRF、本地幂等、事务回滚和并发。最终全站测试共 80 项通过。
- 真实读取现有 8 个内容条目，3 篇 MDX 可转换，未要求重新输入既有资料。
- Backend 首版 10 项 OAuth 与完整发布模拟集成测试通过；Wrangler dry-run 通过；真实 workerd + SQLite Durable Object runtime 检查通过，覆盖 health / bridge / 匿名 session / Origin 与 Fetch 登录限制。
- SSR 全部 Astro 文件经实际 Rust compiler transform，没有 syntax error。最终全站类型与构建检查以 `VERIFICATION.md` 的实际执行记录为准。
- 独立浏览器与隔离网站副本的 Owner 流程通过：草稿刷新 / Undo / Discard、三类条目、主页排序、批量本地保存与成功记录恢复、真实文件选择 / 管理 / 改名 / MIME 拒收、课程子笔记 CRUD，以及手机编辑窗口。正式 Profile / Homepage 内容摘要前后一致。
- Backend 的独立浏览器夹具 9 项通过，涵盖目录层次、附件确认和链接迁移、顶层 popup bridge RPC、CSRF 隔离与错误窗口来源拒绝。此夹具没有进行外部发布。
- 真实 GitHub owner 登录与两次网页发布已验证：临时项目和附件一起产生 commit `c08e7dd0696bdb5369ca107a2eeefa717cb28f8a`，Actions `37227824551`、Pages deployment `6845526022` 均成功，公开页面及原字节附件 HTTP 200；网页删除产生 commit `0c83768ad06b6db023e31adc37a2e5f47e49b306`，Actions `37228251115`、deployment `6845602309` 均成功，测试页面和附件均 HTTP 404。每次只改两个测试文件，正式 Profile / Homepage 未改动，已有 README 更新保留。
- 最终完整测试 115 项通过，GitHub 后端集成测试 12 项；workerd 回归包含真实运行时 OAuth token exchange 和加密会话 bootstrap，外部 API 使用虚构夹具。修复了默认 fetch 丢失调用上下文的问题，并按 GitHub 实际 schema 使用 `branchName`。

完整记录见 `VERIFICATION.md`。GitHub Pages 是网页编辑后的自动发布目标；Sites 保留独立的所有者预览副本，由 Sites 工作流同步，GitHub 内容提交不会自动更新该副本。
