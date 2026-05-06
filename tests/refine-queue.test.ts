import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RefineQueue } from "../src/refine/queue.js";

function withQueue(fn: (queue: RefineQueue) => void) {
  const dir = mkdtempSync(join(tmpdir(), "kairos-refine-"));
  try {
    fn(new RefineQueue(join(dir, "refine.jsonl")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("RefineQueue", () => {
  it("同一 memory/note 入队幂等", () => withQueue((queue) => {
    const a = queue.enqueue({ memory_id: "mem_1", note: "补充范围", now: "2026-05-06T00:00:00.000Z" });
    const b = queue.enqueue({ memory_id: "mem_1", note: "补充范围", now: "2026-05-06T01:00:00.000Z" });
    expect(a.id).toBe(b.id);
    expect(queue.list({ status: "pending" })).toHaveLength(1);
  }));

  it("markDone 后从 pending 移除", () => withQueue((queue) => {
    const job = queue.enqueue({ memory_id: "mem_1", note: "补充范围" });
    queue.markDone(job, { updated: true });
    expect(queue.list({ status: "pending" })).toHaveLength(0);
    expect(queue.list({ status: "done" })[0].result).toEqual({ updated: true });
  }));
});
