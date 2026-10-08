# Academic File Library — Storage Configuration

本指南对应 [FILE-LIBRARY.md](FILE-LIBRARY.md) 的当前实现。所有源代码和 metadata 仍由 `Z-hang729/Z-hang-Homepage` 的 main 管理。原件存储与网站部署分离；修改显示名称、文件夹或关系不复制大文件。

## 当前线上配置

| 服务 | 当前状态 |
| --- | --- |
| GitHub Pages | `https://z-hang729.github.io/Z-hang-Homepage/` |
| Owner backend | `https://z-hang-owner-cms.zhang-owner-worker.workers.dev` |
| GitHub Release 原件 | 已授权的 `Z-hang-Homepage` 仓库；Owner 自动创建/选择 Release |
| 独立 Assets 仓库 | 代码支持，当前没有启用 |
| R2 | 当前没有启用；本轮账户查询返回 `10042 Please enable R2 through the Cloudflare Dashboard` |

本阶段是可用的 **GitHub-only mode**。R2 direct/multipart 的实现与 mock/runtime 测试不等于完成账户激活或真实 multi-GB 上传。任何 R2 计费/账户确认必须由账户所有者完成。

## Provider routing 与容量

实际配置见 `src/lib/files.mjs` 和已登录后的 **Storage Help**。

| Provider | 当前应用通道 | 用途 |
| --- | --- | --- |
| `github-repository` | 保留已有原件；小型内容资源由原来的受保护内容流程维护 | Avatar、cover、旧上传、Markdown 等；不是大二进制队列的目标 |
| `github-release` | 上传 relay 每文件最多 **100,000,000 bytes**；GitHub 本身每 asset 必须小于 2 GiB | 普通附件、PDF、ZIP、Notebook、Office、代码和科研文件 |
| `external-object-storage` | 配置后浏览器直接上传 R2；应用约束为 5 TiB − 5 GiB | 超过 relay 的原件、多 GB 数据与 archive |
| `external-url` | metadata-only，使用永久公开 HTTPS URL | Zenodo/OSF/机构存储及现成公开文件 |

100,000,000 bytes 是当前 Cloudflare Worker ingress/relay 容量，约 95.37 MiB；不是 GitHub Release 的原生 asset 容量，也不是 10 MB/20 MB 人为文件上限。自动路由在超过 relay 时选择可用对象存储；未配置时明确提示配置，并让其他可上传项继续。

