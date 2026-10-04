# Z-hang Academic Hub

面向长期积累的 **Personal Academic Hub + Research Archive + Digital Garden**。采用 Astro 静态生成、TypeScript、Markdown / MDX、YAML、KaTeX、Mermaid 与 Pagefind；公开站点不需要数据库、账号服务或服务器运行时。第一版 UI 使用英文，内容可中文、英文混排。

本站源码位于 `academic-site` 仓库的 `hub/`。按网站所有者的要求，旧版网站源码与页面已从当前目录删除，历史版本仅在本地备份分支保留；本站不迁移或参考旧内容。GitHub Pages 工作流构建和发布 `hub/dist/`，Sites 发布相同新站的预览版本。

本次发布目标为普通仓库 `Z-hang729/Z-hang-Homepage`。具体配置与授权后的操作见 [Deployment](docs/DEPLOYMENT.md)，已执行的检查见 [Verification](docs/VERIFICATION.md)。

Phase 2 已加入主页编辑、结构化表单、Markdown 预览、目录与附件管理、草稿恢复和一次提交整批变更。使用方式与线上配置见 [Owner CMS](docs/OWNER-CMS.md)，身份、文件与发布保护见 [Security](docs/SECURITY.md)。

## Quick Start

建议安装 **Node.js 24 LTS**；项目最低版本由 `package.json` 的 `engines` 指定。首次安装或拿到新的 lockfile 后，在 PowerShell 运行：

```powershell
Set-Location "D:\Z-hang's Site\academic-site\hub"
npm ci
npm run dev
```

打开终端输出的本地地址，默认 `http://127.0.0.1:4321/`。停止服务用 `Ctrl+C`。每次保存 Markdown、YAML 和样式后，开发页面自动刷新。

```powershell
npm run check
npm test
npm run build
npm run preview
```

`build` 依次运行内容校验、Astro 静态构建、Pagefind 搜索索引与构建产物链接检查。`preview` 预览真正发布的静态产物，搜索应以这个预览为准；开发服务器不会自动生成完整 Pagefind 索引。

## 页面与信息结构

| 路径 | 用途 |
| --- | --- |
| `/` | 简介、Current Focus、精选科研、最新日志、笔记、时间轴与项目 |
| `/research/` | 科研卡片与时间轴、状态与标签筛选 |
| `/research/{slug}/` | 科研正文、日志、资源、附件与相关内容 |
| `/notes/` | 按课程、学期、类别与标签整理笔记 |
| `/notes/{slug}/` | 课程正文、学习进度、目录、PDF 与文件 |
| `/projects/` | 计算、分析、可视化与软件项目 |
| `/about/`、`/cv/` | YAML 驱动的个人信息与网页 CV |
| `/search/` | Pagefind 搜索，快捷键 `Ctrl+K` / `Cmd+K` |
| `/tags/{tag}/` | 跨科研、笔记和项目的标签索引 |
| `/publications/` | 未来论文、报告、软件与数据成果入口 |
| `/rss.xml`、`/changelog/` | 更新订阅与网站变更记录 |
| `/admin/` | 本地管理入口；公开构建没有写入服务 |
| `/owner/` | Owner 编辑入口；线上连接 GitHub 认证后端，本地提供隔离的开发编辑服务 |

所有示例科研、课程和项目通过 `demo: true` 明确标注为 **Demo**，不代表本人已经取得的研究成果。未提供的联系方式、头像、CV 与成果保持空值，UI 不生成虚假的个人链接。

## 目录结构

