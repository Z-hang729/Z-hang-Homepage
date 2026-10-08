# Z-hang’s Academic File Library

本文件描述 2026-10 Academic File Library 升级后的实现。日常操作见 [Owner 使用指南](FILE-LIBRARY-OWNER-GUIDE.md)，部署与存储配置见 [STORAGE.md](STORAGE.md)。本轮没有重建 Homepage，也没有改写 Research、Notes、Projects 的现有内容。

## 架构与数据来源

网站入口为 `/files/`，每个文件的稳定页面为 `/files/<id>/`。GitHub Pages 承载静态页面；GitHub 仓库保存源代码、内容和开放格式的 JSON metadata；GitHub Releases 或可选的 R2 保存二进制原件。文件重命名、移动、关联页面或迁移存储时保留同一 ID，因此分享地址保持不变。

| 层 | 实现 | 职责 |
| --- | --- | --- |
| FileMetadata / FileRelations | `src/lib/files.mjs`、`src/lib/file-records.ts` | 校验、标准化、多页面关联、分类、检索文本、稳定链接 |
| StorageAdapter | `owner-backend/storage-adapters.mjs` | GitHub Release、R2、已有仓库原件、External URL 的 provider I/O |
| StorageRouter / 服务端授权 | `owner-backend/storage.mjs`、`service.mjs` | Owner 权限、上传 ticket、multipart、发布引用、安全下载、删除 |
| UploadQueue | `src/owner/storage-upload.js`、`storage-store.js` | 有界分块哈希、并发上传、进度、重试、暂停、恢复 |
| PreviewRouter | `src/file-preview/preview.js` 及独立 viewer 模块 | 按文件类型延迟加载只读预览 |
| FileLibraryUI | `src/pages/files/`、`FileCard.astro`、`FileResources.astro` | 浏览、筛选、排序、树、稳定详情和原件下载 |
| OwnerFileManager | `src/owner/storage.js`、`storage-library-model.js` | 上传、批量 metadata、关系、移动、替换、删除、导入 |

Git metadata 是内容目录的唯一事实来源。后端的上传会话和已发布对象索引用于安全校验与恢复，不建立另一份可独立编辑的内容数据库。迁移 provider 不需要重写 Research/Notes/Projects 正文。

## Metadata schema

每个文件对应 `src/data/files/<id>.json`。详情路由使用稳定 `id`；`slug` 是预留的可读 metadata，当前不以改 slug 的方式变更永久页面地址。

| 字段 | 含义 |
| --- | --- |
| `id`, `slug` | 稳定标识；缺省 slug 等于 ID |
| `name`, `displayName`, `originalName` | 名称、可改显示名称、下载时保留的原始文件名 |
| `description` | 安全渲染的 Markdown；不允许执行原始 HTML |
| `extension`, `mimeType`, `size`, `previewType` | 文件识别、原件字节数、选择性预览类型 |
| `category`, `tags`, `relativePath` | Research / Notes / Projects / General、标签、逻辑路径 |
| `storageProvider`, `storageKey` | provider 与物理对象定位，不随显示名称更改 |
| `downloadUrl`, `previewUrl` | 永久原件/预览入口，不能保存临时签名或 token URL |
| `sha256`, `checksum` | SHA-256；两个字段表示相同值，旧文件可暂缺 |
| `uploadedAt`, `updatedAt`, `createdBy` | 上传、更新与创建者信息 |
| `relatedResearch`, `relatedNote`, `relatedProject` | 页面 slug 数组；同一文件可以关联多个页面 |
| `researchId`, `noteId`, `projectId` | 兼容旧记录，标准化时对应各关系数组首项 |
| `folderId`, `folderName`, `folderDownloadUrl`, `isFolderBundle` | 上传文件夹分组、可选 ZIP 快照 |
| `visibility` | `public` 或 `unlisted`；本阶段拒绝伪装成私密文件的 `private` |
| `version`, `versions`, `source`, `sourceUrl` | 当前版本、可选旧版本事实与来源 |
| `authors`, `year`, `doi`, `license`, `citation` | 可选学术引用信息 |
| `instrument`, `telescope`, `observationDate`, `observationTime`, `datasetType`, `wavelength`, `cadence`, `dimensions`, `units` | 可选科研信息；普通文件不必填写 |
| `course`, `project`, `featured`, `isDerivative`, `parentFileId` | 可选上下文、预留 featured 与衍生文件关系 |

