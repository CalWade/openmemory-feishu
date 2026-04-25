# MemoryOps Demo Script

## Demo 1：历史决策召回

### 输入

飞书项目群中出现如下讨论：

```text
A：我们用 PostgreSQL 还是 MongoDB？
B：MongoDB 查询灵活。
C：但我们的数据强关系，事务要求高。
A：那最终决定用 PostgreSQL，原因是事务一致性和 SQL 分析能力更好。
B：确认，后续数据层都按 PostgreSQL 设计。
```

### 操作

```bash
memoryops add --text "最终决定用 PostgreSQL，不用 MongoDB，原因是事务一致性和 SQL 分析能力更好。"
memoryops recall "我们为什么不用 MongoDB？" --evidence
```

### 预期输出

系统返回：当前项目已决定使用 PostgreSQL，而不是 MongoDB，并引用原始讨论作为证据。

## Demo 2：矛盾更新

### 输入

```text
以后周报每周五发给 Alice。
不对，周报以后发给 Bob，Alice 不再负责这个了。
```

### 预期输出

查询“周报发给谁？”时返回 Bob；Alice 版本被标记为历史失效。

## Demo 3：遗忘提醒

### 输入

```text
生产环境 API Key 已在 4 月 25 日更新，新 key 只允许服务端使用，不允许前端直连。
```

### 操作

```bash
memoryops remind --now 2026-04-30T10:00:00+08:00
```

### 预期输出

系统输出高风险事项复习提醒。
