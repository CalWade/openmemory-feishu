# Kairos

> 面向飞书协作场景的长期项目记忆引擎。Kairos 通过官方 `lark-cli` 接入飞书群消息，自动沉淀项目决策、风险和团队约定，并在后续讨论触及历史上下文时主动推送决策卡片。

## 运行方式

```text
飞书群聊
  ↓ lark-cli Runtime
Kairos Memory Engine
  ↓
Dashboard 可视化 + 飞书决策卡片
```

Kairos 使用官方 `lark-cli` 接入飞书群消息，使用飞书群自定义机器人 webhook 推送决策卡片。OpenClaw 作为 Agent 宿主、部署和运维控制面。

## 两种使用方式

| 方式 | 入口 |
|---|---|
| 本地运行 | [`QUICKSTART.md`](./QUICKSTART.md) |
| 基于 OpenClaw 运行 | [`USAGE.md`](./USAGE.md) 中的一键复制提示词 |

本地最短路径：

```bash
npm install
npm run build
npm run setup:lark-runtime -- --profile kairos-alt --chat-id oc_xxx --feishu-webhook "https://open.feishu.cn/open-apis/bot/v2/hook/xxx" --test-read --test-webhook
npm run dashboard
npm run lark-runtime
```

## 解决的问题

飞书群聊里沉淀了大量关键协作信息：

- 为什么复赛阶段先用 SQLite，而不是 PostgreSQL？
- 哪个流程已经被新规则覆盖？
- 哪个风险已经提醒过？
- 当前有效决策是什么，旧决策是否已经失效？

Kairos 把这些碎片化信息变成结构化、可追溯、可更新的长期记忆。

## 核心能力

| 能力 | 说明 |
|---|---|
| 飞书群接入 | `lark-cli Runtime` 轮询目标群消息，按 `message_id` 去重 |
| 会话理解 | 显式 thread/reply + LLM thread linking，用于复杂群聊上下文归纳 |
| 慢速归纳 | `InductionQueue` 后台处理候选窗口，不阻塞群聊流程 |
| 结构化记忆 | `MemoryAtom` 保存决策、风险、约定、证据链和状态 |
| 冲突更新 | `Reconcile` 支持 DUPLICATE / SUPERSEDE / CONFLICT_PENDING |
| 历史激活 | 新消息触及旧决策时，自动推送飞书决策卡片 |
| 反馈修正 | 卡片支持确认、忽略、请求更新；更新请求进入 `RefineQueue` |
| 可视化 | `Dashboard` 以中文数据流形式展示引擎真实工作状态 |
| 自证评测 | 内置抗干扰、矛盾更新、召回、线程链接等评测套件 |

## 运行入口

### 接入飞书群

```bash
npm run setup:lark-runtime -- --profile kairos-alt --chat-id oc_xxx --feishu-webhook "https://open.feishu.cn/open-apis/bot/v2/hook/xxx" --test-read --test-webhook
```

### 启动可视化页面

```bash
npm run dashboard
```

打开：

```text
http://127.0.0.1:8787
```

### 启动飞书群监听

```bash
npm run lark-runtime
```

### 只跑一轮调试

```bash
npm run lark-runtime:once
```

### 跑本地评测

```bash
npm run eval:core
npm run dev -- eval --suite thread-linking
```

## Dashboard 展示

Dashboard 是旁路观察页面，不向群聊发送调试消息。它展示：

```text
飞书消息进入
→ 会话解缠与归纳
→ 长期记忆生成
→ 历史记忆激活
→ 反馈与修正
```

适合比赛录屏时与飞书群界面并排展示。

## 项目结构

```text
src/larkRuntime/       lark-cli Runtime Worker
src/candidate/         消息标准化、线程恢复、候选窗口、LLM thread linker
src/induction/         慢速归纳队列
src/extractor/         结构化抽取器
src/memory/            MemoryAtom、Store、Reconcile、Decision Card
src/workflow/          历史记忆 activation 和频控
src/refine/            用户反馈后的修正队列和补丁应用
src/visualization/     Dashboard
src/eval/              Benchmark runner
```

## 评测

```bash
npm run dev -- eval --core
npm run dev -- eval --suite thread-linking
npm run dev -- eval --suite llm-decision-extraction
```

核心评测覆盖：

- 决策/风险/约定抽取；
- 抗干扰召回；
- 矛盾更新；
- 飞书工作流 activation；
- LLM thread linking 对比；
- 本地评测结果会自动展示在 Dashboard。

## 公开文档

| 文档 | 说明 |
|---|---|
| [`QUICKSTART.md`](./QUICKSTART.md) | 本地接入飞书群的最短路径 |
| [`USAGE.md`](./USAGE.md) | 本地运行 / OpenClaw 运行两种方式和可复制提示词 |
| [`docs/lark-cli-runbook.md`](./docs/lark-cli-runbook.md) | lark-cli Runtime 详细排障和授权说明 |
| [`docs/demo-script.md`](./docs/demo-script.md) | 比赛展示脚本 |
| [`docs/benchmark-report.md`](./docs/benchmark-report.md) | 自证评测报告 |
| [`docs/archive/`](./docs/archive/) | 归档文档 |

## 当前定位

Kairos 可以独立于 OpenClaw 运行；在比赛展示中，OpenClaw 体现为 Agent 宿主和运维控制面：负责拉取仓库、配置 lark-cli、启动 Runtime、启动 Dashboard、运行评测和排障。飞书消息接入使用官方 lark-cli，保证链路真实、稳定、可复现。