文件必须是 first-class record，而不是复制到每个关联页面下的不同二进制。`fileRelations`、`withFileRelations` 统一读写新旧关联；`fileGroup` 统一文件分类；`fileSearchText` 统一 metadata 检索内容。关联变更需通过现有页面检查。

## 浏览与关联

Library 提供 Grid、List、Folders 三种视图。搜索基于本地已发布 metadata，不向数据库请求，也不下载原件全文。可搜索名称、Markdown 描述、标签、扩展名、文件夹、学术信息及关联页面的标题/课程信息。多个搜索词同时匹配。

筛选包括文件类型、Collection、文件夹、标签和更新时间；排序包括 Recently Updated、Recently Added、Name、Largest First。PDF 同时出现在 PDF 和 Documents 筛选。关系数组允许同一文件出现在多个 Collection 的关联结果中。URL query 保存检索条件，详情中的标签可返回对应筛选。

Research、Notes、Projects 详情自动呈现关联 File Cards 和文件树。Owner 可以 Add Existing File，复用同一个 record/blob。衍生预览和文件夹 ZIP 快照不作为普通文件卡片混入主列表。

## 上传和发布

1. Owner 选择任意扩展名的文件、多个文件或目录，保留原始相对路径。
2. 队列只保留 File 引用，使用 8 MiB 分块计算 SHA-256；UI 默认显示前 100 项，可继续展开。
3. 实际并发可选 3–6 个文件；单项支持暂停、恢复、重试、取消。总文件数和总字节数没有固定应用上限。
4. GitHub Release 上传使用服务端授权的原始流中转；已配置 R2 时使用浏览器直传，较大对象使用 multipart。
5. 上传成功后选择 **Add completed files to draft**，统一 Review，然后 **Publish Changes**。

一次 metadata 批次产生一次 Git commit/Pages deployment，不为每个 blob 单独发布。metadata 请求仍受 32 MiB RPC 容量和单 JSON 1 MiB 校验约束，这些是 metadata 通道保护，不是文件存储容量或队列数量上限。

IndexedDB 保存非敏感上传事实、已完成部分、待处理记录和清理回执，不保存 GitHub/R2 永久凭据或临时上传 URL。刷新后浏览器通常需要重新选择同名同大小的原件，并通过哈希确认才能继续。上传会话最长 7 天；短期上传授权需登录后重新签发。GitHub relay 中断后可能需要重传该文件；R2 multipart 可恢复已确认的部分。

选择文件后，按扩展名与路径显示类型/Collection 建议，并识别 README 与 cover/thumbnail 候选。建议只作提示，不自动改变所选 Collection、关系、description、正文或封面。README 可由 Owner 检查后用于文件夹说明/overview；封面候选也必须由 Owner 自己选择使用。

## 预览模块与预算

点击 **Open preview** 才加载对应 viewer。首页不加载 PDF.js、FITS 图像解析或 Notebook 文件内容。预览失败保留 File Information、Download Original、Copy Link，并可重试。下面都是浏览器预览预算，绝不决定原件是否允许保存。

