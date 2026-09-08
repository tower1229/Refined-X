# Refined-X 协议升级改造方案

**调研截止：2026-09-08**  
**源码基线：`tower1229/Refined-X@00781cecb0616cf64b27370830d448c1006fa72f`**  
**状态：技术设计与迁移建议；尚未实施、提交或完成客户端端到端验收。**

## 1. 执行结论

本次升级不应采用“把所有版本号改为最新、增加更多发现文件”的方式。建议目标是：**一个 Ask 业务核心，一个支持新旧 MCP 的 `/mcp`，一份内部能力契约，以及少量由契约生成的外部文档。**

| 决策 | 本次处理 |
|---|---|
| MCP | 接入官方 TypeScript SDK v2 的 Web 标准服务入口，支持 `2026-07-28`，同时保留基于 `initialize` 的旧客户端兼容；两种行为在同一 `/mcp`，共享同一个 `ask` 工具。 |
| NLWeb | 保留 `0.55` 的受限 `/ask` 子集。当前官网规范仍是该版本，不能因为版本号低而当作废弃实现删除。 |
| AWP | 作为可选、实验性的构建期导出，不作为主流 Agent 连接的前置条件。默认模板不宣称 Agent 会自动发现它。 |
| 历史发现文档 | 停止将旧 MCP Catalog / Server Card 实现称为稳定官方标准；冻结为薄兼容输出，发布弃用说明后退役。 |
| OpenAPI | 本次优先修正真实接口、条件输出与 schema，保留 3.1.x 兼容输出；不为追新而强制切换到 3.2。 |
| 安全与成本 | 保留现有 API Key、Turnstile、配额、缓存、审计和保留策略；协议升级不能成为绕过权限或重复推理的路径。 |
| 维护边界 | 不引入两套 MCP SDK、两个业务核心、独立 AWP 服务、A2A、支付、任务系统、MCP Apps 或自建 OAuth 授权服务器。 |

新协议已被部分主流客户端采用，但并非所有客户端、部署方式和默认配置都已切换。因此，**modern-only 会损失现有兼容性，legacy-only 则错过已经落地的新客户端能力；双时代兼容是当前有证据支持的选择。** [S01–S08]

## 2. 范围与证据边界

### 2.1 本次检查的内容

通过 GitHub 读取当前 `main`，确认基线提交的提交时间为 2026-09-01。检查重点包括 Worker 的 MCP 路由、NLWeb 请求解析、入口及跨域处理、现有测试、OpenAPI、MCP 发现生成器、站点配置和构建验证脚本。[R01–R10]

协议事实来自官方规范、官方 SDK 文档、产品文档和开源客户端源码；“规范已发布”“SDK 可用”“产品默认启用”“本项目已联调通过”是四种不同结论，不能互相替代。

本次没有运行各商业客户端的真实会话，也没有运行项目完整构建或测试。尝试进行生产站点的有限元数据探测时，执行环境无法解析目标域名，未获得 HTTP 响应；这不是生产站故障证据，也不能将源码推断写成线上实测结果。未调用 `/ask` 或 `tools/call`，未触发模型生成。

### 2.2 不改变的产品边界

Refined-X 仍是静态优先的个人发布模板。HTML、文章 Markdown、公开 JSON、`llms.txt` 等静态输出继续独立工作；Live Ask 是可选外部 Worker。网站可见界面继续面向人的阅读与提问体验，不增加协议选择器，不要求访客理解 MCP/AWP。[R02]

“向人提供 Ask、向 Agent 提供 MCP”在本项目中的具体实现依据是 **NLWeb + MCP**，并不要求新增 `human.md`。AWP 是额外的发现描述层，不取代这两者。[R03][S09][S10]

## 3. 最新协议与实际采用情况

### 3.1 协议状态

| 项目 | 调研确认的状态 | 对 Refined-X 的意义 |
|---|---|---|
| MCP `2026-07-28` | 已正式发布；modern 请求自描述，取消该时代的 initialize 会话握手；增加 server/discover、请求头路由、结果缓存提示等。 | 值得接入，但不能直接删除 legacy 客户端入口。 |
| MCP 2025 系列 | 属于 legacy 行为：initialize 握手。官方 SDK 明确提供双时代服务方式。 | 属于当前兼容基线，不是无条件应删的“废代码”。 |
| NLWeb `0.55` | 当前官网仍发布此版本规范，官方实现也仍使用 0.55。 | 保留现有受限子集，不扩展 await、长期记忆或任意任务执行。 |
| AWP `0.2` | 官网规范仍标记 Draft RFC，发布日期 2026-04-16。 | 小范围试验，不能宣传为主流客户端普遍内建的入口。 |
| MCP Server Cards / SEP-2127 | GitHub 提案仍 open、in-review；2026-09-03 仍有更新，提案说明使用 `/.well-known/ai-catalog.json`。 | 现有 `/.well-known/mcp/catalog.json` 不能继续被称作稳定“官方入口”；也不宜马上追着草案再添新路径。 |
| OpenAPI | 官方 latest 当前指向 3.2.0；项目输出 3.1.0。 | 版本较旧不等于应删。现阶段先确保现有消费者能正确调用 3.1.x 描述的实际接口。 |

依据：[S01][S02][S06][S09–S12][S16]。OpenAPI 保留 3.1.x 是本方案的兼容策略，不是对全部 Agent 的 OpenAPI 版本支持作出的统计结论。

### 3.2 主流客户端支持矩阵

