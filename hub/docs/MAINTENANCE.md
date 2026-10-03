# 长期维护指南

## 半年以后从哪里开始

进入 `academic-site/hub/`，读取 README 与 `package.json`，确认使用 Node.js 24。运行 `npm ci`、`npm run dev`，先查看网站和已有内容，再修改。源码在 `src/`，公开附件在 `public/`；`dist/` 为自动生成文件，修改它不会持续保留。

常规更新顺序：`git pull --ff-only` → 编辑或 `npm run admin` → 浏览器预览 → `npm run check` → `npm test` → `npm run build` → `git diff` → commit / push。若没有远程仓库，跳过 pull / push，先保留本地备份。

## 新增科研、课程和项目

复制同类别的 `index.md` 到新 slug 目录，修改全部 frontmatter。将 `demo` 改为 `false` 的前提是正文确实描述你的真实工作；不要仅去掉 Demo 标签而保留样例结论。填写有效的 `date` 与 `updated`，后者不能早于前者。

- 科研：`src/content/research/{slug}/index.md`，填写 status。
- 课程：`src/content/notes/{slug}/index.md`，填写 course / semester / category / progress。
- 项目：`src/content/projects/{slug}/index.md`，填写 techStack 与真实链接。

设置 `featured: true` 可加入主页精选，最近内容与标签由 collection 自动计算。新建内容不需要修改 Astro 路由。稳定 URL 由文件夹决定；更名标题不更改目录。确需改 slug 时，同时更新日志的 project、内容链接以及引用它的附件路径，并保留迁移记录。

## 添加科研日志

在 `src/content/logs/{research-slug}/` 新建 `YYYY-MM-DD.md`，frontmatter 写 `title`、`project`、`date`。当天多次更新可用 `YYYY-MM-DD-topic.md`，日期字段仍使用有效的日历日期。每条日志记录问题、输入、假设、实现版本、结果与下一步；区分实际结果与计划。项目页面按日期组织日志。

## 导入整个文件夹

用 README 的 import 命令或本地 Admin 导入。源目录保持不变，目标已经存在时停止导入。请选择新的 slug 或先手动整理，不要通过删除已有目录解决冲突。生成的 `metadata.yaml` 记录原文件名、层级、文件类型、字节数与略过原因。

修改展示信息只编辑 `index.md` frontmatter。阅读子页面位于项目的 `files/`，公开副本位于 `public/uploads/`。后续修改阅读内容应编辑网站副本，原始研究文件仍在原目录管理。import 不是双向同步工具；重新导入也不会覆盖既有网站资料。

导入的 Markdown / MDX 视为资料：原文件名和内容保留在下载副本中，阅读页统一生成 `.md`，MDX 的 import、export、表达式和组件不执行。原始 HTML 显示为文本；代码块、公式、Markdown 图片和链接继续正常显示。若同一目录有同名的 `.md` 与 `.mdx`，导入会停止以避免阅读 URL 冲突，请先给其中一份资料改名。需要使用可执行 MDX 组件时，应由你在网站源码中审查并手工添加。

## 添加 PDF、图片和代码

将可公开的小文件放到 `public/uploads/{kind}/{slug}/`，在 attachments 写 `/uploads/{kind}/{slug}/filename.pdf`。使用 title 给文件一个易读标题，`type: pdf` 提供 PDF 预览。

图片在正文使用 Markdown 图片语法并填写有意义的 alt 文本，说明图注、数据来源、处理方式和单位。图像大小适度，保持清晰；原始观测数据不作为网页图片上传。代码说明环境、依赖、用途和运行限制；没有实际执行验证时不要宣称可独立运行。

FITS / FTS / FIT、IDL SAVE、视频、压缩包与大于 10 MiB 的文件保存到研究归档或外部存储。网站只保存 metadata、缩略图与真实下载链接。外部资源同时记录提供者、版本、日期精度、许可或公开范围；需要永久引用时使用 DOI / 机构稳定地址。

## 修改头像、CV 和联系方式

