import type { ConflictRelation, MemoryAtom, MemoryAction } from "./atom.js";
import type { MemoryStoreLike } from "./storeFactory.js";

export type ReconcileApplyResult = {
  action: Exclude<MemoryAction, "DELETE" | "NONE">;
  atom?: MemoryAtom;
  target_id?: string;
  relation?: ConflictRelation;
  reason: string;
};

export function reconcileAndApplyMemoryAtom(store: MemoryStoreLike, incoming: MemoryAtom): ReconcileApplyResult {
  const existingById = store.get(incoming.id);
  if (existingById) {
    return {
      action: "DUPLICATE",
      atom: existingById,
      target_id: existingById.id,
      reason: "same_stable_id",
    };
  }

  const candidates = store.findConflictCandidates(incoming, 5)
    .filter((item) => item.status === "active")
    .filter((item) => item.project === incoming.project)
    .filter((item) => item.type === incoming.type)
    .filter((item) => item.scope === incoming.scope)
    .filter((item) => item.subject === incoming.subject);

  if (candidates.length === 0) {
    const saved = store.upsert(incoming);
    return { action: "ADD", atom: saved, reason: "no_same_subject_candidate" };
  }

  const target = candidates[0];
  const duplicateScore = semanticSimilarity(incoming, target);
  if (duplicateScore >= 0.72) {
    return {
      action: "DUPLICATE",
      atom: target,
      target_id: target.id,
      reason: `same_subject_high_similarity:${duplicateScore.toFixed(2)}`,
    };
  }

  const relation = inferConflictRelation(incoming, target);
  if (relation !== "INDEPENDENT") {
    const result = store.supersede(target.id, incoming, relation);
    return {
      action: "SUPERSEDE",
      atom: result.current,
      target_id: target.id,
      relation,
      reason: `same_subject_${relation.toLowerCase()}`,
    };
  }

  const pending = {
    ...incoming,
    status: "conflict_pending" as const,
    action: "CONFLICT" as const,
    target_id: target.id,
    conflict_relation: "INDEPENDENT" as const,
    metadata: {
      ...(incoming.metadata ?? {}),
      reconcile_state: "conflict_pending",
      reconcile_reason: "same_subject_uncertain_relation",
      candidate_target_id: target.id,
      duplicate_score: duplicateScore,
    },
  };
  const saved = store.upsert(pending);
  return {
    action: "CONFLICT",
    atom: saved,
    target_id: target.id,
    relation: "INDEPENDENT",
    reason: "same_subject_uncertain_relation",
  };
}

function semanticSimilarity(a: MemoryAtom, b: MemoryAtom): number {
  const aTokens = tokenSet(`${a.subject} ${a.content} ${a.tags.join(" ")}`);
  const bTokens = tokenSet(`${b.subject} ${b.content} ${b.tags.join(" ")}`);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of aTokens) if (bTokens.has(token)) overlap++;
  const union = new Set([...aTokens, ...bTokens]).size;
  return overlap / union;
}

function tokenSet(text: string): Set<string> {
  const tokens: string[] = [];
  const latin = text.match(/[A-Za-z0-9_+#.-]{2,}/g) ?? [];
  tokens.push(...latin.map((x) => x.toLowerCase()));
  const cjk = text.match(/[\u4e00-\u9fa5]{2,}/g) ?? [];
  for (const part of cjk) {
    if (part.length <= 4) tokens.push(part);
    for (let i = 0; i < part.length - 1; i++) tokens.push(part.slice(i, i + 2));
  }
  return new Set(tokens.filter((t) => !STOP_TOKENS.has(t)));
}

const STOP_TOKENS = new Set(["决定", "最终", "阶段", "使用", "采用", "作为", "因为", "所以", "需要", "可以", "当前", "方案"]);

function inferConflictRelation(incoming: MemoryAtom, target: MemoryAtom): ConflictRelation {
  const text = `${incoming.content}\n${incoming.source.excerpt}`;

  // 规则只作为保守 guard：未定/提问/试探性方案绝不能自动 supersede。
  if (isUnresolvedProposal(text)) return "INDEPENDENT";

  if (/从\s*\d|从.*开始|之后|之前|截至|到.*为止/.test(text)) return "TEMPORAL_SEQUENCE";
  if (/不对|改为|改成|改用|替换|不再|取消|废弃|废止|不允许|必须|先不用|暂时不用|不作为|默认不/.test(text)) return "DIRECT_CONFLICT";
  if (/离职|下线|移除|删除/.test(text)) return "INDIRECT_INVALIDATION";

  // 同一决策 subject 下，旧内容和新内容若包含互斥技术名，也按直接冲突处理。
  // 仍然要求出现明确否定/默认变更信号；单纯“考虑 SQLite”不能覆盖旧决策。
  const pairText = `${incoming.content}\n${target.content}`.toLowerCase();
  if (pairText.includes("postgresql") && pairText.includes("sqlite") && /不用|暂时不用|部署成本|成本太高|默认/.test(text)) {
    return "DIRECT_CONFLICT";
  }
  return "INDEPENDENT";
}

function isUnresolvedProposal(text: string): boolean {
  const hasQuestionCue = /[？?]|要不要|是否|是不是|可不可以|能不能|会不会|考虑|评估|待确认|再讨论|还没定|未定|不确定/.test(text);
  const hasStrongResolutionCue = /最终决定|结论是|已定|拍板|统一为|明确决定|固定下来|先按/.test(text);
  return hasQuestionCue && !hasStrongResolutionCue;
}