| 客户端／环境 | 直接证据 | 可得结论 | 发布前验收方式 |
|---|---|---|---|
| Claude Code `v2.1.232+`，通常的直接使用环境 | 官方文档明确默认使用 SDK v2 runtime；对 HTTP 服务器探测新协议并在支持时采用。 | 已有实际产品级支持，不能再仅用 7 月的“即将推出”公告判断。 | 当前受支持版本、默认配置下连接双时代 `/mcp`，验证实际采用的协议与 ask 返回。 |
| Claude Code：Bedrock、Claude Platform on AWS、Google Cloud Agent Platform、Microsoft Foundry 等文档列出的环境 | 同一官方文档列出默认 v1 runtime 的例外；亦有 gateway、feature-flag 相关例外。 | 同一产品仍存在 legacy 默认路径。 | 至少以 `MCP_SDK_GENERATION=v1` 或等效受支持配置覆盖旧运行时；需要检验真实部署时记录平台。 |
| Claude Code：明确选择 runtime / negotiation | 官方文档提供 `MCP_SDK_GENERATION=v1/v2` 与 `MCP_PROTOCOL_NEGOTIATION=auto/legacy`。 | SDK 世代与协商模式是两个维度；在默认 v1 的环境只设 v2 不一定开始探测。 | v2+auto 与 legacy 分别测试，不依赖品牌名猜版本。 |
| Codex CLI | 2026-08-07 的 `0.147.0` 发布说明提供 opt-in 的 2026-07-28 支持；本次检索到的源码中 `mcp_2026_07_28` 为 UnderDevelopment、default_enabled=false。 | 已实现并已作为可选能力发布，不等于所有安装或默认配置启用。 | 记录安装版本；分别检验功能关闭／开启。源码检索所见 SHA 为 `d6489472f3c15e87d2d7763a5fde033545c530f8`，不将 main 状态冒充每个发行版状态。 |
| Gemini CLI | 本次读取到 core package 版本 `0.60.0-nightly.20260901.g0bd1d4397`，依赖 `@modelcontextprotocol/sdk: 1.23.0`。 | 该源码快照提供明确旧 SDK 依赖证据；按 legacy 路径设计验收，不把它外推成所有分发渠道永不支持新版。 | 固定实际安装版本，并从请求/响应记录协商结果。 |
| Cursor | 官方文档确认 Streamable HTTP；本次未取得其对 2026-07-28 默认启用的明确版本说明。 | HTTP 传输支持已证实，新协议精确版本未核实。 | 当作需要 legacy 保障的真实客户端进行连接验收；不能仅根据“支持 MCP”打勾。 |
| OpenAI Responses API 远程 MCP | 官方文档确认支持 Streamable HTTP 或 HTTP/SSE。 | 此资料未给出可据以认定 2026-07-28 默认采用的精确版本。 | 远程工具导入及有限 ask 联调；单独验证鉴权，不与 Codex 的结果混用。 |
| AWP 原生自动发现 | AWP 官网提供的是通过 AWP MCP server 接入 Claude Code 的方案。 | 未取得上述主流产品普遍内建自动探测 AWP 的证据。适配器支持不等于原生发现。 | AWP schema 测试与专门消费者测试分开记录，不列为普通 MCP 客户端连接前提。 |

依据：[S03–S05][S08][S10][S13][C01][C02]。

**验收记录不能只有“Claude / Cursor：支持”。至少记录客户端精确版本、平台、运行时、实验开关、实际请求协议、工具导入、调用结果、认证方式和测试日期。** 未执行的项目标为 `not_run`，不能把文档证明写成 `passed`。

## 4. 源码审计发现

| 编号 | 位置 | 当前问题 | 改造要求 |
|---|---|---|---|
| F01 | `examples/public-ask-worker/src/mcp-server.ts`；`src/lib/mcp-discovery.ts` | initialize 固定返回 `2024-11-05`，忽略请求版本；发现文档却标为 Streamable HTTP。 | 删除硬编码协商逻辑，由 SDK 决定相应时代和有效版本；元数据不能与实际传输矛盾。 |
| F02 | `mcp-server.ts` | `notifications/initialized` 没有独立处理，会落入 Method not found 并返回 id:null 的响应。 | legacy 已接受通知应按协议返回 202 空响应，不伪造 JSON-RPC 调用响应。 |
| F03 | `mcp-server.ts`；`mcp.test.ts` | rejectionResponse 将 FORBIDDEN 等字符串放进 JSON-RPC `error.code`；测试断言同一错误形状。 | 由 SDK 生成合法协议错误；业务码保留在工具错误数据或 error.data，不放进应为整数的 code。旧错误测试同步更正。 |
| F04 | `index.ts` 的 OPTIONS/CORS 与 `/mcp` 分支 | CORS 只放行 content-type、authorization、Turnstile；`/mcp` 直接返回 handleMcp，未像统一出口一样附加跨域处理。 | 成功和失败响应统一处理 CORS；允许需要的 MCP 头；将 Origin 校验与浏览器 CORS 明确分开。 |
| F05 | `src/pages/openapi.json.ts` | ask/mcp 未配置时仍生成对应 POST path，回落到静态站点 origin。 | 纯静态模式不声明远程 Ask/MCP；静态 `/ask/` UI 不是 POST API。 |
| F06 | `openapi.json.ts`；`scripts/verify.mjs` | 外部端点仅取 `.origin` 并固定 `/ask` 或 `/mcp`；验证脚本也仅核对 origin。 | 支持带路径前缀的真实 URL；验证 server+path 重建结果等于配置的完整端点。 |
| F07 | `protocol.ts`、`mcp-server.ts`、`openapi.json.ts`、`site-copy.ts` | schema、版本、能力文案多处重复；工具 query.text 未声明运行时已有的 1–500 字符边界。 | 统一契约；保留既有 Unicode 计数、trim 和默认 mode 的语义，不以简单复制 Zod max 代替原行为。 |
| F08 | `index.ts` ↔ `mcp-server.ts` | 相互导入：入口导入协议处理器，协议处理器又从入口导入 executeAskAction。 | 抽出独立 ask-service；入口、HTTP 和 MCP adapter 单向依赖它。 |
| F09 | `mcp-discovery.ts` | 将草案 Catalog 标为 Official；Catalog / Card / mcp.json / about.json 同时重复身份与发现信息。 | 更正成熟度，保留少量有用途的输出；历史草案输出通过同一数据源投影，随后退役。 |
| F10 | `llms.txt.ts`；`scripts/verify.mjs` | llms 无条件列出三份 MCP 发现文档，构建验证强制要求它们存在。 | 验证按部署能力与迁移阶段变化；新增“必须不存在”的断言，防止删除后又被脚本补回。 |

