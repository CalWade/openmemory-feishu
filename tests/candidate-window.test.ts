import { describe, expect, it } from "vitest";
import { normalizeTextLines } from "../src/candidate/normalize.js";
import { segmentMessages } from "../src/candidate/segment.js";
import { mergeAdjacentScoredSegments, scoreSegments } from "../src/candidate/salience.js";
import { buildCandidateWindows, buildCandidateWindowFromThread } from "../src/candidate/window.js";
import type { ConversationThread, NormalizedMessage } from "../src/candidate/thread.js";

describe("buildCandidateWindows", () => {
  it("保留高价值消息并丢弃明显噪声", () => {
    const messages = normalizeTextLines("韦贺文：现在是遇到这个bug\n黄威健：行\n黄威健：这个要给独立ip\n黄威健：有点问题，预览pdf有中文乱码\n韦贺文：都贼慢", {
      baseTimestamp: 1_000,
      source: "feishu_chat",
    });
    const segments = mergeAdjacentScoredSegments(scoreSegments(segmentMessages(messages)));
    const windows = buildCandidateWindows(segments, { minScore: 0.1, maxMessages: 10 });

    expect(windows[0].candidate_eligible).toBe(true);
    expect(windows[0].denoised_text).toContain("这个要给独立ip");
    expect(windows[0].denoised_text).toContain("预览pdf有中文乱码");
    expect(windows[0].denoised_text).not.toContain("都贼慢");
  });

  it("buildCandidateWindowFromThread 构造带 context/resolution/after 的窗口", () => {
    const messages: NormalizedMessage[] = [
      { id: "m1", sender: "Alice", text: "讨论数据库选型", timestamp: 1000, chat_id: "oc_1", mentions: [], links: [], doc_tokens: [], task_ids: [], source: "feishu_chat" },
      { id: "m2", sender: "Bob", text: "PostgreSQL 怎么样", timestamp: 2000, chat_id: "oc_1", mentions: [], links: [], doc_tokens: [], task_ids: [], source: "feishu_chat" },
      { id: "m3", sender: "Alice", text: "最终决定采用 SQLite", timestamp: 3000, chat_id: "oc_1", mentions: [], links: [], doc_tokens: [], task_ids: [], source: "feishu_chat" },
      { id: "m4", sender: "Bob", text: "同意，先按这个来", timestamp: 4000, chat_id: "oc_1", mentions: [], links: [], doc_tokens: [], task_ids: [], source: "feishu_chat" },
    ];
    const thread: ConversationThread = {
      id: "t1",
      messages,
      participants: ["Alice", "Bob"],
      start_time: 1000,
      end_time: 4000,
      confidence: 0.8,
      topic_hint: "数据库/SQLite",
    };
    const win = buildCandidateWindowFromThread(thread);
    expect(win.thread_id).toBe("t1");
    expect(win.context_before).toHaveLength(2); // m1, m2
    expect(win.resolution_messages.map((m) => m.id)).toContain("m3");
    expect(win.context_after).toHaveLength(1); // m4
    expect(win.has_resolution_cue).toBe(true);
    expect(win.salience_reasons).toContain("包含决策/确认信号");
    expect(win.salience_reasons).toContain("有后续确认");
  });
});
