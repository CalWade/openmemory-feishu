import type { NormalizedMessage } from "./types.js";
import type { ScoredSegment } from "./salience.js";

export type CandidateWindow = {
  id: string;
  segment_id: string;
  topic_hint: string;
  salience_score: number;
  salience_signals: string[];
  candidate_eligible: boolean;
  denoised_text: string;
  evidence_message_ids: string[];
  dropped_message_ids: string[];
  estimated_tokens: number;
};

export type WindowOptions = {
  minScore?: number;
  maxMessages?: number;
};

const DEFAULT_MIN_SCORE = 0.45;
const DEFAULT_MAX_MESSAGES = 12;

/**
 * 将 scored segment 转成送给 LLM 的候选上下文窗口。
 *
 * 规则：
 * - 低分 segment 不进入候选；
 * - 删除孤立寒暄/弱确认/纯文件占位；
 * - 保留问题、原因、规则、风险、命令、确认等证据；
 * - 若保留内容过多，优先保留高价值消息。
 */
export function buildCandidateWindows(segments: ScoredSegment[], options: WindowOptions = {}): CandidateWindow[] {
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const maxMessages = options.maxMessages ?? DEFAULT_MAX_MESSAGES;
  return segments.map((segment) => buildCandidateWindow(segment, { minScore, maxMessages }));
}

export function buildCandidateWindow(segment: ScoredSegment, options: Required<WindowOptions>): CandidateWindow {
  const scoredMessages = segment.messages.map((message, index) => ({
    message,
    index,
    score: scoreMessage(message),
  }));

  const eligible = segment.salience_score >= options.minScore;
  const kept = eligible
    ? scoredMessages
      .filter(({ message, score }) => score > 0 || isContextualConfirmation(message))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, options.maxMessages)
      .sort((a, b) => a.index - b.index)
    : [];

  const keptIds = new Set(kept.map(({ message }) => message.id));
  const dropped = segment.messages.filter((message) => !keptIds.has(message.id));
  const denoised = kept.map(({ message }) => `${message.sender}：${message.text}`).join("\n");

  return {
    id: `win_${segment.id.replace(/^seg_/, "")}`,
    segment_id: segment.id,
    topic_hint: segment.topic_hint,
    salience_score: segment.salience_score,
    salience_signals: segment.salience_signals,
    candidate_eligible: eligible && kept.length > 0,
    denoised_text: denoised,
    evidence_message_ids: kept.map(({ message }) => message.id),
    dropped_message_ids: dropped.map((message) => message.id),
    estimated_tokens: estimateTokens(denoised),
  };
}

function scoreMessage(message: NormalizedMessage): number {
  const text = message.text.trim();
  if (!text || isLowValue(text)) return 0;
  let score = 0;
  if (/决定|最终|采用|选择|确认|后续|按.*实现|就这么/.test(text)) score += 3;
  if (/不对|改为|改成|不再|以后|规则|必须|需要|要给|放到|顺序|引导|配置/.test(text)) score += 3;
  if (/bug|乱码|失败|风险|不允许|不能|问题|ip|IP|pdf|PDF|生产环境/.test(text)) score += 3;
  if (/测试|测试平台|重新领|新版|上架|推送|员工|流程/.test(text)) score += 2;
  if (/npm|pnpm|git|```|命令/.test(text)) score += 2;
  if (/https?:\/\/|@|\[文件\]/.test(text)) score += 1;
  if (text.length >= 12) score += 1;
  return score;
}

function isLowValue(text: string): boolean {
  return /^(ok|OK|行|好|好的|收到|哈哈哈?|我现在也没啥事|还没完|都贼慢|\[文件\])$/.test(text.trim());
}

function isContextualConfirmation(message: NormalizedMessage): boolean {
  return /确认|可以|就这样|同意/.test(message.text) && message.text.length <= 24;
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  // 粗略估算：中文约 1.5 字/token，英文按空白词计。
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const latinWords = (text.match(/[A-Za-z0-9_+#.-]+/g) ?? []).length;
  return Math.ceil(cjk / 1.5 + latinWords);
}
