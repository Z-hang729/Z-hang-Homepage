# 恢复与回滚

恢复操作先保护当前工作区，再恢复已知良好的提交。不要直接删除仓库历史、覆盖远程分支或在公开仓库提交 token。

## 本地草稿

Owner workspace 的草稿保存在浏览器本地存储中，刷新后会恢复未发布变更。若当前仓库已经变化，系统会显示冲突并要求逐文件选择最新版本或保留草稿。需要放弃整批草稿时使用 **Discard**；该操作不会删除 GitHub 上已有内容。

若浏览器数据即将被清理，先在 Review 冲突窗口导出 `website-draft.json`。导出的文件可能包含个人资料，保存到加密的本地位置，不要上传到公开仓库。

## Git 与 Pages

1. 记录当前 `git status`、分支和最新提交 SHA。
2. 从 GitHub Actions 中找到最后一个 build/deploy 成功的提交。
3. 在新的本地 checkout 中检出该 SHA，运行 `npm ci`、`npm run check`、`npm test` 和 `npm run build`。
4. 只有验证通过后才将恢复提交推送到 `main`；不要 force push。
5. 在 Actions 和 Pages deployment 中核对恢复 SHA，并访问真实 URL 检查首页、Research、Files、Search 与 Owner 只读状态。

## 文件与学术记录

File Library 原始文件与 metadata 分开保存。删除 Research 或替换 Figure 前先检查引用关系；若原始文件仍被 Figure、Package、日志或笔记引用，保留文件并修复关系。发布过的研究包历史版本保持原始 snapshot 和 checksum，恢复时也不能编辑历史字段。

若 schema 或构建失败，先恢复造成失败的最近一批变更，再逐条重做。不要通过把 draft 改成假 published 来绕过发布保护。

## 事件记录

在 `docs/PHASE4-TESTING.md` 或部署记录中写下失败步骤、提交 SHA、Actions run、修复动作和最终验证 URL。恢复完成后保留原失败分支或标签，便于复盘。

