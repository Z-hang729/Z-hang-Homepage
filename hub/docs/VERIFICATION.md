# 网站验证记录

首版记录日期：2026-10-02。以下保留各阶段实际结果；真实 GitHub Pages 已于 2026-10-04 发布，见后面的线上记录。早期未验证状态只对应其所在阶段。

## 源码与功能检查

- `npm run check`：57 个文件，0 errors / 0 warnings / 0 hints。
- `npm test`：34 项测试全部通过。覆盖导入来源保留、路径与 junction 限制、同名冲突、原子保存、并发冲突、日期、资料 schema、本地 HTTP 写入权限和真实 Markdown 链接渲染。
- MDX 导入保留原始下载，生成不执行 import / export / JSX 的 `.md` 阅读副本；原始 HTML 显示为文本。代码、公式、普通 Markdown 链接继续呈现。
- 重复导入不覆盖已有条目；原始 FITS、秘密文件和超限附件记录在略过清单中。
- 原站源码、数据库和存储保留。新站的构建产物、测试夹具和浏览器截图位于忽略目录，未包含在可提交文件中。

## 实际静态构建与子路径

- 主站 `npm run build`：38 个 HTML 页面、795 处本地页面 / 附件 / 锚点链接全部有效；Pagefind 索引生成成功。
- 在 `.local/integration-site/` 隔离副本通过真正的 CLI 导入包含中文文件名、嵌套 `Chapter/index.md`、MDX、引用式 PDF 链接的资料夹：6 个文件复制、4 个文件略过。
- 使用 `SITE_URL=https://Z-hang729.github.io`、`SITE_BASE_PATH=/Z-hang-Homepage/`、`REPO_URL=https://github.com/Z-hang729/Z-hang-Homepage` 构建隔离副本：42 个 HTML 页面、903 处链接全部有效，导入子页面和中文附件正确保留仓库前缀。
- 在子路径预览中再次执行浏览器检查，搜索、主题、图表、PDF 和所有屏幕宽度通过。MDX 阅读页保留脚本文本而没有可执行脚本，测试中的文件写入副作用未发生。
- 已修复引用式 Markdown 链接漏加 base；build 使用 `--force`，避免修改 Markdown 插件或部署路径后复用旧正文渲染缓存。

## 浏览器验证

使用本机 Chrome 的 headless 模式，真实访问构建产物和开发服务器：

- 1440 px 桌面、1280 px 笔记本、768 px 平板、390 px 手机、320 px 窄屏；检查页面没有整体横向溢出。
- 首页、三类归档、科研和笔记阅读页、About、CV、Publications、Admin。
- 深浅主题及刷新后保持；搜索实际返回 Pagefind 结果；筛选空状态和科研时间轴。
- KaTeX 公式、Mermaid 实际图节点、移动菜单和折叠目录。
- 示例 PDF 返回有效 PDF 文件；手机提供 Open / Download。
- 公开 Admin 没有写入服务。本地 Admin 实际编辑并保存 Profile，首页立即反映变化，随后还原原文。
- 没有浏览器异常、console error 或 HTTP 400 及以上失败请求。

证据文件在 `.local/qa/results.json` 和 `.local/qa/*.png`。它们属于本地验证资料，不进入公开仓库。

## 已知边界

- UI 默认英文，资料可以中英文混排；多语言配置只是预留，完整双语路由与切换尚未实现。
- 论文与荣誉没有虚构内容。Publications 空集合会产生构建提示。
- Mermaid 仅在图表页面按需加载；其可选图表模块较大，构建会显示 chunk size 提示。
- Astro / MDX 会显示 head-inject 指令的打包提示；实际 MDX 学术组件、数学和图表已通过页面验证。
- 外部资源是否允许下载、内嵌或匿名访问由提供方决定；本地链接检查不代替外站可达性检查。
- 本地通过构建不代表线上已发布。远程发布后需要按 Deployment 文档再次验证真实网站地址。

## Phase 2 浏览器检查（2026-10-04）

当前主站完整检查：`npm run check` 无错误；2026-10-04 最新完整 `npm test` 99 项通过、0 项失败；最终构建生成 39 个 HTML 页面，926 处本地链接全部通过。测试包括认证失效、未知发布结果、幂等键冲突和丢失响应后的完整请求保留；同一批次经过多次安全重试只产生一个 commit。这些本地测试不代替真实生产 OAuth 验证。

