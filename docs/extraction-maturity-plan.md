# Kairos 抽取与分段成熟化方案

> 本文聚焦抽取与分段层；完整项目全景见 `docs/technical-panorama.md`。本文不对 DeBERTa/CRF、PGlite、Self-RAG、LangGraph 等路线做武断排除，而是给出问题定义、候选路径和验证标准。

## 1. 当前关键问题

Kairos 已经打通真实飞书群消息 → MemoryAtom → `push_decision_card` 的闭环，但抽取与分段仍存在三类核心风险：

1. 真实群聊多线程交错，当前 Candidate Segment Pipeline 仍偏线性分段；
2. 规则抽取虽然增强了未定问题拒识，但仍然是 baseline / guard；
3. LLMDecisionExtractor 已具备 retry/fallback/降级记录，但仍需要更多真实样本证明效果。

## 2. 成熟目标

抽取流水线应从“关键词匹配 + 单段抽取”升级为：

```text
Raw Messages
  → Conversation Disentanglement
  → Adaptive CandidateWindow
  → Controlled LLM Slow Extraction
  → Reconcile
  → MemoryAtom + EventLog
```

核心标准：

- 能恢复多轮讨论中的决策线程；
- 能区分未定问题、复议、最终决策、风险、行动指令；
- LLM 抽取失败可重试、可降级、可审计；
- 不确定内容不静默写入；
- 每条记忆能追溯证据；
- 重复 ingest 不制造重复记忆。

## 3. Conversation Disentanglement 候选路线

| 路线 | 作用 | 成本 | 进入条件 |
|---|---|---|---|
| 规则 + thread_id/reply_to/topic overlap | 快速恢复显式线程和近邻主题 | 低 | 作为基础能力 |
| LLM 辅助线程判断 | 判断隐式关联和跨时间回流 | 中 | 规则线程恢复不够时 |
| Embedding 聚类 | 聚合同主题非连续消息 | 中 | 有足够真实样本时 |
| DeBERTa/RoBERTa + HMM/CRF | 监督式会话解缠 | 高 | 有标注数据并证明收益时 |

DeBERTa/CRF 是候选成熟路线，不应被排除。是否采用取决于真实飞书样本上的线程恢复指标，而不是主观判断。

## 4. CandidateWindow 成熟形态

```ts
type CandidateWindow = {
  id: string;
  thread_id?: string;
  messages: NormalizedMessage[];
  denoised_text: string;
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

## 5. LLM 慢速归纳

LLM 不要求实时一次完成记忆形成。成熟路径应允许：

- 候选窗口先落盘；
- LLM 后台批处理；
- 多次观察后归纳；
- 低置信进入确认；
- 失败 fallback 并记录 degraded metadata。

当前已完成：retry、fallback、prompt version、截断、`should_remember`、`reject_reason`、risk/convention 边界修正。

## 6. 必须新增评测

- 多线程交错群聊；
- 明确 reply_to/thread_id；
- 多轮争论后拍板；
- 未定问题和复议问题；
- 机器人卡片/授权链接/文件图片噪声；
- LLM 超时/非 JSON/fallback；
- 重复 ingest；
- 冲突更新。

## 7. 成功标准

不是“抽取更多”，而是：

```text
该记的能记；
不该记的不写；
不确定的可等待；
失败路径可解释；
记忆有证据；
重复导入不污染状态。
```
