# Kairos 技术全景图：从真实飞书协作流到企业级长期记忆

> 本文不是“为了 Demo 做简化”的方案，而是 Kairos 的完整技术版图：明确目标架构、当前实现层级、候选技术路线、成熟度门槛和验证标准。任何技术路线不应被武断排除；只能根据问题、数据、成本、效果和合规约束决定进入哪一阶段。

## 0. 基本原则

Kairos 的目标不是做一个关键词脚本，也不是把聊天记录塞进向量库，而是构建一个能处理企业协作流的长期记忆系统：

```text
真实飞书协作数据
  → 会话解缠 / 语义分块
  → 候选记忆窗口
  → 结构化抽取与慢速归纳
  → 冲突更新与生命周期管理
  → 可溯源召回与安全交互
  → OpenClaw / 飞书协作现场
```

必须坚持三点：

1. **真实效果优先**：不能为了 Demo 稳定性，把工程临时方案包装成成熟能力。
2. **技术路线不武断裁剪**：DeBERTa、CRF、PGlite、Self-RAG、LangGraph、Mem0/Zep 等都应作为候选路径进入评估，而不是凭直觉说“短期不做”。
3. **每一层都要有评测标准**：能不能采用某项技术，取决于真实飞书样本上的指标，而不是概念上先进。

## 1. 总体架构全景

```text
Data Ingress
  ├─ lark-cli：官方飞书消息/文档/Wiki/任务数据入口
  ├─ OpenClaw hook：实时消息入口与 Agent 编排
  └─ 导出文件：离线样本与评测数据

Conversation Understanding
  ├─ 消息标准化：NormalizedMessage
  ├─ 噪声过滤：bot/card/oauth/file/ack
  ├─ 会话解缠：Conversation Disentanglement
  ├─ 自适应分块：Adaptive / Sliding / Topic-aware Chunking
  └─ CandidateWindow：带证据、上下文、线程与置信信息的候选窗口

Memory Extraction
  ├─ Rule guard：未定问题、低价值内容、明显风险/决策的保守判断
  ├─ LLM structured extractor：受控 JSON schema 抽取
  ├─ Slow memory induction：允许后台渐进归纳，不要求实时一次完成
  ├─ Human-in-the-loop：低置信/高风险记忆进入确认
  └─ Reconcile：ADD / UPDATE / SUPERSEDE / DUPLICATE / CONFLICT_PENDING

Memory Store
  ├─ MemoryAtom：结构化记忆对象
  ├─ EventLog：追加式审计日志
  ├─ JSONL portable store：免编译与演示分发
  ├─ SQLite：本地开发
  └─ WASM/Service DB 候选：PGlite / LibSQL / DuckDB-WASM / Postgres

Recall & Action
  ├─ Deterministic recall：稳定、可解释、不乱编
  ├─ Generative answer layer：受证据约束的 LLM 回答
  ├─ Decision Card：历史决策卡片
  ├─ Remind：记忆生命周期提醒
  └─ Interaction loop：确认、忽略、更新、频控、幂等
```

## 2. 数据入口层

### 当前实现

- `lark-cli` 已完成真实飞书群消息按 `chat_id` 读取；
- `OpenClaw hook` 已具备插件路径和默认安全模式；
- `ingest-file` 支持离线 JSON 导入；
- `doctor --e2e` 已能验证真实群消息 → MemoryAtom → `push_decision_card`。

### 成熟目标

| 能力 | 目标 |
|---|---|
| 群消息读取 | 支持按群、按时间、分页、幂等导入 |
| 文档/Wiki | 支持 lark-cli docs/wiki 数据进入同一记忆管线 |
| 实时入口 | OpenClaw hook 与 lark-cli 历史回填写入同一 Memory Store |
| 权限 | 每条记忆绑定来源群、用户、租户、权限边界 |

### 候选路线

- lark-cli：官方入口，优先保留；
- OpenClaw Feishu tools：作为 Agent 编排入口；
- lark-event / OpenClaw hook：实时事件流候选；
- 自建 OAuth/API Server：仅在产品化需要时评估，不作为当前唯一方向。

## 3. 会话理解层：Conversation Disentanglement + Semantic Chunking

### 现状问题

当前 Candidate Segment Pipeline 仍偏 baseline。它可以清洗和切分文本，但不能充分处理：

