import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { makeMemoryId } from "../memory/id.js";

export type RefineJobStatus = "pending" | "done" | "failed";

export type RefineJob = {
  id: string;
  memory_id: string;
  project?: string;
  status: RefineJobStatus;
  requested_by?: string;
  message_id?: string;
  note?: string;
  created_at: string;
  updated_at: string;
  attempts: number;
  max_attempts: number;
  result?: unknown;
  error?: string;
};

type RefineEvent = {
  event: "enqueue" | "done" | "failed";
  job: RefineJob;
  at: string;
};

export class RefineQueue {
  constructor(private readonly path = "data/refine_queue.jsonl") {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  enqueue(input: { memory_id: string; project?: string; requested_by?: string; message_id?: string; note?: string; now?: string; maxAttempts?: number }): RefineJob {
    const now = input.now ?? new Date().toISOString();
    const id = makeRefineJobId(input.memory_id, input.note);
    const existing = this.get(id);
    if (existing && existing.status === "pending") return existing;
    if (existing && existing.status === "done") return existing;

    const job: RefineJob = {
      id,
      memory_id: input.memory_id,
      project: input.project,
      status: "pending",
      requested_by: input.requested_by,
      message_id: input.message_id,
      note: input.note,
      created_at: now,
      updated_at: now,
      attempts: existing?.attempts ?? 0,
      max_attempts: input.maxAttempts ?? 2,
    };
    this.append({ event: "enqueue", job, at: now });
    return job;
  }

  markDone(job: RefineJob, result: unknown, options: { now?: string } = {}): RefineJob {
    const now = options.now ?? new Date().toISOString();
    const updated: RefineJob = { ...job, status: "done", updated_at: now, attempts: job.attempts + 1, result, error: undefined };
    this.append({ event: "done", job: updated, at: now });
    return updated;
  }

  markFailed(job: RefineJob, error: string, options: { now?: string } = {}): RefineJob {
    const now = options.now ?? new Date().toISOString();
    const attempts = job.attempts + 1;
    const updated: RefineJob = { ...job, status: attempts >= job.max_attempts ? "failed" : "pending", updated_at: now, attempts, error };
    this.append({ event: "failed", job: updated, at: now });
    return updated;
  }

  get(id: string): RefineJob | undefined {
    return this.snapshot().get(id);
  }

  list(options: { status?: RefineJobStatus; limit?: number } = {}): RefineJob[] {
    return [...this.snapshot().values()]
      .filter((job) => !options.status || job.status === options.status)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, options.limit ?? 50);
  }

  private append(event: RefineEvent) {
    appendFileSync(this.path, `${JSON.stringify(event)}\n`, "utf8");
  }

  private snapshot(): Map<string, RefineJob> {
    const map = new Map<string, RefineJob>();
    if (!existsSync(this.path)) return map;
    for (const line of readFileSync(this.path, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as RefineEvent;
        if (event.job?.id) map.set(event.job.id, event.job);
      } catch {
        // append-only queue: ignore corrupted line
      }
    }
    return map;
  }
}

export function makeRefineJobId(memoryId: string, note?: string): string {
  return makeMemoryId(["refine", memoryId, note?.trim() || "no-note"].join("|"));
}
