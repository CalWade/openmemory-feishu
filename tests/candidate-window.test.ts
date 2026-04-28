import { describe, expect, it } from "vitest";
import { normalizeTextLines } from "../src/candidate/normalize.js";
import { segmentMessages } from "../src/candidate/segment.js";
import { mergeAdjacentScoredSegments, scoreSegments } from "../src/candidate/salience.js";
import { buildCandidateWindows } from "../src/candidate/window.js";

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
});
