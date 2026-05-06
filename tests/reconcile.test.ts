import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "../src/memory/store.js";
import { createManualMemory } from "../src/memory/factory.js";
import { reconcileAndApplyMemoryAtom } from "../src/memory/reconcile.js";

function withStore(fn: (store: MemoryStore) => void) {
  const dir = mkdtempSync(join(tmpdir(), "kairos-reconcile-"));
  try {
    fn(new MemoryStore(join(dir, "memory.db"), join(dir, "events.jsonl")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("reconcileAndApplyMemoryAtom", () => {
  it("相同 id 识别为 DUPLICATE，不重复写入", () => withStore((store) => {
    const atom = createManualMemory({ text: "最终决定使用 SQLite。", project: "kairos", type: "decision", subject: "database_selection" });
    store.upsert(atom);
    const result = reconcileAndApplyMemoryAtom(store, atom);
    expect(result.action).toBe("DUPLICATE");
    expect(result.target_id).toBe(atom.id);
    expect(store.list({ project: "kairos" })).toHaveLength(1);
  }));

  it("同 subject 高相似内容识别为 DUPLICATE", () => withStore((store) => {
    const oldAtom = store.upsert(createManualMemory({
      text: "决策：MVP 阶段使用 SQLite 作为本地状态库。理由：PostgreSQL 部署成本高。",
      project: "kairos",
      type: "decision",
      subject: "local_storage_selection",
      tags: ["SQLite", "PostgreSQL", "数据库选型"],
    }));
    const incoming = createManualMemory({
      text: "决策：MVP 阶段使用 SQLite 作为本地状态库，因为 PostgreSQL 部署成本高。",
      project: "kairos",
      type: "decision",
      subject: "local_storage_selection",
      tags: ["SQLite", "PostgreSQL", "数据库选型"],
    });
    const result = reconcileAndApplyMemoryAtom(store, incoming);
    expect(result.action).toBe("DUPLICATE");
    expect(result.target_id).toBe(oldAtom.id);
    expect(store.list({ project: "kairos" })).toHaveLength(1);
  }));

  it("同 subject 明确改为时执行 SUPERSEDE", () => withStore((store) => {
    const oldAtom = store.upsert(createManualMemory({
      text: "最终决定数据库方案采用 PostgreSQL。",
      project: "kairos",
      type: "decision",
      subject: "database_selection",
      tags: ["PostgreSQL"],
    }));
    const incoming = createManualMemory({
      text: "复赛 demo 阶段改为使用 SQLite，PostgreSQL 部署成本太高，暂时不用。",
      project: "kairos",
      type: "decision",
      subject: "database_selection",
      tags: ["SQLite", "PostgreSQL"],
    });
    const result = reconcileAndApplyMemoryAtom(store, incoming);
    expect(result.action).toBe("SUPERSEDE");
    expect(result.target_id).toBe(oldAtom.id);
    expect(store.get(oldAtom.id)?.status).toBe("superseded");
    expect(store.list({ project: "kairos" })).toHaveLength(1);
    expect(store.list({ project: "kairos" })[0].content).toContain("SQLite");
  }));

  it("同 subject 但关系不明时进入 conflict_pending", () => withStore((store) => {
    const oldAtom = store.upsert(createManualMemory({
      text: "数据库方案采用 PostgreSQL。",
      project: "kairos",
      type: "decision",
      subject: "database_selection",
      tags: ["PostgreSQL"],
    }));
    const incoming = createManualMemory({
      text: "数据库方案也可以考虑 MongoDB。",
      project: "kairos",
      type: "decision",
      subject: "database_selection",
      tags: ["MongoDB"],
    });
    const result = reconcileAndApplyMemoryAtom(store, incoming);
    expect(result.action).toBe("CONFLICT");
    expect(result.target_id).toBe(oldAtom.id);
    expect(result.atom?.status).toBe("conflict_pending");
    expect(result.atom?.metadata?.reconcile_state).toBe("conflict_pending");
    expect(store.list({ project: "kairos" })).toHaveLength(1); // 默认只返回 active，不混入 pending
    expect(store.list({ project: "kairos", includeHistory: true }).map((x) => x.status).sort()).toEqual(["active", "conflict_pending"]);
  }));
});
