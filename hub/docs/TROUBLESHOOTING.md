# 故障排查

先复制最早的具体报错，确认当前目录是 `academic-site/hub/`，不要只看日志结尾的“build failed”。修改后重跑失败的最小检查，再完整 build；无需反复执行已经通过且未受影响的步骤。

| 故障 | 检查与处理 |
| --- | --- |
| `npm ci` / install 失败 | 检查 `node --version` 是否满足 package engines，建议 Node 24；确认 lockfile 存在、npm registry 可达。版本不兼容先切换 Node。只有计划更新依赖时才用 `npm install` 重写 lockfile，保持 package 与 lockfile 同步。 |
| PowerShell 无法执行 `npm.ps1` | 在当前终端使用 `npm.cmd ci` / `npm.cmd run dev`，不需要为了网站永久降低系统执行策略。 |
| `astro` 命令找不到 | 在 hub 运行 `npm ci`，再用 `npm run ...`；不要依赖全局 Astro。 |
| Astro build schema 失败 | 查看报错的文件和字段；title / description / date / updated 必须存在，日期有效，updated 不早于 date；research status 与 notes category 必须属于允许值。 |
| Duplicate slug | 同一类别目录 slug 重复，或明确 slug 与目录不一致。选择不同稳定目录名，更新日志和链接；不覆盖旧资料。 |
| Orphan research log | `project` 必须与 `src/content/research/{slug}/` 一致，日志日期字段使用 YYYY-MM-DD。 |
| GitHub Actions `npm ci` 失败 | 检查提交了 `hub/package-lock.json`，workflow 工作目录为 hub，setup-node 与本地版本兼容。进入失败 step 阅读实际错误。 |
| GitHub Actions Pages 配置 / 权限失败 | Settings → Pages 的 Source 选择 GitHub Actions；检查 Pages 已启用、环境规则允许 main、deploy 权限含 pages:write 与 id-token:write。build 对 Pages 配置有 pages:read。不要将 PAT 填入客户端。 |
| 线上首页 404 | 区分实际部署没有完成与 URL 错误；普通仓库站点带 `/仓库名/`，用户名站点是 `/`。确认 Actions deployment URL、artifact 是 hub/dist、Pages 环境成功。 |
| 页面正常但 CSS / 图片 / 搜索 404 | 构建时 SITE_BASE_PATH 配错或内容手写了仓库前缀。字段写 `/uploads/...`，统一由模板加 base。用相同环境重新 build 和 preview，查看 check-links 报错。 |
| 修改 Markdown 插件后正文仍是旧结果 | Content Collections 可能保留已渲染 HTML。本站 `npm run build` 已使用 `astro build --force` 清除内容缓存；直接运行 Astro 时也加 `--force`，然后重新生成 Pagefind。 |
| broken local link | 确認目标页面或 public 文件真实存在；路径大小写在 Linux 严格区分。空格用 `%20`，不要写 Windows 路径、`public/` 或缺失章节锚点。 |
| 外部链接打不开 | 自动检查不联网请求外站。手动确认真实 URL、资源是否移走、是否需要账号；改用稳定来源或 DOI，不生成虚假备用链接。 |
| PDF missing | 文件必须位于 public 下；attachments URL 使用 `/uploads/...`。检查大小、大小写、Git 是否提交文件，以及 import 清单中是否因为大文件策略略过。 |
| PDF 不能内嵌 | 浏览器、移动端或外部资源可能不允许内嵌。使用 Open / Download；外部 PDF 受对方响应头限制，不能由本站保证预览。 |
| 图片路径错误 | `public/uploads/a.png` 对应 URL `/uploads/a.png`；frontmatter cover 使用同样路径。src 中文件不是 public 静态 URL；避免把本机盘符作为图片地址。 |
| Markdown 渲染错误 | 检查 frontmatter 起止 `---`、YAML 缩进、列表层级和 fenced code block。MDX 含特殊 `<` / `{` 时可能被作为 JSX，纯笔记优先 `.md`。 |
| LaTeX 渲染错误 | 检查成对 `$` / `$$`、括号和 KaTeX 支持命令；YAML 中含反斜杠的数学不使用未经处理的双引号。正文直接写 LaTeX，无需重复转义成 JavaScript 字符串。 |
| Mermaid 不显示 | 代码块语言必须是 mermaid，检查 diagram 语法和浏览器控制台；首次动态加载失败时重新刷新。简化一个最小图验证。 |
| Search 在 dev 不可用 | Pagefind 文件只在 build 生成。执行 `npm run build` 后 `npm run preview`；正确 base 下打开 search。内容变更后旧 dist 索引需要重建。 |
| Admin 保存失败 409 | 文档自打开后被另一处改动。先保留你的文本，Reload 后合并，不覆盖外部修改。 |
| Admin 公网站点不能保存 | GitHub Pages 只有静态文件；回到本机运行 npm run admin，或在你已授权的仓库中编辑 Markdown。 |
| Admin 本地请求被拒绝 | 使用终端提供的 loopback 地址；不要从不同 origin / iframe 发写入请求；检查本地开发服务仍在运行。 |
| 导入提示目标已存在 | 选择新的 --slug，或明确审查旧目录后手动合并；import 不覆盖。 |
| 导入略过文件 | 阅读 metadata.yaml 的 omitted；raw FITS、SAVE、视频、压缩包、秘密文件、符号链接与超限文件留在原目录，使用外部链接发布。 |
| publish 无法运行 | 需要已配置 origin、普通分支和交互终端；没有远程授权时应停留在本地检查，不通过默认占位地址 push。 |

常用定位命令：

```powershell
npm run validate
npm run check
npm test
npm run build
git status
git diff
```

构建成功后仍需查看实际页面：数学与代码、长中文标题、手机导航、目录折叠、PDF、主题、搜索和控制台。避免在未定位原因时批量删除源码、上传目录或旧网站数据库。