依据：[R03–R11]。这些是源码层结论，不是本次已复现的生产端故障清单。Streamable HTTP 从 MCP 2025-03-26 起出现，2024 的 HTTP+SSE 是另一种传输模型；不能仅改发现文档中的传输字符串来掩盖差异。[S14]

## 5. 目标架构：收敛，而不是叠加

```text
公开内容 + instance.config
         │
         ├── 静态 HTML / Markdown / JSON / llms
         │
         └── public-capabilities（内部类型化描述；不是新增网络协议）
                  ├── OpenAPI
                  ├── about.json（项目自有公开索引）
                  ├── 可选 AWP manifest
                  └── 历史发现兼容投影（限期保留）

人：/ask/ UI ── NLWeb POST /ask ─┐
                               ├── executeAskAction
Agent：同一个 POST /mcp ─────────┘        │
       ├── modern SDK adapter            ├── 权限 / 配额 / 防滥用
       └── legacy SDK adapter            ├── 检索 / 模型 / 缓存
                                         └── 审计 / 保留策略
```

AWP 让了解 AWP 的消费者获得端点；MCP `server/discover` 则是在已知 MCP 端点上获取服务器能力。二者不是同一个发现阶段。新增 server/discover 不会自动让全网 Agent 找到这个网站，也不是将它发布为一个独立 `/server/discover` HTTP 路由。[S02][S07]

### 5.1 内部契约的最小内容

建议新增根目录 `shared/public-ask-contract.ts`。内容限于 NLWeb 子集的请求、结果、错误分类、版本、公开能力描述，以及各入口默认行为。应能够被 Astro 构建与 Worker 导入，但不得导入环境密钥、DB binding、Astro 专属模块或 Worker 入口。

`src/lib/public-capabilities.ts` 将 shared 契约与 `siteConfig` 合并，决定本实例实际输出哪些静态和远程能力。这是构建期适配，不要发展成通用插件注册中心。

版本字段分工如下：

| 字段 | 含义 | 禁止的混用 |
|---|---|---|
| NLWeb `meta.version` | Ask 业务数据格式，目前 0.55 | 不能替换成 MCP 日期版本。 |
| MCP 请求版本及 SDK era | JSON-RPC/传输语义 | 不能使用 NLWeb 的 meta 替代现代 MCP 的 params._meta。 |
| serverInfo.version | 部署的软件版本 | 不能当作协议版本。 |
| AWP awp_version | 发现 manifest 格式，目前实验 0.2 | 不能将 validator 的 0.2.1 当作协议 0.2.1。 |
| OpenAPI openapi / info.version | OpenAPI 语法版本 / 本站 API 文档版本 | 两者独立管理。 |

## 6. MCP 改造

### 6.1 使用一个官方 SDK 入口

用官方 TypeScript SDK v2 的 `@modelcontextprotocol/server` 替换现有手写 MCP 分发器。Web 标准 `createMcpHandler` 返回 fetch 入口，适合已有 Worker 的 Request/Response 形式；它可以通过 `legacy: 'stateless'` 在同一 handler 上服务旧式握手客户端。[S06]

实现要求：在现有 Worker 的 `/mcp` 路由内调用 SDK handler，不将其直接挂成整个 Worker 的默认处理器，否则可能使其他路径也接收 MCP。SDK server factory 每请求创建实例不意味着每请求创建新的业务数据库、额度系统或内容索引。[S06]

固定通过验收的 SDK patch 和 lockfile；不在部署时动态安装 `latest`。本项目没有必要同时安装一套新 SDK 和一套旧 SDK，再自行写两套 ask 适配代码。Worker 保持现有目录和部署方式，不为这次升级迁移框架。[R10]

### 6.2 兼容规则

| 到达 `/mcp` 的请求 | 行为 | 验收目标 |
|---|---|---|
| 有效 modern 请求，2026-07-28 元数据与请求头完整 | 按 modern 编解码；无需先 initialize；可以直接 tools/list 或 tools/call。 | server/discover、tools/list、ask 在现代客户端通过。 |
| legacy initialize，声明项目支持的旧版本 | SDK 完成旧版本协商，响应仍是 legacy InitializeResult。 | 2025-11-25、2025-06-18 是核心验收项；2025-03-26 路径也纳入 HTTP 兼容测试。 |
| legacy notifications/initialized | 202，无响应体。 | 不返回 id:null 的 Method not found。 |
| 老版本 HTTP 客户端未发送版本头 | 只使用所选 SDK 明确支持的 legacy 规则处理。 | 不按 User-Agent 猜测；不默认为 modern。 |
| 明确请求不支持的版本 | 合法 unsupported-version 错误，包含支持版本。 | 不把任意日期静默当作已支持。 |
| modern 头与 body 不匹配 | 协议错误，拒绝执行。 | 不回退到 legacy 继续处理。 |
| 认证失败、额度耗尽、超时或服务端故障 | 保持原权限与失败语义。 | 不以“兼容回退”为理由重复执行、绕过权限或无限重试。 |

官方区分 modern、legacy、dual-era，并定义 unsupported-version 错误；旧式 initialize 与现代请求不是仅版本号不同的同一响应模板。[S02][S08]

**对 2024-11-05 的处理：**首先移除项目自身硬编码返回 2024 的行为，不直接承诺实现 2024 HTTP+SSE。已有客户端若能接受协商后的 2025 版本，继续正常工作；若确有硬锁 2024 的消费者，将其列为有负责人和退役条件的兼容例外，先验证所选 SDK 能否满足必要交互，再决定迁移客户端或临时边界桥接。没有消费者证据时，不新增 `/sse`、`/messages` 和长连接基础设施来“补齐旧协议”。

### 6.3 工具与响应保持一个版本的业务含义

保留 `ask` 名称及 `query.text`、`prefer`、`meta` 等既有业务参数。添加与运行时一致的输入约束、明确的输出 schema 和适当的只读 annotations，但不把只读等同于免费、无限调用或业务幂等。

