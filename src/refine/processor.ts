import type { MemoryAtom } from "../memory/atom.js";
import type { MemoryStoreLike } from "../memory/storeFactory.js";
import type { RefineJob } from "./queue.js";

export type RefineTriageResult = {
  ok: boolean;
  job_id: string;
  memory_id: string;
  atom?: MemoryAtom;
  error?: string;
};

export function triageRefineJob(store: MemoryStoreLike, job: RefineJob, options: { now?: string } = {}): RefineTriageResult {
  const atom = store.get(job.memory_id);
  if (!atom) return { ok: false, job_id: job.id, memory_id: job.memory_id, error: "memory_not_found" };
  const now = options.now ?? new Date().toISOString();
  const updated: MemoryAtom = {
    ...atom,
    action: "UPDATE",
    metadata: {
      ...(atom.metadata ?? {}),
      refine_state: "awaiting_human_patch",
      refine_job_id: job.id,
      refine_note: job.note,
      refine_requested_by: job.requested_by,
      refine_requested_message_id: job.message_id,
      refine_triaged_at: now,
    },
  };
  const saved = store.upsert(updated);
  return { ok: true, job_id: job.id, memory_id: job.memory_id, atom: saved };
}

export function applyRefinePatch(store: MemoryStoreLike, input: {
  memory_id: string;
  content: string;
  note?: string;
  user_id?: string;
  job_id?: string;
  now?: string;
}): RefineTriageResult {
  const atom = store.get(input.memory_id);
  if (!atom) return { ok: false, job_id: input.job_id ?? "manual", memory_id: input.memory_id, error: "memory_not_found" };
  const now = input.now ?? new Date().toISOString();
  const previousContent = atom.content;
  const updated: MemoryAtom = {
    ...atom,
    action: "UPDATE",
    content: input.content,
    observed_at: now,
    metadata: {
      ...(atom.metadata ?? {}),
      refine_state: "patched",
      refine_patched_at: now,
      refine_patched_by: input.user_id,
      refine_patch_note: input.note,
      refine_previous_content: previousContent,
      refine_job_id: input.job_id ?? atom.metadata?.refine_job_id,
    },
  };
  const saved = store.upsert(updated);
  return { ok: true, job_id: input.job_id ?? String(updated.metadata?.refine_job_id ?? "manual"), memory_id: input.memory_id, atom: saved };
}
