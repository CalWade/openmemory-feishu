# Kairos OpenClaw 安装说明

Kairos 以 OpenClaw hook pack 形式分发。压缩包内包含：

- `package.json`：声明 `openclaw.hooks`
- `hooks/kairos-feishu-ingress/`：OpenClaw message:received hook
- `dist/`：已编译的 Kairos JS 代码
- `README.md`：项目说明

## 安装

```bash
openclaw plugins install ./memoryops-0.1.0.tgz
openclaw hooks enable kairos-feishu-ingress
openclaw gateway restart
openclaw hooks check
```

## 使用方式

安装并启用后，OpenClaw Gateway 收到飞书消息时会触发：

```text
message:received -> kairos-feishu-ingress -> Kairos feishu-workflow
```

默认行为是只记录工作流判断结果，不主动发送飞书卡片：

```text
runs/kairos-feishu-ingress.jsonl
```

如果要允许自动发送飞书决策卡片，需要显式配置：

```bash
export KAIROS_HOOK_SEND_FEISHU=1
export KAIROS_FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/..."
```

## 验证

1. 写入一条测试决策：

```bash
memoryops extract-decision --project kairos --write \
  --text "张三：最终决定 MVP 阶段使用 SQLite 作为当前状态库，同时保留 JSONL Event Log。王五：PostgreSQL 对复赛 demo 来说部署成本太高。"
```

2. 在飞书中发送：

```text
要不我们还是用 PostgreSQL？
```

3. 查看日志：

```bash
tail -f runs/kairos-feishu-ingress.jsonl
```

期望看到：

```json
{"action":"push_decision_card"}
```

## 当前重要限制

当前版本仍依赖 `better-sqlite3`。OpenClaw 安装插件依赖时会使用 `--ignore-scripts`，因此打包安装目录中的 native binding 可能不可用。

比赛演示机建议设置：

```bash
export KAIROS_REPO_DIR="/home/ecs-user/.openclaw/workspace/memoryops"
```

让 hook 使用已安装依赖的开发仓库运行。真正免编译分发需要后续改为 JSONL portable store 或服务化。