输出使用同一份规范化 NLWeb answer 数据；支持结构化输出的对应时代采用 structuredContent，同时保留 JSON 文本 content，避免现有客户端解析链路失效。现代响应的 `resultType` 等协议字段由 SDK 编码，不复制 2025 的响应壳来冒充 2026。输出 schema 只声明真实输出；必须包含既有来源链接与无结果等正常业务状态。[S15]

现有大小控制针对 NLWeb JSON/SSE 数据；增加 SDK 响应封装和 structuredContent + 文本双份输出后，应检查最终 HTTP 响应的字节数，不能只复用内层结果大小检查而假定总响应仍在原限额内。截断或失败沿用一致政策，并优先保留来源 URL。请求体也只能按受控方式读取：不要先消耗 Request.body，再把已消费的 Request 交给 SDK；使用所选 SDK 的受支持限制机制或有上限的边界流，并以超大 body 用例验证。[R09]

运行期业务失败与协议失败分层处理。参数非法属于协议参数错误；已执行工具的领域失败使用该时代 SDK 支持的工具错误表示；HTTP 鉴权和请求级限流保留正确 HTTP 状态。领域码如 FORBIDDEN、RATE_LIMITED 进入约定的业务字段，不进入 JSON-RPC 的整数 error.code。不得为兼容旧错误测试继续发送非法 JSON-RPC。

### 6.4 元数据缓存与会话

现代 server/discover 和 tools/list 结果应包含规范要求的 `ttlMs` 与 `cacheScope`。建议先把不随调用者改变的公开工具定义设为固定 TTL，例如 1 小时；若以后按权限过滤工具，改为 private 或按授权上下文隔离。[S17]

MCP 缓存提示不等于 Cloudflare 自动缓存 POST；不能将所有带授权头的 MCP 回答放进共享 CDN 缓存。既有 Ask 精确缓存继续服务业务，缓存键中的知识版本、人格版本、模式与权限相关因素不得因更换传输而丢失。

本项目只需要固定 ask 工具，不宣称支持 listChanged 推送或其他未实现扩展。legacy 的 stateless 服务不要求保留协议会话；无需因此增加 Durable Objects。现有实现本就没有完整会话存储，不能把本次改造宣传为从“有状态架构”迁移至 Serverless。

## 7. NLWeb 与浏览器 Ask：保留行为，消除重复

现有 HTTP Ask 默认模式是 `list, summarize`；MCP 在参数归一化时将未指定 mode 的请求设为 `list`。共享契约时必须保留这个差异，不能因抽取公共 schema 意外让匿名 Agent 开始触发摘要生成。[R03][R09]

建议将默认值显式建模为入口策略，而不是复制两份 schema：

```text
HTTP Ask 缺省模式 → list, summarize（继续受现有浏览器验证和权限策略约束）
MCP ask 缺省模式  → list
显式 prefer.mode → 统一归一化及校验，再进入同一业务权限判断
```

当前 parser 会 trim 文本，并以 Unicode code point 检查 1–500 字符。迁移验证库时应覆盖中文、emoji、前后空白和边界长度。mode 的空白、顺序等既有解析行为也要以回归用例固定；收紧可接受别名必须明确列为兼容变化，而不是无意改变。[R09]

保留 NLWeb start/result/complete 的 buffered SSE 输出以及前端对应处理。本项目当前不是模型 token 实时流式生成；文案必须继续说明这一点。**MCP 废弃旧 HTTP+SSE transport，不等于废弃 NLWeb SSE，也不等于禁止 Streamable HTTP 返回 SSE。** [R09][S14]

这次不增加 await、promise、elicitation、长期 memory 或任意扩展字段。它们不是当前用户体验的必要条件，现有拒绝边界应继续测试。

## 8. 发现层与 AWP

### 8.1 保留的发现路径与职责

| 输出 | 职责 | 处理 |
|---|---|---|
| `llms.txt` / `llms-full.txt` / 文章 `.md` | 机器读取内容与内容入口 | 保留；更新可用接口链接，不承诺所有 Agent 自动使用。 |
| JSON APIs | 公开资料、文章、主题和静态搜索索引 | 保留；不是因为也有 MCP 就属于冗余。 |
| `openapi.json` | HTTP API 的实际调用契约 | 保留并修正，不能将静态索引 API 误称为服务器搜索。 |
| `/.well-known/about.json` | 本项目公开资料与接口索引 | 保留路径，逐步精简重复内容；标为 Refined-X 自有格式，不当作国际标准。 |
| MCP `server/discover` | 在已知 `/mcp` 上的运行期协议能力发现 | 通过 SDK 实现；不是另一个静态 JSON 文件。 |
| `/agent.json` 与 `/.well-known/agent.json` | AWP 消费者的可选能力 manifest | 一个 builder，两个一致输出，默认关闭或明确实验。 |
| 旧 MCP catalog/card/mcp.json | 历史草案及兼容探测 | 停止扩展，按第 10 节退役。 |

### 8.2 AWP 最小实现范围

新增 `src/lib/awp-manifest.ts` 和两个极薄 Astro route。建议实例配置新增单一开关 `discovery.awp: false`，开启时构建生成。不要增加 AWP server、代理、注册中心、定时同步进程或 Agent 客户端。

规范 §3 要求 `/agent.json`，但官网和 quickstart 示例使用 `/.well-known/agent.json`。在草案阶段双路径是兼容措施，不代表维护两份 manifest；两者必须由同一个序列化结果生成并进行字节一致性测试。正式规范收敛后再评估是否去掉别名。[S10][S11]

Manifest 顶层生成 awp_version、domain、intent、actions；按配置生成 protocols。每个 action 必须包含规范要求的 id、description、auth_required、inputs、outputs，以及适当的 method/endpoint 或 via。官网的极短展示样例不能当作完整验收规则。[S11]

