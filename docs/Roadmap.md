Refined-X 最有价值的定位不是“又一个 Astro 博客模板”，而是：

> 把个人网站变成你在 Agent 时代的公开数字接口。

从仓库、[模板 Demo](https://demo.refined-x.com)、[真实站点](https://refined-x.com)和 Public Ask Worker 看，项目已经形成了“内容源 → 人类网页 → 机器语料 → Agent 问答”的完整闭环，技术差异化成立，也已经进入 [Astro Themes](https://astro.build/themes/details/refined-x/)。目前最大的问题不是功能不足，而是能力强于叙事：它已经是一个新形态的个人发布基础设施，但 README 仍主要把它呈现为功能很多的博客模板。

## 项目真正的特色

| 层次         | 当前实现                                                     | 用户价值                                         |
| ------------ | ------------------------------------------------------------ | ------------------------------------------------ |
| 人类可读     | 编辑感黑白视觉、文章/专栏/作品/简介、明暗主题                | 不是为了 Agent 牺牲阅读体验                      |
| 机器可读     | `llms.txt`、全量语料、逐页 Markdown 镜像、JSON API、OpenAPI  | Agent 不必从复杂 HTML 中猜测内容                 |
| Agent 可查询 | 本地精选答案搜索；可选 NLWeb `/ask` 与 MCP `ask`             | 网站从“等人浏览”升级为“可以被提问”               |
| 数据可自主   | `contentRoot`、外部配置覆盖、submodule 模式、静态构建        | 内容可以留在个人仓库、知识库或 Obsidian 工作流中 |
| 身份结构化   | person、cooperation、projects、answers、series 等明确 Schema | 发布的不只是文章，而是公开身份、能力和知识边界   |

最强的差异点其实有三个。

第一，它不是单独加一个 `llms.txt`。当前 Astro 生态已经出现不少 Markdown 镜像、LLM 文件和 MCP 插件，这些单点能力会迅速商品化，[Astro Integrations](https://astro.build/integrations/39/) 已经能看到类似方向。Refined-X 的价值在于把这些能力组织成了一个完整的个人站点产品。

第二，它把“个人内容”当作独立数据源。模板、内容仓库、静态资源和实例配置可以分离，这与普通博客主题最大的区别是：主题可以更换，公开数据仍然属于个人。这正好对应你数字主权架构中的“个人公开数字接口”一层。

第三，它同时服务人和 Agent。传统博客主题如 [AstroPaper](https://github.com/satnaing/astro-paper) 主要竞争阅读、SEO和易用性；AI 工具插件主要生成机器语料；[NLWeb](https://github.com/nlweb-ai/NLWeb) 主要解决自然语言接口。Refined-X 把三者接在了同一个个人发布流程里。

但需要保持一个技术上的诚实边界：Agent-friendly 不等于 Agent 会自动发现并调用。你当前的 MCP catalog 也明确标为 `draft`。营销承诺应该是“可读、可连接、可查询”，不要说成“任何 Agent 都能自动发现本站”。

## 目前最影响传播的几个问题

1. **“Agent 友好”过于抽象**

用户看完仍然不知道它到底替自己省了什么。第一屏应该展示结果：“写一份 Markdown，同时得到网页、机器语料、API 和可选问答接口”，协议名放到下一层。

2. **模板 Demo 没展示最强能力**

当前 [Demo 的 `llms.txt`](https://demo.refined-x.com/llms.txt) 明确显示没有配置 Public Ask Worker，因此访客体验到的是静态答案搜索；真正可用的 MCP/NLWeb 在[生产实例](https://refined-x.com/llms.txt)。营销主 Demo 应该接上一个严格限额的 Worker，或者清晰提供：

- Static Demo：零后端、零 AI 成本
- Live Agent Demo：真实 MCP/NLWeb 问答

3. **功能层级没有被压缩**

`llms.txt`、OpenAPI、JSON API、MCP、NLWeb 同时出现，对目标用户是认知负担。建议统一为三个结果：

- Publish：给人阅读
- Expose：给机器理解
- Ask：给 Agent 查询

4. **从“看到”到“上线”仍有摩擦**

应把快速开始拆成三条路径：

- 5 分钟静态博客
- 接入现有 Markdown/Obsidian 数据仓库
- 开启 Live Ask/MCP

Public Ask Worker 当前涉及 Cloudflare AI Search、Gateway、D1、Turnstile 和多项密钥，能力完整，但对首次使用者偏重。最好提供一键部署或向导。

5. **开源项目信任资产还不够完整**

[`package.json`](https://github.com/tower1229/Refined-X/blob/main/package.json) 仍是 `0.1.0`；目前标准路径下缺少 CHANGELOG、CONTRIBUTING、SECURITY、Issue 模板等。现有 [Pages 工作流](https://github.com/tower1229/Refined-X/blob/main/.github/workflows/deploy-pages.yml) 执行了 build，但没有把 check、test、verify 全部纳入 CI。它们不是营销装饰，而是用户判断“敢不敢拿来长期建站”的依据。

此外，英文模板的部分机器输出和 Schema 报错仍混有中文，国际传播前应再做一次端到端语言检查。

## 建议的市场定位

对外主标题：

> 把个人网站变成你在 Agent 时代的公开数字接口

副标题：

> 一份 Markdown/YAML 内容，同时发布为精心排版的网页、Agent 可读的 Markdown 与 `llms.txt`、程序可用的 JSON/OpenAPI，以及可选的 MCP/NLWeb 问答接口。内容仍然保存在你自己的仓库或知识库中。

英文版：

> **Your public interface for the agentic web.**
> Publish once for people, search engines, and AI agents.

Refined-X 这个名字可以保留，但必须始终绑定描述词：

> Refined-X — Agent-ready personal publishing for Astro

不要把“个人数字主权”放在安装页第一屏。它是项目的思想护城河，适合作为品牌故事和长文传播；第一屏仍然要先回答具体用途。

## 30 天零预算营销方案

| 阶段    | 重点动作                                                                     | 目标                   |
| ------- | ---------------------------------------------------------------------------- | ---------------------- |
| 第 1 周 | 重写 README 首屏；补架构图、60 秒动图、三种安装路径；让主 Demo 支持 Live Ask | 访客 30 秒内看懂       |
| 第 2 周 | 发布正式版本；补 CI、路线图、贡献指南；增加“一键部署”和故障排查              | 降低采用风险           |
| 第 3 周 | 中英文同步发布主文章、技术拆解和 Show HN；集中投放 Astro 社区                | 获得首批精准用户       |
| 第 4 周 | 邀请 5–10 位用户实际建站；建立 “Built with Refined-X” 展示页；整理三篇案例   | 用真实站点形成增长飞轮 |

最重要的发布内容不是功能清单，而是一个完整故事：

《个人网站不该只是一组网页：Agent 时代，如何把自己发布成一个公开数字接口》

配套 60 秒视频只演示四件事：

1. 人打开网站阅读文章。
2. Agent 读取 `llms.txt` 和 Markdown。
3. 用户接入 MCP，询问“作者有哪些 AI 实践？”
4. Agent 返回带来源链接的答案。

渠道上建议分层：

- Astro Themes、Astro Discord、r/astrojs：强调 Astro 7、静态优先、快速部署。
- Hacker News、DEV、GitHub：强调端到端架构和开放协议，标题可用：
  `Show HN: Refined-X – An Astro personal site with llms.txt, OpenAPI, MCP and NLWeb Ask`
- Obsidian、数字花园、自托管社区：强调外部 `contentRoot`、数据不与主题绑定。
- V2EX、掘金、知乎、即刻、少数派：以“个人网站如何适应 Agent 时代”为主，不以协议罗列为主。
- 你的现有开源影响力：当前公开 GitHub 主页已有数百关注者和多个数百至千星项目，[这不是冷启动账号](https://github.com/tower1229)。应把 Refined-X 置顶，并讲述“从前端开源组件到 Agent Web”的连续演进。

## 后续最有价值的增长杠杆

当完整模板获得第一批用户后，可以把机器发布层抽成独立 Astro Integration，例如：

> `@refined-x/agent-surface`

让现有博客只安装一个插件，就获得 Markdown 镜像、`llms.txt`、JSON/OpenAPI 和发现端点。插件负责扩大入口，Refined-X 模板负责提供完整体验，Public Ask Worker负责更高阶能力。这样市场就不再局限于“愿意更换整个博客模板的人”。

衡量成功时，不要把 Star 当唯一目标。更有价值的北极星指标是：

- 真实上线的外部站点数量
- 完成首次构建并替换个人内容的用户数
- 展示页提交数量
- Live Ask/MCP 的成功查询数
- 外部 Issue、PR 和案例贡献
