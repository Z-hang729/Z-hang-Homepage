# 首版本验证记录

日期：2026-10-02。这里记录本地已执行的检查；远程仓库创建、GitHub Actions 运行和 Pages 线上部署尚待 GitHub 账号授权。

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