| 格式 / 模块 | 当前行为与预算 |
| --- | --- |
| PDF / `pdf-viewer.js` | PDF.js 只读 canvas，翻页、页码、缩放、Fit Width、全屏、下载。超过 32 MiB 时必须有有效 Range；关闭自动预取，禁用 XFA、脚本求值与可交互注释 |
| Raster image / `image-viewer.js` | PNG/JPEG/WebP/GIF/AVIF/BMP，缩放、拖动平移、Fit Width、全屏；当前原图预览预算 32 MiB；TIFF 等保留信息与下载 |
| Markdown | 复用安全 Markdown、GFM、KaTeX 与 strict Mermaid；最多 2 MiB 前缀 |
| Code/text / `text-viewer.js` | 初始 256 KiB，Load More 每次增加 256 KiB，最多 2 MiB；显示最多 5,000 行。行号、Copy、语言、下载；较小片段延迟加载语法高亮，失败退回纯文本 |
| CSV/TSV / `table-viewer.js` | 读取最多 256 KiB；可显示前 100/500 数据行；列名、排序、过滤仅作用于已加载部分 |
| JSON/YAML / `structured-viewer.js` | 读取最多 2 MiB；可折叠、按需展开、复制格式化结果。最多 5,000 字段、32 层；超预算显示有界源码；YAML 禁用 alias 扩展 |
| Notebook / `notebook-viewer.js` | 最多 2 MiB、500 cells、每 cell 最多 100 outputs；Markdown、代码、执行次数、已保存文本/安全 raster 输出；永远不运行代码或输出 HTML |
| FITS/FIT/FTS / `fits-viewer.js` | 最多 256 KiB header，BITPIX、NAXIS、轴、日期、仪器、望远镜、曝光；另点按钮加载小型 primary 2D 图像，最多 1,048,576 像素、8 MiB pixel data；linear/log、min/max、缩放平移和像素值 |
| Audio/video | 原生 controls，metadata preload，不 autoplay；浏览器不支持 codec 时下载原件 |
| HDF5/NetCDF/CDF/NumPy/MATLAB/IDL data、archives、Office、unknown | File Information + Download Original；本阶段不启动服务器解析/计算、解压、编译或第三方 Office viewer |
| HTML/SVG/XML/可执行与宏内容 | 安全下载；JavaScript/PowerShell 等可作为惰性源码文本显示，永远不执行 |

`readPreviewBytes` 即使遇到忽略 Range 的服务器，也在预算处取消读取。FITS 坐标显示为 FITS 的 1-based 轴顺序，图像轴 2 向上；64-bit integer 的浏览器显示可能有精度近似，原始数据不变。多 HDU、压缩图像和超大科学数据本阶段主要提供 header/metadata/download。

## 原件与文件夹下载

Copy Link 分享稳定网站页面。Download Original 下载原件，安全代理在支持时设置原始文件名、Range/HEAD 与内容安全头，不重新压缩科研图片。外部 URL 的 CORS、文件名和可用性仍由提供方控制。

当前文件夹最多 100 文件且总计不超过 256 MiB 时可生成 ZIP；支持文件保存 API 的浏览器写入所选本地文件，否则使用有界 Blob。超过这个浏览器 ZIP 预算时下载开放 JSON manifest：包含路径、原件链接、稳定页面、字节数和 SHA-256。已有 **Uploaded ZIP snapshot** 可直接下载；它代表上传当时的快照，之后的单文件修改不会自动更新 ZIP。大目录不会在浏览器临时组合 20 GB ZIP。

## 编辑、替换与删除的语义

Rename/Move/Attach/Detach/批量标签只修改 metadata，不重新传输原件。Replace 保留 ID 和永久页面，成功发布新版本后清理不再被引用的旧对象；`versions` 保留名称、大小、哈希和时间等事实，不保证 provider 永久保留旧二进制。

明确删除已存储原件时，Owner 必须输入显示名称确认。服务端在与发布相同的串行队列中检查当前 HEAD、metadata SHA、文件名、Owner 与共享引用；provider 确认删除后，才将 metadata 删除加入草稿。失败时 metadata 保留。删除回执可重试/恢复，避免网络丢失响应导致误重复处理。

