import type { RefineQueue, RefineJob } from "../refine/queue.js";
import type { MemoryAtom } from "./atom.js";
import type { MemoryStoreLike } from "./storeFactory.js";

export type DecisionCardFeedbackAction = "confirm" | "ignore" | "update_requested";

export type DecisionCardFeedbackInput = {
  memory_id: string;
  action: DecisionCardFeedbackAction;
  user_id?: string;
  message_id?: string;
  note?: string;
  now?: string;
};

export type DecisionCardFeedbackResult = {
  ok: boolean;
  action: DecisionCardFeedbackAction;
  memory_id: string;
  atom?: MemoryAtom;
  refine_job?: RefineJob;
  error?: string;
};

export function applyDecisionCardFeedback(store: MemoryStoreLike, input: DecisionCardFeedbackInput, options: { refineQueue?: RefineQueue } = {}): DecisionCardFeedbackResult {
  const atom = store.get(input.memory_id);
  if (!atom) {
    return { ok: false, action: input.action, memory_id: input.memory_id, error: "memory_not_found" };
  }
  const now = input.now ?? new Date().toISOString();
  const previous = Array.isArray(atom.metadata?.card_feedback_history) ? atom.metadata?.card_feedback_history : [];
  const feedback = {
    action: input.action,
    user_id: input.user_id,
    message_id: input.message_id,
    note: input.note,
    at: now,
  };

  const updated: MemoryAtom = {
    ...atom,
    action: "UPDATE",
    metadata: {
      ...(atom.metadata ?? {}),
      card_feedback_state: feedbackState(input.action),
      card_feedback_updated_at: now,
      card_feedback_last_user_id: input.user_id,
      card_feedback_last_message_id: input.message_id,
      card_feedback_note: input.note,
      card_feedback_history: [...previous, feedback],
    },
  };

  const saved = store.upsert(updated);
  const refine_job = input.action === "update_requested" && options.refineQueue
    ? options.refineQueue.enqueue({
      memory_id: input.memory_id,
      project: saved.project,
      requested_by: input.user_id,
      message_id: input.message_id,
      note: input.note,
      now,
    })
    : undefined;
  return { ok: true, action: input.action, memory_id: input.memory_id, atom: saved, refine_job };
}

function feedbackState(action: DecisionCardFeedbackAction): string {
  if (action === "confirm") return "confirmed";
  if (action === "ignore") return "ignored";
  return "update_requested";
}