上传真实头像和 CV PDF 到 `public/uploads/`，编辑 `profile.yaml` 的 `avatar` 与 `cvPdf`；确认文件存在后再设置路径。`email`、`github`、其他 links 都是公开信息，空字符串代表不公开。未知 ORCID、Scholar、论文、奖项、导师信息保持空，不填占位链接。

网页 CV 从 profile 数据生成，PDF 是独立文件，不会自动由网页 CV 编译。更新履历时审查二者是否一致，再更新 `lastUpdated`。

## 修改主页和全站样式

主页个人信息、Currently、教育和 timeline 编辑 `profile.yaml`；导航编辑 `navigation.yaml`；网站日志编辑 `changelog.yaml`。精选顺序与状态由内容的 metadata 控制。布局变化才编辑 `src/pages/`、`src/components/`、`src/layouts/`。

颜色、字号、间距与组件状态集中在 `src/styles/`。同时检查 light / dark，320–390 px 手机与桌面宽度。用 Tab 检查焦点、键盘菜单和搜索；启用 reduced motion 后动画应停止或减少。长标题、中文、数学、代码、表格与 PDF 是常见溢出来源。

## 搜索、数学和图表

Pagefind 索引由 build 生成，每次发布前必须重新 build。开发服务器提示索引未生成时，运行 build 后用 preview 验证。正文数学使用 KaTeX 支持的 LaTeX 命令；复杂宏、错误括号、遗漏 `$` 会导致渲染失败。Mermaid 用 fenced block，图中文字避免非必要 HTML；先查看控制台和图本身。

## 部署与域名

GitHub Pages 设置 Source 为 GitHub Actions，工作流构建 `hub/`。自动从 Pages 配置读取 origin / base，必要时用 repository Variables 覆盖 `SITE_URL` 与 `SITE_BASE_PATH`。`REPO_URL` 来自当前仓库，未配置远程时源码与 Edit 链接不伪造。

用户名站点通常使用 `/`；普通项目站点使用 `/仓库名`。base 只在构建配置中设置，内容写根相对路径。自定义域名需配置真实 DNS、Pages 域名与 `public/CNAME`，重新构建后检查 HTTPS、canonical、sitemap 与 RSS。

首次实际发布需要 GitHub 账号、仓库选择与授权；本地 build 成功不等于已部署。线上检查 Actions deployment 的实际 URL 和完成状态。

## 回滚

若已发布提交有问题，先记录错误提交。在有远端的正常分支上，使用 `git revert COMMIT_SHA` 创建一个反向提交，验证后 push，工作流重新发布。不要对共享 main 使用 reset + force push。

仅撤回一个尚未提交的文件时，先保存你的本地副本，再用 `git restore -- path/to/file`；这是会丢失该文件未提交编辑的动作，必须明确知道要撤回什么。新的素材目录不要直接批量删除，先确认备份和引用。

## 备份与升级

Git 保存网站源码和公开附件；原始科学数据、旧网站本地数据库、私人课程资料另做备份。需要脱离 GitHub 的恢复副本时，可在父目录运行 `git bundle create academic-site-backup.bundle --all`；该 bundle 只包含已提交历史，未提交文件和原始数据仍需单独备份。

依赖升级在独立分支进行：检查官方 release / migration 文档，更新 package 与 lockfile，运行 check / test / build 与浏览器 QA。不要定期盲目使用 `npm audit fix --force`。README 的版本描述应与实际 lockfile 保持一致。

## 未来扩展

publications collection 已预留 Paper / Conference / Poster / Talk / Software / Dataset。真实成果出现后再填。第一版 reference list 使用明确标题和 URL，BibTeX 与双语路由是后续扩展；不要把预留开关描述成已经实现完整多语言切换或自动文献管理。

旧网站迁移应独立审查原始文件、来源、可公开范围、旧 URL 与新 metadata 的映射，保持历史数据与提供者文件名。新站不会自动下载旧 Sites 或原研究目录的全部资产。
