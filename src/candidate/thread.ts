/**
 * Conversation Disentanglement: 从线性消息流恢复讨论线程。
 *
 * 目标：把 NormalizedMessage[] 转成 ConversationThread[]，
 * 供后续自适应窗口构造使用。
 */
import type { NormalizedMessage } from "./types.js";

export type ConversationThread = {
  id: string;
  messages: NormalizedMessage[];
  topic_hint?: string;
  participants: string[];
  start_time: number;
  end_time: number;
  confidence: number; // 0-1，线程归属的置信度
};

export type ThreadingOptions = {
  max_gap_ms?: number; // 时间间隔阈值，默认 5 分钟
  overlap_tokens?: number; // topic overlap 判断的 token 数，默认 20
  use_thread_id?: boolean; // 是否优先使用飞书 thread_id
  use_reply_to?: boolean; // 是否优先使用 reply_to 链接
};

const DEFAULT_OPTIONS: Required<ThreadingOptions> = {
  max_gap_ms: 5 * 60 * 1000,
  overlap_tokens: 20,
  use_thread_id: true,
  use_reply_to: true,
};

/**
 * 将消息列表按线程分组。
 *
 * 策略（按优先级）：
 * 1. 显式 thread_id/reply_to：直接使用飞书提供的线程标识
 * 2. 时间窗口 + 参与人连续性 + topic overlap：近似恢复隐式线程
 */
export function threadMessages(
  messages: NormalizedMessage[],
  options: ThreadingOptions = {}
): ConversationThread[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);

  if (opts.use_thread_id || opts.use_reply_to) {
    return threadByExplicitLinks(sorted, opts);
  }
  return threadByHeuristics(sorted, opts);
}

function threadByExplicitLinks(
  messages: NormalizedMessage[],
  opts: Required<ThreadingOptions>
): ConversationThread[] {
  const threadMap = new Map<string, NormalizedMessage[]>();
  const idToMsg = new Map<string, NormalizedMessage>();

  // First pass: index all messages by id
  for (const m of messages) idToMsg.set(m.id, m);

  // Second pass: assign to threads
  for (const m of messages) {
    let key = m.thread_id;
    // If reply_to points to a message that has thread_id, use that thread
    if (!key && m.reply_to && opts.use_reply_to) {
      const parent = idToMsg.get(m.reply_to);
      key = parent?.thread_id || m.reply_to;
    }
    if (key) {
      const arr = threadMap.get(key) ?? [];
      arr.push(m);
      threadMap.set(key, arr);
      // Also add parent message if this is the first reply
      if (m.reply_to && !arr.some((x) => x.id === m.reply_to)) {
        const parent = idToMsg.get(m.reply_to);
        if (parent) arr.unshift(parent);
      }
    }
  }

  // Collect orphans (messages not in any thread)
  const assigned = new Set<string>();
  for (const msgs of threadMap.values()) {
    for (const m of msgs) assigned.add(m.id);
  }
  const orphans = messages.filter((m) => !assigned.has(m.id));

  const threads: ConversationThread[] = [];
  for (const [id, msgs] of threadMap) {
    // Sort by timestamp
    msgs.sort((a, b) => a.timestamp - b.timestamp);
    threads.push(buildThread(id, msgs, 0.9));
  }

  // 孤儿消息用启发式二次分组
  if (orphans.length) {
    const orphanThreads = threadByHeuristics(orphans, opts);
    threads.push(...orphanThreads);
  }

  return threads;
}

function threadByHeuristics(
  messages: NormalizedMessage[],
  opts: Required<ThreadingOptions>
): ConversationThread[] {
  const threads: ConversationThread[] = [];
  let current: NormalizedMessage[] = [];

  for (const m of messages) {
    if (current.length === 0) {
      current.push(m);
      continue;
    }
    const last = current[current.length - 1];
    const gap = m.timestamp - last.timestamp;
    const sameParticipants = m.sender === last.sender || current.some((x) => x.sender === m.sender);
    const topicOverlap = computeTopicOverlap(last.text, m.text, opts.overlap_tokens);

    // 时间间隔短且有一定语义关联（参与人重叠或主题重叠或时间极短）
    const shortGap = gap <= 60_000; // 1分钟内强关联
    const related = sameParticipants || topicOverlap > 0.2 || shortGap;
    if (gap <= opts.max_gap_ms && related) {
      current.push(m);
    } else {
      threads.push(buildThread(`heuristic_${threads.length}`, current, 0.6));
      current = [m];
    }
  }

  if (current.length) {
    threads.push(buildThread(`heuristic_${threads.length}`, current, 0.6));
  }

  return threads;
}

function buildThread(
  id: string,
  messages: NormalizedMessage[],
  confidence: number
): ConversationThread {
  const participants = Array.from(new Set(messages.map((m) => m.sender)));
  const start_time = messages[0]?.timestamp ?? 0;
  const end_time = messages[messages.length - 1]?.timestamp ?? start_time;
  const topic_hint = extractTopicHint(messages);
  return { id, messages, participants, start_time, end_time, confidence, topic_hint };
}

function computeTopicOverlap(a: string, b: string, tokenLimit: number): number {
  const tokensA = new Set(tokenize(a).slice(0, tokenLimit));
  const tokensB = tokenize(b).slice(0, tokenLimit);
  if (tokensA.size === 0 || tokensB.length === 0) return 0;
  let overlap = 0;
  for (const t of tokensB) if (tokensA.has(t)) overlap++;
  return overlap / Math.max(tokensA.size, tokensB.length);
}

function tokenize(text: string): string[] {
  // 简单分词：中文按单字，英文按单词
  const tokens: string[] = [];
  const re = /[\u4e00-\u9fa5]|[a-z0-9]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) tokens.push(m[0].toLowerCase());
  return tokens;
}

function extractTopicHint(messages: NormalizedMessage[]): string | undefined {
  // 取前两条消息的关键词作为 topic hint
  const combined = messages
    .slice(0, 2)
    .map((m) => m.text)
    .join(" ");
  const tokens = tokenize(combined);
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  const top = Array.from(freq.entries())
    .filter(([t]) => t.length > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);
  return top.length ? top.join("/") : undefined;
}
