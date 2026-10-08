# Z-hang’s Library — Owner 使用指南

文件库入口：[Z-hang’s Library](https://z-hang729.github.io/Z-hang-Homepage/files/)。登录入口：[Owner workspace](https://z-hang729.github.io/Z-hang-Homepage/owner/)。

网站页面、文件说明与实际文件原件分别保存。上传完成后还要 Review / Publish，访客才会在网站目录中看到新文件。文件默认公开；Unlisted 只是隐藏目录，不提供保密访问。

旧本地 `/admin/` 仍可编辑 YAML/Markdown 和生成学术条目模板，原来的二进制文件夹导入已换成 Owner Library 入口。后续文件/文件夹上传请使用下面的统一流程。

## 上传一个文件或一批文件

1. 完成 Owner 登录，点击底部工具栏 **Upload**，或在 Library 的 Owner 控件中点击上传。Research/Notes/Projects 页面也有 **Upload files / Upload folder**。
2. 选择 Collection：General、Research、Notes 或 Projects。关联某个页面时选择它；可在 **Also attach to existing pages** 中勾选多个已有页面。
3. 点击选择文件，或把文件拖入上传区域。所有扩展名都可以保存，未知格式仍有 File Information 和 Download。
4. 按需填写 Tags、Description，Storage 保持 Automatic。**Concurrent uploads** 可选 3–6；网络不稳定时用 3。
5. 点击 **Start Upload**。每项显示原件大小、provider、哈希/上传进度与状态；顶部显示完成数量和总字节数。
6. 等待完成，点击 **Add completed files to draft**。
7. 打开 **Review & publish / Publish Changes**，核对这一批文件的说明、关联和数量后发布一次。

不要为一批 100 个文件逐个 Publish。上传 blob 不触发每个文件单独的 Pages 构建；最后的 metadata 批次统一发布。可先添加已完成的记录，失败项以后重试。

如果提示 **Possible duplicate / This file may already exist**：

- **Use Existing**：复用现有原件和稳定页面，增加此次关联/标签。
- **Upload Anyway**：明确保留另一份 record/original。
- **Cancel**：取消这一项。

SHA-256 与大小用于识别重复；旧文件缺少哈希时，名称和大小只是可能重复的提示。

## 上传文件夹

使用 **Choose Folder / Upload Folder**，或在支持的桌面浏览器中直接拖入目录。系统递归保留相对路径，例如 `TiO/data/image01.fts`、`TiO/code/align.pro`。目录没有固定 20/100/1000 文件数量限制；长队列默认分批显示，可点 Show more。

可选 **Create folder ZIP bundle** 生成上传时的 ZIP 快照。小 ZIP 在 64 MiB 内存预算内组装；较大 ZIP 需要支持文件保存 API 的浏览器写到本地再上传，或自己准备 archive。无需 ZIP 也可上传每个原件、保留文件树。ZIP 同样受当前实际上传 provider 容量约束。

选择后会显示按格式/路径判断的类型与 Collection 建议，并指出 README、cover/thumbnail 候选；这些提示不会自动改掉当前选择。README、封面图片始终作为普通用户文件保留，不会自动覆盖已有 Research overview、Homepage 或封面。可检查 README 后手动用于文件夹描述/overview，或在对应编辑器选择封面。

## 暂停、失败与刷新后恢复

- 单项 **Pause / Resume / Retry / Cancel** 只处理该文件；**Pause All / Resume All** 控制整个队列。
- 浏览器刷新或关闭后，重新登录并打开 Upload，可恢复非敏感的队列记录。
- 出现 **Choose original** 时重新选择同一文件；系统会核对名称、大小与哈希。重新选择目录可帮助匹配多个原件。
- GitHub Release 中转中断可能重传整个文件；配置 R2 后，multipart 可只重试/恢复需要的部分。
- Owner 登录过期时保留草稿和队列，重新登录；不要清浏览器站点数据来解决普通登录问题，否则可能丢失本地恢复记录。

队列/草稿不存永久 GitHub 或 R2 secret。请不要把密码、token、Client Secret 贴入文件说明或对话。

## 文件太大怎么办

当前 GitHub-only 安全上传通道每文件最多 **100,000,000 bytes**，约 95.37 MiB。它来自后端请求容量；GitHub Release 原生 asset 可以更大，但不能把仓库写入 token 暴露到浏览器来绕过中转限制。

超出时有两条可用路径：

1. 已经放在 GitHub Release、Zenodo、OSF 或机构公开存储上的原件，使用 Import / Sync / Add External File 建立目录记录，不再次上传。
2. 启用 R2 后用浏览器直传与 multipart。当前 R2 尚未激活；需要由账户所有者在 Cloudflare 完成必要确认。配置步骤见 [STORAGE.md](STORAGE.md)。

没有固定总文件数/总上传字节限制，也不会把 10 MB 简单改成一个虚假的 10 GB 上限。超过实际 provider 能力时，系统明确显示原因。

## 浏览、预览与分享

Library 顶部可以搜索文件名、标签、文件夹、课程/研究标题和说明；可以按类型、Collection、Tag、更新时间筛选，用 Grid/List/Folders 浏览。Recently Updated 和 Recently Added 是两种排序。

点击文件标题或 **Preview** 进入永久文件页，再点 **Open preview**。PDF 支持翻页/页码/缩放/Fit Width，全屏；图片支持缩放/拖动；代码有语言和行号/复制；CSV 可排序过滤已加载行；JSON/YAML 可折叠；Notebook 只展示已保存内容；FITS/FTS 先看 header，小型二维数据另点加载图像。

**Download Original** 始终面向原件。Office、archive、HDF5/NetCDF/NumPy/MATLAB 等复杂数据或未知格式，本阶段用 File Information + Download。Preview truncated 表示只显示部分，不表示原件被截断。Preview unavailable 时，仍可下载到本机打开。

**Copy Link / Copy file page link** 分享 `/files/<id>/` 页面。即使未来改名字、移动目录或从 Releases 迁到 R2，该地址仍保持。普通分享优先使用页面地址。

## File Manager：文件夹、编辑与批量操作

打开 **File Manager**：左侧文件夹，中间文件列表，右侧所选文件详情。顶部可以筛选、排序与搜索，并看到 provider 统计。Owner 在公开卡片/详情页还可直接 Edit / Move、Replace、Delete。

**Create folder** 建立逻辑文件夹。空文件夹先保存在当前设备，移动/上传实际文件后，路径才成为发布的 metadata。选择文件夹后可 **Rename / move folder**，保留其内部嵌套路径。移动不会复制大二进制。

**Rename / Move / Edit metadata** 中可以改：

- Display name 与相对文件夹路径。
- Markdown description、Tags、Public / Unlisted。
- 多个 Research/Notes/Projects 的勾选关联。
- 可选 Authors、Year、DOI、License、Citation、仪器、波长、时间、维度等科研字段。

改 Display name 保留 Original filename；更改文件内容用 Replace，不需要为了改显示名称重新上传。

勾选多个文件后点 **Edit selected**，可以统一增加/删除/替换标签、移动文件夹、Attach/Detach/Replace 所选关系。**Select all matching** 选择当前筛选命中的所有文件，包括尚未展开显示的记录；提交前核对选择数量。批量操作只产生一个草稿 metadata 批次。

## 把已有文件关联到多个页面

在 Research/Notes/Projects 的 Owner 控件选择 **Attach existing files**（Add Existing File），勾选 File Manager 中的文件，再点 **Attach selected to this page**。也可以编辑某个文件，在关联区域勾选多个页面。

一个 PDF 关联两个 Research 仍是同一文件 record/original。取消勾选只移除关系，不删除文件。其他关联页面仍保留它。

## 替换版本

选择 **Replace**，选新原件，输入旧 Original filename 确认，再按上传/草稿/发布流程完成。永久 ID 与页面地址不变，Updated 和 Version 更新；旧版本的名称/大小/哈希/日期可保留在 history。

新 metadata 发布成功后再清理旧原件。重要原件请自己保留独立备份；Git 中的版本说明不保证旧二进制永远能下载。清理失败可以稍后使用 **Clean up removed files** 重试。

## 删除文件

Delete 确认界面会列出文件名、大小、provider 和受影响的关联页面。请输入 **Type … to confirm** 中指定的名称：已发布原件使用其正式版本的显示名称；尚未发布的原件使用原始文件名。草稿中的重命名不会改变后端核验所需的正式名称。

对于本系统托管的 Release/R2 原件，顺序是：**provider 确认删除 → metadata 删除加入草稿 → Publish Changes 更新网站目录**。provider 失败时记录保留，稍后重试。原件成功删除后，下载会立刻失效；目录页面要等 Publish/Deploy 后才消失。删除前先检查哪些关联页面受到影响。

已存在网站 repository 原件只取消 Library record，不删除源文件，保护 Homepage/正文中的旧链接；External URL 也不会删除外部站点的原件。共享对象引用和远程 HEAD 冲突会阻止不安全的删除。

如果删除原件已成功但网络/页面关闭导致目录仍在，重新打开 File Manager 点 **Recover pending deletions**，检查恢复的草稿后 Publish。不要直接去 GitHub/R2 随意删对象来绕过冲突。已删除的远程 binary 不能靠恢复 JSON 自动找回。

## 导入和同步

- **Sync from GitHub Releases**：读取已授权仓库的 Release assets，为尚未入库的文件建立 metadata；不重复传输原件。
- **Import GitHub File / Release**：粘贴永久 GitHub file/Release asset URL，填写原件名、说明和关联。
- **Add External File**：保存 Zenodo/OSF/机构存储等永久公开 HTTPS 链接。

导入后仍需 Review / Publish。第三方预览受其 CORS/Range 限制；文件来源不应是需要登录的私密网页或临时签名 URL。可在 Edit metadata 中补 DOI、citation 和 license。

## 下载一个文件夹

展开 **Folder downloads**。小目录提供 **Download folder ZIP**；大目录提供 **Download file manifest**，里面列出原件链接、稳定页面、路径、大小和 SHA-256，便于使用下载工具或脚本。已有 **Uploaded ZIP snapshot** 可以直接下载。

文件夹快照不会因为之后改一个文件而自动重做。需要当前完整快照时重新生成/上传新 bundle；多 GB 目录优先提前准备 archive 或使用 manifest，不在浏览器临时凑一个 20 GB ZIP。

## 发版后暂时看不到更新

文件上传、metadata commit、Actions 构建和 Pages 上线是不同阶段。上传进度 100% 不等于网站目录已经更新；Add to draft 也还没有发布。

先确认 Publish 成功，再看对应 Actions/Pages deployment。部署成功后刷新正式页面，必要时用强制刷新/新窗口确认缓存。不要为同一批重复点 Publish 来催促上线。出现 conflict 时先同步最新版本再 Review，避免覆盖手工更新。

## 旧文件、回滚与保护 Homepage

本轮保留当前最新 Homepage、导航、正文、原件和稳定链接。旧 repository 文件已经通过兼容 JSON/索引进入 Library；不会删除或搬走原件。需要再次迁移时见 [FILE-LIBRARY.md](FILE-LIBRARY.md) 的 dry-run/backup 步骤。

当前升级备份分支是 `backup/before-academic-file-library`。恢复代码时不要将整个 main reset 到备份，因为那会丢失后来自己的内容修改。先备份现有 metadata/原件，再只恢复需要的实现文件。

更多结构和安全说明：[FILE-LIBRARY.md](FILE-LIBRARY.md) · [STORAGE.md](STORAGE.md)。
