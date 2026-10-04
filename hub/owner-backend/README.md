# Owner Worker 配置与验证

此目录是在既有 Astro / GitHub Pages 网站之外运行的轻量认证后端。公开页面继续由 GitHub Pages 提供；仓库内容仍是唯一长期内容来源。SQLite Durable Object 仅保存短期登录 state、加密会话、限流计数和发布幂等记录。没有第二套内容数据库。

当前代码已通过 10 项 GitHub API mock 集成测试、8 项前端发布恢复测试、Wrangler dry-run 打包、本地真实 workerd + SQLite Durable Object smoke test，以及 9 项独立浏览器上传 / 文件管理 / popup bridge 检查。真实 GitHub OAuth、远程 commit 和线上部署尚未配置、验证。浏览器已经登录 GitHub 不代表当前开发工具能够控制该浏览器；无需安装 GitHub 插件才能配置此后端。

## 一次性配置

1. 在自己的 GitHub 账号 [注册私有 GitHub App](https://github.com/settings/apps/new)。Homepage URL 使用 `https://z-hang729.github.io/Z-hang-Homepage/`；Callback URL 精确使用 `https://你的Worker域名/auth/callback`。启用用户 access token 到期；取消 Webhook Active；安装时不自动请求 OAuth。仅授予 Contents: Read and write、Actions: Read-only、Deployments: Read-only，Metadata: Read-only 自动随 App 提供。不要授予 Workflows 或其他权限。[GitHub 官方用户授权说明](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
2. 将 App 安装到自己的账号，选择 **Only select repositories**，只选择 `Z-hang-Homepage`。记录 App ID、Client ID、Installation ID（安装设置 URL 中的数字），以及目标 Repository ID（仓库 API 的 `id`）。Owner Account ID 已核实为 `326471613`；仓库未存在时先创建这个普通仓库并推送当前网站。不要使用或替换主页仓库。
3. 把 `wrangler.example.jsonc` 复制为本目录忽略的 `wrangler.jsonc`，填入 Worker HTTPS origin 和上述四个非秘密 ID。默认唯一允许网站 origin 是 `https://z-hang729.github.io`；origin 不含 `/Z-hang-Homepage/` 路径。需要本地联调时可额外列入精确的 `http://127.0.0.1:4321`。网站构建配置 `PUBLIC_OWNER_BACKEND_URL` 指向 Worker HTTPS origin；这个 URL 可以公开。
4. 在 Worker Secrets 中写入 `GITHUB_CLIENT_SECRET` 和 `SESSION_ENCRYPTION_KEY`。后者应为安全随机的 32 字节、64 位十六进制编码。App 私钥、PAT 和浏览器 GitHub token 均不需要。不要将秘密粘贴到聊天、公开环境变量、JSON 配置、仓库或网页。

先在 `hub` 安装既有网站依赖，再在此目录安装后端构建工具：

```powershell
npm.cmd ci
```

上面的命令需分别在 `hub` 和 `hub/owner-backend` 执行。首次部署在此目录执行：

```powershell
npx.cmd wrangler login
npx.cmd wrangler secret put GITHUB_CLIENT_SECRET --config wrangler.jsonc
npx.cmd wrangler secret put SESSION_ENCRYPTION_KEY --config wrangler.jsonc
npm.cmd run deploy
```

`secret put` 使用交互输入，避免把秘密放在命令行参数或日志里。部署会创建此配置声明的一个 SQLite Durable Object namespace；[Cloudflare 官方要求新 namespace 使用 SQLite](https://developers.cloudflare.com/changelog/post/2026-07-09-restrict-new-kv-backed-namespaces/)。使用自己的 Cloudflare 账号和 Free plan；本项目不自动创建付费资源。

`generate-manifest.mjs` 可生成非秘密的 App 配置草案：

```powershell
node generate-manifest.mjs --worker-origin=https://你的Worker域名 --site-url=https://z-hang729.github.io/Z-hang-Homepage/
```

它提供备案名称、官网、callback 和最小权限字段，供配置检查或后续受控注册使用。当前不实现 GitHub App manifest 的临时 code 转换和一键注册；推荐上面的 GitHub Settings 手动注册。生成器的停用 webhook 地址没有事件处理器，正式设置应维持 Webhook Active 关闭。[GitHub 官方 manifest 流程](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest)

## 请求与会话

- `GET /bridge/?client_origin=精确可信origin`：顶层编辑连接窗口。消息 namespace 为 `zhang-owner`，只接受固定 `window.opener` 且 `event.origin` 完全匹配的请求。
- `GET /auth/login`、`GET /auth/callback`：独立 GitHub 登录窗口，以 state + PKCE S256 防止错误回调与 code 劫持。成功后通过 Worker 同源 BroadcastChannel 通知 bridge，另有登录期间的会话检查回退。稳定的 bridge 不导航到 GitHub，因此不依赖 GitHub 保留跨域 `opener`。
- `GET /api/session`：仅给同源 bridge 读取会话和 CSRF；未登录不返回 CSRF。bridge 回传给网站时移除 CSRF。它不是 GitHub 凭据。
- `POST /api/rpc`：`{method,params}`，method 为 `session / snapshot / file / publish / history / status / logout`。所有调用必须携带 Worker 精确 Origin、有效 HttpOnly session cookie 和 `X-CSRF-Token`。此 API 不开放跨域 CORS。

`__Host-owner_session` 为 Secure、HttpOnly、SameSite=Lax、Path=/，最长两小时且不超过 GitHub token 剩余有效期；会话服务器校验 numeric Owner ID。Cookie 仅包含不可预测的随机会话标识，其 hash 用作服务器查找键。GitHub token 在 Durable Object 中以 AES-GCM 加密，刷新 token 直接丢弃。退出或到期后删除服务端会话。顶层 bridge 使用自己 origin 的第一方 cookie，不依赖第三方 cookie。

## 原子发布与状态

发布参数为 `expectedHead / idempotencyKey / message? / changes[]`。每个修改包含 `path / action / expectedSha`，upsert 额外包含 `encoding / content`。身份、repo 和 branch 不接受客户端变更。服务端重新校验 Owner、App 安装、路径、文件 SHA、内容 schema、文件魔数和限额，再调用 GitHub GraphQL `createCommitOnBranch(expectedHeadOid)`，一次创建并推进一个 commit。[官方原子 commit 合约](https://docs.github.com/en/graphql/reference/commits#createcommitonbranch)

同一个 Durable Object 串行执行发布，完整 HEAD compare-and-swap 避免覆盖并发 Git 更新。幂等请求保存内容 digest，拒绝一个 key 复用不同内容；网络响应丢失时先根据 commit 内唯一 publication trailer 查历史。无法证明上次结果时保留草稿并报告 `PUBLICATION_UNCERTAIN`，不会强制推送。

状态查询以具体 commit SHA 查询 `deploy.yml` 的 push workflow 与 `github-pages` deployment。只有该 SHA 的 Pages deployment 状态成功并提供网站 URL 才显示 Deployed。Commit 成功、build 完成、deploy 成功分别报告；Action run 成功不会被冒充为网站已经上线。

## 本地验证

```powershell
# 在 hub 中：
node --test tests/owner-backend.test.mjs
node --test tests/owner-publication.test.mjs

# 在本目录中：
npm.cmd run dry-run
npm.cmd run test:runtime

# 可选：使用独立 Chrome / Edge / Chromium 配置执行本地浏览器检查。
npm.cmd run test:browser
```

dry-run 不部署线上资源。runtime test 使用虚构配置运行本机 workerd 与 SQLite，验证路由、bridge、匿名 session、Origin 和导航校验；完整 OAuth 回调和发布失败/并发恢复在 GitHub mock suite 中验证。浏览器检查使用每次新建的独立 profile、随机调试端口、本地 fixture 和虚构 API，覆盖目录结构、拒收原因、元数据确认、移动时更新引用，以及 popup RPC 的 CSRF 和来源校验，不接触用户的登录 profile，也不发布到 GitHub。前端发布恢复测试验证草稿存储失败会阻止请求、已确认保存后的刷新失败不会改判为发布失败，以及响应丢失后复用完整请求并确认已有 commit。尚未完成真实账号测试前，不应称线上 Owner Mode 已启用。
