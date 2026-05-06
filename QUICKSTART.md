# Kairos 快速接入飞书群（lark-cli Runtime 模式）

> 当前推荐主线：`lark-cli Runtime`。OpenClaw hook 是历史/候选路径，不是当前 P0 运行方式。

## 1. 安装

```bash
git clone https://github.com/CalWade/Kairos.git
cd Kairos
npm install
npm run build
```

## 2. 准备 lark-cli

```bash
npm install -g @larksuite/cli
lark-cli auth login --recommend --profile kairos-alt
```

确认登录：

```bash
lark-cli auth status --profile kairos-alt
```

## 3. 找到要监听的群 chat_id

优先用群列表/搜索：

```bash
lark-cli im +chat-list --format json --profile kairos-alt
```

如果本地 lark-cli 没有 `+chat-list`，用消息搜索找到 `chat_id`：

```bash
lark-cli im +messages-search --query "群里最近一条独特消息" --format json --profile kairos-alt
```

目标格式通常是：

```text
oc_xxxxxxxxxxxxxxxxx
```

## 4. 准备飞书机器人 webhook

在目标飞书群添加「自定义机器人」，复制 webhook：

```text
https://open.feishu.cn/open-apis/bot/v2/hook/xxxx
```

注意：webhook 必须来自同一个目标群，否则 Kairos 会读 A 群、发到 B 群。

## 5. 运行接入向导

```bash
npm run setup:lark-runtime -- \
  --profile kairos-alt \
  --chat-id oc_xxx \
  --feishu-webhook "https://open.feishu.cn/open-apis/bot/v2/hook/xxx" \
  --test-read \
  --test-webhook
```

该命令会：

- 检查 lark-cli 是否安装；
- 检查 profile 是否登录；
- 检查读取群消息权限；
- 测试读取目标群最近消息；
- 可选发送一条测试卡片；
- 写入 `.env`。

## 6. 启动可视化页面

```bash
npm run dashboard
```

打开：

```text
http://127.0.0.1:8787
```

## 7. 启动 lark-cli Runtime

```bash
npm run lark-runtime
```

Runtime 会：

```text
轮询飞书群消息
→ 去重
→ 后台归纳 MemoryAtom
→ 检测历史决策复议
→ 通过机器人 webhook 推送决策卡片
→ Dashboard 展示数据流状态
```

## 8. 调试：只跑一轮

```bash
npm run lark-runtime:once
```

如果看到：

```json
{
  "errors": [],
  "fetched": 4,
  "new_messages": 4
}
```

说明已经成功连接目标飞书群。

## 常见问题

### 不知道 chat_id

使用：

```bash
lark-cli im +chat-list --format json --profile kairos-alt
```

或用消息搜索返回结果里的 `chat_id`。

### 能读消息但不发卡

确认 `.env` 里有：

```bash
KAIROS_FEISHU_WEBHOOK_URL=...
```

并确认 webhook 来自目标群。

### Dashboard 看不到数据

先跑：

```bash
npm run lark-runtime:once
npm run eval:core
```

再刷新 Dashboard。

### 不想发真实卡片

只跑：

```bash
npm run lark-runtime:once
```

不要启用 `KAIROS_FEISHU_WEBHOOK_URL` 或不要运行 `npm run lark-runtime` 的发送版本。
