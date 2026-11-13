# 💿 Spinora 官方网站与礼物盒子系统

本项目是 **Spinora（3D CD / 唱机 / 动态歌词大屏播放器）** 的专属官方网站与轻量社区功能实现。
完全基于 **0 成本、无付费依赖** 的 Serverless 云原生架构设计。

---

## 🌟 技术选型

- **前端托管**：Cloudflare Pages（全球 Anycast CDN，秒级加载，无限流量）
- **软件分发**：GitHub Releases（支持单文件 2GB，全球 CDN 高速下载）
- **无服务器后端**：Cloudflare Pages Functions（同域免跨域 API）
- **轻量数据库**：Cloudflare D1（边缘 Serverless SQLite）
- **防滥用防护**：客户端 IP 加盐哈希限流与 XSS 实体转义清洗

---

## 🚀 极速部署指南（5 分钟上线）

### 第一步：创建 GitHub 仓库并推送
1. 在 GitHub 上创建一个新仓库，例如 `spinora-website`（或直接使用主项目分支）。
2. 将本目录 `spinora-website` 下的所有代码推送到仓库的 `main` 分支。

### 第二步：创建 Cloudflare D1 数据库
1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)。
2. 在左侧菜单点击 **存储与数据库 (Storage & Databases)** -> **D1 SQL 数据库**。
3. 点击 **创建数据库**，输入名称 `spinora-db` 并确认。
4. 进入该数据库详情页，切换到 **控制台 (Console)** 选项卡。
5. 将本项目根目录下的 `schema.sql` 内容完整复制并粘贴进控制台，点击 **执行 (Execute)**。

### 第三步：部署到 Cloudflare Pages
1. 在 Cloudflare 控制台左侧进入 **计算 (Workers & Pages)** -> 点击 **创建应用程序** -> 选择 **Pages** -> **连接到 Git**。
2. 授权并选中你的 `spinora-website` 仓库：
   - **项目名称**：`spinora`（自动分配 `spinora.pages.dev` 免费二级域名）
   - **生产分支**：`main`
   - **框架预设**：None（原生前端，无需构建）
   - **构建输出目录**：`public`
3. 点击 **保存并部署**。

### 第四步：绑定 D1 数据库到 Pages Functions
1. 部署完成后，进入该 Pages 项目的管理界面。
2. 点击 **设置 (Settings)** -> **函数 (Functions)** -> 找到 **D1 数据库绑定** 区域。
3. 点击 **添加绑定 (Add binding)**：
   - **变量名称 (Variable name)**：严格填写为 `DB`
   - **D1 数据库**：选择刚创建的 `spinora-db`
4. 点击 **保存**。
5. 进入 **部署 (Deployments)** 页面，点击最新一次部署右侧的 `...` -> **重试部署 (Retry deployment)**。
6. 🎉 大功告成！打开分配的 `https://spinora.pages.dev` 即可直接访问。

---

## ⚖️ 公益与合规设计说明

1. **零音频文件托管**：本系统数据库只记录歌曲名、歌手、推荐语与合规流媒体公开外链，不存储、不上载任何实际音频文件本体。
2. **DMCA 快速下架通道**：后台内置 `status='hidden'` 屏蔽字段，如收到版权方通知可瞬间屏蔽。