- 多线程群聊交错；
- 引用回复；
- 隐式指代；
- 先争论后拍板；
- 多条消息共同形成一个决策；
- 噪声消息混入；
- 同一主题跨时间回流。

### 成熟目标

把线性消息流还原为候选讨论线程：

```text
Raw Messages
  → Thread Linking
  → Topic Segmentation
  → Evidence Window Construction
  → CandidateWindow
```

### 技术路线分层

| 层级 | 技术路线 | 作用 | 数据需求 | 评估指标 |
|---|---|---|---|---|
| Level 0 | 规则 + reply_to/thread_id + topic overlap + 时间距离 | 快速建立线程近似 | 低 | 是否减少明显混线 |
| Level 1 | LLM 辅助线程判断 | 对难例做语义判断 | 中 | 线程归属准确率、抽取提升 |
| Level 2 | Embedding topic clustering / HDBSCAN | 处理跨时间同主题回流 | 中 | topic purity、召回率 |
| Level 3 | DeBERTa/RoBERTa + HMM/CRF | 监督式会话解缠 | 高 | thread F1、ARI、VI |

注意：DeBERTa/CRF 不应被排除。它代表监督式会话解缠的成熟路线。是否采用取决于是否能收集标注数据，以及它相对 LLM/规则/embedding 路线在真实飞书样本上是否显著提升。

### CandidateWindow 成熟形态

```ts
type CandidateWindow = {
  id: string;
  thread_id?: string;
  messages: NormalizedMessage[];
  denoised_text: string;
  context_before: string[];
  resolution_messages: string[];
  context_after: string[];
  evidence_message_ids: string[];
  noise_message_ids: string[];
  topic_hint?: string;
  salience_score: number;
  salience_reasons: string[];
  has_question_cue: boolean;
  has_resolution_cue: boolean;
  has_conflict_cue: boolean;
  thread_confidence: number;
}
```

## 4. 抽取层：从规则 baseline 到受控混合抽取

### 当前实现

- 规则抽取已支持 decision / convention / risk / workflow / none；
- 已增加统一未定问题拒识；
- LLMDecisionExtractor 已支持 retry、fallback、prompt version、输入截断、`should_remember`、`reject_reason`、degraded metadata；
- LLM 显式评测当前可跑通 4/4，但样本仍小。

### 成熟目标

抽取层不应依赖单次模型判断，而应是一个可审计状态机：

```text
CandidateWindow
  → Rule Guard
  → LLM Structured Extraction
  → Schema Validation
  → Retry / Repair / Fallback
  → Confidence Routing
  → Reconcile
```

### 技术路线

| 组件 | 当前 | 成熟方向 |
|---|---|---|
| Rule extractor | baseline + guard | 预分类器 + 保守 fallback |
| LLM extractor | 受控增强路径 | 慢速归纳、批处理、可追踪版本 |
| SLM | 未实现 | 用于低成本预分类/置信度判断 |
| Human-in-the-loop | 未实现 | 低置信和高风险记忆确认 |
| Reconcile | supersede 基础能力 | duplicate / conflict_pending / update / merge |

### 重要原则

- 不确定不写；
- 未定讨论不写；
- 复议问题不写，但可触发 recall；
- 高风险低置信不静默写，进入确认；
- LLM 失败不是异常路径，而是可降级的正常工程状态；
- 记忆可以慢慢归纳，不要求实时立即完成。

## 5. 存储层：从演示存储到可扩展记忆状态引擎

### 当前实现

- JSONL portable store：默认分发后端，免编译；
- SQLite Store：本地开发后端；
- EventLog：追加式审计日志；
- MemoryAtom：结构化记忆对象。

### 当前边界

JSONL 适合免编译、审计和演示，不适合大规模并发查询。SQLite 本地好用，但 native binding 给分发带来风险。

### 候选成熟路线

| 路线 | 价值 | 风险 | 进入条件 |
|---|---|---|---|
| PGlite | WASM Postgres，免 native，SQL 能力强 | 新依赖、新持久化语义 | JSONL/SQLite 成为瓶颈 |
| LibSQL | SQLite 生态与同步能力 | 依赖生态评估 | 需要云端同步 |
| DuckDB-WASM | 分析型查询强 | OLTP/事务语义不同 | 需要批量分析/评测 |
| Service Postgres | 生产能力强 | 部署复杂 | 产品化部署阶段 |
| JSONL + DB 双写 | 审计 + 查询兼顾 | 一致性设计复杂 | 需要可追溯生产链路 |

