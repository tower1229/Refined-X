[English](README.md) | 简体中文

# Refined-X

![首页](docs/screenshots/home.png)

基于 [Astro](https://astro.build/) + [Starlight](https://starlight.astro.build/) 的 **Agent 友好的个人站点** 模板。

- 清爽的阅读体验；
- 全栈内容数据驱动；
- 灵活自定义数据源目录、产物目录、配置目录，为个人数据仓库集成做好准备；
- 自动生成 `llms.txt`、OpenAPI、JSON API、Markdown 镜像；
- Agent 友好的 MCP 端口；
- 符合 NLWeb 协议的 /ask 页面。

## 快速开始

```sh
npm create astro@latest -- --template tower1229/Refined-X
cd <project>
npm install
npm run dev
```

或直接克隆本仓库：

```sh
git clone git@github.com:tower1229/Refined-X.git
cd Refined-X
npm install
npm run dev
```

打开终端打印的本地地址。样例内容在 `content/`，静态资源在 `public/`。

```sh
npm run build && npm run verify
```

## 内容 Schema

将 `contentRoot` 指向符合下列结构的目录（默认 `./content`）：

```text
content/
  articles/**/*.md      # contentType: article + pubDate + slug + llmSummary
  answers/**/*.md       # contentType: answer + question + shortAnswer
  pages/**/*.md         # contentType: page（如 friends）
  profile/
    person.yaml         # kind: person
    cooperation.yaml    # kind: cooperation
    resume.md           # About 正文
  projects/*.{yaml,yml,json}
  series/
    series.json         # { "order": ["…"] }
    *.yaml
```

Schema **有明确约定**；内容树的**位置**可配置。

## 配置参考

编辑 [`site.config.mjs`](site.config.mjs)，或在旁路放置 `../instance.config.mjs`（本包作为 git submodule 时）/ 设置环境变量 `REFINED_X_INSTANCE_CONFIG`。

| 字段                                  | 默认                    | 作用                                                |
| ------------------------------------- | ----------------------- | --------------------------------------------------- |
| `locale`                              | `en`                    | 界面文案包（`en` \| `zh-CN`）                       |
| `contentRoot`                         | `./content`             | 公开 Markdown/YAML 根目录                           |
| `publicDir`                           | `./public`              | 静态资源（复制到 dist）                             |
| `outDir`                              | `./dist`                | 构建输出                                            |
| `assetSource`                         | 未设置                  | 可选图片库，供 `collect-assets` 使用                |
| `site` / `title`                      | example.com / Refined-X | 站点身份                                            |
| `ask.askUrl` / `mcpUrl` / `healthUrl` | 空                      | 可选 Public Ask / NLWeb Worker                      |
| `redirects`                           | `{}`                    | Astro redirects                                     |
| `brand.*`                             | Demo Author 文案        | 身份与内容（persona、标题、chips），不含界面 chrome |

相对路径均相对本包根目录解析。

## 能力矩阵

| 能力                                      | 是否包含 | 说明                                  |
| ----------------------------------------- | -------- | ------------------------------------- |
| 编辑向 UI + 主题切换                      | 是       | 见 `DESIGN.md`                        |
| 文章 / 专栏 / 作品 / 关于                 | 是       | 来自 `contentRoot`                    |
| 精选 Answers + 静态 Ask 搜索              | 是       | `/ask`、`/answers`                    |
| `llms.txt` / `llms-full.txt` / `.md` 镜像 | 是       | 构建时生成                            |
| `/api/*.json` + `/openapi.json`           | 是       | 构建时生成                            |
| `/.well-known/mcp/*` 发现                 | 是       | 配置 `ask.*` 前 URL 可为空            |
| NLWeb `POST /ask` + MCP tool              | 可选     | 部署 Public Ask Worker 并设置 `ask.*` |

线上参考实现：[refined-x.com](https://refined-x.com)。

![写作](docs/screenshots/writing.png)

### Themes Portal 短描述

> Agent 友好的个人站点起步模板（Astro + Starlight）：opinionated 公开内容 schema、编辑向阅读体验、`llms.txt` / OpenAPI / JSON API、MCP 发现，以及可选的 NLWeb Public Ask Worker。

### create-astro 冒烟

```sh
npm create astro@latest -- --template tower1229/Refined-X
# 默认分支应为 `main`
cd <project> && npm install && npm run build && npm run verify
```

可选实时问答后端示例：[`examples/public-ask-worker`](examples/public-ask-worker)。

## 作为 submodule 使用

在父级 monorepo（例如自有 `20_Publish/` 的知识库）中：

```sh
git submodule add git@github.com:tower1229/Refined-X.git 90_Website/Template
```

在 submodule 旁新增 `90_Website/instance.config.mjs`，配置 `contentRoot` / `publicDir` / `outDir` / brand / ask URL。实例相关设置不要改 submodule 工作树内的文件。

## 许可证

MIT