```text
academic-site/                 # 原有 Git 仓库
├── .github/workflows/deploy.yml
├── hub/
│   ├── astro.config.mjs        # SSG、Markdown 插件与 URL 配置
│   ├── src/
│   │   ├── content.config.ts   # 严格内容 schema
│   │   ├── data/              # profile.yaml、navigation.yaml、changelog.yaml
│   │   ├── content/
│   │   │   ├── research/{slug}/index.md
│   │   │   ├── notes/{slug}/index.md
│   │   │   ├── projects/{slug}/index.md
│   │   │   ├── logs/{research-slug}/{date}.md
│   │   │   └── publications/
│   │   ├── components/        # 只负责显示的复用组件
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── lib/
│   │   └── styles/
│   ├── public/uploads/        # 公开的小 PDF、图片和代码附件
│   ├── scripts/               # 导入、验证、管理与发布 helper
│   ├── tests/
│   ├── docs/
│   └── dist/                  # 自动生成，不手改
└── .openai/hosting.json        # Sites 预览发布配置；不使用旧数据库
```

## Edit Profile

编辑 `src/data/profile.yaml` 即可改变姓名、简介、教育经历、研究兴趣、技能、Timeline、Currently、联系方式与 CV 路径，无需修改 Astro 组件。

```yaml
email: ""                     # 不公开时留空
github: ""                    # 填完整 https://github.com/... 地址
avatar: /uploads/profile.jpg  # 先把图片放进 public/uploads/
cvPdf: /uploads/cv.pdf         # 留空时不显示不存在的 PDF 下载
lastUpdated: '2026-10-02'
```

YAML 缩进使用空格。日期写成带引号的 `YYYY-MM-DD`；未知个人事实暂不填写。可选列表字段可以省略或设为 `[]`。新增导航项编辑 `src/data/navigation.yaml`，变更记录编辑 `src/data/changelog.yaml`。

## Add Research

新建 `src/content/research/your-project/index.md`；目录名就是稳定 URL slug，使用小写英文、数字和短横线。不要为了改标题而反复改 slug。

```markdown
---
title: Research working notes
description: A concise statement of the research question.
date: '2026-10-02'
updated: '2026-10-02'
status: Planning
tags: [Solar Physics, Python]
featured: false
demo: false
attachments: []
references: []
---

## Overview

## Research question

## Background

## Method

## Experiments

## Results

## Figures

## Code and datasets

## References
```

`status` 只接受 `Planning`、`In Progress`、`Completed`、`Paused`。可选字段包括 `cover`、`authors`、`collaborators`、`github`、`paper`、`data`、`links` 与 `attachments`。对尚未取得的结果，明确说明“计划”或“待验证”。

新增科研日志：`src/content/logs/your-project/2026-10-02.md`。

```markdown
---
title: Initial research question
project: your-project
date: '2026-10-02'
tags: [Planning]
demo: false
---

记录本次尝试、输入数据、假设、观察结果和下一步。
```

`project` 必须与现有科研目录 slug 一致。列表和主页从 collection 自动生成，不需要修改页面代码。

## Add Notes / Add Project

笔记新建 `src/content/notes/your-course/index.md`。除了共同字段 `title`、`description`、`date`、`updated`，填写：

```yaml
course: Space Plasma Physics
semester: 2026 Fall
category: Space Physics
progress: 0
tags: [Plasma Physics]
featured: false
demo: false
```

支持的类别：`Space Physics`、`Physics`、`Mathematics`、`Computer Science`、`General Education`、`Others`。`progress` 为 0–100；`instructor` 可选，不知道时不填。

项目新建 `src/content/projects/your-tool/index.md`，使用共同字段，并可添加 `techStack: [Python, NumPy]`、`github` 与 `links: [{title: Documentation, url: ...}]`。外部链接必须填写真实地址；没有链接时省略该字段。

## Markdown、数学与图表

普通 Markdown 与 `.mdx` 都支持。使用 `$...$` 写行内公式，用 `$$...$$` 写独立公式：

```text
$$
\nabla \cdot \mathbf{B}=0
$$
```

代码块用语言名标注，例如 `python`、`c`、`cpp`、`java`、`javascript`、`matlab`、`latex`、`idl`。Mermaid 使用围栏代码块语言 `mermaid`，图表只在页面包含图表时加载运行时。先检查阅读页面中的实际渲染，再发布数学和流程图。

