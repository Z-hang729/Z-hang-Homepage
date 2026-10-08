# Phase 3 — 2026-10-08

Research Notebook 2.0、Digital Notes 2.0 和 Knowledge Connections 以增量方式加入现有 Astro 网站，继续使用原有 Owner 登录、草稿、GitHub 原子提交及 GitHub Pages 发布。

## 本次完成

- Research：日志独立阅读地址、同日安全标识、标签和状态筛选、折叠、前后日志导航；Owner 新建、编辑、删除和现有文件/章节/项目选择。项目摘要按真实状态及非 Demo 日志计算。
- Notes：课程章节的新建、编辑、删除、排序；课程侧栏、前后章节、阅读进度、响应式目录。新增普通 Markdown 的学术环境、公式/图编号与标签引用、图片放大及原图下载。
- 文件导入：明确区分 **Attach as Course Files** 与 **Import as Course Notes**。从 Library 已有 Markdown/MDX 生成安全阅读副本，保留原件 UUID、原始字节和图片引用；不重复上传。可编辑阅读文本限制 1 MiB，其他原件继续在 Library 浏览/下载。
- 关联：稳定内容 ID、五种显式关系、Wiki 链接、普通 Markdown 和引用式链接、自动反向链接、Owner 关系编辑器及公开 `knowledge.json`。搜索可以按内容类型筛选。
- 安全：发布校验完整仓库内容快照和最终关系图；保留 expected HEAD、文件 SHA、身份权限与单次原子提交。仍被引用的章节、日志、文件不能单独删除；原件删除之前先检查章节/日志引用。
- 兼容：修改标题保留 ID/URL；可信旧 MDX 仅改元数据时保留正文逐字不变。新的网页编辑不执行导入的 JSX/JavaScript。

## 首页与原件保护

开始前创建并推送 `backup/before-phase3-knowledge-system`，基线提交为 `cc18c1daaf22bb5d90e490afe63dc2b2c9dc85e6`。

按用户截图删除 availability 文字、四组栏目眉题、Timeline 眉题、Footer 技术/更新时间、Archive 说明 banner 以及 Library 标题的大句点。原有 Demo 标签和文章 Demo 提示保留。其他首页文案、个人资料、栏目顺序、主题及布局不改写。

23 个原有正文、数据、样式、首页和原件文件用 SHA-256 核对。测试示例仅位于隔离副本；正式网站没有添加虚构课程、研究结果或 QA 内容。旧地址保留，新日志地址由现有文件名生成。

## 迁移与维护

本次无需迁移或重写旧内容。新增字段均可选，旧记录使用兼容默认值；新章节可以添加 `order`，关系可以在 Owner 中逐步填写。已有引用可在同一草稿批次显式移除，再删除目标。

创建新日志：进入 Owner，**Add → New Research Log**，选择研究项目，填写正文并选择已有文件；保存草稿后统一发布。

添加课程章节：**Add → New Notes Chapter**，或课程的 Reading notes 管理入口；选择稳定文件名。Library 导入时明确选择 Import as Course Notes。章节标题可以修改，文件名保持稳定。

管理关联：在阅读页选择 **Connections**，或 **Add knowledge connection**；反向链接自动生成。正文中的 Wiki/Markdown 引用需要在正文内修改。发布后等待 Pages 状态成功，正式内容和搜索索引随同一次构建更新。

详细维护说明见 [Research Notebook](RESEARCH-NOTEBOOK.md)、[Digital Notes](DIGITAL-NOTES.md)、[Knowledge Connections](KNOWLEDGE-CONNECTIONS.md) 和 [测试说明](PHASE3-TESTING.md)。

## 验证与发布证据

- 完整自动测试：238/238。
- Astro 检查：0 errors、0 warnings；提示属于静态分析建议。
- 生产构建：39 个页面；1,031 处内部链接、资源及锚点通过；Pagefind 索引 37 页、2 个筛选维度。
- 隔离公共浏览器：9 组，涵盖旧地址、精确删减、日志、数学引用、反向关联和明暗/手机布局。
- 隔离 Research Owner：6 组，真实编辑表单及现有上传队列入口。
- 隔离 Notes/Relations Owner：6 组，真实章节 CRUD/排序、MDX 兼容、现有 Markdown 导入、关联锚点与去重、手机布局。
- 编译后的后端通过真实 workerd + SQLite Durable Object 隔离运行时测试，涵盖鉴权、原子发布、流式上传、公开下载及 SHA-256。

发布继续使用仓库原有 `deploy.yml` 和现有 Cloudflare Worker；实际发布状态以同一提交的 GitHub Actions / Pages 部署以及 `.local/qa/phase3/production-after.json` 的只读线上验收为准。后者核对剩余首页全文、栏目顺序、真实旧日志/文件、分类搜索和原件下载哈希；失败会另写 failure 报告，不会声明成功。

## 当前边界

GitHub Pages 仍需在提交后完成构建；网页草稿保存不会立即替换正式页面。线上验收保持只读，Owner 写入流程在隔离账户/内容夹具中验证，未向真实学术档案添加测试记录。原有 R2 账户尚未启用，当前文件上传能力沿用现有 GitHub provider 和既定限制。

本次未加入 3D 图谱、AI 自动关联、代码执行或多人协作。`knowledge.json` 提供可导出的静态关系数据。
