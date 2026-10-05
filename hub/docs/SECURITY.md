# Owner CMS 安全模型

本文件描述公开静态网站与 Owner 编辑服务之间的边界。测试中的 owner 会话不能替代生产 GitHub 身份验证；真实 App / secret / 部署尚未配置时，不宣称生产安全链路已经通过。

## 身份与授权

GitHub App 登录在服务端交换认证凭证并调用 GitHub 身份 API。服务端将返回的数字账号 ID 与 owner allowlist 比较，目标账号 `Z-hang729` 的公开数字 ID 为 `326471613`。

用户名、邮箱、前端 `isAdmin`、隐藏路径或浏览器可修改的状态均不构成授权。每一个内容读取和写入接口都必须根据服务端验证的会话检查 owner 身份；隐藏编辑按钮只是 UX，不是安全措施。

访客只能获取已经公开的静态内容。未认证、无效/过期会话与非 owner 会话必须在写入前被拒绝。App 未配置时 fail closed，不启用无需认证的生产模式。

## Token 与 secret

`GITHUB_CLIENT_SECRET` 与 `SESSION_ENCRYPTION_KEY` 保存在 Cloudflare Worker secrets。方案不使用 App private key。短期 user access token 通过 AES-GCM 加密后保存在 SQLite Durable Object，最长会话 2 小时，不保存 refresh token，不返回浏览器，也不写 localStorage、公开变量、HTML、JS、Git 仓库或 Pages。

浏览器所持有的应用会话本身仍是敏感凭证。日志不能记录 Authorization、认证 code、token、private key、完整 session 或 secret 值。

App 仅安装到网站仓库。必要 repository permissions 为 Contents: write、Metadata / Actions / Deployments: read。backend 验证 `repository_selection: selected`、所选仓库数量为一、目标仓库数字 ID、App ID 和 installation ID，拒绝其他权限。禁止请求所有账号仓库的 full access。

## OAuth、会话与请求边界

OAuth state 为随机单次值，并同时关联 server state 与 HttpOnly cookie；callback 严格校验并消耗 state，限制返回地址到本站。PKCE S256 用于防止授权 code 被截获后单独兑换。

会话 cookie 为 `__Host-owner_session`，设置 Secure、HttpOnly、SameSite=Lax，最长 2 小时。静态站打开 Worker 顶层 `/bridge/` popup，使用 Worker first-party cookie；不依赖 third-party cookie，不为绕过浏览器限制把 GitHub token 放回前端。

backend 不启用跨源 API CORS。bridge 的请求仅允许精确 Worker origin，写入还需验证 `X-CSRF-Token` 与 owner 会话。postMessage 使用固定 `zhang-owner` namespace，site origin 必须在 `ALLOWED_SITE_ORIGINS` 中，双方检查 `event.origin` 与 `event.source`，不接受任意窗口发送的编辑指令。请求体与消息体有界。

logout 使当前浏览器会话不再用于编辑；生产实现需要按实际会话机制说明撤销范围。App 权限撤销后，后续 GitHub 写入应失败并提示重新认证。

## 允许修改的位置

Owner 写入服务只接受下面的仓库相对路径：

- `hub/src/data/{profile,navigation,homepage}.yaml`，不能删除这三个必要数据文件。
- `hub/src/content/{research,notes,projects}/<ascii-slug>/index.{md,mdx}`、`metadata.yaml`、`files/**/*.md`。
- `hub/src/content/logs/<project-slug>/<log-slug>.md`。
- `hub/public/uploads/{images,documents,files,research,notes,projects}/**` 中允许的附件；后面三类必须紧接条目 ascii slug。

不得通过传入路径编辑 `.github/workflows/`、package scripts、源组件、backend、secret、环境文件或仓库中的其他项目。

路径必须规范化并拒绝绝对路径、`..`、重复/空 segment、Windows 反斜杠与盘符、控制字符、编码 traversal、保留设备名及可能逃离允许目录的路径。同名/大小写冲突不能覆盖已有文件。

浏览器导入的文件不执行代码。MDX import / export / JSX 与原始 HTML 不进入可执行阅读副本；原始文件保留为下载附件。现有可信 MDX 仅允许 metadata 变化且 body 必须完全相同；body 编辑需要转换为安全 Markdown并保留原文，不支持的表达式明确拒绝。创建和编辑 Markdown 验证格式、危险链接、原始 HTML 与保留 metadata 键。

## 上传

上传前后验证路径、实际字节数、SHA256 和存储提供者，不能仅相信前端 MIME。源码仓库导入继续拒绝活动文件、secret 与隐藏路径、生成缓存和符号链接；新的外部文件队列可存储 HTML / SVG / 可执行文件，但这些类型只提供下载，绝不执行或作为网站 HTML 嵌入。选择目录中的科研资料仍由 owner 审阅后明确开始上传。

