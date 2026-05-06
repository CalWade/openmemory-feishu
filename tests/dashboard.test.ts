import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "../src/memory/store.js";
import { createManualMemory } from "../src/memory/factory.js";
import { buildEngineDashboardData, renderEngineDashboardHtml, writeEngineDashboardHtml } from "../src/visualization/dashboard.js";

describe("Engine Dashboard", () => {
  it("生成包含 MemoryAtom 和工作流步骤的 HTML", () => {
    const dir = mkdtempSync(join(tmpdir(), "kairos-dashboard-"));
    try {
      const store = new MemoryStore(join(dir, "memory.db"), join(dir, "events.jsonl"));
      store.upsert(createManualMemory({ text: "决策：复赛阶段使用 SQLite", project: "kairos", type: "decision", subject: "local_storage_selection" }));
      const data = buildEngineDashboardData({ store, eventsPath: join(dir, "events.jsonl"), inductionQueuePath: join(dir, "induction.jsonl"), refineQueuePath: join(dir, "refine.jsonl"), activationThrottlePath: join(dir, "activation.jsonl"), hookLogPath: join(dir, "hook.jsonl") });
      const html = renderEngineDashboardHtml(data);
      expect(html).toContain("Kairos Engine Dashboard");
      expect(html).toContain("复赛阶段使用 SQLite");
      expect(html).toContain("Feishu Message");
      expect(html).toContain("MemoryAtom");
      const output = join(dir, "dashboard.html");
      writeEngineDashboardHtml(data, output);
      expect(renderEngineDashboardHtml(data)).toContain("Active Memories");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
