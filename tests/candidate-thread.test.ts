import { describe, expect, it } from "vitest";
import { threadMessages, type NormalizedMessage } from "../src/candidate/thread.js";

function makeMsg(overrides: Partial<NormalizedMessage> & { id: string; text: string }): NormalizedMessage {
  return {
    id: overrides.id,
    sender: overrides.sender ?? "user",
    text: overrides.text,
    timestamp: overrides.timestamp ?? Date.now(),
    chat_id: overrides.chat_id ?? "oc_1",
    thread_id: overrides.thread_id,
    reply_to: overrides.reply_to,
    mentions: [],
    links: [],
    doc_tokens: [],
    task_ids: [],
    source: "feishu_chat",
    raw: overrides.raw,
  };
}

describe("threadMessages", () => {
  it("按显式 thread_id 分组", () => {
    const messages = [
      makeMsg({ id: "m1", text: "讨论数据库选型", thread_id: "t1", timestamp: 1000 }),
      makeMsg({ id: "m2", text: "PostgreSQL 怎么样", thread_id: "t1", timestamp: 2000 }),
      makeMsg({ id: "m3", text: "另一个话题", thread_id: "t2", timestamp: 3000 }),
    ];
    const threads = threadMessages(messages);
    expect(threads).toHaveLength(2);
    expect(threads.find((t) => t.id === "t1")?.messages).toHaveLength(2);
    expect(threads.find((t) => t.id === "t2")?.messages).toHaveLength(1);
  });

  it("按 reply_to 链接分组", () => {
    const messages = [
      makeMsg({ id: "m1", text: "父消息", timestamp: 1000 }),
      makeMsg({ id: "m2", text: "回复", reply_to: "m1", timestamp: 2000 }),
      makeMsg({ id: "m3", text: "另一个回复", reply_to: "m1", timestamp: 3000 }),
    ];
    const threads = threadMessages(messages);
    const parentThread = threads.find((t) => t.id === "m1");
    expect(parentThread?.messages).toHaveLength(3);
  });

  it("孤儿消息按启发式分组", () => {
    const now = Date.now();
    const messages = [
      makeMsg({ id: "m1", text: "讨论 SQLite", sender: "Alice", timestamp: now }),
      makeMsg({ id: "m2", text: "SQLite 性能如何", sender: "Bob", timestamp: now + 1000 }),
      makeMsg({ id: "m3", text: "完全无关的话题", sender: "Carol", timestamp: now + 10 * 60 * 1000 }), // 10分钟后
    ];
    const threads = threadMessages(messages, { max_gap_ms: 5 * 60 * 1000 });
    expect(threads.length).toBeGreaterThanOrEqual(2);
  });

  it("生成 topic_hint", () => {
    const messages = [
      makeMsg({ id: "m1", text: "讨论数据库选型 PostgreSQL SQLite", timestamp: 1000 }),
      makeMsg({ id: "m2", text: "PostgreSQL 更适合", timestamp: 2000 }),
    ];
    const threads = threadMessages(messages);
    expect(threads[0]?.topic_hint).toContain("postgresql");
  });

  it("计算参与人和时间范围", () => {
    const messages = [
      makeMsg({ id: "m1", text: "讨论数据库选型", sender: "Alice", timestamp: 1000 }),
      makeMsg({ id: "m2", text: "PostgreSQL 性能不错", sender: "Bob", timestamp: 2000 }),
    ];
    const threads = threadMessages(messages);
    expect(threads[0].participants).toContain("Alice");
    expect(threads[0].participants).toContain("Bob");
    expect(threads[0].start_time).toBe(1000);
    expect(threads[0].end_time).toBe(2000);
  });
});
