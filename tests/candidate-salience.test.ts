import { describe, expect, it } from "vitest";
import { normalizeTextLines } from "../src/candidate/normalize.js";
import { segmentMessages } from "../src/candidate/segment.js";
import { mergeAdjacentScoredSegments, scoreSegments } from "../src/candidate/salience.js";

describe("salience scoring and merge", () => {
  it("高价值决策片段获得显著性信号", () => {
    const messages = normalizeTextLines("张三：最终决定 MVP 用 SQLite\n李四：确认", {
      baseTimestamp: 1_000,
      source: "feishu_chat",
    });
    const scored = scoreSegments(segmentMessages(messages));

    expect(scored[0].salience_score).toBeGreaterThan(0.3);
    expect(scored[0].salience_signals).toContain("decision_word");
    expect(scored[0].salience_signals).toContain("confirmation");
  });

  it("相邻同领域碎片会被合并", () => {
    const messages = normalizeTextLines("韦贺文：现在是遇到这个bug\n黄威健：这个要给独立ip\n黄威健：有点问题，预览pdf有中文乱码\n韦贺文：改一下顺序吧，放到最开头", {
      baseTimestamp: 1_000,
      intervalMs: 60_000,
      source: "feishu_chat",
    });
    const segments = segmentMessages(messages, { minTokenOverlap: 0.9 });
    const merged = mergeAdjacentScoredSegments(scoreSegments(segments));

    expect(segments.length).toBeGreaterThan(1);
    expect(merged).toHaveLength(1);
    expect(merged[0].domain_hint).toBe("preview_test_issue");
  });
});