**一期 action 范围建议只镜像明确公开的静态读取 API**，例如 get_profile、list_articles、list_topics、get_search_index。MCP 通过 protocols.mcp 声明，ask 的完整参数与模式条件由 tools/list 提供；暂不将“list 匿名、summarize 需权限”的同一个工具硬压成一个简单 auth_required 布尔值。这既避免授权语义失真，也减少一份重复工具定义。未来仅在有真实 AWP 消费者需求时添加 ask action 投影。

AWP 的 typed input/output 不是 OpenAPI schema 的原样复制；实现一个范围有限的投影并用实际 JSON API 响应夹具验证。`get_search_index` 返回索引，不是按 query 执行搜索；描述和输出必须如实反映。

protocols.mcp 只声明已通过验收的版本与真实端点。AWP 的单一 version 字段不替代 MCP 协商；不创建 mcp-v1/mcp-v2 两个假“不同协议”，也不把任意新增 supportedVersions 字段当成 AWP 标准字段。

### 8.3 部署能力应决定元数据

| 实例配置 | 预期结果 |
|---|---|
| 纯静态，askUrl/mcpUrl 均空 | 保留人类 `/ask/` 本地搜索；OpenAPI 和 AWP 不声明远程 POST Ask 或 MCP。 |
| 只有 askUrl | HTTP Ask 可见，MCP 不可见。 |
| 只有 mcpUrl | MCP 发现可见，不由 askUrl 是否存在决定；人类页面不因此假定有远程 Ask。 |
| 两者都配置 | 各自使用完整端点与真实能力。 |
| 配置非法 URL、含片段或不允许的协议 | 构建报错或按明确规则处理，不生成看似正常的错误链接。 |
| 外部 endpoint 带前缀，如 `/public/v1/ask` | OpenAPI 的服务器与 path 组合必须等于该完整 URL，不能丢失 `/public/v1`。 |
| GitHub Pages 项目子路径部署 | 不得声称已占有域名根 `/agent.json`；需要根站／自定义域名配合，否则仅作为可读取文件而非完整域名发现部署。 |

静态 handler 中写 Response headers 不足以证明 CDN 最终会发送它们；发布验收必须检验真实 Content-Type、CORS 和缓存头。Cloudflare Pages、GitHub Pages 与自定义静态托管分别记录结果，不把一种平台的配置能力当成所有平台的保证。

### 8.4 liveness 与来源可信度

静态 manifest 不写永远 operational 的运行状态；可引用经过明确设计的健康地址。当前 `/health` 默认只报告 ok 和 NLWeb 版本，深度 search 检查是另一种行为，不能把轻量 health 等同于模型、检索、预算都可用。[R07]

如果为兼容检查增加元数据，只输出软件版本、contract hash 和经测试的协议能力，不暴露内部索引 job、token、用户数据。发现文件和 serverInfo 都是声明，不能用作授权依据；安全边界仍在 Worker。

## 9. 鉴权、CORS 与防滥用

### 9.1 保持现有访问分层

匿名 Agent 继续可 list；可信机器使用既有 Bearer Key 获得允许模式；浏览器摘要继续受 Turnstile 和既有站点策略控制。Turnstile 不应要求无浏览器的 Agent 完成。新的现代 MCP `_meta` 不是身份凭证，旧时代 fallback 也不构成额外权限。

SDK 的裸 Web handler 不自动验证 Host/Origin，也不会从 HTTP header 自动完成业务 token 校验。因此更换 SDK 后仍必须接入已有验证和配额机制；“使用 SDK”不能代替这些安全措施。[S06]

### 9.2 HTTP 边界

Origin 存在时做明确 allowlist 校验，拒绝非法来源；没有 Origin 的 CLI 请求仍需正常认证及限流，不能简单一律禁用。校验 Host 与受部署控制的规范地址，避免根据不可信代理头选择站点身份。

在成功和错误响应上统一处理 CORS。允许实际使用的 Content-Type、Authorization、Accept、MCP-Protocol-Version、Mcp-Method，以及工具调用所需 Mcp-Name；保留浏览器 Ask 所需 Turnstile header。按需暴露 Retry-After、请求 ID 和认证 challenge；不要把带凭证的接口统一改成任意 Origin 放行。

现代请求必须校验 header/body 对应值。不要以 Mcp-Method 头值直接决定跳过鉴权后再执行不同的 body；legacy 则使用 SDK 解析后的真实方法做同样的业务判断。无需为 query.text 增加 x-mcp-header，避免问题内容进入网关请求头日志。[S14]

### 9.3 OAuth 不与 API Key 混为一谈

对于已有模型能力的访问 Agent，匿名 list 已可提供检索结果和来源，再由对方模型总结；这不需要调用本站摘要模型，也不要求首先建设自助 OAuth。这里不等于声称检索没有基础设施成本。

当前运营者签发的机器 API Key 不是完整 MCP OAuth 登录。可继续作为明确文档化的机器访问方式；未接入 OAuth 时，不生成伪 OAuth metadata，不承诺所有只提供 OAuth UI 的客户端均能使用认证摘要。

若真实目标要求 Claude/ChatGPT 等云端用户完成自助授权，再另立范围有限的 OAuth 交付项：采用成熟授权服务，Resource Server 校验 audience、scope、expiry；正确提供 Protected Resource Metadata 和 WWW-Authenticate；兼容客户端注册方式；跟进新版 issuer 校验要求。2026 规范将 CIMD 作为优先方向、保留 DCR 向后兼容，这不是本次就自建完整授权服务器的理由。[S18]

认证、撤销、配额与预算必须在两种协议时代一致。不能通过将失效 Key 的请求降格为匿名而改变它原本应得到的错误。现有业务预算降级策略继续在同一业务核心里执行，并明确标识实际输出模式，不能由协议 adapter 各自决定。

## 10. 冗余清理与退役清单

### 10.1 同批升级直接删除或替换

