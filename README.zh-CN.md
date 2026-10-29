[English](README.md) | 简体中文

# Refined-X

## 面向 Agentic Web 的个人公开接口

一次发布，同时服务于人、搜索引擎与 AI Agent。

Refined-X 是一个基于 [Astro](https://astro.build/) 和 [Starlight](https://starlight.astro.build/) 构建的 AI 友好型个人博客模板。
你只需要用 Markdown 和 YAML 维护公开内容，Refined-X 就能把同一份内容转换为：

- 面向读者的克制、清晰的个人网站；
- 面向大语言模型的 Markdown 镜像、`llms.txt` 与结构化 JSON；
- 面向程序和 Agent 的 OpenAPI、MCP 发现信息；
- 可选的 NLWeb Public Ask 服务，用于实时、基于公开内容的问答。

你的内容可以保存在自己的仓库或独立知识库中。网站默认是纯静态的，
AI 问答服务始终是可选项。

[在线演示](https://demo.refined-x.com) ·
[询问 Demo](https://demo.refined-x.com/ask/) ·
[使用此模板](https://github.com/new?template_name=Refined-X&template_owner=tower1229) ·
[生产站点](https://refined-x.com)

![Refined-X 首页](docs/screenshots/home.jpg)

## 为什么需要 Refined-X？

大多数个人网站发布 HTML 后便止步于此。这对浏览器足够友好，
但 AI Agent 仍然需要从导航、布局和脚本中重新提取信息、判断结构和理解语义。

Refined-X 将同一份公开内容发布为三种界面：

| 界面       | 提供的能力                                                      |
| ---------- | --------------------------------------------------------------- |
| 面向人     | 文章、系列、项目、个人资料、精选回答、主题聚合、明暗主题        |
| 面向机器   | 页面级 Markdown、`llms.txt`、`llms-full.txt`、JSON API、OpenAPI |
| 面向 Agent | 静态精选搜索、可选 NLWeb `/ask`、可选 MCP `ask` 工具            |

```mermaid
flowchart LR
  A["Markdown + YAML"] --> B["Refined-X 构建"]
  B --> C["面向人的个人网站"]
  B --> D["机器可读接口"]
  D --> E["可选 Public Ask"]
```

## Refined-X 有什么不同？

### 一份内容，多种输出

文章、回答、项目、系列与公开个人资料使用明确的内容模型。
网站页面和所有机器可读接口都由这份公开内容生成，
避免为人和 Agent 分别维护两套数据。

### 内容与模板相互独立

`contentRoot`、`publicDir` 和 `outDir` 均可配置。
你可以把个人内容长期保存在独立知识库或 monorepo 中，
仅将 Refined-X 作为可替换的发布层。

### 不接入 AI 后端也能完整使用

默认站点完全静态。`/ask` 可以直接搜索精选回答和公开文章，
不依赖模型、数据库或常驻服务器，也不会产生推理费用。

### 需要时再启用实时问答

可选的 Public Ask Worker 提供基于公开内容的检索和摘要，
暴露受限的 NLWeb v0.55 兼容 `/ask` 接口与双代 Streamable HTTP MCP 服务
（同一 `/mcp` 上一个 `ask` 工具，覆盖 modern `2026-07-28` 与 legacy 2025）。
离线双代集成由 CI 跑通；产品客户端验收见
[`docs/mcp-client-support-matrix.md`](docs/mcp-client-support-matrix.md)
（核心：Claude Code modern + Codex CLI legacy，合成 mock 后端；其余客户端保持 `not_run`）。
并内置配额、限流、浏览器验证、来源链接和明确的能力边界。

### 为阅读而设计

对 Agent 友好不意味着把个人网站做成控制台。
Refined-X 使用克制的编辑式视觉语言、适度动效和无障碍明暗主题，
让人的阅读体验始终处于首位。

## 快速开始

本仓库已经启用 GitHub Template。你可以点击
[使用此模板](https://github.com/new?template_name=Refined-X&template_owner=tower1229)，
也可以运行：

```sh
npm create astro@latest -- --template tower1229/Refined-X
cd <project>
npm install
npm run dev
```

然后打开 Astro 在终端中输出的本地地址。

部署前建议依次执行：

```sh
npm run check
npm run test:public-ask
npm run test:related
npm run build
npm run verify
```

## 选择部署模式

| 模式                  | 所需基础设施                                           | 获得的能力                                                          |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| 纯静态                | GitHub Pages、Cloudflare Pages、Netlify 或任意静态托管 | 网站、本地 Ask 搜索、Markdown、`llms.txt`、JSON、OpenAPI 与发现信息 |
| 静态站点 + 外部知识库 | 静态托管加独立 `contentRoot`                           | 在内容保留于外部知识库的同时获得全部静态输出                        |
| Live Ask              | 静态站点加参考 Cloudflare Worker                       | 基于公开内容的浏览器问答、NLWeb `/ask`、MCP `ask` 与健康检查        |

建议先从纯静态模式开始，只在确实需要对话式访问时启用 Live Ask。

## 部署静态站点

| 路径 | 说明 |
| ---- | ---- |
| GitHub Pages | 复制 [`deploy/user-github-pages.yml`](deploy/user-github-pages.yml) → 启用 Pages（GitHub Actions） |
| Cloudflare Pages | 构建命令 `npm run build`，输出目录 `dist`，Node `24` |

完整步骤见 [`docs/deploy-static.md`](docs/deploy-static.md)。

Cloudflare Pages：在[控制台](https://dash.cloudflare.com/)连接仓库（[Git 集成文档](https://developers.cloudflare.com/pages/get-started/git-integration/)）。GitHub Pages：复制上方 workflow 即可。

## 内容模型

默认公开内容位于 `content/`：

```text
content/
  articles/**/*.md
  answers/**/*.md
  pages/**/*.md
  profile/
    person.yaml
    cooperation.yaml
    resume.md
  projects/*.{yaml,yml,json}
  series/
    series.json
    *.yaml
```

文章 frontmatter 使用明确、可验证的字段：

```yaml
---
title: 为人和 Agent 同时构建个人网站
description: 一段面向读者和搜索引擎的简短描述。
contentType: article
pubDate: 2026-07-01
slug: humans-and-agents
series: notes
tags:
  - publishing
  - agents
llmSummary: 一段供机器读取、忠于正文事实的简明摘要。
---
```

构建时会校验必要日期、slug、摘要、回答字段和内容类型，
使公开语料保持稳定且可被程序处理。

可选的 `seoTitle` 只覆盖浏览器和分享标题，不改变正文 H1；`seoImage` 指定分享图片；
`updatedDate` 表示实际内容更新时间，不得早于 `pubDate`。页面日期未知时可以不填。

配置 `assetSource` 后，收集流程保留原图 URL，并为静态位图生成带内容哈希的 WebP 和尺寸清单。
Markdown 图片使用该清单输出宽高、响应式候选和懒加载；GIF、动画与 SVG 保留原格式。
JPEG 按 EXIF 方向转换后的尺寸生成候选，宽度描述符唯一且与编码后的像素一致；图片缓存 v3 包含平台、架构及 Sharp／原生编码库版本，编码器升级后不会复用旧缓存。
`retainedAssets` 可显式保留下线文章曾经公开的原图文件名，保证干净检出也能重建兼容 URL。
字体使用仓库内的 Spectral 拉丁子集，许可见 `src/assets/fonts/Spectral-OFL.txt`。

清理前会拒绝资源源目录与输出目录的包含关系及危险符号链接，并保护内容和历史快照输入。内容根目录可以包含 public，但不能位于将被删除的 asset 目录内。

资源目录每次从引用原图重建，不保留 public 或 dist 中的预览残留。需要保留旧衍生 URL 时，
通过 `REFINED_X_ASSET_HISTORY` 提供历史快照目录：`asset-history.json` 包含 `version: 1`、
`sourceRevision`、`files: [{ file, sha256 }]`，文件位于 `optimized/`，恢复时校验哈希。
快照由托管适配层从已推送产物生成；普通构建缓存不充当历史输入。

`feedUpdatedDate` 与 `pageUpdatedDates` 是作者维护的频道、列表或静态页更新日期，
适用于下线文章、调整列表等仅靠文章日期无法表达的变更；不应在每次构建时刷新。集合页（含归档分页）采用显式日期与自动成员日期的较新值。
RSS 自动发现位于公共 head，页脚同时提供订阅入口。

执行 `npm run test:site` 验证图片、链接、部署 base 和日期逻辑；`npm run verify` 检查构建产物。
通用审计入口 `scripts/site-audit.mjs` 返回页面元数据、图片、失败项与编辑警告。
托管平台适配层可向 `auditSite` 传入 `resolveRoute`，把实际重定向优先级纳入链接检查。
审计同时检查内联 CSS 静态 URL 和 `data-src`。历史动态路由的具体样本由托管适配层维护。
标题、描述长度和空 ALT 只提示人工复核，不作为统一字数门槛。
元数据名称和 canonical 关系标记按不区分大小写解析，包括复制的历史 HTML。

Pagefind 使用固定版本的公开 `getFiles()` API 导出字节，再由 Node 等待写入并读回校验 SHA-256。
`build` 和 `verify` 都会拒绝空或损坏的入口、缺失的语言元数据／WASM、损坏的压缩内容，
以及文件清单不一致或哈希不匹配的产物。部署时保留完整 `pagefind/`，包括 `refined-x-manifest.json`。
现有 Ask 页面仍使用 `/api/search-index.json`；Pagefind 是供集成使用的独立静态索引。
`npm run test:search` 执行 100 次真实原生索引导出；`npm run test:search-build` 在实际 Astro 构建中
注入故障并验证两道门禁。诊断依据与验收边界见[搜索完整性说明](docs/pagefind-integrity.md)。
内存导出会暂存整个索引包，大型站点升级前应测量构建内存。

## 配置站点

v2.1.1 同时更新站点和可选 Worker 的安全依赖。分别在根目录与
`examples/public-ask-worker` 执行 `npm ci`、`npm audit`；CI 会检查生产及开发依赖的所有严重级别。
注册表不可用或新增安全公告也会使该门禁失败。
Worker 固定 MCP SDK 2.3.0、Wrangler 4.153.0；实例同步后应重新生成类型并运行离线协议测试。
模板更新不会自动部署已有 Worker。具体版本、公告来源和验收边界见
[安全升级说明](docs/security-upgrade-2026-10-29.md)。

多数情况下，建议创建一个 `instance.config.mjs` 覆盖实例配置。
你也可以直接修改 [`site.config.mjs`](site.config.mjs) 中的默认值：

```js
export default {
  site: "https://example.com",
  title: "你的名字",
  locale: "zh-CN",
  timeZone: "Asia/Shanghai",
  contentRoot: "./content",
  publicDir: "./public",
  outDir: "./dist",
  brand: {
    persona: "你的名字",
    homeHeading: "你的名字",
    homeLede: "你关注什么，以及为什么写作。",
  },
};
```

常用配置：

| 字段          | 默认值      | 用途                                  |
| ------------- | ----------- | ------------------------------------- |
| `locale`      | `en`        | 界面语言，可选 `en` 或 `zh-CN`        |
| `contentRoot` | `./content` | 公开 Markdown/YAML 内容目录           |
| `publicDir`   | `./public`  | 静态资源目录                          |
| `outDir`      | `./dist`    | 构建输出目录                          |
| `assetSource` | 未设置      | 可选的外部图片资源库                  |
| `brand.*`     | Demo 数据   | 公开身份与首页文案                    |
| `ask.*`       | 空          | 可选 Public Ask / MCP / 健康检查 URL；`protocolProfile` 默认 `undeclared`（仅在部署验收后设为 `dual-era`） |
| `discovery.awp` | `false`   | 可选 AWP 0.2；`true` 时生成字节一致的 `/agent.json` 与 `/.well-known/agent.json`（一期仅静态读）；llms 不自动推荐；子路径部署限制见计划 §8.3 |
| `comments.*`  | 空          | 可选的 giscus 仓库与讨论分类          |

相对路径均从 Refined-X 包根目录解析。

## 启用文章评论

Refined-X 可以在文章页按需加载 [giscus](https://giscus.app/)，并将讨论数据保存在
公开的 GitHub Discussions 仓库中。启用 Discussions、安装 giscus GitHub App、
创建讨论分类后，从 giscus 配置页复制四个公开标识：

```js
export default {
  comments: {
    repo: "owner/repository",
    repoId: "R_...",
    category: "Comments",
    categoryId: "DIC_...",
  },
};
```

四项全部留空时评论关闭；部分配置会让构建明确失败，避免发布不可用的评论区。
Refined-X 使用稳定的 `article:<entry.id>` 讨论键，语言和深浅色跟随站点，第三方
iframe 会懒加载。访客参与评论需要 GitHub 账号。

## Agent 可读接口

每次构建都会生成一组可预测的公开接口：

| 地址                                | 用途                                |
| ----------------------------------- | ----------------------------------- |
| `/llms.txt`                         | 面向 Agent 的精简站点地图与重要链接 |
| `/llms-full.txt`                    | 完整公开文本语料                    |
| `/<page>.md`                        | 对应公开页面的纯净 Markdown 镜像    |
| `/api/profile.json`                 | 结构化公开身份信息                  |
| `/api/articles.json`                | 文章目录                            |
| `/api/topics.json`                  | 主题目录                            |
| `/api/search-index.json`            | 静态 Ask 与搜索语料                 |
| `/openapi.json`                     | API 以及可选 Ask/MCP 契约（仅声明已配置的远程端点） |
| `/.well-known/about.json`           | 站点能力摘要                        |

这些接口可以降低网站被检索、摄取和连接的成本，
但不承诺所有 Agent 都会自动发现或主动调用它们。

历史草案 MCP 发现路径（`/.well-known/mcp.json`、
`/.well-known/mcp/catalog.json`、`/.well-known/mcp/server-card.json`）已在破坏性变更中**移除**。
请优先使用已配置的 MCP 端点 URL、OpenAPI 与 `about.json`；不要期望 `/.well-known/ai-catalog.json`。

## 启用 Live Ask

可选的 Cloudflare Worker，用于带来源的浏览器问答、NLWeb `POST /ask` 与 MCP `ask`。
包目录：[`examples/public-ask-worker`](examples/public-ask-worker)。

**部署清单与故障排查：** [`docs/deploy-live-ask.md`](docs/deploy-live-ask.md)。

Worker 上线后，在静态站点配置中接入：

```js
export default {
  ask: {
    askUrl: "https://ask.example.com/ask",
    mcpUrl: "https://ask.example.com/mcp",
    healthUrl: "https://ask.example.com/health",
    // 可选。默认 undeclared —— 部署验收前不要宣称 modern dual-era。
    // protocolProfile: "dual-era",
  },
};
```

若启用浏览器生成式回答，请在 Astro 构建时设置 `PUBLIC_TURNSTILE_SITE_KEY`。
官方 Demo 使用 `https://ask-demo.refined-x.com/mcp`。

Live Ask 有意不支持长期记忆、任意外部操作、动态权限征询，
也不会模仿或冒充网站所有者。

## 使用外部知识库

Refined-X 可以作为子模块放入个人数据仓库：

```sh
git submodule add git@github.com:tower1229/Refined-X.git 90_Website/Template
```

将 `instance.config.mjs` 放在子模块附近，或设置
`REFINED_X_INSTANCE_CONFIG`：

```js
export default {
  contentRoot: "../../20_Publish",
  publicDir: "../../30_Assets/Public",
  outDir: "../../dist",
};
```

个人身份和实例配置保留在模板之外，
因此更新 Refined-X 时不会覆盖你的内容与个性化信息。

## 设计

视觉系统、字体、组件规则、动效边界和无障碍说明详见
[`DESIGN.md`](DESIGN.md)。

![Refined-X 封面 — 层叠](docs/community-cover/refined-x-cover-ink.png)

![Refined-X 封面 — 拼贴](docs/community-cover/refined-x-cover-paper.png)

## 项目边界

Refined-X 是：

- 一个静态优先的个人发布模板；
- 一套观点明确的公开内容模型；
- 一份同时面向人、机器与 Agent 的公开接口参考实现。

Refined-X 不是：

- 托管式 CMS；
- 私人 Agent；
- 长期记忆服务；
- 对所有 MCP 客户端自动发现能力的承诺；
- 把扩展矩阵里未跑过的客户端写成“已验证支持”（见 [`docs/mcp-client-support-matrix.md`](docs/mcp-client-support-matrix.md)）。

它服务的是“个人愿意公开表达和被外部读取的部分”，
而不是替个人保存全部私人数据或代表个人执行任意行动。

## 参与贡献

欢迎提交 Issue、部署案例、文档改进和 Pull Request。
如果你已经使用 Refined-X 发布了自己的站点，
可以创建 showcase Issue，帮助其他人了解真实使用方式。

- [贡献指南](CONTRIBUTING.md)
- [更新日志](CHANGELOG.md)
- [安全策略](SECURITY.md)
- [路线图](ROADMAP.md)

## 开源许可

[MIT](LICENSE)
