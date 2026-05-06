import { describe, expect, it } from "vitest";
import { createMemoryStoreSyncForJsonl } from "../src/memory/storeFactory.js";
import { runLarkRuntimeCycle } from "../src/larkRuntime/worker.js";

describe("lark runtime", () => {
  it("缺少 chatId 时直接报错，避免启动半残 runtime", async () => {
    await expect(runLarkRuntimeCycle({
      chatId: "",
      store: createMemoryStoreSyncForJsonl({ db: "/tmp/kairos-runtime-test.jsonl", events: "/tmp/kairos-runtime-test-events.jsonl" }),
    })).rejects.toThrow("缺少 chatId");
  });
});
