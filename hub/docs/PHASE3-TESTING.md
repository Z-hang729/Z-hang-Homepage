# Phase 3 回归验证

本文件说明 Research Timeline、课程章节、数学排版和 Knowledge Connections 的公共页面回归流程。测试生成的内容只存在于 `.local/` 隔离副本，不会加入线上网站。

## 备份与保护范围

升级前的 Git 备份分支为 `backup/before-phase3-knowledge-system`，起点为 `cc18c1daaf22bb5d90e490afe63dc2b2c9dc85e6`。原有个人资料、课程和科研正文、附件与图片均应保留。升级中的有意变更是新增系统功能，以及用户九张截图指定的删减。

`scripts/phase3-browser-qa.mjs` 会在运行前后对主目录的以下内容计算 SHA-256，并比较文件集合和每个文件的字节内容：

- `src/content/`
- `src/data/`
- `public/uploads/`

测试程序不写这些主目录。它把 `src/`、`public/`、`scripts/` 和必要配置复制到 `.local/phase3-browser-qa-<时间戳>/`，在副本中生成带 `QA Phase3` 标识的研究、课程、章节、项目、日志和文件元数据。所有写入、浏览器个人资料及本地编辑操作必须留在这个副本中。

运行时请暂停其他会修改正文、数据或附件的操作，否则前后哈希比较也会报告这些并发改动。隔离副本保留用于排错，不会自动删除用户文件。

## 运行

在 `hub/` 目录执行：

```powershell
npm test
npm run check
npm run build
node scripts/phase3-browser-qa.mjs
```

需要 Node.js 22.13 或更新版本、已安装项目依赖，以及本机 Chrome 或 Edge。脚本默认寻找 Windows 标准安装位置；其他位置可设置 `PHASE3_QA_CHROME` 为浏览器可执行文件的绝对路径。

浏览器检查默认使用 `/Z-hang-Homepage` 前缀，以核对 GitHub Pages 项目仓库路径。也可设置 `PHASE3_QA_BASE`；设置为 `/` 时使用根路径。独立服务只监听 `127.0.0.1`、使用临时空闲端口，并清空 `PUBLIC_OWNER_BACKEND_URL`，不会登录 Owner 或向线上后端发布内容。

服务冷启动最多等待 120 秒。超时时错误会注明日志位置并附末尾输出；这类超时不能计作功能通过。

## 浏览器覆盖

测试以真实 Chrome/Edge 的 DOM、链接、数学排版和页面宽度为依据。每组成功后输出 `PASS`，最终数量以 JSON 报告为准，不在本文提前声明结果。

| 范围 | 核对内容 |
| --- | --- |
| 九项截图删减 | Hero 的 availability、四组带编号眉题、Timeline 眉题、Footer 技术及更新时间、Archive 的统一说明 banner、Library 标题大句点消失 |
| 首页保护 | 原来的 profile 大标题、Section 顺序、磁层示意图、小字号 logo 句点仍在；不移除其他标题 |
| 三类 Archive | 搜索、Grid/Timeline 切换仍存在；卡片的 Demo 标签保留 |
| Library | `Z-hang’s Library` 标题没有大句点；三种浏览视图和命令搜索焦点可用 |
| 既有地址 | 运行前所有 research/notes/projects 主条目、导入 Markdown 子文档及稳定文件 UUID 地址仍返回 HTTP 200 |
| 现有阅读能力 | Demo 详情说明、行内及独立公式、标题和目录导航保留 |
| Research Timeline | 日志按最新优先排列；展开/收起、标签及状态筛选、空结果提示可用；打开独立日志详情地址，保留公式和正文 |
| Knowledge Connections | 显式跨栏目关系可打开，反向引用可见，关联文件仍使用稳定 UUID 地址 |
| Wiki 链接 | `[[note:课程/files/章节|文字]]` 渲染为带正确部署前缀的实际章节链接 |
| 课程章节 | 章节导航标识当前页并按 order 排列；原有课程路径不变 |
| 数学引用 | 定理环境、带标签公式、图注及显式标题 ID 生成目标；引用链接指向这些目标且可点击 |
| 手机布局 | 390 px 宽下首页、课程、章节、日志、Library 的浅色与深色模式不横向溢出 |
| 原件保护 | 主 content/data/uploads 的 SHA-256 和文件集合在测试前后完全一致 |

### 隔离数学样例语法

章节夹具使用真实 Markdown 语法，不执行代码：

