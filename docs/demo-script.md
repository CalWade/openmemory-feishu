# Kairos 复赛展示脚本

## 展示原则

主画面只展示完整工作场景，不展示内部 CLI 命令。

```text
左侧：飞书 Demo 群
右侧：Kairos Dashboard 中文数据流
后台：lark-runtime 常驻运行
```

## 场景脚本

### 1. 历史决策形成

飞书群中自然讨论：

```text
产品：复赛 demo 的环境要尽量轻，评委最好能一键跑起来。
工程：PostgreSQL 会不会太重？本地部署和初始化都麻烦。
工程：SQLite + JSONL 更轻，也适合 OpenClaw 插件分发。
产品：最终决定：复赛阶段先用 SQLite，PostgreSQL 复赛后再评估。
```

Dashboard 展示：

```text
飞书消息进入 → 会话解缠与归纳 → 长期记忆生成
```

### 2. 历史复议触发

飞书群中有人发：

```text
要不我们还是用 PostgreSQL？
```

Kairos 通过机器人推送决策卡片：

```text
检测到你正在复议一个历史决策
历史决策：复赛阶段先使用 SQLite，不使用 PostgreSQL
理由：PostgreSQL 部署成本较高，可能影响评委快速运行
证据：来自此前群聊讨论
[确认有效] [忽略] [请求更新]
```

Dashboard 展示：

```text
历史记忆激活 → 决策卡片发送 → 频控记录
```

### 3. 用户反馈修正

用户点击或后台触发：

```text
请求更新：只限复赛阶段，长期产品化阶段重新评估 PostgreSQL/PGlite。
```

Dashboard 展示：

```text
反馈与修正 → RefineQueue pending → patched
```

### 4. 自证评测

Dashboard 展示本地评测：

```text
抗干扰召回
矛盾更新
飞书工作流 activation
LLM thread linking
```

## 录屏顺序

1. 展示飞书 Demo 群和 Dashboard；
2. 群里出现历史决策讨论；
3. Dashboard 生成有效记忆；
4. 群里出现复议问题；
5. Kairos 推送历史决策卡片；
6. 展示反馈按钮和 Dashboard 状态变化；
7. 展示 Benchmark 区块；
8. 结束时切到架构图或文档说明。

## 讲解话术

> Kairos 不是简单搜索聊天记录，而是把飞书协作流中的关键决策沉淀为有状态、有证据链、可更新的长期记忆。当团队之后重新讨论同一问题时，Kairos 会主动召回历史决策，并通过飞书卡片把上下文推回协作现场。

> 右侧 Dashboard 是旁路观察页，不向群里发送调试消息。它展示消息从飞书进入 Kairos 后，经过会话解缠、慢速归纳、MemoryAtom、Activation 和反馈修正的完整数据流。