已经上传到 GitHub Releases 的更大 asset 可以通过 **Import GitHub File / Release** 或 **Sync from GitHub Releases** 建立 record，不经过该 relay 重新传输。已有 provider 容量可能调整，升级时对照 [GitHub Releases 官方说明](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)、[Workers 请求限制](https://developers.cloudflare.com/workers/platform/limits/) 和 [R2 官方限制](https://developers.cloudflare.com/r2/platform/limits/)。

队列没有固定文件数或累计字节上限；3–6 个并发控制瞬时内存/请求压力。metadata 另外有单记录 1 MiB、RPC 32 MiB 的安全预算；CSV、Notebook、FITS 等另外有预览预算，这些均不等于原件容量。

## GitHub Releases setup

当前 GitHub App 安装仅授予指定网站仓库的最小权限。Owner backend 校验固定 Owner numeric ID、App、installation、仓库 numeric ID、main 分支和权限。不可把 token 写入浏览器、PUBLIC 环境变量、仓库或对话。

后端管理 `homepage-files-...` Release，按预留 asset slot 切换新的 Release，二进制上传并行进行。生成 asset 物理名称以避免碰撞，原始文件名保存在 JSON，下载代理恢复 Content-Disposition。上传原件不 commit 二进制；Review/Publish 一次提交 metadata。

开发/部署使用 `owner-backend/wrangler.example.jsonc` 作模板，实际 `wrangler.jsonc` 留在 ignored 本地配置。已配置的 GitHub App 与 session secrets 不应重新生成覆盖。主要后端变量：

```text
OWNER_GITHUB_ID
REPO_OWNER=Z-hang729
REPO_NAME=Z-hang-Homepage
BRANCH=main
WORKER_ORIGIN
ALLOWED_SITE_ORIGINS=["https://z-hang729.github.io"]
GITHUB_APP_ID
GITHUB_CLIENT_ID
GITHUB_INSTALLATION_ID
TARGET_REPOSITORY_ID
```

后端 secrets 为 `GITHUB_CLIENT_SECRET`、`SESSION_ENCRYPTION_KEY`；它们与前端 `PUBLIC_OWNER_BACKEND_URL` 不是一类配置。Pages 前端只知道公开 Worker URL。

## 可选独立 Assets 仓库

要启用 `Z-hang-Homepage-Assets`：

1. 创建需要的公开原件仓库并记录其 numeric repository ID。
2. 由 Owner 本人完成 GitHub App installation 变更授权，精确选择网站仓库与 Assets 仓库。
3. 设置 `ASSETS_REPO_NAME=Z-hang-Homepage-Assets`、`ASSETS_REPOSITORY_ID=<verified ID>` 并部署后端。
4. 验证新上传落到 Assets 仓库，旧网站 Release 记录与永久页面继续工作。

后端只接受约定的仓库名称与精确授权范围，不接受任意扩大到所有仓库。已有 binary 不会因为配置变更自动迁移；迁移时保持同一 metadata ID，并逐一验证新原件 SHA-256 与旧链接切换。

## 启用 R2 direct upload

1. 账户所有者在 Cloudflare Dashboard 激活 R2，完成必要账户/付款确认。
2. 创建专用 private bucket，例如 `z-hang-homepage-files`，保持公开 `r2.dev` 访问关闭。
3. 为 Worker 增加 R2 binding `FILE_BUCKET`，`bucket_name` 使用该 bucket。设置后端变量 `R2_ACCOUNT_ID`、`R2_BUCKET`。
4. 创建范围限于该 bucket 的 S3 object read/write credential。把 `R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY` 存入 **Worker Secrets**，绝不放在源文件、PUBLIC_* 或本地浏览器存储。
5. 配置 bucket CORS 精确允许网站 origin：`https://z-hang729.github.io`。Origin 不包含 `/Z-hang-Homepage` 路径；只在确有需要时另加受控开发 origin。
6. CORS 允许 `PUT`、`GET`、`HEAD` 以及所需 `Content-Type`、`Content-MD5`、`Range` request headers；expose `ETag`、`Content-Length`、`Content-Range`。不要用 wildcard origin 放宽账户授权。
7. 部署 backend，登录 Storage Help 确认 R2 Available，再做真实小文件、multipart 中断恢复、part retry、原件 SHA-256、Range/HEAD 和稳定下载验证。

binding 示例只包含公开配置：

```json
{
  "r2_buckets": [
    { "binding": "FILE_BUCKET", "bucket_name": "z-hang-homepage-files" }
  ],
  "vars": {
    "R2_ACCOUNT_ID": "<account id>",
    "R2_BUCKET": "z-hang-homepage-files"
  }
}
```

该片段需合并到实际配置，保留原有 Durable Object/vars/migrations；不要用它覆盖整个已工作的配置文件。

后端只签发短期、指定对象/方法/part 的 15 分钟 URL。浏览器直接向 R2 传 Blob slice，multi-GB 字节不经过 Worker。默认 multipart 为 16 MiB，按总大小调整以符合 10,000 parts；各部分用有界 MD5、ETag 与重试，完成后核对对象事实。公开 metadata 只存稳定 Worker URL，签名 query 不会成为共享地址。

## 公共下载与外部链接

公开下载代理 `/storage/public/<id>` 校验已发布 JSON 与对象定位，再提供 GET/HEAD/Range。原件下载指定原始文件名，设置 nosniff/CSP；HTML/SVG/宏/可执行原件不会在网站 origin 运行。GitHub Release 重定向仅允许固定可信 host。

External URL 只保存 metadata，不代理未知服务器或凭据。使用永久、公开 HTTPS 文件链接；不要粘贴需要登录的 Drive 私有链接、内网地址、OAuth token 或临时 presigned URL。外部站点的 CORS/Range 不支持时，预览可失败，原件链接仍可由用户直接打开。

## 删除、替换与备份

新 Delete 流程遵循 provider-first：精确验证 HEAD/metadata SHA/确认名称/共享引用，provider 确认后才删除草稿 metadata。失败保持记录；durable deletion receipt 与本地 recovery receipt 支持丢响应后的重试。原件确认删除至 Pages 更新完成之间，列表可能仍旧存在而下载已失效。

Repository 与 external records 只取消目录引用，原件保留，避免破坏 Homepage 或外部对象。Replace 先上传新版本、保持 ID、发布新 metadata，再清理旧对象；共享引用仍阻止错误删除。旧版本 metadata/Git history 不是二进制备份。重要数据保留独立原件备份。

备份应包括：Git source/metadata、Release 原件、对象存储原件与必要的安全配置恢复说明。密钥通过账户安全设施管理，不放进 Git backup。代码回滚逐项撤回实现，不 reset main 覆盖之后用户内容。

## 迁移

本轮备份分支为 `backup/before-academic-file-library`。在 `hub` 执行 `npm run migrate-files` 查看 dry-run，确认后 `npm run migrate-files -- --write`。迁移先备份已有 JSON，再索引旧 `public/uploads` 原件；不移动文件、不改正文或 Homepage。详见 [FILE-LIBRARY.md](FILE-LIBRARY.md)。

Provider 迁移应上传并验证目标原件，保留同一 ID，只切换 provider/key/download/preview 字段；CAS 发布成功并确认新下载后才清理旧位置。先删 provider 再尝试迁移会破坏仍在线的旧链接；该过程与明确的 **Delete File** 行为不同。

## 排错

| 现象 | 处理 |
| --- | --- |
| Configure Storage required | 文件超过当前 relay；启用 R2，或导入已托管的永久公开文件，不修改前端常量伪装突破 ingress |
| GitHub authentication expired | 保留草稿/队列，重新 Owner 登录，按需重新选择原件恢复 |
| GitHub Release rejected asset | 查看单项错误、重试；若已完成但响应丢失，由 session/asset reconciliation 恢复 |
| R2 PUT/part CORS error | 检查实际 origin、bucket binding、headers、ETag exposure、secret scope；签名过期则重新签发 |
| Multipart resume needs file | 重新选择同一原件，等待哈希确认；不要以同名不同内容替代 |
| Publish conflict | 仓库有更新；同步最新内容、Review 新草稿，不覆盖用户新的 HEAD |
| Delete conflict / shared reference | 刷新并核对记录、版本、关联；后端不会删除仍被其他 record 使用的原件 |
| Preview unavailable | 看 File Information/Download；检查 CORS/Range/格式/preview budget，不改存储白名单 |
| 网站还没更新 | 看该 metadata commit 的 Actions/Pages 状态；成功后刷新/新窗口确认，避免为同一批反复发布 |

变更配置后以 authenticated Storage Help 和实际上传/下载结果为准。不能仅因 mock 通过就标记 R2 已上线。
