# 内容维护指南

网站内容以文件为准，Owner workspace 只是受控的编辑与审阅入口。公开页面只读取已经通过 schema 校验、明确标记为 `public` 且 `published` 的学术记录；草稿可以在本地工作区保存和预览，但不能通过 Owner 的远程发布接口写入公开仓库。

## 添加研究、日志和课程笔记

优先从 Owner workspace 进入 **Add**，选择 Research、Notes 或 Project。保存前检查标题、日期、状态、tags 与 slug。研究日志应放在 `src/content/logs/{research-slug}/`，文件名包含真实日期，例如 `2026-10-12-alignment.md`，并保留 `project` 字段。长篇课程材料放在课程目录的 `files/` 下，通过课程页面的文档顺序管理。

正文使用 Markdown；需要数学时使用 `$...$` 或 `$$...$$`，代码块注明语言。已有 MDX 正文中的组件不会被 Owner 编辑器自动重写；若转换不安全，编辑器会保留原文件并要求使用开发工作流。

## 文件、图集与引用

先将原始文件放进 File Library，再在 Research、Figure、Reference 或 Package 中引用稳定的 File Library ID。不要在学术 JSON 中复制二进制内容，也不要通过手改 URL 绕过 File Library。Figure 必须有真实日期、caption、alt text、来源和许可信息；Reference 使用实际 DOI/BibTeX 元数据，`publicationStatus: published` 表示已由 Owner 审阅。

研究包记录输入、代码、配置、过程、输出和说明文件的角色，不执行上传的代码。发布后的版本是不可变快照；需要修改时建立新的语义版本。README、方法、参数、环境和校验和应来自实际记录，不能为了通过健康检查虚构资料。

## Dashboard 健康提醒

Owner Dashboard 的计数包含当前设备上的草稿，用于管理全量工作区。Research health 按研究项目显示 File Library 文件、日志、图、参考文献、研究包和 README 六项检查。提醒只是清单，不会自动创建文件、修改关系或发布内容。打开对应 Research 后逐项补充，确认真实来源后再在 Review & publish 中发布整批变更。

## 发布前检查

1. Review 变更列表，确认没有意外的 profile、homepage 或原始文件删除。
2. 运行 `npm run check`、`npm test` 与 `npm run build`。
3. 确认引用、File Library ID、页面链接和日期有效。
4. 远程 Owner 模式下只发布已经标记为 `published` 的学术记录；草稿留在本地。
5. 发布后查看 Actions 与 Pages 状态，再访问真实网站验证页面。