图片、PDF、Markdown、代码、文本和 notebook 仅作为资料处理。文件名与目录保持可追溯；被略过文件记录具体原因。超限数据使用外部 DatasetLink。

文件队列没有人为的文件数或批次字节上限；提供者及流式中转容量集中在 `src/lib/files.mjs`，超过中转容量的原件需要 R2 直传。可编辑文本/单项元数据 1 MiB、发布请求 32 MiB 防止文本和元数据请求耗尽资源。旧仓库附件继续验证 base64、UTF-8 和支持格式的签名。外部原件不整批编码、不进入 Git 历史；ZIP 不解压，Notebook 不执行，预览按固定读取预算取消流。详见 [FILE-STORAGE.md](FILE-STORAGE.md)。

替换或删除已有附件显示具体对象并审查变化；未公开的本机研究数据不能因目录拖入而静默全部上传。

## 构建与 GitHub 写入

发布以 draft 开始时的 HEAD SHA 为前提。GitHub GraphQL `createCommitOnBranch(expectedHeadOid)` 在服务端原子校验 HEAD 并提交；遇到竞争返回冲突而不覆盖新提交。

Durable Object 串行处理发布。幂等键与内容 digest 绑定；重试不能复用同一键提交不同内容。commit trailer 支持网络中断后的结果查回，避免 API 回应丢失导致重复 commit。

一次审查后的发布对应一次 commit。禁止直接静默删除大量文件、覆写历史、删除 branch 或改变仓库可见性。删除条目需要 owner 的明确确认并保留 Git 历史。

GitHub Actions 只构建公开站。未经信任的可执行 MDX / script 不能通过 CMS 发布到构建任务；认证服务的私钥与会话 secret 不应作为公开站构建环境变量注入。

## 公开站隔离

未登录访客不加载完整编辑器。认证服务失败时不改变公开 HTML、导航、搜索、RSS、sitemap 和公开附件访问。

生产 bundle 和构建产物需要扫描 secret 模式，同时验证页面中没有真实密钥。源码中的示例键名与测试夹具不应被误认为生产 secret；扫描不能代替真实的凭证边界测试。

## 验证要求

至少验证：匿名写入拒绝、非 owner ID 拒绝、篡改/过期 session 拒绝、错误 Origin / CSRF 拒绝、路径逃逸拒绝、重复 slug 拒绝、超限与禁止文件拒绝、HEAD 冲突不写分支、合法 owner 一次 commit、真实 Actions 与 Pages 状态区分、访客不存在编辑控制。

每一项实际执行结果与限制记录到 `VERIFICATION.md`。生产认证与远程部署尚未执行的项目必须标为未验证，不能用本地模拟 API 的测试通过替代。

2026-10-04 的独立浏览器夹具验证了顶层 popup 的实际 RPC 往返、CSRF 留在 bridge、错误 window source 拒绝、保留上传层次和拒绝不当文件、引用附件删除保护。主站隔离副本验证了图片替换 MIME 拒收、精确标题删除确认和两次批量本地保存；公开桌面 / 手机页面没有编辑控件。测试未使用用户登录 profile、秘密文件或 GitHub 写入权限，不能代替生产 OAuth 与远程 commit 检查。

## 依赖审计记录（2026-10-04）

`npm audit` 返回 3 个 high 项，来源是 Astro 构建阶段远程图片缓存使用的 `http-cache-semantics <=4.2.0`，并向 Astro/MDX 上溯计数；当前公开 npm 最新版 4.2.0 尚无修复版本。不能为消除数字而使用 audit 建议的旧 Astro 大版本。本项目生产前台为纯静态文件；Owner Worker 不导入 Astro 或该缓存模块，会话/令牌请求明确不缓存。当前内容不使用带私密认证的 Astro 远程图片共享缓存。保留此已知依赖问题；有上游修复后升级并复验。详见 [GitHub 官方安全公告](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)。

## 恢复与事件处理

泄露或异常访问时先撤销受影响 App 权限 / secret，轮换会话加密密钥并检查 GitHub 历史。轮换 `SESSION_ENCRYPTION_KEY` 会使旧加密会话无法继续使用，需要重新登录。不要将密钥粘贴到聊天、issue、commit 或浏览器前端配置。

CMS 不可用时按 `OWNER-CMS.md` 使用 GitHub 或本地 Markdown / YAML 工作流；恢复错误内容创建新的 commit，保留既有历史。Phase 1 备份 branch 为 `backup/pre-owner-cms`。
