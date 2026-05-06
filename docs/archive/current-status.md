# Kairos 当前项目状态

更新时间：2026-05-04

## 当前定位

Kairos 是面向飞书与 OpenClaw 的企业级项目决策记忆引擎。当前最稳的架构是：

```text
lark-cli：官方飞书数据入口，负责 OAuth、scope、API 调用和 JSON 输出
OpenClaw：插件安装、hook 生命周期、实时消息入口和 Agent 编排
Kairos：Memory Engine，负责抽取、存储、召回、冲突更新、提醒、卡片和评测
```

## 已完成且可运行

- CLI：`memoryops`
- MemoryAtom v0.2 类型与 Zod Schema
- SQLite Memory Store（本地开发）
- JSONL portable store（OpenClaw hook / 免编译分发默认后端）
- JSONL Event Log
- `add / search / recall / list / history`
- `supersede` 非损失效覆盖
- 飞书会话导出解析：`normalize-chat-export`
- 候选片段 baseline：`segment-chat-export`
- 结构化决策抽取 baseline：`extract-decision`
- LLMDecisionExtractor 可选路径：`extract-decision --llm --fallback`，不作为稳定主链路
- Decision Card：Markdown、结构化 JSON、飞书 interactive card payload
- 飞书机器人 webhook 显式发送路径：`decision-card <id> --send-feishu-webhook`
- Recall 确定性格式化回答
- Remind 本地生命周期：`remind` / `remind snooze` / `remind ack`
- OpenClaw hook pack：`hooks/kairos-feishu-ingress`
- 免编译插件分发：hook 默认走 JSONL，避免 `better-sqlite3` native binding 问题
- lark-cli 官方数据入口：`status / plan / preflight / ingest-file / ingest-chat / e2e-chat`
- 安装诊断与向导：`doctor`、`doctor --pretty`、`setup-wizard`
- Demo 脚本：`npm run demo:e2e`、`npm run demo:feishu-workflow`、`npm run demo:lark-cli-chat`
- 自描述安装文件：`OPENCLAW.md`、`openclaw.setup.json`、`docs/lark-cli-runbook.md`、`docs/openclaw-agent-checklist.md`
- 核心评测 runner：decision-extraction / conflict-update / recall / anti-interference / remind / feishu-workflow
- Vitest 单元测试与 TypeScript build

## 已验证的真实链路

截至 2026-05-04，已用真实飞书测试群完成：

```text
真实飞书群消息
→ 官方 lark-cli 按 chat_id 读取
→ Kairos 解析 JSON 并过滤机器人卡片/授权链接等噪声
→ 抽取 MemoryAtom
→ 后续提问“要不我们还是用 PostgreSQL？”
→ feishu-workflow 输出 push_decision_card
```

实测命令：

```bash
memoryops doctor --profile kairos-alt --chat-id <oc_xxx> --e2e --pretty
```

当前验收结果：

```text
read chat messages ✅
e2e chat -> memory -> workflow ✅
workflow_action = push_decision_card
```

## 真实边界

- 默认 Decision Extractor 仍是规则 baseline；LLMDecisionExtractor 只是增强路径，当前不宣传为生产级抽取效果。
- Candidate Segment Pipeline 是输入清洗 baseline，不是核心智能算法卖点。
- `recall` 是检索 + 确定性格式化回答，不是完整生成式 QA。
- `remind` 仍是本地生命周期 MVP，尚未做飞书周期性投递。
- OpenClaw hook 默认只记录 workflow 输出，不自动发卡；自动发送需要显式配置 `KAIROS_HOOK_SEND_FEISHU=1` 和 webhook。
- lark-cli 全局消息搜索仍缺 `search:message`，但主路径不依赖它；当前主路径是按 `chat_id` 读取群消息。
- Benchmark 规模仍然较小，当前结果只能说明 MVP 闭环可跑，不代表真实生产效果。

## 当前最重要缺口

1. 最终复赛材料：需要更新演示脚本、录屏讲稿和提交说明。
2. Benchmark 扩充：需要更多真实飞书片段、抗干扰样本和误抽样本。
3. 抽取质量：继续减少真实群消息中的误抽和漏抽。
4. 飞书回推：当前有 webhook 显式发送路径，但默认不开启；如要演示自动发卡，需要单独配置安全开关。
5. 文档/Wiki 入口：lark-cli 已可作为官方入口，尚未把 `docs/wiki` 数据读取做成主线 demo。
