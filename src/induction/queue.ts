import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CandidateWindow } from "../candidate/window.js";
import { makeMemoryId } from "../memory/id.js";

export type InductionJobStatus = "pending" | "done" | "failed";

export type InductionJob = {
  id: string;
  project?: string;
  status: InductionJobStatus;
  window: CandidateWindow;
  created_at: string;
  updated_at: string;
  attempts: number;
  max_attempts: number;
  result?: unknown;
  error?: string;
};

type InductionEvent = {
  event: "enqueue" | "done" | "failed";
  job: InductionJob;
  at: string;
};

export class InductionQueue {
  constructor(private readonly path = "data/induction_queue.jsonl") {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  enqueue(window: CandidateWindow, options: { project?: string; maxAttempts?: number; now?: string } = {}): InductionJob {
    const now = options.now ?? new Date().toISOString();
    const id = makeInductionJobId(window, options.project);
    const existing = this.get(id);
    if (existing && existing.status === "pending") return existing;
    if (existing && existing.status === "done") return existing;

    const job: InductionJob = {
      id,
      project: options.project,
      status: "pending",
      window,
      created_at: now,
      updated_at: now,
      attempts: existing?.attempts ?? 0,
      max_attempts: options.maxAttempts ?? 2,
    };
    this.append({ event: "enqueue", job, at: now });
    return job;
  }

  markDone(job: InductionJob, result: unknown, options: { now?: string } = {}): InductionJob {
    const now = options.now ?? new Date().toISOString();
    const updated: InductionJob = {
      ...job,
      status: "done",
      updated_at: now,
      attempts: job.attempts + 1,
      result,
      error: undefined,
    };
    this.append({ event: "done", job: updated, at: now });
    return updated;
  }

  markFailed(job: InductionJob, error: string, options: { now?: string } = {}): InductionJob {
    const now = options.now ?? new Date().toISOString();
    const attempts = job.attempts + 1;
    const updated: InductionJob = {
      ...job,
      status: attempts >= job.max_attempts ? "failed" : "pending",
      updated_at: now,
      attempts,
      error,
    };
    this.append({ event: "failed", job: updated, at: now });
    return updated;
  }

  get(id: string): InductionJob | undefined {
    return this.snapshot().get(id);
  }

  list(options: { status?: InductionJobStatus; limit?: number } = {}): InductionJob[] {
    return [...this.snapshot().values()]
      .filter((job) => !options.status || job.status === options.status)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, options.limit ?? 50);
  }

  private append(event: InductionEvent) {
    appendFileSync(this.path, `${JSON.stringify(event)}\n`, "utf8");
  }

  private snapshot(): Map<string, InductionJob> {
    const map = new Map<string, InductionJob>();
    if (!existsSync(this.path)) return map;
    for (const line of readFileSync(this.path, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as InductionEvent;
        if (event.job?.id) map.set(event.job.id, event.job);
      } catch {
        // append-only queue: ignore corrupted line, keep rest readable
      }
    }
    return map;
  }
}

export function makeInductionJobId(window: CandidateWindow, project?: string): string {
  const evidence = [...window.evidence_message_ids].sort().join(",");
  return makeMemoryId([
    "induction",
    project ?? "default",
    window.source_channel ?? "manual",
    window.source_type ?? "manual_text",
    window.segment_id,
    evidence || window.denoised_text.replace(/\s+/g, " ").trim(),
  ].join("|"));
}