公开图片、PDF 先复制到 `public/uploads/`，内容里写 `/uploads/...`，不写 `public/` 前缀，不写 Windows 盘符。文件名可保留中文与空格；手写 URL 时对空格使用 `%20`。例如：

```yaml
attachments:
  - title: Lecture 01
    url: /uploads/notes/your-course/lecture01.pdf
    type: pdf
```

PDF 页面提供预览、Open 与 Download；手机以打开和下载为主。图片配说明、来源与 alt 文本。可引用你有权公开分享的资源，版权不明的资料优先保存外部链接。

## Import Folder

导入会复制公开副本，不修改源目录。首次在交互终端运行，会询问缺少的标题、简介、标签、状态或学期。

```powershell
npm run import:research -- "D:/Research/TiO"
npm run import:notes -- "D:/Notes/SpacePhysics" --semester "2026 Fall" --category "Space Physics"
npm run import:project -- "D:/Code/MyProject" --title "My project"
```

自动读取 README 正文与 metadata、生成稳定 ASCII slug，保留文件原名和目录层级，识别 Markdown、PDF、图片与代码。Markdown 建立可阅读的子页面；相对链接指向对应文档或公开附件。`cover.*` / `thumbnail.*` 优先成为封面。

导入结果包含 `index.md`、子文档、`metadata.yaml` 清单以及 `public/uploads/{kind}/{slug}/`。**`index.md` frontmatter 是展示信息的权威来源；`metadata.yaml` 保存导入清单与略过文件，不是另一份需要同步编辑的主页配置。** 已存在的内容不覆盖；如需独立导入，用 `--slug new-slug`。

```powershell
npm run import:research -- "D:/Research/TiO" --title "TiO study" --description "Working notes" --tags "Solar Physics,IDL" --status Planning --slug tio-study --yes
```

`--yes` 使用已提供值与默认值，不出现问答；请审查 `TODO` 学期和自动提取的简介。完整参数：`npm run import:research -- --help`。

每个文件最多 **10 MiB**，每次导入最多 **100 MiB / 1000 个文件**。FITS / FTS / FIT、IDL SAVE、大型科学数据、视频、压缩包、数据库、秘密文件与符号链接不复制；略过原因写入清单。网站只保存缩略图、描述、数据版本、来源与真实下载链接。大文件存放 GitHub Releases、Zenodo、OSF、Figshare 或机构存储；不自动上传这些服务。

## Local Admin

```powershell
npm run admin
```

打开本地 `/admin/` 管理 Profile YAML 与科研、笔记、项目和日志 Markdown，也可导入文件夹。管理界面保存后更新源码，开发预览自动刷新。文本保存会检查 YAML 语法；完整内容 schema 与链接仍需 `npm run build` 检查。

本地管理服务只在开发阶段运行，监听 loopback，不将 GitHub PAT / API Key 放入网页。允许写入路径限制在本站内容和数据目录，禁止路径穿越和符号链接；保存使用 revision 检查，文件已被另一处修改时要求重新加载。GitHub Pages 只得到静态文件，不能写入本机或 Git 仓库。不要通过 `--host 0.0.0.0` 公开本地管理服务器。

## Build / 验证

| 命令 | 用途 |
| --- | --- |
| `npm run check` | Astro 与 TypeScript 检查 |
| `npm run validate` | metadata、有效日期、slug、日志所属项目、文件与上传策略 |
| `npm test` | 导入、管理、内容与链接的行为测试 |
| `npm run build` | 内容检查 → SSG → Pagefind → 本地链接与锚点检查 |
| `npm run preview` | 静态预览，包括搜索 |
| `npm run test:browser` | 浏览器功能、desktop / mobile 检查，需 Playwright 与 Chromium |