**原件删除成功后，下载会立即失效；网站列表在随后 Publish/Deploy 后移除。** 这是 provider-first 删除的明确后果；不要把恢复 Git metadata 误认为恢复已删除的原件。已有 repository 资源和 External URL 删除只移除 Library record，保留原件，保护 Homepage/正文的旧嵌入链接。替换后的旧对象清理则继续在发布后进行。

## 安全、SEO 与公开性

Owner 复用既有 GitHub App 登录、精确 origin/source 校验、CSRF/PKCE、后端 session 与最小仓库授权。Visitor 无法写入、上传、移动或删除。storage key 由服务端生成，路径禁止 traversal/control characters；MIME/magic 检查辅助预览，不把未知扩展名当成存储拒绝理由。

永久 GitHub token、OAuth secret、session key、R2 key 只在后端。公开 URL 校验拒绝内网目标和签名/token URL；外部导入建立 metadata，不任意抓取用户 URL。Release 跳转验证可信 host，安全代理只提供经过发布校验的对象。

Public 详情拥有网站 canonical/OG，可加入 sitemap。Unlisted 不进 Library、Pagefind 和 sitemap，详情 noindex，但其 URL、Git metadata 和原件仍可能公开；它不是私密访问控制。Owner/Admin/草稿入口保持 noindex。

## 兼容迁移与回滚

本轮开发前备份分支为 `backup/before-academic-file-library`，基线为用户最新 commit `c94b5819b87b67652cc4e01ceca6a138de48a051`。ignored 本地 Homepage snapshot 为 `.local/academic-file-library-baseline.json`，保护 19 个当前文件。不要使用更早 prompt、Demo、旧 Sites 或旧升级基线覆盖它。

旧 `/admin/` 的二进制文件夹导入入口已退休；所有文件/目录上传统一进入 Owner Library。本地页面仍保留 YAML/Markdown 编辑器及结构化学术条目模板创建。`import:research`、`import:notes`、`import:project` CLI 是显式的内容转换工具，其选取/转换规则不代表 Universal File Library 的存储政策。

在 `hub` 目录执行：

```sh
npm run migrate-files
npm run migrate-files -- --write
```

默认 dry run；`--write` 先将已有 JSON 和 manifest 备份到 `.local/file-migration-backups/<timestamp>/`，再标准化 JSON 并索引 `public/uploads` 的旧原件。路径产生确定性 ID，已索引原件不重复创建；不移动、删除或重写原件、Homepage、正文。已有文件 ID 和链接保留。本轮对一个旧 PDF 记录升级，并索引两个已有图片原件。

回滚实现时逐项比较/撤回实现文件；不要把 main 硬重置到备份分支，否则会丢弃之后的用户编辑。新 metadata 和对象应先备份，再做兼容回滚。

## 验证与排错入口

```sh
npm test
npm run check
npm run build
node scripts/library-browser-qa.mjs
node scripts/file-browser-qa.mjs
node scripts/storage-browser-qa.mjs
```

后三项使用隔离副本与专用浏览器 profile，不在正式用户文件中创建测试内容。Library QA 覆盖生产 base path、多关联搜索/筛选、三视图、稳定复制、20 GB manifest 模拟、移动端/主题、Markdown 安全、unlisted。provider/队列测试包含大量文件、分块内存预算、进度、重试和大文件模拟；模拟通过不等于真实 R2 已配置。最终发布证据单独记录，不把本指南中的功能表当作生产验收报告。

Preview unavailable 时首先保留下载路径，检查 CORS/Range/文件格式。Storage unavailable 时仍能浏览 metadata；不能上传超 relay 的文件时按 [STORAGE.md](STORAGE.md) 配置 R2 或导入已公开原件。发现 Homepage 意外变化时立即与本轮 snapshot/最新用户 HEAD 对比，不恢复旧版本文案。
