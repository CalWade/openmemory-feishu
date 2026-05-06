import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "../src/memory/store.js";
import { createManualMemory } from "../src/memory/factory.js";
import { RefineQueue } from "../src/refine/queue.js";
import { applyRefinePatch, triageRefineJob } from "../src/refine/processor.js";

function withStore(fn: (store: MemoryStore, queue: RefineQueue) => void) {
  const dir = mkdtempSync(join(tmpdir(), "kairos-refine-proc-"));
  try {
    fn(new MemoryStore(join(dir, "memory.db"), join(dir, "events.jsonl")), new RefineQueue(join(dir, "refine.jsonl")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("refine processor", () => {
  it("triageRefineJob 不改内容，只标记 awaiting_human_patch", () => withStore((store, queue) => {
    const atom = store.upsert(createManualMemory({ text: "决策：使用 SQLite", project: "kairos", type: "decision", subject: "local_storage_selection" }));
    const job = queue.enqueue({ memory_id: atom.id, note: "补充：只限 MVP 阶段", requested_by: "ou_1" });
    const result = triageRefineJob(store, job, { now: "2026-05-06T00:00:00.000Z" });
    expect(result.ok).toBe(true);
    expect(result.atom?.content).toBe("决策：使用 SQLite");
    expect(result.atom?.metadata?.refine_state).toBe("awaiting_human_patch");
    expect(result.atom?.metadata?.refine_note).toBe("补充：只限 MVP 阶段");
  }));

  it("applyRefinePatch 需要显式 content 才修改内容", () => withStore((store, queue) => {
    const atom = store.upsert(createManualMemory({ text: "决策：使用 SQLite", project: "kairos", type: "decision", subject: "local_storage_selection" }));
    const job = queue.enqueue({ memory_id: atom.id, note: "补充范围" });
    const result = applyRefinePatch(store, {
      memory_id: atom.id,
      job_id: job.id,
      content: "决策：MVP 阶段使用 SQLite",
      user_id: "ou_1",
      now: "2026-05-06T01:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    expect(result.atom?.content).toBe("决策：MVP 阶段使用 SQLite");
    expect(result.atom?.metadata?.refine_state).toBe("patched");
    expect(result.atom?.metadata?.refine_previous_content).toBe("决策：使用 SQLite");
  }));
});