## 6. 召回与回答层

### 当前实现

- `recall` 是确定性格式化回答；
- `feishu-workflow` 能基于历史记忆决定是否 `push_decision_card`；
- Decision Card 可生成 Markdown / JSON / Feishu payload。

### 成熟目标

召回层应分成两层：

```text
Evidence Retrieval：找证据
Answer Generation：生成回答，但必须受证据约束
```

### 候选路线

- Deterministic recall：继续作为安全 fallback；
- Hybrid retrieval：BM25/FTS + embedding + reranker；
- Self-RAG / CRAG：用于生成式回答的证据自检；
- LangGraph/状态机：用于检索、生成、验证、回退的条件编排。

这些不应被排除，但必须在证据归因和错误回退机制明确后再进入主链路。

## 7. 安全交互层

### 当前实现

- 默认不自动发卡；
- webhook 发送必须显式配置；
- hook 默认只记录 workflow 输出。

### 成熟目标

- 群级白名单；
- 频控；
- 幂等；
- 卡片按钮确认；
- 3 秒内响应回调；
- 异步更新卡片；
- 操作审计。

### 候选路线

- OpenClaw message tool 回当前会话；
- lark-cli bot/user send；
- 飞书卡片回调 + 后台队列；
- Redis/集中式限流；
- event_id 幂等表。

## 8. 全局记忆与权限边界

### 当前实现

主路径按 `chat_id` 读取群消息。这是真实、可控、可复现的入口，但不是全局记忆。

### 成熟目标

- 跨群、跨文档、跨会议、跨任务的组织记忆；
- 每条 MemoryAtom 带权限边界；
- 检索前做权限 pre-filter；
- 支持时间演化和实体关系。

### 候选路线

- Mem0 风格层级记忆；
- Zep/Graphiti 风格时序知识图谱；
- LangMem 风格 agent memory 管理；
- RBAC / ABAC / tenant boundary；
- source context id + participant ACL。

这些是长期产品化关键，不应在方案中删掉。

## 9. 评测体系

当前核心问题不是“有没有功能”，而是“效果如何证明”。

### 必须建立的评测层级

| 层级 | 评测对象 | 示例指标 |
|---|---|---|
| Ingestion | lark-cli/导出数据读取 | 成功率、分页、权限错误率 |
| Disentanglement | 线程恢复 | thread F1、ARI、VI |
| Chunking | CandidateWindow | 窗口纯度、证据覆盖率、噪声率 |
| Extraction | LLM/规则抽取 | kind accuracy、field F1、schema pass rate |
| Reconcile | 状态更新 | duplicate rate、supersede accuracy |
| Recall | 召回 | evidence precision/recall、MRR |
| Answer | 生成回答 | faithfulness、citation accuracy |
| Interaction | 卡片/频控 | 误触发率、用户确认率、刷屏率 |

### 当前必须扩充的评测

- 真实飞书噪声；
- 多线程交错；
- 未定讨论；
- 复议问题；
- 多轮争论后决策；
- 重复 ingest；
- 低置信 LLM fallback；
- 证据链缺失；
- 卡片误触发。

## 10. 当前能力层级声明

| 层级 | 状态 |
|---|---|
| 真实飞书群消息读取 | 已跑通 |
| 结构化 MemoryAtom | 已实现 |
| LLM 受控抽取 | 已增强，但样本仍少 |
| 规则抽取 guard | 已增强，但仍是 fallback/guard |
| 会话解缠 | 未成熟，需重点建设 |
| 自适应分块 | 未成熟，需重点建设 |
| Reconcile 去重/冲突 | 部分实现 |
| 生成式召回 | 未成熟，当前用确定性 recall |
| 生产级存储 | 未实现，当前是 JSONL/SQLite |
| 权限隔离/全局记忆 | 未实现，需长期建设 |

## 11. 对外表述

不要说：

> Kairos 已经具备生产级企业记忆能力。

应该说：

> Kairos 已经打通真实飞书群消息到结构化项目记忆的端到端闭环，并形成 MemoryAtom、EventLog、Reconcile、Recall、Decision Card 与 OpenClaw/lark-cli 集成的基础架构。当前正在从 MVP baseline 向成熟企业记忆系统演进，重点建设会话解缠、自适应语义分块、受控 LLM 慢速归纳、状态化 Reconcile、可溯源生成与权限边界。
