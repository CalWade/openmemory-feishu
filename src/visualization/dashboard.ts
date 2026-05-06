import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname } from "node:path";
import { EventLog } from "../memory/eventLog.js";
import type { MemoryAtom } from "../memory/atom.js";
import type { MemoryStoreLike } from "../memory/storeFactory.js";
import { InductionQueue } from "../induction/queue.js";
import { RefineQueue } from "../refine/queue.js";
import { ActivationThrottle } from "../workflow/activationThrottle.js";

export type EngineDashboardOptions = {
  store: MemoryStoreLike;
  eventsPath?: string;
  inductionQueuePath?: string;
  refineQueuePath?: string;
  activationThrottlePath?: string;
  hookLogPath?: string;
};

export type EngineDashboardData = {
  generated_at: string;
  memories: MemoryAtom[];
  events: unknown[];
  induction_jobs: unknown[];
  refine_jobs: unknown[];
  activations: unknown[];
  hook_logs: unknown[];
};

export function buildEngineDashboardData(options: EngineDashboardOptions): EngineDashboardData {
  const eventsPath = options.eventsPath ?? "data/memory_events.jsonl";
  const inductionQueuePath = options.inductionQueuePath ?? "data/induction_queue.jsonl";
  const refineQueuePath = options.refineQueuePath ?? "data/refine_queue.jsonl";
  const activationThrottlePath = options.activationThrottlePath ?? "data/activation_throttle.jsonl";
  const hookLogPath = options.hookLogPath ?? "runs/kairos-feishu-ingress.jsonl";
  const throttle = new ActivationThrottle(activationThrottlePath);
  return {
    generated_at: new Date().toISOString(),
    memories: options.store.list({ includeHistory: true, limit: 100 }),
    events: new EventLog(eventsPath).readAll().slice(-100),
    induction_jobs: new InductionQueue(inductionQueuePath).list({ limit: 100 }),
    refine_jobs: new RefineQueue(refineQueuePath).list({ limit: 100 }),
    activations: [...throttle.latest().values()],
    hook_logs: readJsonlSafe(hookLogPath).slice(-100),
  };
}

