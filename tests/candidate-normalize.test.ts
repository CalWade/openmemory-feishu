import { describe, expect, it } from "vitest";
import { normalizeTextLines } from "../src/candidate/normalize.js";

describe("normalizeTextLines", () => {
  it("将带说话人的文本行转成标准消息", () => {
    const messages = normalizeTextLines("张三：最终决定使用 PostgreSQL。\n李四：确认。", {
      baseTimestamp: 1_000,
      intervalMs: 100,
      source: "feishu_chat",
      chatId: "oc_demo",
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].sender).toBe("张三");
    expect(messages[0].text).toBe("最终决定使用 PostgreSQL。");
    expect(messages[0].timestamp).toBe(1_000);
    expect(messages[0].chat_id).toBe("oc_demo");
    expect(messages[0].source).toBe("feishu_chat");
  });

  it("抽取 mention、链接和文档 token", () => {
    const messages = normalizeTextLines("@小王 看这个文档 https://example.feishu.cn/wiki/ABC123", {
      baseTimestamp: 1_000,
    });

    expect(messages[0].mentions).toContain("小王");
    expect(messages[0].links[0]).toContain("https://example.feishu.cn/wiki/ABC123");
    expect(messages[0].doc_tokens).toContain("ABC123");
  });
});
