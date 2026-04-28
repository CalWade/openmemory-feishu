import type { CandidateWindow } from "../candidate/window.js";
import type { MemoryAtom, MemoryType } from "../memory/atom.js";
import { createManualMemory } from "../memory/factory.js";
import type { ExtractionResult } from "./decisionTypes.js";

export function extractionToMemoryAtom(result: ExtractionResult, window: CandidateWindow, project?: string): MemoryAtom | undefined {
  if (result.kind === "none") return undefined;
  const type = mapKindToMemoryType(result.kind);
  const now = new Date().toISOString();
  const { subject, content, tags, importance, decay_policy } = buildAtomContent(result);
  return {
    ...createManualMemory({
      text: content,
      project,
      type,
      scope: "team",
      layer: type === "workflow" ? "behavior" : "rule",
      formation: "derived",
      subject,
      tags,
      importance,
      confidence: result.confidence,
      decay_policy,
      now,
    }),
    source: {
      channel: "manual",
      source_type: "manual_text",
      excerpt: window.denoised_text,
      chunk_ids: result.evidence_message_ids,
    },
    metadata: {
      extraction_kind: result.kind,
      aliases: result.aliases,
      negative_keys: result.negative_keys,
      evidence_message_ids: result.evidence_message_ids,
      raw_extraction: result,
    },
  };
}

function mapKindToMemoryType(kind: Exclude<ExtractionResult["kind"], "none">): MemoryType {
  if (kind === "decision") return "decision";
  if (kind === "convention") return "convention";
  if (kind === "risk") return "risk";
  return "workflow";
}

function buildAtomContent(result: Exclude<ExtractionResult, { kind: "none" }>): {
  subject: string;
  content: string;
  tags: string[];
  importance: 1 | 2 | 3 | 4 | 5;
  decay_policy: "ebbinghaus" | "linear" | "step" | "none";
} {
  if (result.kind === "decision") {
    return {
      subject: result.topic,
      content: [
        `决策：${result.decision}`,
        result.conclusion ? `结论：${result.conclusion}` : undefined,
        result.reasons.length ? `理由：${result.reasons.join("；")}` : undefined,
      ].filter(Boolean).join("\n"),
      tags: ["decision", result.topic, ...result.aliases],
      importance: 4,
      decay_policy: "step",
    };
  }
  if (result.kind === "convention") {
    return {
      subject: result.topic,
      content: `规则：${result.rule}`,
      tags: ["convention", result.topic, ...result.aliases],
      importance: 3,
      decay_policy: "step",
    };
  }
  if (result.kind === "risk") {
    return {
      subject: result.topic,
      content: [
        `风险：${result.risk}`,
        result.impact ? `影响：${result.impact}` : undefined,
        result.mitigation ? `缓解措施：${result.mitigation}` : undefined,
      ].filter(Boolean).join("\n"),
      tags: ["risk", result.topic, ...result.aliases],
      importance: result.severity === "high" ? 5 : 4,
      decay_policy: "step",
    };
  }
  return {
    subject: result.topic,
    content: [
      result.trigger ? `触发：${result.trigger}` : undefined,
      result.steps.length ? `步骤：${result.steps.join("；")}` : undefined,
      result.commands.length ? `命令：${result.commands.join("；")}` : undefined,
    ].filter(Boolean).join("\n") || "工作流记忆",
    tags: ["workflow", result.topic, ...result.aliases],
    importance: 3,
    decay_policy: "step",
  };
}
