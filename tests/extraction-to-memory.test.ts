import { describe, expect, it } from "vitest";
import type { CandidateWindow } from "../src/candidate/window.js";
import { extractDecisionBaseline } from "../src/extractor/ruleDecisionExtractor.js";
import { extractionToMemoryAtom } from "../src/extractor/toMemoryAtom.js";
import { MemoryStore } from "../src/memory/store.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function win(text: string): CandidateWindow {
  return {
    id: "win_test",
    segment_id: "seg_test",
    topic_hint: "manual",
    salience_score: 0.8,
    salience_signals: [],
    candidate_eligible: true,
    denoised_text: text,
    evidence_message_ids: ["m1", "m2"],
    dropped_message_ids: [],
    estimated_tokens: 10,
  };
}

describe("extractionToMemoryAtom", () => {
  it("把决策抽取结果写入 MemoryAtom 并可通过反向问题召回", () => {
    const dir = mkdtempSync(join(tmpdir(), "kairos-extract-"));
    try {
      const store = new MemoryStore(join(dir, "memory.db"), join(dir, "events.jsonl"));
      const window = win("张三：最终决定 MVP 阶段使用 SQLite 作为当前状态库，同时保留 JSONL Event Log。\n王五：PostgreSQL 对复赛 demo 来说部署成本太高，容易让评委跑不起来。");
      const result = extractDecisionBaseline(window);
      const atom = extractionToMemoryAtom(result, window, "kairos");
      expect(atom).toBeTruthy();
      store.upsert(atom!);

      const hits = store.search("为什么不用 PostgreSQL？", { project: "kairos" });
      expect(hits).toHaveLength(1);
      expect(hits[0].type).toBe("decision");
      expect(hits[0].content).toContain("SQLite");
      expect(hits[0].metadata?.aliases).toContain("PostgreSQL");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("保留非 manual 来源归因", () => {
    const window = {
      ...win("张三：最终决定 MVP 阶段使用 SQLite 作为当前状态库。"),
      source_channel: "feishu",
      source_type: "feishu_message",
    } satisfies CandidateWindow;
    const result = extractDecisionBaseline(window);
    const atom = extractionToMemoryAtom(result, window, "kairos");
    expect(atom?.source.channel).toBe("feishu");
    expect(atom?.source.source_type).toBe("feishu_message");
  });
});
