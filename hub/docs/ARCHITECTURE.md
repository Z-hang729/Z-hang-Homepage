# Architecture & Design System

## 架构决策

Astro 负责静态生成与内容路由，TypeScript 约束页面逻辑，YAML 保存个人数据，Markdown / MDX 保存长文。正文在构建阶段生成 HTML；主题、搜索、筛选、目录与图表只使用必要的客户端脚本。没有运行时数据库，也没有公开写入 API。

```text
YAML profile + Markdown / MDX + public files
                ↓ schema / source validation
           Astro static rendering
                ↓
           Pagefind indexing
                ↓ HTML links / files / heading validation
             hub/dist
                ↓ GitHub Actions Pages artifact
        GitHub Pages / optional custom domain
```

本地 Admin 是开发服务器 integration，不包含在部署的服务端 runtime 中。内容操作使用允许路径、loopback / origin 限制、revision 冲突检测和原子保存；这些控制是本地写入边界。静态 `/admin/` 本身不具备 GitHub 权限。

## 内容边界

| 内容 | 权威源 | 页面生成 |
| --- | --- | --- |
| 个人简介、教育、兴趣、联系方式、CV、Timeline | `src/data/profile.yaml` | Home / About / CV / Footer |
| 导航与网站更新 | navigation / changelog YAML | Header / Changelog |
| 科研、课程、软件项目 | 对应 collection 的 `{slug}/index.md` frontmatter + body | 列表、详情、Tags、搜索、相关项 |
| 科研日志 | `src/content/logs/{project}/` | 项目时间轴、最新动态、RSS |
| 导入清单 | `{slug}/metadata.yaml` | 维护时查询来源、复制文件与略过原因 |
| 导入阅读文档 | `{slug}/files/` Markdown | 自动生成文件阅读路由 |
| 小型公开附件 | `public/uploads/` | 固定下载地址 |
| 原始数据 / 未公开材料 | 原研究归档或外部存储 | 仅发布 metadata 与链接 |

文件夹 slug 是 canonical route；同类 slug 唯一。日期与状态由 metadata 决定，不依赖构建时随机日期或不完整 Git history。导入清单不是第二份主页配置，修改展示字段只改 index frontmatter。

Astro Content Collections 是渲染 schema 的最终依据。独立 source validator 额外检查本地文件、重复 slug、日志项目关系与上传策略；构建后 checker 校验实际 HTML 的路径和锚点。每一种检查承担不同失败面，不将外部网络可达性混入可重现的构建。

## URL、部署与源码链接

`SITE_URL` 定义 HTTPS origin，`SITE_BASE_PATH` 定义 `/` 或 `/repo`，`REPO_URL` 定义真实源码仓库。URL helper 统一处理导航、附件与分页路径。内容保留根相对链接；页面加部署前缀。工作流读取 GitHub Pages 配置并支持 Variables 覆盖。

Git 根目录仍在 `academic-site/`；Pages 构建工作目录是 `hub/`。现有根站点、数据库、本地存储与 `.openai/hosting.json` 独立保留。所有 Pages artifact 只来自 hub/dist，旧 Sites 部署不会因本次开发被替换。

## 设计系统

视觉采用克制的空间物理语言：明亮纸色与深蓝黑两套主题，青蓝作为主要交互色，太阳橙用于少量状态与重点，磁层曲线、太阳风轨迹只在 Hero 提供结构。避免背景视频与大体积 3D 依赖。

| 要素 | 规则 |
| --- | --- |
| Typography | 系统字体保证速度，中文使用系统 CJK 回退；标题与正文层次分明，长文限制行宽，正文行高约 1.7–1.8 |
| Colors | 全站通过 CSS custom properties 共享背景、面板、正文、弱化文本、边框、accent；dark/light 各有独立可读配色 |
| Spacing | 以 4/8 px 节奏组织控件，段落、卡片和 section 使用稳定间距；宽屏留白不挤压手机阅读区 |
| Radius / shadow | 卡片与按钮统一圆角；阴影轻，依靠边界和层次分组，避免大面积玻璃模糊 |
| Cards | 标题 → 简介 → metadata → tags；状态用文本与视觉共同传达，不能只依赖颜色 |
| Buttons / links | 动作与导航有清晰的 hover / focus；链接标签说明目的，不用空链接充当按钮 |
| Tags | 统一尺寸和边界；点击进入稳定的标签路由；长标签换行 |
| Code | 高亮、复制按钮、横向滚动；不把长代码强行缩放成不可读文字 |
| Tables | 行列语义明确，手机可横向滚动，单位与标题保留 |
| Callouts | 用标题与正文传达 note / warning / tip，颜色只是辅助 |
| Figures | 有 alt、图注、来源和下载；原图不作为网页背景，按需加载 |
| PDF | 桌面可预览；手机保留清晰 Open / Download，并说明浏览器内嵌限制 |
| Motion | 仅用于少量 Hero 轨迹与状态；尊重 prefers-reduced-motion |

实际 token 与断点集中在 `src/styles/`，不是分散写进各内容条目。学术阅读组件共享同一布局：Breadcrumb、title / metadata、正文、TOC、附件、references 与上一篇 / 下一篇。

## Accessibility & performance

使用语义 heading 层级、landmark、skip link、label、按钮与原生链接。菜单和搜索支持键盘，focus 可见，主题不以颜色作为唯一信息。手机卡片单列，导航与目录折叠，表格和代码独立滚动；测试以真实 viewport 为准。

SSG 页面无需 hydration 才能阅读；Pagefind 索引和 Mermaid 按需加载。没有默认 analytics、背景音乐或视频。数学在构建阶段处理，附件大小有明确限制。未来统计服务需单独选择隐私方案。

## 扩展与当前边界

- Publications schema 保留 Paper / Conference / Poster / Talk / Software / Dataset；当前没有虚构的成果。
- 引用先采用明确 reference list；自动 BibTeX / CSL 文献系统可独立扩展。
- Profile 可保存中文和英文资料，当前 UI 默认英文；完整双语内容、路由、SEO hreflang 与切换是后续阶段。
- 第一期不需要远程 CMS。未来 OAuth / Decap / 托管 CMS 需要重新设计授权与部署边界，不能把 token 写入浏览器解决。
- Folder import 是受控复制与发布准备，不是原始科学归档的同步或备份工具。

## 官方技术参考

- [Astro Content Collections](https://docs.astro.build/en/guides/content-collections/)
- [Astro GitHub Pages deployment](https://docs.astro.build/en/guides/deploy/github/)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Pagefind indexing](https://pagefind.app/docs/)
- [KaTeX supported functions](https://katex.org/docs/supported.html)
- [Mermaid documentation](https://mermaid.js.org/)
- GitHub Actions releases verified at implementation: [checkout](https://github.com/actions/checkout/releases), [setup-node](https://github.com/actions/setup-node/releases), [configure-pages](https://github.com/actions/configure-pages/releases), [upload-pages-artifact](https://github.com/actions/upload-pages-artifact/releases), [deploy-pages](https://github.com/actions/deploy-pages/releases).
