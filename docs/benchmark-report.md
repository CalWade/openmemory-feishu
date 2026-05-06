# Kairos Benchmark Report

## 评测命令

```bash
npm run dev -- eval --core
npm run dev -- eval --suite thread-linking
npm run dev -- eval --suite llm-decision-extraction
```

`eval --core` 结果会保存到 `runs/latest-eval.json`，并显示在 Dashboard 的「本地评测结果」区域。

## 核心评测覆盖

| Suite | 目标 |
|---|---|
| decision-extraction | 结构化抽取决策、风险、约定、工作流和 none |
| conflict-update | 验证新旧记忆冲突时能保留历史并更新当前值 |
| recall | 验证问题能召回正确历史决策和理由 |
| anti-interference | 验证多条干扰记忆下仍能命中目标记忆 |
| remind | 验证风险记忆 review_at 到期提醒 |
| feishu-workflow | 验证飞书消息 activation、误触发控制和斜杠命令忽略 |
| thread-linking | 对比启发式线程恢复和 LLM thread linking |
| llm-decision-extraction | 显式验证 LLM 结构化抽取和 fallback/degraded 记录 |

## 比赛要求映射

### 1. 抗干扰测试

测试目标：在注入无关/相似记忆后，仍能召回目标历史决策。

示例查询：

```text
为什么不用 PostgreSQL？
```

期望：命中 SQLite / PostgreSQL 相关决策理由，不误命中 hooks、周报、API Key 等干扰内容。

### 2. 矛盾更新测试

测试目标：输入冲突指令后，当前记忆被更新，旧记忆进入历史状态。

示例：

```text
旧：以后周报每周五发给 Alice。
新：不对，周报以后发给 Bob，Alice 不再负责这个了。
```

期望：

```text
当前 active = Bob
旧 Alice 记忆 = superseded
历史仍可追溯
conflict_relation = DIRECT_CONFLICT
```

### 3. 效能指标

Kairos 在历史决策复议场景中减少额外检索操作。

| 指标 | 手工流程 | Kairos |
|---|---:|---:|
| 找历史决策操作步数 | 约 7 步 | 约 2 步 |
| 额外检索输入字符 | 约 42 字 | 0 字 |
| 是否自动推送历史决策卡片 | 否 | 是 |

操作步数减少约 71.4%，额外检索输入减少 100%。

## 真实飞书链路证明

真实链路通过 `lark-cli Runtime` 完成：

```text
真实飞书群消息
→ lark-runtime 轮询读取
→ induction queue
→ LLM thread linking / fallback
→ MemoryAtom
→ activation
→ 飞书机器人决策卡片
→ Dashboard 数据流展示
```

运行入口：

```bash
npm run dashboard
npm run lark-runtime
```

Dashboard 展示运行状态、队列、记忆、activation、反馈修正和本地评测结果。

## 结果解释边界

- 本地 benchmark 是可复现自测，不等同于生产大规模线上评测；
- `thread-linking` 中的 silver set 不等同于人工 gold label；
- LLM 路径保留 timeout/fallback/degraded 记录；
- 飞书群展示以真实 lark-cli 读取和真实 webhook 发卡为准。
