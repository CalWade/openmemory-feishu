import { describe, expect, it } from "vitest";
import { buildLarkCliPlan, checkLarkCliStatus } from "../src/larkCliAdapter.js";

describe("lark-cli adapter", () => {
  it("status check never throws", () => {
    const status = checkLarkCliStatus();
    expect(typeof status.installed).toBe("boolean");
    expect(status.auth_checked).toBe(false);
  });

  it("buildLarkCliPlan 生成消息搜索和文档读取命令但不执行", () => {
    expect(buildLarkCliPlan({ purpose: "message_search", query: "PostgreSQL" }).command).toContain("+messages-search");
    expect(buildLarkCliPlan({ purpose: "doc_fetch", docUrl: "https://example.feishu.cn/wiki/xxx" }).command).toContain("+fetch");
  });
});
