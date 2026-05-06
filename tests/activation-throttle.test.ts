import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActivationThrottle } from "../src/workflow/activationThrottle.js";

function withThrottle(fn: (throttle: ActivationThrottle) => void) {
  const dir = mkdtempSync(join(tmpdir(), "kairos-throttle-"));
  try {
    fn(new ActivationThrottle(join(dir, "activation.jsonl")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("ActivationThrottle", () => {
  it("首次允许，记录后冷却期内禁止", () => withThrottle((throttle) => {
    const first = throttle.check({ chat_id: "oc_1", memory_id: "mem_1", now: "2026-05-06T00:00:00.000Z", cooldownMs: 15 * 60 * 1000 });
    expect(first.allowed).toBe(true);
    throttle.record({ chat_id: "oc_1", memory_id: "mem_1", message_id: "om_1", sent_at: "2026-05-06T00:00:00.000Z" });
    const second = throttle.check({ chat_id: "oc_1", memory_id: "mem_1", now: "2026-05-06T00:05:00.000Z", cooldownMs: 15 * 60 * 1000 });
    expect(second.allowed).toBe(false);
    expect(second.reason).toBe("cooldown");
    expect(second.cooldown_until).toBe("2026-05-06T00:15:00.000Z");
  }));

  it("冷却期后允许", () => withThrottle((throttle) => {
    throttle.record({ chat_id: "oc_1", memory_id: "mem_1", sent_at: "2026-05-06T00:00:00.000Z" });
    const result = throttle.check({ chat_id: "oc_1", memory_id: "mem_1", now: "2026-05-06T00:16:00.000Z", cooldownMs: 15 * 60 * 1000 });
    expect(result.allowed).toBe(true);
  }));

  it("不同群或不同 memory 分别计数", () => withThrottle((throttle) => {
    throttle.record({ chat_id: "oc_1", memory_id: "mem_1", sent_at: "2026-05-06T00:00:00.000Z" });
    expect(throttle.check({ chat_id: "oc_2", memory_id: "mem_1", now: "2026-05-06T00:05:00.000Z" }).allowed).toBe(true);
    expect(throttle.check({ chat_id: "oc_1", memory_id: "mem_2", now: "2026-05-06T00:05:00.000Z" }).allowed).toBe(true);
  }));
});