后续补齐直接文件夹创建、图片编辑与仪表盘后，再次完整执行 `npm test`：114 项通过、0 失败、0 跳过；`npm run check`：90 文件、0 errors、0 warnings、4 个既有 hints。实际 GitHub Pages 子路径构建仍为 39 个页面、926 处链接通过；Pagefind 索引 39 页。189 个构建后的 HTML / JS / JSON 文件未发现 GitHub token / private key 模式。

新测试包含：父条目、原件与阅读页同批生成并统一检查最终限额；错误课程 metadata / 重名 / 路径逃逸拒绝；图片原字节保留、MIME 拒收、同路径替换、科研目录路径保留、正文语法与 MDX 原件保留；仓库统计来源 ID 不匹配拒绝。独立 popup fixture 增至 10 组通过，包含直接创建课程的真实表单与学期确认，`externalPublishing=false`。

主站隔离浏览器检查随后扩展至 13 组并全部通过，保留原 9 组并新增课程目录直接创建 / 7 文件同批保存、封面预览与直接编辑 / 删除 / 同页 Undo、头像直接编辑 / 草稿 / Undo、管理页计数 / 资产 / 本地发布状态。没有 browser 或 HTTP error；正式 profile / homepage 哈希前后一致。每次使用自有独立端口、全新 Chrome profile，结束时关闭测试进程；已查看桌面与手机截图。

`node scripts/owner-browser-qa.mjs` 已通过。测试复制当前 `src/`、`public/` 和配置到 `.local/owner-browser-site-*`，使用独立 Chrome 测试 profile；全部保存发生在该副本。正式 `profile.yaml` 与 `homepage.yaml` 的 SHA-256 前后一致。

- 1440 px 桌面与 390 px 手机的访客页面无编辑控制，手机无页面横向溢出。
- 本地登录显示 `LOCAL EDIT`；主页 inline 修改只进入草稿，刷新后恢复，Undo 和 Discard 正常。
- Research、Notes、Projects 表单实际创建草稿；公式、表格和代码即时预览正常。主页区块排序与三个条目组成同一审查批次。
- 第一批本地保存后核对明确 `saved-local` 成功记录、IndexedDB 中的确认结果、零剩余变更和实际文件。Astro 自动刷新后不会误报冲突或再次保存该批次。
- 通过真实浏览器文件选择输入导入 README、PNG、PDF；Files 列出原文件，改名与移动正常，不当 MIME 的图片替换被拒绝。
- 课程子阅读笔记实际新增、编辑与删除；错误的确认标题拒绝删除，正确标题可删除阅读页并保留原件归档。
- 第二批保存后 PNG / PDF 的 SHA-256 与上传原件一致，README 原文一致，移动前的旧附件路径不存在。
- 手机上传、子笔记编辑和批量审查窗口均无横向溢出；已查看截图。全轮没有浏览器异常、console error 或 HTTP 400 及以上失败请求。

证据：`.local/qa/owner-results.json`、`owner-run.log` 与 `phase2-*.png`。截图和夹具均在忽略目录内，不进入公开内容。

`owner-backend/` 的 `npm run test:browser` 另有 9 项通过：保留目录层次、排除文件确认、草稿上传、输入文件名确认移动、内容链接迁移、阻止删除引用附件，以及真实顶层 popup 的 bridge RPC、CSRF 隔离和不可信窗口来源拒绝。此测试使用本地模拟服务，`externalPublishing=false`。

这些结果验证本地编辑与连接窗口机制。真实 GitHub owner OAuth、通过编辑器产生远程 commit 和生产两种身份的流程需独立验证；GitHub Actions / Pages 首版发布与实际访客页面已在下面记录。

## 真实 GitHub Pages 首版验证（2026-10-04）