export function writeEngineDashboardHtml(data: EngineDashboardData, outputPath: string, options: { refreshSeconds?: number } = {}) {
  const dir = dirname(outputPath);
  if (dir && dir !== "." && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(outputPath, renderEngineDashboardHtml(data, options), "utf8");
}

export function renderEngineDashboardHtml(data: EngineDashboardData, options: { refreshSeconds?: number } = {}): string {
  const latestHook = data.hook_logs.slice(-8).reverse();
  const latestEvents = data.events.slice(-8).reverse();
  const induction = data.induction_jobs as any[];
  const refine = data.refine_jobs as any[];
  const activeMemories = data.memories.filter((m) => m.status === "active").slice(0, 12);
  const pendingRefine = refine.filter((j) => j.status === "pending");
  const pendingInduction = induction.filter((j) => j.status === "pending");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${options.refreshSeconds ? `<meta http-equiv="refresh" content="${options.refreshSeconds}">` : ""}
  <title>Kairos Engine Dashboard</title>
  <style>
    :root { color-scheme: dark; --bg:#0b1020; --card:#111a2e; --card2:#17223a; --text:#e8eefc; --muted:#91a1bd; --ok:#3ddc97; --warn:#ffd166; --bad:#ff6b6b; --blue:#70a1ff; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at top left, #1b2b52, var(--bg)); color: var(--text); }
    header { padding: 28px 32px 16px; display:flex; align-items:flex-end; justify-content:space-between; gap: 20px; }
    h1 { margin: 0; font-size: 30px; letter-spacing: -0.03em; }
    h2 { margin: 0 0 14px; font-size: 17px; color: #fff; }
    .sub { color: var(--muted); margin-top: 6px; }
    .grid { display:grid; grid-template-columns: repeat(12, 1fr); gap: 16px; padding: 16px 32px 32px; }
    .card { background: linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.02)); border: 1px solid rgba(255,255,255,.09); border-radius: 18px; padding: 18px; box-shadow: 0 10px 30px rgba(0,0,0,.18); }
    .span3 { grid-column: span 3; } .span4 { grid-column: span 4; } .span5 { grid-column: span 5; } .span6 { grid-column: span 6; } .span7 { grid-column: span 7; } .span8 { grid-column: span 8; } .span12 { grid-column: span 12; }
    .metric { font-size: 34px; font-weight: 750; }
    .metric small { font-size: 13px; color: var(--muted); font-weight:500; }
    .pill { display:inline-flex; align-items:center; border-radius:999px; padding:4px 9px; font-size:12px; margin: 2px 4px 2px 0; background:#22304f; color:#c7d6ff; }
    .ok { color: var(--ok); } .warn { color: var(--warn); } .bad { color: var(--bad); } .blue { color: var(--blue); }
    .timeline { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
    .step { flex:1; min-width:140px; background:var(--card2); border-radius:14px; padding:12px; border:1px solid rgba(255,255,255,.06); }
    .step b { display:block; font-size:14px; margin-bottom:4px; }
    .step span { font-size:12px; color:var(--muted); }
    table { width:100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align:left; padding:9px 8px; border-bottom:1px solid rgba(255,255,255,.07); vertical-align:top; }
    th { color:#b8c5dd; font-weight:600; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size:12px; color:#dbe7ff; }
    .muted { color: var(--muted); }
    pre { white-space:pre-wrap; word-break:break-word; margin:0; font-size:12px; color:#dbe7ff; }
    @media (max-width: 980px) { .span3,.span4,.span5,.span6,.span7,.span8,.span12 { grid-column: span 12; } header { flex-direction:column; align-items:flex-start; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Kairos Engine Dashboard</h1>
      <div class="sub">飞书工作流旁路可视化 · 不污染群聊 · 真实追踪 Memory Engine 状态</div>
    </div>
    <div class="sub mono">generated_at ${escapeHtml(data.generated_at)}</div>
  </header>

  <main class="grid">
    <section class="card span3"><div class="metric">${data.memories.length}<br/><small>MemoryAtom 总数</small></div></section>
    <section class="card span3"><div class="metric ok">${activeMemories.length}<br/><small>Active Memories</small></div></section>
    <section class="card span3"><div class="metric ${pendingInduction.length ? "warn" : "ok"}">${pendingInduction.length}<br/><small>Pending Induction</small></div></section>
    <section class="card span3"><div class="metric ${pendingRefine.length ? "warn" : "ok"}">${pendingRefine.length}<br/><small>Pending Refine</small></div></section>

    <section class="card span12">
      <h2>工作流追踪</h2>
      <div class="timeline">
        ${step("1", "Feishu Message", `${latestHook.length} hook logs`)}
        ${step("2", "Thread Linking", `${induction.length} induction jobs`)}
        ${step("3", "MemoryAtom", `${activeMemories.length} active`)}
        ${step("4", "Activation", `${data.activations.length} card sends`)}
        ${step("5", "Feedback / Refine", `${refine.length} refine jobs`)}
      </div>
    </section>

    <section class="card span7">
      <h2>Active Memories</h2>
      ${memoryTable(activeMemories)}
    </section>

    <section class="card span5">
      <h2>Queues</h2>
      ${queueTable("Induction", induction.slice(-8).reverse())}
      <div style="height:14px"></div>
      ${queueTable("Refine", refine.slice(-8).reverse())}
    </section>

    <section class="card span6">
      <h2>Recent Hook / Activation Logs</h2>
      ${logTable(latestHook)}
    </section>

    <section class="card span6">
      <h2>Recent Memory Events</h2>
      ${logTable(latestEvents)}
    </section>
  </main>
</body>
</html>`;
}

export async function serveEngineDashboard(options: EngineDashboardOptions & { port?: number; refreshSeconds?: number }) {
  const port = options.port ?? 8787;
  const server = createServer((_, res) => {
    try {
      const data = buildEngineDashboardData(options);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderEngineDashboardHtml(data, { refreshSeconds: options.refreshSeconds ?? 2 }));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(error instanceof Error ? error.stack : String(error));
    }
  });
  await new Promise<void>((resolve) => server.listen(port, resolve));
  return { server, url: `http://127.0.0.1:${port}` };
}

function step(n: string, title: string, detail: string): string {
  return `<div class="step"><b><span class="pill">${n}</span>${escapeHtml(title)}</b><span>${escapeHtml(detail)}</span></div>`;
}

function memoryTable(memories: MemoryAtom[]): string {
  if (!memories.length) return `<div class="muted">暂无 active memory</div>`;
  return `<table><thead><tr><th>Type</th><th>Subject</th><th>Content</th><th>Status</th></tr></thead><tbody>${memories.map((m) => `<tr><td><span class="pill">${escapeHtml(m.type)}</span></td><td class="mono">${escapeHtml(m.subject)}</td><td>${escapeHtml(short(m.content, 150))}</td><td>${escapeHtml(m.status)}</td></tr>`).join("")}</tbody></table>`;
}

function queueTable(title: string, jobs: any[]): string {
  return `<h2 style="font-size:14px;margin-top:0">${escapeHtml(title)}</h2>${jobs.length ? `<table><tbody>${jobs.map((j) => `<tr><td><span class="pill">${escapeHtml(j.status ?? "unknown")}</span></td><td class="mono">${escapeHtml(short(j.id ?? "", 18))}</td><td>${escapeHtml(short(j.window?.topic_hint ?? j.note ?? j.error ?? "", 70))}</td></tr>`).join("")}</tbody></table>` : `<div class="muted">无队列任务</div>`}`;
}

function logTable(items: unknown[]): string {
  if (!items.length) return `<div class="muted">暂无日志</div>`;
  return `<table><tbody>${items.map((item) => `<tr><td><pre>${escapeHtml(short(JSON.stringify(item, null, 2), 520))}</pre></td></tr>`).join("")}</tbody></table>`;
}

function readJsonlSafe(path: string): unknown[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return { parse_error: true, line: short(line, 200) }; }
    });
}

function short(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