| 内容 | 操作 | 保留下来的能力 |
|---|---|---|
| 手写 initialize/tools/list/tools/call 分发、JSON-RPC 序列化、手写 ID 处理 | 使用 SDK 原位替换 `mcp-server.ts`，删除旧实现，而不是另存 mcp-v1。 | legacy 与 modern 都由同一 SDK、同一业务回调服务。 |
| 固定 `MCP_PROTOCOL_VERSION='2024-11-05'` 与固定 initialize 返回 | 删除不真实的单版本声明，改为经测试的能力描述及真实协商。 | 需要的旧客户端兼容仍保留。 |
| 重复 ASK_TOOL_INPUT_SCHEMA / OpenAPI Ask schema / 能力文案 | 移至 shared 契约；调用方做必要格式投影。 | 原参数和限制、错误类别、来源。 |
| 断言 error.code 是 FORBIDDEN 等字符串的测试 | 重写成合法协议错误与业务码位置的断言。 | 原权限拒绝和审计行为。 |
| index/mcp-server 循环依赖 | 抽出 ask-service，更新测试导入。 | 原业务实现，不另写一份。 |
| “Official MCP Catalog”“完全支持所有 Agent”等无证据文案 | 立即修正。 | 如实说明的现有能力。 |

### 10.2 先兼容后删除

目标退役：`/.well-known/mcp.json`、`/.well-known/mcp/catalog.json`、`/.well-known/mcp/server-card.json` 中没有现实消费者继续依赖的历史草案输出。

第一个迁移版本先停止在新接入说明中推荐它们，但继续用统一 capabilities 生成**原形状的薄兼容响应**。不能将它们直接重定向到 AWP 或 server/discover：前者 schema 不同，后者还是 JSON-RPC POST 方法，不能用 GET 重定向替换。

为每个历史入口记录原因、已知消费者、负责人和下次审查条件。参考项目策略：至少经历两个发布周期和不少于 30 日观察，结合已知消费者配置核对后退役；这只是建议的本项目迁移策略，不是 MCP 规范规定的通用期限。

生产站流量不能代表所有使用模板的外部站点。公共模板应在 release notes 中明确破坏性变化、最后兼容版本和迁移路径；没有跨实例证据时，不声称“全体用户都已不使用”。

确认退役后，同一 PR 删除 route、builder、常量、配置字段、导航链接、测试 fixture 和强制存在的 verify 项。`airIdentifier`、`discoveryMetaKey`、packageIdentifier 等仅由旧发现结构使用的配置，在全仓引用审计后删除；仍承担服务器身份的字段统一到必要的最小集合，不能按名字直接删。

**不在本轮新增 `/.well-known/ai-catalog.json`。** 等 SEP-2127 定稿或真实消费者确实需要，再以一个明确版本的 adapter 实现；不是每次草案换路径就永久保留一条新路径。

### 10.3 明确保留

有效的 MCP legacy adapter、NLWeb buffered SSE、既有 JSON API、Markdown、llms 两种读取粒度、机器 Key、浏览器 Turnstile、审计、保留期限及精确缓存都不属于需要因“协议升级”而移除的冗余。判断标准是是否有独立用途和真实消费者，而非文件或协议的数量。

## 11. 文件级实施清单

| 文件或目录 | 操作 | 完成标准 |
|---|---|---|
| `shared/public-ask-contract.ts` | 新增最小共享契约。 | 请求/结果约束、版本、模式默认与能力边界只有一个业务来源；不泄漏服务端依赖。 |
| `examples/public-ask-worker/src/ask-service.ts` | 从 index 提取 executeAskAction 及必要业务实现。 | index 与 mcp-server 不循环依赖；HTTP/MCP 的权限与业务结果等价。 |
| `examples/public-ask-worker/src/mcp-server.ts` | 原位改为 SDK v2 adapter。 | 同路径 modern+legacy；只有一个 ask 注册及业务调用；删除旧分发器。 |
| `examples/public-ask-worker/src/index.ts` | 保留 Worker 路由、queue、scheduled；统一 HTTP 边界。 | `/ask`、`/mcp`、health、内部路由不混淆；错误响应也有正确头。 |
| `examples/public-ask-worker/src/protocol.ts` | 保留 NLWeb 编码与流格式，引用 shared 契约。 | 0.55 受限行为与前端不退化；入口默认模式差异不丢失。 |
| `examples/public-ask-worker/src/access-guard.ts` 等现有边界模块 | 复用／小幅重构。 | 鉴权只执行预期次数；SDK metadata 不能伪造访问类别。 |
| Worker `package.json`、lockfile、tsconfig | 添加经过验收的 SDK 与契约所需依赖，校准 shared 引用。 | Node 单测、workerd/Miniflare 集成、Wrangler bundle 都通过；无不适合 Worker 的动态代码执行依赖路径。 |
| `src/lib/public-capabilities.ts` | 新增构建期能力模型。 | 条件远程能力、完整 URL、身份和来源统一。 |
| `src/lib/mcp-discovery.ts` | 过渡期改为薄兼容投影，最终随旧入口退役。 | 不再自成一套身份、版本及能力事实。 |
| `src/pages/openapi.json.ts` | 条件输出、准确 server/path、共享 schema。 | 静态模式不虚构动态 endpoint；operationId 稳定。 |
| `src/pages/.well-known/about.json.ts` | 使用统一模型，保持对既有客户端的迁移窗口。 | 自有格式定位明确，旧字段删除有说明，不偷偷改变语义。 |
| `src/lib/awp-manifest.ts` | 新增有限 AWP projection。 | 关闭时不输出；开启时符合所固定草案约束。 |
| `src/pages/agent.json.ts` 与 `src/pages/.well-known/agent.json.ts` | 新增薄路由。 | 同一序列化结果；正确 MIME；实际部署根路径验证通过。 |
| `src/pages/llms.txt.ts`、`src/lib/site-copy.ts`、相关 Head/MCP 引导组件 | 更新链接及文案。 | 不再推荐退役入口；仍提供用户可复制的真实 MCP URL；不要求 AWP。 |
| `scripts/verify.mjs` | 从固定存在清单改为能力驱动检查。 | 同时验证“应该存在”和“不应该存在”，检测旧 URL/常量重新出现。 |
| Worker 现有 mcp/protocol 测试和 staging regression 脚本 | 修改错误测试，补充双时代和客户端验收。 | 不以删除失败断言代替修复，不重复触发真实模型。 |
| README 中英文、部署文档、ROADMAP | 一次性更新支持矩阵及迁移说明。 | 开发计划与已交付功能分开，过时相互矛盾的段落删除。 |

