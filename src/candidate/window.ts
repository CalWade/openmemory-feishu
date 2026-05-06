import type { NormalizedMessage } from "./types.js";
import type { ConversationThread } from "./thread.js";
import type { ScoredSegment } from "./salience.js";
import type { SourceChannel, SourceType } from "../memory/atom.js";

/**
 * 新版候选记忆窗口：围绕一个潜在决策/风险/约定的完整上下文。
 *
 * 与旧版不同，ThreadedCandidateWindow 显式区分：
 * - context_before: 决策前的讨论背景
 * - resolution_messages: 拍板/决定/确认消息
 * - context_after: 后续赞同/反对/执行
 * - noise_message_ids: 被过滤的噪声
 */
export type ThreadedCandidateWindow = {
  id: string;
  thread_id?: string;
  topic_hint?: string;

  // 时间范围
  start_time: number;
  end_time: number;

  // 消息分层
  context_before: NormalizedMessage[];
  resolution_messages: NormalizedMessage[];
  context_after: NormalizedMessage[];
  noise_message_ids: string[];

  // 证据与去噪
  evidence_message_ids: string[];
  dropped_message_ids: string[];
  denoised_text: string;

  // 信号标记
  has_resolution_cue: boolean;
  has_question_cue: boolean;
  has_conflict_cue: boolean;
  has_risk_cue: boolean;

  // 评分
  salience_score: number;
  salience_reasons: string[];
  confidence: number; // 窗口构造置信度

  // 元数据
  estimated_tokens: number;
  participant_count: number;
};

export type WindowOptions = {
  contextWindowSize?: number; // 决策前保留多少条消息，默认 5
  afterWindowSize?: number; // 决策后保留多少条消息，默认 3
  resolutionKeywords?: RegExp;
  questionKeywords?: RegExp;
  riskKeywords?: RegExp;
};

const DEFAULT_OPTIONS: Required<WindowOptions> = {
  contextWindowSize: 5,
  afterWindowSize: 3,
  resolutionKeywords: /决定|最终|采用|选择|确认|结论|拍板|就这么|统一|约定|改为|改成|不再|后续/,
  questionKeywords: /要不要|会不会|是否|为什么|怎么|如何|疑问|问题|未定|待确认|再讨论/,
  riskKeywords: /bug|风险|失败|不允许|不能|问题|乱码|生产环境|安全|漏洞|回滚/,
};

/**
 * 从 ConversationThread 构造 CandidateWindow。
 *
 * 策略：
 * 1. 识别 resolution 消息（含决策关键词）
 * 2. 向前收集 contextWindowSize 条作为背景
 * 3. 向后收集 afterWindowSize 条作为后续
 * 4. 过滤噪声（寒暄、文件占位、纯表情）
 * 5. 标记信号（resolution/question/conflict/risk）
 */
export function buildCandidateWindowFromThread(
  thread: ConversationThread,
  options: WindowOptions = {}
): ThreadedCandidateWindow {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const messages = [...thread.messages].sort((a, b) => a.timestamp - b.timestamp);

  // 识别 resolution 消息索引
  const resolutionIndices = messages
    .map((m, i) => ({ m, i, isRes: opts.resolutionKeywords.test(m.text) }))
    .filter((x) => x.isRes)
    .map((x) => x.i);

  // 如果没有明确 resolution，取中间高价值消息作为锚点
  const anchorIndex = resolutionIndices.length > 0
    ? resolutionIndices[Math.floor(resolutionIndices.length / 2)]
    : Math.floor(messages.length / 2);

  // 切分三段
  const contextStart = Math.max(0, anchorIndex - opts.contextWindowSize);
  const contextEnd = anchorIndex;
  const afterStart = anchorIndex + 1;
  const afterEnd = Math.min(messages.length, afterStart + opts.afterWindowSize);

  const context_before = messages.slice(contextStart, contextEnd);
  const resolution_messages = resolutionIndices.length > 0
    ? resolutionIndices.map((i) => messages[i]).filter(Boolean)
    : [messages[anchorIndex]];
  const context_after = messages.slice(afterStart, afterEnd);

  // 噪声过滤
  const noiseIds = messages
    .filter((m) => isNoise(m))
    .map((m) => m.id);

  // 信号检测
  const allText = messages.map((m) => m.text).join(" ");
  const has_resolution_cue = opts.resolutionKeywords.test(allText);
  const has_question_cue = opts.questionKeywords.test(allText);
  const has_risk_cue = opts.riskKeywords.test(allText);
  const has_conflict_cue = /反对|不同意|但是|不过|然而|冲突|矛盾/.test(allText);

  // 证据链 = 保留的所有消息
  const evidence = [...context_before, ...resolution_messages, ...context_after];
  const evidenceIds = evidence.map((m) => m.id);
  const dropped = messages.filter((m) => !evidenceIds.includes(m.id));

  // 去噪文本
  const denoised = evidence
    .map((m) => `${m.sender}：${m.text}`)
    .join("\n");

  // 评分
  const salience_score = computeSalience(context_before, resolution_messages, context_after, opts);
  const salience_reasons = buildSalienceReasons(context_before, resolution_messages, context_after, opts);

  return {
    id: `win_${thread.id}`,
    thread_id: thread.id,
    topic_hint: thread.topic_hint,
    start_time: messages[0]?.timestamp ?? 0,
    end_time: messages[messages.length - 1]?.timestamp ?? 0,
    context_before,
    resolution_messages,
    context_after,
    noise_message_ids: noiseIds,
    evidence_message_ids: evidenceIds,
    dropped_message_ids: dropped.map((m) => m.id),
    denoised_text: denoised,
    has_resolution_cue,
    has_question_cue,
    has_conflict_cue,
    has_risk_cue,
    salience_score,
    salience_reasons,
    confidence: thread.confidence,
    estimated_tokens: estimateTokens(denoised),
    participant_count: new Set(messages.map((m) => m.sender)).size,
  };
}

