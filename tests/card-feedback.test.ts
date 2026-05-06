import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "../src/memory/store.js";
import { createManualMemory } from "../src/memory/factory.js";
import { applyDecisionCardFeedback } from "../src/memory/cardFeedback.js";

function withStore(fn: (store: MemoryStore) => void) {
  const dir = mkdtempSync(join(tmpdir(), "kairos-card-feedback-"));
  try {
    fn(new MemoryStore(join(dir, "memory.db"), join(dir, "events.jsonl")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("applyDecisionCardFeedback", () => {
  it("confirm 会写入 card feedback metadata", () => withStore((store) => {
    const atom = store.upsert(createManualMemory({
      text: "决策：MVP 阶段使用 SQLite。",
      project: "kairos",
      type: "decision",
      subject: "local_storage_selection",
    }));
    const result = applyDecisionCardFeedback(store, {
      memory_id: atom.id,
      action: "confirm",
      user_id: "ou_1",
      message_id: "om_1",
      now: "2026-05-06T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    expect(result.atom?.metadata?.card_feedback_state).toBe("confirmed");
    expect(result.atom?.metadata?.card_feedback_last_user_id).toBe("ou_1");
    expect(store.get(atom.id)?.metadata?.card_feedback_state).toBe("confirmed");
  }));

  it("update_requested 保留 note 和历史", () => withStore((store) => {
    const atom = store.upsert(createManualMemory({
      text: "决策：MVP 阶段使用 SQLite。",
      project: "kairos",
      type: "decision",
      subject: "local_storage_selection",
    }));
    applyDecisionCardFeedback(store, { memory_id: atom.id, action: "confirm", user_id: "ou_1", now: "2026-05-06T00:00:00.000Z" });
    const result = applyDecisionCardFeedback(store, {
      memory_id: atom.id,
      action: "update_requested",
      user_id: "ou_2",
      note: "补充：只限 MVP 阶段",
      now: "2026-05-06T01:00:00.000Z",
    });
    expect(result.atom?.metadata?.card_feedback_state).toBe("update_requested");
    expect(result.atom?.metadata?.card_feedback_note).toBe("补充：只限 MVP 阶段");
    const history = result.atom?.metadata?.card_feedback_history as unknown[];
    expect(history).toHaveLength(2);
  }));

  it("memory 不存在时返回错误，不抛异常", () => withStore((store) => {
    const result = applyDecisionCardFeedback(store, { memory_id: "missing", action: "ignore" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("memory_not_found");
  }));
});
