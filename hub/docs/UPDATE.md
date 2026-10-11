# 依赖与功能更新流程

本项目以 Astro 静态构建为中心，Owner backend 和浏览器编辑器是独立边界。更新时先审查现有模块，复用既有 File Library、Knowledge Connections、Pagefind 和发布流程，不为同一功能建立第二套存储。

## 常规更新

```text
备份与 git status
  → 阅读变更日志和相关 schema
  → 小范围修改
  → npm run check
  → npm test
  → npm run build
  → 真实浏览器/移动端检查
  → commit → GitHub Actions → Pages 验收
```

依赖升级使用锁文件：在 `hub/` 中运行 `npm ci` 后再修改 `package.json`，提交 `package-lock.json`。确认 Astro、Vite、Pagefind、KaTeX、PDF 与 Markdown 解析器的兼容性；升级后至少覆盖首页保护、Research/Notes/Files 路由、Search、引用、PDF 和 Owner 登录流程。

## 修改边界

- Homepage 的文字、section 顺序、颜色、字体和动画必须先做 baseline，再验证 SHA 或渲染文本未变。
- 新的学术记录遵守 `src/lib/academic-schema.mjs`，不得把 Demo、draft 或 unlisted 条目当成公开成果。
- Owner Dashboard 只读计算统计和健康提醒，不得在渲染阶段写文件或自动修复内容。
- 上传代码只作为文档和下载附件保存；网站不会自动执行用户上传的代码。
- 公开仓库中不能出现 OAuth secret、token、`.env`、浏览器本地草稿或测试凭据。

## 版本与发布

为有行为变化的更新补充测试和 `docs/PHASE4-CHANGELOG.md` 条目。Commit message 应说明实际内容，例如 `Add Owner research health dashboard`。推送后等待 workflow 的 build、test 和 Pages deploy 全部成功，再用准确的 commit SHA 验证线上页面；GitHub push 成功本身不等于网站已更新。

## 性能与可访问性回归

主页不应加载 Owner editor、Pagefind、Knowledge Graph、PDF 生成器或大型 viewer。新增客户端功能采用动态导入和按需初始化。键盘焦点、语义 heading、按钮 label、对比度和 `prefers-reduced-motion` 每次都应抽查；公开页面上的新数据默认静态生成。