通过 GitHub 官方公开 API 确认 `Z-hang729/Z-hang-Homepage` 为公开仓库，默认分支为 `main`。Actions [run 37190475493](https://github.com/Z-hang729/Z-hang-Homepage/actions/runs/37190475493) 的 build 与 deploy jobs 均为 `completed / success`。

- 已发布 commit：`d0da71da523efffb82cac8dc5ac3e8d7447e7b16`。
- `github-pages` deployment ID：`6838966068`；最新状态 `success`，状态记录时间 `2026-10-04T08:56:10Z`。
- 实际网址：[https://z-hang729.github.io/Z-hang-Homepage/](https://z-hang729.github.io/Z-hang-Homepage/)。首页 HTTP 200，标题为 `An academic garden · Z-hang`，资源与导航正确使用 `/Z-hang-Homepage/`。

使用新的独立 headless Chrome profile，直接检查上述真实网站，没有读取用户的浏览器 profile、cookie 或 OAuth 窗口。页面验证全部通过：

- 1440 / 1280 / 768 / 390 / 320 px 布局无整体横向溢出；已查看真实桌面与手机截图。
- 深浅主题切换及刷新保留；Pagefind 输入 `plasma` 实际返回结果，结果链接保留仓库路径前缀。
- Research 筛选与时间轴、课程阅读页 KaTeX 和 Mermaid 图节点、手机菜单与折叠目录正常。
- 示例 PDF 返回 HTTP 200、PDF Content-Type 和 `%PDF-` 文件签名；手机提供打开与下载入口。
- 首页、三类归档、About、CV、Publications、科研和课程阅读页均无 owner 编辑控制。公开 `/admin/` 为只读；`/owner/` 的界面加载完成，生产页面不提供本地登录按钮。
- 浏览器异常、console error 和 HTTP 400 及以上失败请求均为零。

证据：`.local/qa/public-live/results.json` 与同目录 PNG；临时只读验证脚本位于 `.local/browser-remote-check.mjs`。这些资料都位于忽略目录，不进入公开内容。

此记录对应上述首版 commit。该版本未配置线上编辑后端；后续后端配置、生产 OAuth 和通过编辑器发布的验证应单独追加实际结果，不由静态页面检查推断。

## 真实编辑服务门禁（2026-10-04）

Cloudflare Worker `https://z-hang-owner-cms.zhang-owner-worker.workers.dev` 已成功部署，version `6289870c-a3dd-4179-8cc9-9e73c38f7016`。GitHub App `5184269` 的 installation `167835885` 只选择目标仓库；实际界面核验 webhook 关闭、短期用户令牌到期启用。密钥通过官方 Wrangler stdin 写入，列表仅核验名称。

真实匿名 HTTP 检查 10/10 通过：配置健康、可信 Pages bridge、匿名安全会话、不可信 origin、直接会话访问、跨域写入、匿名同源写入、非导航登录、无效回调，以及导航 OAuth 的正确 Client ID / callback / PKCE S256 / Secure + HttpOnly + SameSite=Lax Cookie。仅校验响应，不记录 Cookie、OAuth state、token 或完整响应体，也未写入网站内容。

证据在根目录忽略文件 `.local/backend-production-smoke.json`。这些结果验证真实服务可用及匿名拒绝；不能代替 Owner 登录与实际远程发布。

## 真实 Owner 登录、发布与清理（2026-10-04）

使用已登录 GitHub 的正常浏览器专用窗口，经本站 Owner 页和后台连接 popup 完成真实 OAuth；后台按数字 ID `326471613` 验证本人身份并只接受 installation `167835885` 的单一目标仓库。未读取浏览器 cookie / 凭据数据库，也未把令牌、验证码或 OAuth URL 参数写入验证记录。

生产验证发现并修复两个问题：Cloudflare 全局 fetch 被作为实例方法调用会出现非法上下文，现在使用闭包调用；GitHub 当前 `CommittableBranch` 输入字段为 `branchName`，已通过只读 schema 查询核实并修正。拒绝诊断仅返回固定分类与已知 schema 字段，禁止回传 GitHub 原始错误或用户正文。最终 Worker version 为 `85b28fd8-fbc6-4b68-9167-96ddb3966dec`，匿名门禁重新检查 10/10 通过。

- 在真实网页中创建标记为 demo 的 `Website publishing check` 项目，选择唯一的无敏感信息小附件，先存草稿再审阅整批发布。经过修复与原请求安全重试，仅产生一个 CMS commit：`c08e7dd0696bdb5369ca107a2eeefa717cb28f8a`。它以已有 README 更新 `ea2d90572b8713ccd22cd2c5cc2958afbaaca984` 为父提交，仅新增项目 Markdown 和附件两个文件。
- [Actions 37227824551](https://github.com/Z-hang729/Z-hang-Homepage/actions/runs/37227824551) completed / success；精确相同 SHA 的 Pages deployment `6845526022` success。公开项目页与附件均 HTTP 200，附件与本地选择文件原字节相同。
- 通过相同编辑器输入精确标题确认删除，再审阅并发布。清理 commit `0c83768ad06b6db023e31adc37a2e5f47e49b306` 仅删除上述两文件；[Actions 37228251115](https://github.com/Z-hang729/Z-hang-Homepage/actions/runs/37228251115) 和 deployment `6845602309` 同 SHA success。公开测试页面和附件均 HTTP 404；正式资料未变，README 更新保留。Git 历史保留已发布的验证示例。
- 发布界面执行 Check again 验证部署反馈，清理后草稿清空，并退出 Owner 会话。新独立匿名 Chrome 对生产页面的 11 组检查通过，覆盖电脑和手机、搜索、主题、KaTeX、Mermaid、PDF、访客无编辑控件及只读 admin；没有浏览器或 HTTP 错误，已查看实际电脑和手机截图。
- 最终完整测试为 115 项通过、0 失败、0 跳过，其中 GitHub 后端 12 项。编译后的真实 workerd + SQLite OAuth 回归通过，使用虚构外部 API 响应，不代替上述真实账号验证。

无凭据的实测证据：仓库根目录忽略文件 `.local/owner-production-proof.json`，以及 `hub/.local/qa/public-live/results.json` 和截图。GitHub Pages 是编辑器自动发布目标；Sites 是通过 Sites 工作流同步的独立预览，GitHub commit 不会自动同步到 Sites。

## 文件存储升级：发布前验证（2026-10-05）

本轮从远程用户最新提交 `74f40cc8a5970db0b6f0a9ad9abfdd5de41d9aee` 开始，备份分支为 `backup/before-file-system-v2`。忽略目录中的基线清单对 18 个首页、个人资料、已有内容及头像文件逐项核对 SHA256，结果全部一致；用户删除的旧页面没有恢复。

- Node 自动测试 157/157 通过，包含真实存储容量路由、超过 1000 项队列、分块校验与恢复、并发失败隔离、元数据发布、共享原件删除保护、预览读取预算与旧编辑流程回归。
- Astro 检查为 0 errors、0 warnings（10 个开发提示）；按实际 Pages 路径构建 34 页，779 项链接、资源与锚点检查通过。
- 7 组隔离浏览器上传/管理验证通过：12 MiB 原件字节一致、目录和 ZIP、一次草稿批次、稳定 ID 替换、删除确认、导入/同步及手机队列无溢出。16 组独立阅读器浏览器验证通过，覆盖各类预览、按需读取、安全下载及关联页；测试使用虚构存储服务，不代表生产账号的上传结果。
- 编译后的真实 workerd + SQLite DO 验证 12 MiB 流式上传、上游 Content-Length、作用域票据、幂等完成及未发布预览拒绝；外部 API 响应为虚构夹具。
- 最新真实 Worker version `23910430-4bed-4ae0-983f-6b620e6ae925` 已上线，匿名生产安全门禁 10/10 通过。

证据：`hub/.local/qa/storage-browser/results.json`、`hub/.local/qa/file-reader/results.json`、根目录 `.local/file-storage-v2-baseline.json` 和 `.local/backend-production-smoke.json`，均不进入公开仓库。

本轮配置保持原单仓库 GitHub App 安装范围，默认使用网站仓库 Releases。Cloudflare R2 API 返回账户尚未开通，需要账户本人在控制台完成开通/账单确认；因此当前不能声称真实多 GB R2 上传已验证。GitHub Releases 的实际上传及清理闭环另行记录，不从隔离测试推断。

## 文件存储升级：真实上传与公开读取（2026-10-05）

初次实现提交 `5811390eff75474a75b8d61fe71df160a6dd8a2d` 已经 [Actions 37261555416](https://github.com/Z-hang729/Z-hang-Homepage/actions/runs/37261555416) 和同 SHA 的 Pages deployment `6851054486` 成功发布。本轮始终保留用户最新首页与内容；18 个基线文件逐字节核对没有变化。

- 在真实 Owner 页面并发上传两个各 12 MiB 的 `.dat` 测试原件和一个 163 字节文本原件。单文件超过旧 10 MiB 限制、总量超过旧 20 MiB 限制；三个文件均为专门生成的无敏感信息夹具，没有上传个人研究资料。
- 上传后统一审阅发布，仅产生一个元数据 commit：`c12250ba0ef1da3c281407395869b33cd704ceb0`，父提交为 `5811390eff75474a75b8d61fe71df160a6dd8a2d`。该 commit 仅新增三个 JSON 记录，原件保存在 Releases，没有进入这次 Git commit。[Actions 37262198708](https://github.com/Z-hang729/Z-hang-Homepage/actions/runs/37262198708) 和同 SHA 的 Pages deployment `6851149777` 均为 success。
- 三个原件的本地 SHA256、元数据 SHA256、GitHub asset digest 和公开下载 SHA256 一致。稳定文件页面与原件下载均为 HTTP 200；公开 HEAD 保留原始文件名和大小，Range 返回 HTTP 206 与正确的 32 字节片段。
- 实际网站的 12 项只读浏览器检查通过，覆盖文件库搜索、稳定文件页、文本预览、原件下载、当前首页与 About 头像、已有公式和图表、15 条当前页面的手机布局与访客无编辑控件。文本夹具显示正常；两个二进制 `.dat` 不属于可解码 UTF-8 文本，预览安全失败后下载仍可用，没有把它们计为科学数据预览成功。没有浏览器异常或失败 HTTP 请求。

随后经相同 Owner 编辑器发布删除元数据，commit 为 `b9e2f9b6c02db8e53e0c5d89a4e685da067f8aac`，仅删除这三个测试 JSON；[Actions 37269153920](https://github.com/Z-hang729/Z-hang-Homepage/actions/runs/37269153920) 和同 SHA 的 Pages deployment `6852205382` 均为 success。再通过真实 File manager 执行受当前 HEAD 引用检查保护的原件清理。`2026-10-05T05:56:32.526Z` 的只读核验确认三个元数据与 GitHub Release 原件均不存在，三个公开页面和本站原件代理均返回 HTTP 404，清理结果 `passed: true`。清理后 18 个受保护文件再次核对一致。

无凭据的真实证据在根目录 `.local/storage-production-proof.json` 和 `.local/qa/storage-public-smoke-files/results.json`；截图、夹具和验证工具均位于忽略目录，不进入公开网站源码。

## 文件存储升级：后端修复与当前边界（2026-10-05）

生产检查发现并修复公开元数据读取在真实 workerd 中的 redirect 兼容问题。后台发布指针更新通过串行发布与 SQLite 事务保护，安全重放以当前 HEAD 为准；并发上传开始阶段串行分配 Release 容器和预留资产位置，原件传输仍可并行。最新已部署 Worker version 为 `0f3aab00-95e9-4bc1-a712-bd2e08bb7e5a`，匿名生产安全门禁再次 10/10 通过。

- 当前完整 Node 自动测试 163/163 通过，其中包含 12 项后端身份认证测试。新增回归包含发布/删除重放、并发 Release 分配和元数据重定向拒绝。最终 Astro 检查为 0 errors、0 warnings、10 hints；实际 Pages 路径构建 34 页，779 项本地链接、资源与锚点检查全部通过。
- 编译后的真实 workerd + SQLite DO 完成 Owner 认证、无 GitHub token 的上传票据/CORS、12 MiB 流式传输、一次原子元数据发布，以及发布后的公开全量 SHA256、HEAD、Range 和重定向拒绝验证。此处使用虚构外部提供方响应，运行时兼容性结果与上面的真实 GitHub 账号实测分别记录。
- 7 组上传/管理和 16 组阅读器隔离浏览器证据仍有效，见 `hub/.local/qa/storage-browser/results.json`、`hub/.local/qa/file-reader/results.json`。它们不证明真实 R2 已开通或多 GB 对象已上传。
- 登录恢复现在与正常发布共用确认提交后的原件清理流程。新增 9 组隔离浏览器回归执行真实 Owner client、发布状态转换和 IndexedDB：已确认提交先保存回执再清理；未确认、认证过期和未知发布状态保留原请求并阻止清理；仍被引用或暂时删除失败的回执保留以供重试。所有分支内容保持一致、没有浏览器异常或远程写入，证据为 `hub/.local/qa/owner-recovery/results.json`。

当前真实可用上传路径为 GitHub Releases 的安全流式转发，入口容量为 `100000000` 字节；GitHub 单 asset 的平台容量小于 2 GiB，不代表当前 Worker 入口可以接收这么大的请求。文件数量和整批累计容量没有旧的应用级限制。超过转发入口的文件需要已配置的对象存储直传。

R2 账户查询实际返回 `10042: Please enable R2 through Cloudflare Dashboard`，尚未完成账户本人开通/账单确认。大文件预签名直传、multipart 和恢复代码已实现并经过模拟验证，但真实 R2 bucket、凭据和多 GB 上传未验证；生产仍保持原单仓库 GitHub App 授权范围，没有自动扩大授权或创建资产仓库。
