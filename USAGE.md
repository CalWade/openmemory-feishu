# Kairos 使用方式

Kairos 支持两种使用方式：

1. **本地运行**：开发者自己在本机安装、配置、启动。
2. **基于 OpenClaw 运行**：把仓库链接和提示词交给 OpenClaw Agent，由 Agent 完成安装、配置、启动和排障。

---

# 方式一：本地运行

## 1. 安装项目

```bash
git clone https://github.com/CalWade/Kairos.git
cd Kairos
npm install
npm run build
```

## 2. 安装并授权 lark-cli

```bash
npm install -g @larksuite/cli
lark-cli auth login --recommend --profile kairos-alt
```

授权时保持命令运行，按官方页面完成授权。

## 3. 配置飞书群

准备：

```text
KAIROS_CHAT_ID：要监听的飞书群 chat_id，例如 oc_xxx
KAIROS_LARK_PROFILE：lark-cli profile，默认 kairos-alt
KAIROS_FEISHU_WEBHOOK_URL：目标群自定义机器人 webhook
```

运行接入向导：

```bash
npm run setup:lark-runtime -- \
  --profile kairos-alt \
  --chat-id oc_xxx \
  --feishu-webhook "https://open.feishu.cn/open-apis/bot/v2/hook/xxx" \
  --test-read \
  --test-webhook
```

## 4. 启动 Dashboard

```bash
npm run dashboard
```

打开：

```text
http://127.0.0.1:8787
```

## 5. 启动 Runtime

```bash
npm run lark-runtime
```

调试一轮：

```bash
npm run lark-runtime:once
```

---

# 方式二：基于 OpenClaw 运行

把下面整段复制给 OpenClaw Agent 即可。

```text
你是 OpenClaw Agent。请帮我部署并运行 Kairos。

项目仓库：
https://github.com/CalWade/Kairos

目标：
把 Kairos 接入我指定的飞书群，通过 lark-cli Runtime 读取群消息，用飞书群自定义机器人 webhook 推送决策卡片，并启动 Kairos Dashboard 展示引擎数据流。

请按以下步骤执行：

1. 克隆项目并安装依赖
   git clone https://github.com/CalWade/Kairos.git
   cd Kairos
   npm install
   npm run build

2. 确认 lark-cli 是否安装
   lark-cli --version
   如果不存在，安装：
   npm install -g @larksuite/cli

3. 按 lark-cli 官方流程完成授权
   lark-cli auth login --recommend --profile kairos-alt

   注意：
   - 这个命令需要保持运行，直到我在浏览器完成授权并返回成功。
   - 不要反复运行 lark-cli config init --new。
   - 授权后用下面命令检查：
     lark-cli auth status --profile kairos-alt

4. 向我索取以下信息：
   - 要监听的飞书群 chat_id，格式通常是 oc_xxx
   - 该群自定义机器人的 webhook，格式是 https://open.feishu.cn/open-apis/bot/v2/hook/xxx

5. 运行 Kairos 接入向导
   npm run setup:lark-runtime -- \
     --profile kairos-alt \
     --chat-id <我提供的 oc_xxx> \
     --feishu-webhook "<我提供的 webhook>" \
     --test-read \
     --test-webhook

6. 启动 Dashboard
   npm run dashboard

   Dashboard 地址：
   http://127.0.0.1:8787

7. 启动 lark-cli Runtime
   npm run lark-runtime

8. 验证运行状态
   - 飞书群有新消息时，Runtime 应能读取并处理。
   - Dashboard 应显示“飞书消息进入 → 会话解缠与归纳 → 长期记忆生成 → 历史记忆激活”。
   - 如果群里出现历史决策复议，Kairos 应通过 webhook 推送决策卡片。

9. 如果要调试，不要刷屏，先运行：
   npm run lark-runtime:once

请在每一步完成后用简短中文告诉我结果。如果缺少权限、chat_id、webhook 或 lark-cli 授权失败，请停下来问我，不要自行创建多个飞书 CLI 应用。
```

---

# 两种方式的区别

| 方式 | 谁来操作 | 适合场景 |
|---|---|---|
| 本地运行 | 开发者自己 | 本机调试、录屏前准备、手动掌控配置 |
| OpenClaw 运行 | OpenClaw Agent | 让 Agent 代为部署、配置、运行、排障 |

两种方式使用同一个运行核心：

```text
lark-cli Runtime
→ Kairos Memory Engine
→ Dashboard
→ Feishu Decision Card
```
