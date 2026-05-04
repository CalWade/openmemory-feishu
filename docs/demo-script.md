# Kairos Demo Script

## 推荐 Demo：真实飞书群消息 + lark-cli

这是当前最推荐的复赛 Demo 主线，因为它使用真实飞书群消息，而不是纯本地 mock。

### 前置条件

```bash
npm install -g @larksuite/cli
lark-cli config init --new --name kairos-alt
lark-cli auth login --recommend --profile kairos-alt
memoryops doctor --profile kairos-alt --pretty
```

需要用户提供目标群 `chat_id`，格式类似 `oc_xxx`。

### 群里准备测试消息

在目标飞书群中发送一条明确历史决策：

```text
最终决定：MVP 阶段暂时不用 PostgreSQL，先用 SQLite，因为部署成本更低。
```

再发送一条后续讨论触发文本：

```text
要不我们还是用 PostgreSQL？
```

### 一键验收

```bash
memoryops doctor \
  --profile kairos-alt \
  --chat-id <oc_xxx> \
  --e2e \
  --pretty
```

或者使用 npm script：

```bash
KAIROS_DEMO_CHAT_ID=<oc_xxx> npm run demo:lark-cli-chat
```

### 预期结果

```text
✅ read chat messages
✅ e2e chat -> memory -> workflow
workflow_action = push_decision_card
```

### 讲解口径

```text
lark-cli 负责官方飞书数据获取；
OpenClaw 负责插件安装和实时触发入口；
Kairos 负责长期记忆抽取、存储、召回和 Decision Card。
```

注意：`search:message` 缺失不影响主流程，因为 Demo 采用 `chat_id` 按群读取。

---

## 一键端到端 Demo

推荐先运行本地端到端脚本，确认演示闭环可用：

```bash
npm run demo:e2e
```

脚本会使用临时 SQLite / JSONL 数据，不污染默认 `data/` 目录。流程包括：

1. 抽取并写入项目决策；
2. 召回“为什么不用 PostgreSQL？”；
3. 输出历史决策卡片；
4. 演示周报接收人从 Alice 被 Bob 替代；
5. 写入风险记忆、查询到期提醒，并演示 snooze / ack；
6. 运行核心评测。

说明：这是本地 CLI 可运行闭环；真实飞书群消息主线见上方 lark-cli Demo。飞书提醒推送仍未实现。

---

## Demo 1：项目决策召回

### 输入讨论

```text
张三：最终决定 MVP 阶段使用 SQLite 作为当前状态库，同时保留 JSONL Event Log。
王五：PostgreSQL 对复赛 demo 来说部署成本太高，容易让评委跑不起来。
```

### 操作

```bash
npm run dev -- extract-decision \
  --project kairos \
  --write \
  --text "张三：最终决定 MVP 阶段使用 SQLite 作为当前状态库，同时保留 JSONL Event Log。王五：PostgreSQL 对复赛 demo 来说部署成本太高，容易让评委跑不起来。"

npm run dev -- recall \
  --project kairos \
  "为什么不用 PostgreSQL？" \
  --evidence
```

### 预期

返回 SQLite + JSONL 决策，并说明 PostgreSQL 被否定的原因是复赛 demo 部署成本高。

---

## Demo 2：矛盾更新

### 操作

```bash
npm run dev -- ingest --project kairos --text "以后周报每周五发给 Alice。"
npm run dev -- ingest --project kairos --text "不对，周报以后发给 Bob，Alice 不再负责这个了。"
npm run dev -- search "周报" --project kairos --include-history
```

### 预期

- Bob 版本 active；
- Alice 版本 superseded；
- 历史可追溯。

---

## Demo 3：飞书会话导出解析

### 操作

```bash
npm run dev -- normalize-chat-export --file /tmp/feishu-chat-export.md --doc-token <doc_token>
npm run dev -- segment-chat-export --file /tmp/feishu-chat-export.md --doc-token <doc_token>
```

### 预期

飞书会话导出文档被解析为逐条 NormalizedMessage，并生成候选片段。当前该能力是输入适配 baseline，不作为核心智能卖点。

---

## Demo 4：核心评测

```bash
npm run dev -- eval --core
```

预期输出：

```text
decision-extraction: pass
conflict-update: pass
recall: pass
```


## 可选：LLM 抽取演示

如果本地 `.env` 已配置主办方提供的 OpenAI-compatible 接口，可以演示 LLMDecisionExtractor：

```bash
npm run dev -- extract-decision \
  --llm \
  --fallback \
  --project kairos \
  --text "张三：最终决定 MVP 阶段使用 SQLite 作为当前状态库，同时保留 JSONL Event Log。王五：PostgreSQL 对复赛 demo 来说部署成本太高，容易让评委跑不起来。"
```

说明：`--fallback` 表示 LLM 请求失败时回退到规则 baseline。当前这只是可选抽取路径，不代表已经完成生产级抽取效果。


## 历史决策卡片演示

先通过 `extract-decision --write` 写入一条决策记忆，记录返回的 `saved.id`，再运行：

```bash
npm run dev -- decision-card <memory_id>
# 只预览飞书 interactive card payload，不发送
npm run dev -- decision-card <memory_id> --feishu-json
# 真实发送需要显式 webhook；不要在公开材料中写入 webhook URL
npm run dev -- decision-card <memory_id> --send-feishu-webhook --feishu-webhook <webhook_url>
```

输出会包含：

- 当前状态
- 决策与结论
- 决策理由
- 被否方案
- 反对 / 顾虑
- 证据摘录

说明：当前已有 CLI Markdown 文本版、飞书 interactive card payload 预览和机器人 webhook 发送路径；发送前必须确认 webhook 对应的群和卡片内容。


## Recall 格式化回答演示

写入决策记忆后运行：

```bash
npm run dev -- recall "为什么不用 PostgreSQL？" --project kairos --evidence
```

期望回答包含：

- 历史决策
- 理由
- 被否方案
- 当前状态
- 记忆 ID
- 可继续运行的 `memoryops decision-card <memory_id>` 命令

说明：当前是确定性格式化回答，不是 LLM 生成式 QA，因此更稳定，但表达能力有限。


## LLM 抽取评测

如需单独检查主办方模型在抽取任务上的表现：

```bash
npm run dev -- eval --suite llm-decision-extraction
```

该 suite 会调用外部 LLM，不进入 `eval --core`。当前它用于暴露 LLM 路径稳定性问题，例如超时、JSON 不稳定或抽取类型错误。


## Remind 生命周期演示

```bash
npm run dev -- remind --project kairos --now 2026-05-30T00:00:00.000Z
npm run dev -- remind snooze <memory_id> --until 2026-06-01T00:00:00.000Z
npm run dev -- remind ack <memory_id>
```

说明：当前是本地提醒生命周期 MVP；`ack` 会清除 `review_at`，`snooze` 会把 `review_at` 移动到指定时间。飞书推送和周期性自动投递尚未实现。


## OpenClaw 飞书入口工作流

本项目不自建飞书事件服务器，飞书消息接收交给 OpenClaw hook：

```bash
openclaw hooks enable kairos-feishu-ingress
openclaw hooks check
```

本地可用下面脚本模拟“飞书群消息触发 Kairos 工作流”：

```bash
npm run demo:feishu-workflow
```

工作流：飞书消息文本 → `memoryops feishu-workflow` → 判断是否命中历史决策 → 输出 answer/card/action。默认不发送；设置 `KAIROS_HOOK_SEND_FEISHU=1` 和 `KAIROS_FEISHU_WEBHOOK_URL` 后才会发卡片。
