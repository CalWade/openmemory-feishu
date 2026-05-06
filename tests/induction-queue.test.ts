import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InductionQueue } from "../src/induction/queue.js";
import type { CandidateWindow } from "../src/candidate/window.js";

function win(): CandidateWindow {
  return {
    id: "win_1",
    segment_id: "seg_1",
    topic_hint: "database",
    salience_score: 0.8,
    salience_signals: ["decision"],
    candidate_eligible: true,
    denoised_text: "张三：最终决定使用 SQLite。",
    evidence_message_ids: ["om_2", "om_1"],
    dropped_message_ids: [],
    estimated_tokens: 20,
    source_channel: "feishu",
    source_type: "feishu_message",
  };
}

function withQueue(fn: (queue: InductionQueue) => void) {
  const dir = mkdtempSync(join(tmpdir(), "kairos-induction-"));
  try {
    fn(new InductionQueue(join(dir, "queue.jsonl")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("InductionQueue", () => {
  it("enqueue 同一窗口是幂等的", () => withQueue((queue) => {
    const a = queue.enqueue(win(), { project: "kairos", now: "2026-05-06T00:00:00.000Z" });
    const b = queue.enqueue(win(), { project: "kairos", now: "2026-05-06T01:00:00.000Z" });
    expect(a.id).toBe(b.id);
    expect(queue.list({ status: "pending" })).toHaveLength(1);
  }));

  it("markDone 后不再出现在 pending", () => withQueue((queue) => {
    const job = queue.enqueue(win(), { project: "kairos" });
    queue.markDone(job, { atom_id: "mem_1" });
    expect(queue.list({ status: "pending" })).toHaveLength(0);
    expect(queue.list({ status: "done" })[0].result).toEqual({ atom_id: "mem_1" });
  }));

  it("markFailed 在未达 max_attempts 前保持 pending，达到后 failed", () => withQueue((queue) => {
    const job = queue.enqueue(win(), { project: "kairos", maxAttempts: 2 });
    const once = queue.markFailed(job, "timeout");
    expect(once.status).toBe("pending");
    const twice = queue.markFailed(once, "timeout");
    expect(twice.status).toBe("failed");
    expect(queue.list({ status: "failed" })).toHaveLength(1);
  }));
});