```markdown
## Model {#sec:model}

> [!THEOREM] Energy identity {#thm:energy}
>
> The inline quantity $E$ is defined below.

$$
\begin{equation}
E = mc^2\label{eq:energy}
\end{equation}
$$

Equation \eqref{eq:energy}; theorem \ref{thm:energy}; section \ref{sec:model}.

![Illustrative diagram](/images/code-study.svg)

Figure: A schematic. Source: [Documentation](https://example.org) {#fig:sample}

See figure \ref{fig:sample}.
```

环境使用 `aside.academic-environment[data-academic-kind]`；公式使用 `.academic-equation` 包装 KaTeX；引用使用 `a.academic-reference`。环境、公式与图的标签目标以 `academic-` 开头；显式标题 ID 保留，例如 `sec:model`。此处示例及引用 URL 仅用于隔离排版验证。

## 报告与排错

输出目录：`.local/qa/phase3/`。

- `results.json`：已通过的检查、浏览器异常、截图路径、是否改变主内容，以及失败堆栈。
- `dev-server.log`：隔离 Astro 服务的完整输出。
- `*-mobile-light.png`、`*-mobile-dark.png`：实际浏览器截图，用于检查文字、间距和横向溢出。

如果服务尚未就绪，先检查日志中的 schema、导入或语法错误。若独立页面返回 404，核对原有 slug、导入文档路径和 `SITE_BASE_PATH`；不能通过删除旧地址断言来掩盖问题。若数学或关系测试失败，核对 Markdown 标签、内容 ID、目标是否存在及公共 DOM hooks，保留夹具用于重现。

`npm run build` 继续执行内容校验、Astro 生成、Pagefind 搜索索引和内部链接检查。Owner/Admin 与 unlisted 文件的搜索排除仍应由最终构建核对；仅运行开发服务器不能证明生产搜索索引正确。

公共浏览器回归不证明 Owner 写入授权、后端并发发布或对象存储的线上可用性。相关检查继续使用现有 Owner/API/文件存储测试；R2 是否启用以实际账户状态和 `STORAGE.md` 为准。发布前需核对真实构建及部署结果，不能把隔离测试内容发布到生产。

## 正式网站只读验收

Owner 的完整操作回归另在隔离浏览器运行，不连接真实账号或对象存储：

```powershell
node scripts/research-owner-browser-qa.mjs
node scripts/phase3-owner-browser-qa.mjs
```

后者使用实际章节和关系表单，校验新建、排序、重命名、MDX 元数据编辑、已有 Library Markdown 导入、关联锚点/去重、确认删除和手机布局。每次保存均调用共享 `validateChangeSet`，而不是跳过关系验证。输出位于 `.local/qa/phase3-owner/`。

`scripts/phase3-production-qa.mjs` 专门用于升级发布后的真实页面验收，不创建内容、不上传夹具、不登录 Owner。浏览器只允许 GET、HEAD、OPTIONS；任何试图写入的请求会被拦截并使验收失败。

在 `hub/` 运行：

```powershell
node scripts/phase3-production-qa.mjs
```

脚本必须读取已经捕获的两份原始基线，不会覆盖它们：

- `hub/.local/qa/phase3/before.json`：升级前正式首页文本、栏目顺序、字段及原始 PDF 的长度和 SHA-256。
- 仓库根 `.local/phase3/baseline.json`：备份提交及 23 个原有正文、数据、附件、首页与样式文件的字节哈希。

首页 `main` 中实际允许删除的是 **六段** 文本：availability 一段、四组带编号眉题、Timeline 眉题。脚本从基线逐一精确删除这六段，再与正式首页归一化后的可见文本作完整比较；所有其他文案及顺序必须相同。Footer 的技术及更新时间、Archive 的统一说明 banner、Library 的大句点分别核对，所以共对应九处页面删减。

验收还检查真实的既有文章和文件地址、新的独立日志地址、公开 `knowledge.json` 的节点与关系、Pagefind 内容类型及真实日志搜索、原有 Worker PDF 和仓库 PDF/图片的实际下载字节。生产图谱若出现隔离 QA 的标题也会失败。原有 Demo 标签仍需存在。

输出为同一目录中的 `production-after.json`、`production-*.png`；失败时写 `production-failure.json`，不会声明成功。此脚本只有在升级部署完成后才能通过所有断言；旧站未升级时删减断言失败是正常结果，不能删掉断言来取得通过。

可用 `PHASE3_QA_SITE` 指定以 `/` 结尾的本地生产预览地址；默认是现有 GitHub Pages 正式地址。`PHASE3_QA_PROXY` 可覆盖浏览器代理；当前正式站默认使用本机既有代理 `http://127.0.0.1:7897`，本地地址默认直连。原始 Worker PDF 的跨站下载仍需要可用网络。覆盖地址或代理不会授权任何线上写入操作。