新增文件名为实施建议，不表示当前仓库已经存在这些文件。此次无需重新组织整个项目或引入 monorepo 管理框架。

## 12. 测试与验收矩阵

### 12.1 四层验收

| 层级 | 必须覆盖 | 不能用什么替代 |
|---|---|---|
| 契约单测 | query Unicode 长度、trim、空 context、模式及版本、扩展拒绝、输出来源和错误数据。 | 不能只做 TypeScript 类型检查。 |
| 协议集成 | SDK 客户端经真实 HTTP 连接 workerd；legacy 与 modern 的发现、schema、调用和错误。 | 不能只直接调用 handleMcp 函数并断言自定义 JSON。 |
| 构建部署 | static / ask-only / mcp-only / both；根路径/子路径；端点前缀；真实 HTTP 响应头。 | 不能只断言 dist 中存在文件。 |
| 产品客户端 | Claude Code runtime 两代；Codex flag 开关；Gemini、Cursor；需要时 Responses API。 | 不能用 SDK 单测或产品文档充当实际通过记录。 |

### 12.2 关键断言

MCP modern：server/discover 和直接 tools/list 均可用；无 initialize 先决条件；正确完整 `_meta` 和请求头；unsupported version、header mismatch 正确且不进入业务；缓存提示有效；resultType/structuredContent 由正确时代编码。

MCP legacy：2025-11-25、2025-06-18、2025-03-26 的协商与调用；通知 202 空响应；必要 ping；无版本头的所支持兼容行为；不要求服务器会话 ID。对仅接受 2024 的真实消费者单列例外，不默认宣称通过。

跨时代等价：相同身份、规范化参数和内容版本进入同一业务核心；返回等价来源和权限结论；认证失败不会被 fallback 消除；同一次客户端动作不会因发现重试导致两次模型调用。

业务与安全：匿名 list 不生成摘要；受信 Key 摘要成功且额度只扣一次；失效 Key、权限不足、限流、超时和取消有一致处理；Origin 不允许时拒绝；CLI 无 Origin 不误拒；未实现的 await/elicitation/memory 仍不可用；内部 learning 路由不进入任何公开发现输出。

构建：静态模式不得出现远程 POST `/ask` 或 MCP 的虚假承诺；mcp-only 配置可发现 MCP；完整路径正确；AWP 两份输出一致；AWP required fields、via 引用、动作输入输出正确；历史入口退役后不再被 README、llms、Head 或 verify 引用。

真实客户端记录示例结构：

```json
{
  "client": "Claude Code",
  "clientVersion": "实际安装版本",
  "platform": "实际平台",
  "runtime": "v2",
  "negotiation": "auto",
  "observedProtocolVersion": null,
  "toolDiscovery": "not_run",
  "anonymousList": "not_run",
  "authenticatedSummarize": "not_run",
  "errorHandling": "not_run",
  "testedAt": null,
  "evidencePath": null
}
```

普通 CI 使用固定语料、模拟检索和模拟模型；只有受控 staging smoke 可以执行有限真实推理。生产协议检查只探测必要元数据，避免把升级验收变成持续消耗配额的爬虫。

## 13. 建议按四个交付批次推进

### 批次 A：契约和真实能力修复

交付 shared 契约、ask-service 提取、配置驱动 OpenAPI、完整 URL 验证、纠正文案及现有错误测试。建立基线 fixtures，保留真实业务结果。此阶段不急于宣传 AWP 或最新 MCP 全量支持。

**退出条件：**原有静态/浏览器 Ask 场景回归通过；schema 与运行时限制一致；无循环依赖；明确记录原有错误与预期修复。

### 批次 B：一个 MCP handler 支持两代

接入 SDK 双时代服务、安全边界、现代结果编码及缓存提示；移除旧手写 router。采用同一业务入口，完成协议层集成与至少新旧各一条真实产品路径的验证。

**退出条件：**Claude Code 新运行时与 Codex/Gemini 等所选 legacy 路径均通过；发现与错误不额外执行模型；Worker 环境而非仅 Node 环境通过。

### 批次 C：收敛发现层、可选 AWP

生成可选 AWP、修正 about/llms/OpenAPI 一致性；旧发现输出变成冻结的兼容投影；发布弃用说明与客户端连接指南。AWP 不应阻塞前两批上线。

**退出条件：**静态与各远程配置组合正确；真实根路径/MIME 验证；关闭 AWP 仍不影响任何普通 MCP 客户端；模板未把实验能力写成默认自动发现。

### 批次 D：退役与发布说明

按消费者证据退役历史路径，同批删除 generator、字段、文案、fixture 和旧必需文件断言。把兼容状态记录纳入后续发布检查。

**退出条件：**清理清单中的删除项有明确结果；需要继续保留的例外有理由、负责人和审查条件；不因一次升级永久增加两份协议实现。

## 14. 上线、回滚和持续维护

先部署能同时服务新旧请求的 Worker，再发布指向新能力的静态文档。Demo 和生产实例分别验收各自的配置、Key、语料与配额，不将一个实例的测试结果推广到另一个。

回滚的最小单位是兼容的 Worker 版本与能力描述组合。保留先前可用的双时代版本作为回滚点；不要只回滚到旧 Worker、却让静态 manifest 继续宣称现代协议。AWP 可以独立关闭；停止 AWP 发布不应影响 `/mcp` 与 `/ask`。

协议元数据审计日志只需低基数信息：声明/采用的协议版本、方法、成功/错误分类、legacy/modern、部署版本；可以记录自报客户端名称与版本用于诊断，但不能当作可信身份。不记录 Authorization、问题原文或完整会话。发现探测次数不是成功使用次数，低频机器人扫描也不是必须永久保留兼容层的证据。