function isNoise(m: NormalizedMessage): boolean {
  const t = m.text.trim();
  if (t.length === 0) return true;
  if (/^(ok|OK|行|好|好的|收到|哈哈哈?|\[文件\]|\[图片\]|\[表情\])$/.test(t)) return true;
  if (m.links.length === 1 && t === m.links[0]) return true; // 纯链接
  return false;
}

function computeSalience(
  before: NormalizedMessage[],
  resolution: NormalizedMessage[],
  after: NormalizedMessage[],
  opts: Required<WindowOptions>
): number {
  let score = 0;
  const all = [...before, ...resolution, ...after];

  // 有 resolution 消息加分
  if (resolution.some((m) => opts.resolutionKeywords.test(m.text))) score += 3;

  // 多人参与加分
  const participants = new Set(all.map((m) => m.sender)).size;
  if (participants >= 2) score += 2;
  if (participants >= 3) score += 1;

  // 有后续确认加分
  if (after.some((m) => /同意|确认|可以|就这么/.test(m.text))) score += 2;

  // 有风险信号加分
  if (all.some((m) => opts.riskKeywords.test(m.text))) score += 2;

  // 长度适中加分
  const totalLen = all.reduce((sum, m) => sum + m.text.length, 0);
  if (totalLen > 50) score += 1;
  if (totalLen > 200) score += 1;

  return Math.min(score, 10);
}

function buildSalienceReasons(
  before: NormalizedMessage[],
  resolution: NormalizedMessage[],
  after: NormalizedMessage[],
  opts: Required<WindowOptions>
): string[] {
  const reasons: string[] = [];
  const all = [...before, ...resolution, ...after];

  if (resolution.some((m) => opts.resolutionKeywords.test(m.text))) reasons.push("包含决策/确认信号");
  if (after.some((m) => /同意|确认|可以|就这么/.test(m.text))) reasons.push("有后续确认");
  if (all.some((m) => opts.riskKeywords.test(m.text))) reasons.push("包含风险信号");
  if (all.some((m) => opts.questionKeywords.test(m.text))) reasons.push("包含问题/讨论");

  const participants = new Set(all.map((m) => m.sender)).size;
  if (participants >= 3) reasons.push("多人参与讨论");
  else if (participants >= 2) reasons.push("双方互动");

  return reasons;
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const latinWords = (text.match(/[A-Za-z0-9_+#.-]+/g) ?? []).length;
  return Math.ceil(cjk / 1.5 + latinWords);
}

// ==================== 旧版兼容 API ====================

/**
 * @deprecated 使用 ThreadedCandidateWindow 替代
 */
export type CandidateWindow = LegacyCandidateWindow;

export type LegacyCandidateWindow = {
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
  source_channel?: SourceChannel;
  source_type?: SourceType;
};

export type LegacyWindowOptions = {
  minScore?: number;
  maxMessages?: number;
};

const DEFAULT_LEGACY_MIN_SCORE = 0.45;
const DEFAULT_LEGACY_MAX_MESSAGES = 12;

/**
 * 旧版 API：将 scored segment 转成候选窗口。
 * @deprecated 使用 buildCandidateWindowFromThread 替代
 */
export function buildCandidateWindows(segments: ScoredSegment[], options: LegacyWindowOptions = {}): LegacyCandidateWindow[] {
  const minScore = options.minScore ?? DEFAULT_LEGACY_MIN_SCORE;
  const maxMessages = options.maxMessages ?? DEFAULT_LEGACY_MAX_MESSAGES;
  return segments.map((segment) => buildLegacyCandidateWindow(segment, { minScore, maxMessages }));
}

function buildLegacyCandidateWindow(segment: ScoredSegment, options: Required<LegacyWindowOptions>): LegacyCandidateWindow {
  const scoredMessages = segment.messages.map((message, index) => ({
    message,
    index,
    score: scoreMessageLegacy(message),
  }));

  const eligible = segment.salience_score >= options.minScore;
  const kept = eligible
    ? scoredMessages
      .filter(({ message, score }) => score > 0 || isContextualConfirmationLegacy(message))
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

function scoreMessageLegacy(message: NormalizedMessage): number {
  const text = message.text.trim();
  if (!text || isLowValueLegacy(text)) return 0;
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

function isLowValueLegacy(text: string): boolean {
  return /^(ok|OK|行|好|好的|收到|哈哈哈?|我现在也没啥事|还没完|都贼慢|\[文件\])$/.test(text.trim());
}

function isContextualConfirmationLegacy(message: NormalizedMessage): boolean {
  return /确认|可以|就这样|同意/.test(message.text) && message.text.length <= 24;
}
