import { describe, expect, it } from "vitest";
import { normalizeFeishuChatExport, parseFeishuChatMeta } from "../src/candidate/feishuChatExport.js";

describe("normalizeFeishuChatExport", () => {
  it("解析飞书会话导出中的说话人、时间和正文", () => {
    const markdown = `<text color="gray">
韦贺文 2026年4月17日 11:31
</text>没事，现在已经上架了一版了
<text color="gray">
黄威健 2026年4月17日 12:06
</text>这个要给独立ip`;

    const messages = normalizeFeishuChatExport(markdown, { docToken: "DOC123" });

    expect(messages).toHaveLength(2);
    expect(messages[0].sender).toBe("韦贺文");
    expect(messages[0].text).toBe("没事，现在已经上架了一版了");
    expect(messages[0].source).toBe("feishu_chat");
    expect(messages[0].raw).toMatchObject({ docToken: "DOC123", exportIndex: 0 });
    expect(messages[1].sender).toBe("黄威健");
    expect(messages[1].text).toBe("这个要给独立ip");
  });

  it("解析元信息时间", () => {
    const parsed = parseFeishuChatMeta("黄威健 2026年4月17日 12:06");
    expect(parsed?.sender).toBe("黄威健");
    expect(new Date(parsed!.timestamp).getFullYear()).toBe(2026);
  });
});