每次依赖升级重新运行双时代套件并更新客户端矩阵；只有经过验收的能力进入公开 manifest。清理依据分为三类：**无效实现立即替换，有效兼容按采用情况维护，实验发现按实际消费者决定去留。**

## 15. 完成定义

本次升级完成，应表现为客户端更容易接入、权限和错误更一致、真实能力更明确，而不是协议文件更多。

发布验收必须确认：同一个 `/mcp` 可接入新旧目标客户端；静态模式仍独立可用；NLWeb 子集及浏览器交互没有功能损失；没有两套 ask 核心；没有非法 JSON-RPC 业务错误码；AWP 是可选投影；过时发现入口按计划删除或有明确例外；公开文档区分已验证与未验证能力。

---

## 资料索引

全部资料于 2026-09-08 调研；网页可能继续变化。下列代码链接固定到本次基线；客户端 main 快照与正式发行版的证据性质已在正文区分。

### 协议、SDK 与产品官方来源

- **S01** MCP 2026-07-28 发布说明：<https://blog.modelcontextprotocol.io/posts/2026-07-28/>
- **S02** MCP Versioning and Compatibility：<https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning>
- **S03** Claude Code MCP 文档，MCP client runtimes：<https://code.claude.com/docs/en/mcp>
- **S04** Codex 官方 changelog，2026-08-07 / CLI 0.147.0：<https://developers.openai.com/codex/changelog>
- **S05** Cursor 官方 MCP 文档：<https://cursor.com/docs/mcp>
- **S06** TypeScript SDK v2 Web 标准服务入口及 legacy 服务：<https://ts.sdk.modelcontextprotocol.io/v2/serving/web-standard.html>；<https://ts.sdk.modelcontextprotocol.io/v2/serving/legacy-clients.html>
- **S07** MCP server/discover：<https://modelcontextprotocol.io/specification/2026-07-28/server/discover>
- **S08** TypeScript SDK v2 协议时代与协商：<https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions.html>
- **S09** NLWeb Specification v0.55：<https://nlweb.ai/docs/specification>
- **S10** AWP 官方主页及接入工具说明：<https://www.agentwebprotocol.org/>
- **S11** AWP Specification v0.2：<https://www.agentwebprotocol.org/spec>
- **S12** SEP-2127 提案状态：<https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127>
- **S13** OpenAI Responses API remote MCP 文档：<https://developers.openai.com/api/docs/guides/tools-connectors-mcp>
- **S14** MCP 2026-07-28 Streamable HTTP：<https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http>
- **S15** MCP Tools / structured results：<https://modelcontextprotocol.io/specification/2026-07-28/server/tools>
- **S16** OpenAPI latest，调研时为 v3.2.0：<https://spec.openapis.org/oas/latest.html>
- **S17** MCP Caching：<https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching>
- **S18** MCP Authorization：<https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization>

### 客户端源码证据

- **C01** Codex 功能默认值，检索时提交：<https://github.com/openai/codex/blob/d6489472f3c15e87d2d7763a5fde033545c530f8/codex-rs/features/src/lib.rs>。检索项 `mcp_2026_07_28`，default_enabled=false；此证据不等同于所有已发布产品的 runtime 状态。
- **C02** Gemini CLI core package：<https://github.com/google-gemini/gemini-cli/blob/main/packages/core/package.json>。本次读取文件 blob SHA `316d38295d822f24b9addbfe1ffecce2dbf6673f`，文件声明版本 `0.60.0-nightly.20260901.g0bd1d4397`，SDK 依赖 `1.23.0`。main 链接会变化，应按本段快照信息复核。

### Refined-X 源码证据

- **R01** 基线提交：<https://github.com/tower1229/Refined-X/commit/00781cecb0616cf64b27370830d448c1006fa72f>
- **R02** README 中文及配置：<https://github.com/tower1229/Refined-X/blob/00781cecb0616cf64b27370830d448c1006fa72f/README.zh-CN.md>；<https://github.com/tower1229/Refined-X/blob/00781cecb0616cf64b27370830d448c1006fa72f/site.config.mjs>
- **R03** MCP adapter：<https://github.com/tower1229/Refined-X/blob/00781cecb0616cf64b27370830d448c1006fa72f/examples/public-ask-worker/src/mcp-server.ts>
- **R04** MCP discovery generator：<https://github.com/tower1229/Refined-X/blob/00781cecb0616cf64b27370830d448c1006fa72f/src/lib/mcp-discovery.ts>
- **R05** OpenAPI generator：<https://github.com/tower1229/Refined-X/blob/00781cecb0616cf64b27370830d448c1006fa72f/src/pages/openapi.json.ts>
- **R06** MCP tests：<https://github.com/tower1229/Refined-X/blob/00781cecb0616cf64b27370830d448c1006fa72f/examples/public-ask-worker/src/mcp.test.ts>
- **R07** Worker 入口：<https://github.com/tower1229/Refined-X/blob/00781cecb0616cf64b27370830d448c1006fa72f/examples/public-ask-worker/src/index.ts>
- **R08** 构建验证：<https://github.com/tower1229/Refined-X/blob/00781cecb0616cf64b27370830d448c1006fa72f/scripts/verify.mjs>
- **R09** NLWeb parser / buffered SSE：<https://github.com/tower1229/Refined-X/blob/00781cecb0616cf64b27370830d448c1006fa72f/examples/public-ask-worker/src/protocol.ts>
- **R10** Worker 依赖：<https://github.com/tower1229/Refined-X/blob/00781cecb0616cf64b27370830d448c1006fa72f/examples/public-ask-worker/package.json>
- **R11** 公开发现与文案：<https://github.com/tower1229/Refined-X/blob/00781cecb0616cf64b27370830d448c1006fa72f/src/pages/.well-known/about.json.ts>；<https://github.com/tower1229/Refined-X/blob/00781cecb0616cf64b27370830d448c1006fa72f/src/pages/llms.txt.ts>；<https://github.com/tower1229/Refined-X/blob/00781cecb0616cf64b27370830d448c1006fa72f/src/lib/site-copy.ts>
