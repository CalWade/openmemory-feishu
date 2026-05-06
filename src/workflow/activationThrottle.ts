import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { makeMemoryId } from "../memory/id.js";

export type ActivationThrottleDecision = {
  allowed: boolean;
  key: string;
  reason: "allowed" | "cooldown";
  last_sent_at?: string;
  cooldown_until?: string;
};

export type ActivationThrottleRecord = {
  key: string;
  chat_id: string;
  memory_id: string;
  message_id?: string;
  sent_at: string;
};

export class ActivationThrottle {
  constructor(private readonly path = "data/activation_throttle.jsonl") {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  check(input: { chat_id: string; memory_id: string; now?: string; cooldownMs?: number }): ActivationThrottleDecision {
    const now = new Date(input.now ?? new Date().toISOString());
    const cooldownMs = input.cooldownMs ?? 15 * 60 * 1000;
    const key = activationThrottleKey(input.chat_id, input.memory_id);
    const last = this.latest().get(key);
    if (!last) return { allowed: true, key, reason: "allowed" };
    const lastTime = new Date(last.sent_at);
    const cooldownUntil = new Date(lastTime.getTime() + cooldownMs);
    if (now < cooldownUntil) {
      return {
        allowed: false,
        key,
        reason: "cooldown",
        last_sent_at: last.sent_at,
        cooldown_until: cooldownUntil.toISOString(),
      };
    }
    return { allowed: true, key, reason: "allowed", last_sent_at: last.sent_at };
  }

  record(input: { chat_id: string; memory_id: string; message_id?: string; sent_at?: string }): ActivationThrottleRecord {
    const record: ActivationThrottleRecord = {
      key: activationThrottleKey(input.chat_id, input.memory_id),
      chat_id: input.chat_id,
      memory_id: input.memory_id,
      message_id: input.message_id,
      sent_at: input.sent_at ?? new Date().toISOString(),
    };
    appendFileSync(this.path, `${JSON.stringify(record)}\n`, "utf8");
    return record;
  }

  latest(): Map<string, ActivationThrottleRecord> {
    const map = new Map<string, ActivationThrottleRecord>();
    if (!existsSync(this.path)) return map;
    for (const line of readFileSync(this.path, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line) as ActivationThrottleRecord;
        if (item.key) map.set(item.key, item);
      } catch {
        // append-only throttle log: ignore corrupted line
      }
    }
    return map;
  }
}

export function activationThrottleKey(chatId: string, memoryId: string): string {
  return makeMemoryId(["activation", chatId, memoryId].join("|"));
}
