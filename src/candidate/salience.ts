import type { CandidateSegment } from "./segment.js";

export type SalienceSignal =
  | "decision_word"
  | "rule_change_word"
  | "risk_word"
  | "deadline_word"
  | "workflow_word"
  | "has_structured_info"
  | "multi_party"
  | "confirmation"
  | "explicit_memory"
  | "source_weight";

export type ScoredSegment = CandidateSegment & {
  salience_score: number;
  salience_signals: SalienceSignal[];
  domain_hint: string;
};

const DOMAIN_CLUSTERS: Record<string, RegExp> = {
  preview_test_issue: /预览|pdf|中文乱码|独立\s*ip|测试平台|重新领|bug|环境检查|微信引导|生产环境|上架|新版|员工|推送/i,
  storage_decision: /SQLite|PostgreSQL|MongoDB|数据库|JSONL|状态库|Event Log/i,
  weekly_report_rule: /周报|Alice|Bob|接收人|每周五/i,
  api_key_risk: /API Key|密钥|前端直连|服务端|生产环境/i,
  candidate_segment_pipeline: /Candidate Segment|候选片段|Conversation Segmentation|Salience|Context Windowing|Denoising/i,
};

export function scoreSegments(segments: CandidateSegment[]): ScoredSegment[] {
  return segments.map(scoreSegment);
}

export function scoreSegment(segment: CandidateSegment): ScoredSegment {
  const text = segment.messages.map((message) => message.text).join("\n");
  const signals = new Set<SalienceSignal>();
  let score = 0;

  if (/决定|最终|确认|采用|选择|定了|就这么/.test(text)) {
    signals.add("decision_word");
    score += 0.25;
  }
  if (/以后|以后都|规则|约定|固定|改为|改成|不对|不再|放到|顺序/.test(text)) {
    signals.add("rule_change_word");
    score += 0.22;
  }
  if (/风险|禁止|不允许|注意|安全|bug|乱码|不对|失败|问题/.test(text)) {
    signals.add("risk_word");
    score += 0.20;
  }
  if (/截止|DDL|提交|上线|上架|发布/.test(text)) {
    signals.add("deadline_word");
    score += 0.12;
  }
  if (/npm|pnpm|git|命令|部署|测试平台|流程|引导|配置|重新领/.test(text)) {
    signals.add("workflow_word");
    score += 0.14;
  }
  if (/(\d{1,2}:\d{2}|\d+\s*分钟|https?:\/\/|@|`|\[文件\]|ip|IP|pdf|PDF)/i.test(text)) {
    signals.add("has_structured_info");
    score += 0.12;
  }
  if (new Set(segment.messages.map((message) => message.sender)).size >= 2) {
    signals.add("multi_party");
    score += 0.12;
  }
  if (/确认|行|ok|可以|同意|就这样/.test(text)) {
    signals.add("confirmation");
    score += 0.08;
  }
  if (/记住|别忘了|这个很重要|以后都|最终决定/.test(text)) {
    signals.add("explicit_memory");
    score += 0.20;
  }
  if (segment.source !== "manual") {
    signals.add("source_weight");
    score += 0.05;
  }

  const domain = inferDomain(text) ?? segment.topic_hint;
  return {
    ...segment,
    topic_hint: domain || segment.topic_hint,
    domain_hint: domain || segment.topic_hint,
    salience_score: Math.min(1, Number(score.toFixed(2))),
    salience_signals: [...signals],
  };
}

export function shouldMergeAdjacent(left: ScoredSegment, right: ScoredSegment, maxGapMs = 20 * 60 * 1000): boolean {
  const gap = right.start_time - left.end_time;
  if (gap > maxGapMs) return false;
  if (left.domain_hint && left.domain_hint === right.domain_hint) return true;
  if (left.topic_hint && left.topic_hint === right.topic_hint) return true;
  if (hasSharedParticipants(left, right) && hasRelatedDomainText(left, right)) return true;
  if (right.salience_score < 0.2 && left.salience_score >= 0.45 && gap <= 5 * 60 * 1000) return true;
  return false;
}

export function mergeAdjacentScoredSegments(segments: ScoredSegment[]): ScoredSegment[] {
  const merged: ScoredSegment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last && shouldMergeAdjacent(last, segment)) {
      const messages = [...last.messages, ...segment.messages];
      const combined = scoreSegment({
        id: `${last.id}_merge_${segment.id}`,
        messages,
        topic_hint: last.domain_hint || segment.domain_hint,
        start_time: last.start_time,
        end_time: segment.end_time,
        boundary_reasons: [...new Set([...last.boundary_reasons, ...segment.boundary_reasons, "adjacent_merge"])],
        source: last.source,
      });
      merged[merged.length - 1] = combined;
    } else {
      merged.push(segment);
    }
  }
  return merged;
}

export function inferDomain(text: string): string | undefined {
  for (const [name, pattern] of Object.entries(DOMAIN_CLUSTERS)) {
    if (pattern.test(text)) return name;
  }
  return undefined;
}

function hasSharedParticipants(left: CandidateSegment, right: CandidateSegment): boolean {
  const leftSenders = new Set(left.messages.map((message) => message.sender));
  return right.messages.some((message) => leftSenders.has(message.sender));
}

function hasRelatedDomainText(left: CandidateSegment, right: CandidateSegment): boolean {
  const text = `${left.messages.map((message) => message.text).join("\n")}\n${right.messages.map((message) => message.text).join("\n")}`;
  return Boolean(inferDomain(text));
}
