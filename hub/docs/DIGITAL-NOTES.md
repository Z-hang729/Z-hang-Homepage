# Digital Notes 2.0

课程继续使用 `src/content/notes/<course>/index.md(x)`；阅读章节继续使用同一课程下的 `files/**/*.md(x)`。没有另外的章节数据库。现有文件、原文和阅读链接保持原样。

## Owner 工作流

1. 在 Owner 的 Notes 中创建或选择课程，打开 **Notes / Reading notes**。
2. **Add chapter** 创建 Markdown 章节。内部路径例如 `Lectures/01.md`；修改标题不会修改路径。章节标题、简介、创建/更新时间、标签和可选 `order` 都来自本章 frontmatter。
3. **Move up / Move down** 保存完整的章节顺序到草稿。公开阅读页的课程目录与 Previous/Next 采用同一顺序。
4. **Import / attach Library files** 选择现有 Library 文件，并明确选择：
   - **Attach as Course Files**：保留为原始课程附件，支持各种文件类型。
   - **Import as Course Notes**：只将选择的 Markdown/MDX 生成安全 Markdown 阅读副本。可多选，路径保留文件夹层级。原始 Library 文件和字节保留，`sourceFileId` 与 `relatedFiles` 建立来源/附件关联。
5. 在编辑器中预览并修正标签问题，然后按既有 **Review & publish** 发布。草稿保存不会立即改变公开网站。

阅读副本是普通 Markdown 和 YAML frontmatter，随时可以从 GitHub 编辑或迁出。删除阅读章节只移除该页及课程目录项；Library 原件继续保留。MDX 可信旧文档仍可阅读；无法安全转换的文档只能在线修改 metadata。可转换的正文编辑会归档原 MDX，再生成同一阅读 URL 的 Markdown。

导入单份完整 UTF-8 文本最多 **1 MiB**，这是在线编辑容量，不是 Library 存储限制。读取流在达到预算时取消，拒绝二进制、截断内容和无效 UTF-8。跨域原件需要其存储端提供 CORS；托管 GitHub/R2 原件使用稳定预览地址。导入时只读取公开原件，不发送 Owner 登录凭据。

相对图片路径根据原文件的 `relativePath` 匹配现有 Library 文件，保留子目录和 `../Figures/…` 关系。歧义或缺失会阻止导入并提示补齐原件；图片支持 PNG/JPEG/GIF/WebP/AVIF/BMP。其他相对文件链接转向原件的永久详情页。PDF、代码、科学数据与 Office 文件继续作为附件，不会自动转为章节。任意导入 MDX/HTML 不会执行：简单已知组件可转换，其他 JSX/HTML 显示为源文本，正文最终保存为 `.md`。

## 稳定章节与标题锚点

章节 ID 使用 `note:<course>/files/<relative-path-without-extension>`，例如 `note:electrodynamics/files/Lectures/01`，不会依赖标题或排序。现有课程 `documents` 顺序是默认值；显式章节 `order` 优先，未列入课程的章节按自然路径排序。

在标题末尾写显式锚点：

```markdown
## Field equations {#sec:fields}

See \ref{sec:fields}.
```

锚点采用字母开头的 ASCII 字母/数字/冒号/点/下划线/连字符，最多 120 字符；每篇中必须唯一。标题显示时移除 `{#...}`，目录和正文引用使用实际锚点。普通未标注标题继续使用现有自动锚点。

## 数学与公式引用

沿用站点的 KaTeX：行内 `$...$`，独立公式 `$$...$$`。向量、矩阵、分段、`aligned`、`align` 等采用 KaTeX 支持的语法。编号公式示例：

```markdown
$$
\begin{equation}
\nabla\cdot\mathbf B = 0 \label{eq:gauss-law}
\end{equation}
$$

The constraint follows from \eqref{eq:gauss-law}.
```

`\begin{equation}...\end{equation}` 在 `$$` 内使用；不要省略 Markdown 数学分隔符。带 `\label` 的独立公式按本页次序编号，也支持保留手写 `\tag{2.3}`。普通独立公式不强加编号。正文 `\eqref{...}` 显示带括号编号，`\ref{...}` 显示目标编号；都可向前引用并跳到同页目标。数学区域中的引用显示安全的编号文本，不生成可执行链接。

KaTeX 官方说明 [`\label` / `\ref` 不受原生支持](https://katex.org/docs/support_table.html)，而 [`\tag` 受支持](https://katex.org/docs/supported.html)。因此共享 Remark 插件先解析标签/引用，再把已清理并编号的公式交给现有 KaTeX；没有第二套数学渲染器，也没有打开 `trust`。跨页关系请使用网站的 Wiki 知识链接或普通 Markdown 链接。

## 学术环境

```markdown
> [!THEOREM] Gauss constraint {#thm:gauss}
>
> In the stated domain, the magnetic field satisfies $\nabla\cdot\mathbf B=0$.

> [!PROOF]
>
> Write the derivation here.

By Theorem \ref{thm:gauss}, ...
```

支持 `DEFINITION`、`THEOREM`、`LEMMA`、`PROPOSITION`、`COROLLARY`、`PROOF`、`EXAMPLE`、`REMARK`、`NOTE`、`WARNING`、`EXERCISE`、`SOLUTION`。标题与标签可省略；Definition/Theorem/Lemma/Proposition/Corollary/Example/Exercise 各按本页独立计数，Proof 自动添加结束方框。原有普通引用块及旧 MDX Callout 继续可读。

## 图注、来源与引用

```markdown
![Magnetic geometry](/uploads/notes/course/Figures/geometry.png)

Figure: Magnetic geometry in the model. Source: [Original paper](https://example.org/paper) {#fig:geometry}

The coordinate system appears in Figure \ref{fig:geometry}.
```

图片单独一段；紧邻下一段以 `Figure:` 开头。插件生成语义化 figure/figcaption、按页计数和稳定标签。图注可使用普通强调、来源链接和数学；原图保持完整分辨率。可信旧 MDX Figure 组件仍使用原有放大/下载行为。

## 校验与安全边界

- 重复或缺失的公式、学术环境、标题、图片标签会在预览和构建时报错，避免发布无效引用。
- 代码块、行内代码、已存在的链接文本和 MDX JavaScript 节点不会被学术引用插件改写。展示 LaTeX 源码示例请使用代码块。
- Owner 预览通过 HTML 白名单清理，并继续防 DOM clobbering；其标签 ID 会带预览前缀，局部引用相应调整。
- Python、IDL、C/C++、Java、JavaScript/TypeScript、MATLAB、Fortran、R、Julia、LaTeX、JSON、Bash、YAML 在 Owner 中按需高亮；大代码超过 100 KiB 或 1500 行时保留清晰的纯文本，避免拖慢编辑。
- 单元测试覆盖章节身份/排序/前后章、可信 MDX 精确正文保留、Library 原件保留/相对图/导入边界、全套环境、引用校验、科学代码，以及 200 个带标签公式的实际渲染。