链接检查覆盖生成 HTML 内的本地页面、PDF、图片、CSS / JS、`srcset` 和章节锚点，并检测仓库子路径丢失。不自动请求外部站点，不保证外部链接一直有效。浏览器检查的安装和执行方式以脚本输出为准。

## GitHub Pages Deploy

已按所有者授权连接公开仓库 [Z-hang729/Z-hang-Homepage](https://github.com/Z-hang729/Z-hang-Homepage)，由 GitHub Actions 部署至 [正式网站](https://z-hang729.github.io/Z-hang-Homepage/)。[Owner 入口](https://z-hang729.github.io/Z-hang-Homepage/owner/) 已完成真实 GitHub 登录、整批编辑发布和清理验证；详情见 [验证记录](docs/VERIFICATION.md)。以下配置步骤用于复现或迁移。

部署时保留 `academic-site` 作为 Git 根目录，`hub/` 为工作流构建目录。如果以后把 `hub/` 单独迁移成新仓库，需把工作流移入新根目录，并更新 `working-directory`、lockfile 与 artifact 路径。

1. 将确认可公开的源码推到你的 GitHub 仓库，默认分支使用 `main`。
2. 在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. `.github/workflows/deploy.yml` 在推送 `main` 后检查、测试、构建并发布。Pull request 只检查构建，不部署。
4. 在 Actions 的 deployment 项中打开实际网站地址。

工作流通过 `actions/configure-pages` 自动读取 Pages 的 origin 与 base path，同时允许仓库 Variables 覆盖：

| 变量 | 含义 | 示例值（需替换成你的实际配置） |
| --- | --- | --- |
| `SITE_URL` | 完整站点 origin，含协议，不含仓库目录 | `https://YOUR_ACCOUNT.github.io` |
| `SITE_BASE_PATH` | 用户主页为 `/`，项目站点为 `/YOUR_REPOSITORY` | `/personal-website` |
| `REPO_URL` | 源码仓库地址；工作流自动使用当前仓库 | `https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY` |

无需把 base 写入内容文件；内容一直保存 `/uploads/...` 与 `/notes/...`，模板统一加前缀。本地模拟项目站点：

```powershell
$env:SITE_URL = 'https://YOUR_ACCOUNT.github.io'
$env:SITE_BASE_PATH = '/personal-website'
npm run build
npm run preview
```

此时打开预览服务器的 `/personal-website/`。恢复根路径：`Remove-Item Env:SITE_BASE_PATH`。实际域名未配置时的默认 origin 只服务本地预览，不能视为已发布地址。

未来自定义域名在 Pages 设置中配置，添加 `public/CNAME`，将 `SITE_URL` 改为实际 HTTPS 域名、`SITE_BASE_PATH` 改为 `/`。DNS 与 HTTPS 生效后重新检查 canonical、RSS 和 sitemap。

## Update / Publish

先拉取远端，再编辑和检查：

```powershell
git pull --ff-only
npm run admin
# 保存、预览后停止开发服务器
npm run check
npm test
npm run build
git status
git diff
```

审查个人信息、附件及待发布内容后，可按熟悉的 Git 流程提交，或运行：

```powershell
npm run publish -- "Update research notes"
```

helper 会先检查、测试与构建，显示远端、分支与变更范围；只有在交互终端明确输入 **PUBLISH** 后，才 stage `hub/` 与 Pages 工作流、提交并 push。不会 force push，也不会把父目录中的旧网站和本地数据加入本次提交。GitHub Actions 只部署 `main`；其他分支可用于 review。

## Backup / Maintenance / Troubleshooting

源码、`package-lock.json`、公开附件和导入清单都纳入 Git；`dist/`、`node_modules/`、临时文件不备份进源码仓库。未公开的原始数据和历史本地数据库单独备份，在原研究目录保留原文件名、版本与来源。

长期维护操作见 [MAINTENANCE.md](docs/MAINTENANCE.md)，常见故障见 [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)，技术架构和设计系统见 [ARCHITECTURE.md](docs/ARCHITECTURE.md)。
