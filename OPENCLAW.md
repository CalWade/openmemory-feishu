# Kairos for OpenClaw Agents

> lark-cli Runtime 负责飞书数据接入；OpenClaw 作为 Agent 宿主、部署者和运维控制面。

## 任务目标

当用户给出 Kairos 仓库链接时，OpenClaw Agent 应完成：

```text
拉取仓库
→ 安装依赖
→ 构建项目
→ 按 lark-cli 官方流程完成授权
→ 配置目标群 chat_id 和机器人 webhook
→ 启动 Dashboard
→ 启动 lark-runtime
→ 验证飞书群消息可被监听和激活
```

## 最短执行路径

```bash
git clone https://github.com/CalWade/Kairos.git
cd Kairos
npm install
npm run build
```

安装并授权 lark-cli：

```bash
npm install -g @larksuite/cli
lark-cli auth login --recommend --profile kairos-alt
```

重要：保持 `auth login` 进程运行，直到用户在浏览器完成授权并返回成功。不要反复执行 `lark-cli config init --new`。

接入目标群：

```bash
npm run setup:lark-runtime -- \
  --profile kairos-alt \
  --chat-id oc_xxx \
  --feishu-webhook "https://open.feishu.cn/open-apis/bot/v2/hook/xxx" \
  --test-read \
  --test-webhook
```

启动：

```bash
npm run dashboard
npm run lark-runtime
```

## 环境变量

`.env` 中应包含：

```bash
KAIROS_PROJECT=kairos
KAIROS_LARK_PROFILE=kairos-alt
KAIROS_CHAT_ID=oc_xxx
KAIROS_FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxx
```

## 用户可见演示

不要把 CLI 命令作为主画面。比赛展示应显示：

```text
左侧：飞书群真实协作消息和 Kairos 决策卡片
右侧：Kairos Dashboard 中文数据流
```

CLI 只作为后台运行和排障工具。

## Dashboard

```bash
npm run dashboard
```

打开：

```text
http://127.0.0.1:8787
```

Dashboard 会展示：

```text
飞书消息进入
→ 会话解缠与归纳
→ 长期记忆生成
→ 历史记忆激活
→ 反馈与修正
→ 本地评测结果
```

## Runtime

```bash
npm run lark-runtime
```

只跑一轮：

```bash
npm run lark-runtime:once
```

Runtime 负责：

- 轮询目标飞书群；
- 按 message_id 去重；
- 后台归纳 MemoryAtom；
- 检测历史决策复议；
- 通过飞书机器人 webhook 推送决策卡片；
- 写入 Dashboard 可读状态。

## 评测

```bash
npm run eval:core
npm run dev -- eval --suite thread-linking
```

评测结果会保存到 `runs/latest-eval.json`，并显示在 Dashboard。

## 安全规则

- 不打印完整 webhook URL；
- 不提交 `.env`；
- 不把真实飞书群消息原文提交到仓库；
- lark-cli 授权按官方流程完成，不要反复创建新 CLI 应用；
- 发送卡片前确认 webhook 来自目标群。
