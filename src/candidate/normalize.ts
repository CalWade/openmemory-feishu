import { createHash } from "node:crypto";
import type { NormalizedMessage, NormalizedSource } from "./types.js";

export type NormalizeTextOptions = {
  source?: NormalizedSource;
  sender?: string;
  baseTimestamp?: number;
  intervalMs?: number;
  chatId?: string;
  threadId?: string;
};

/**
 * 将纯文本按非空行转为标准消息。
 *
 * 支持两种简单输入：
 * - "张三：最终决定用 PostgreSQL"
 * - "最终决定用 PostgreSQL"（sender 默认为 unknown）
 */
export function normalizeTextLines(text: string, options: NormalizeTextOptions = {}): NormalizedMessage[] {
  const baseTimestamp = options.baseTimestamp ?? Date.now();
  const intervalMs = options.intervalMs ?? 60_000;
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parsed = parseSpeakerLine(line);
      const messageText = parsed.text.trim();
      const timestamp = baseTimestamp + index * intervalMs;
      return normalizeMessage({
        text: messageText,
        sender: parsed.sender ?? options.sender ?? "unknown",
        timestamp,
        source: options.source ?? "manual",
        chat_id: options.chatId,
        thread_id: options.threadId,
        raw: line,
      });
    });
}

export function normalizeMessage(input: {
  text: string;
  sender: string;
  timestamp: number;
  source: NormalizedSource;
  chat_id?: string;
  thread_id?: string;
  reply_to?: string;
  raw?: unknown;
}): NormalizedMessage {
  const links = extractLinks(input.text);
  return {
    id: makeMessageId(input),
    sender: input.sender,
    text: input.text,
    timestamp: input.timestamp,
    chat_id: input.chat_id,
    thread_id: input.thread_id,
    reply_to: input.reply_to,
    mentions: extractMentions(input.text),
    links,
    doc_tokens: extractDocTokens(links),
    task_ids: extractTaskIds(input.text),
    source: input.source,
    raw: input.raw,
  };
}

function parseSpeakerLine(line: string): { sender?: string; text: string } {
  // 飞书中文语境里常见格式是“张三：内容”。
  // 英文冒号只在冒号后有空白时视为说话人分隔，避免把 https:// 误判为分隔符。
  const zhMatch = line.match(/^([^:：]{1,32})：\s*(.+)$/);
  if (zhMatch) return { sender: zhMatch[1].trim(), text: zhMatch[2] };
  const enMatch = line.match(/^([^:：]{1,32}):\s+(.+)$/);
  if (enMatch) return { sender: enMatch[1].trim(), text: enMatch[2] };
  return { text: line };
}

function extractMentions(text: string): string[] {
  const matches = text.match(/@[\p{L}\p{N}_\-\u4e00-\u9fa5]+/gu) ?? [];
  return [...new Set(matches.map((item) => item.slice(1)))];
}

function extractLinks(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)）]+/g) ?? [];
  return [...new Set(matches)];
}

function extractDocTokens(links: string[]): string[] {
  const tokens: string[] = [];
  for (const link of links) {
    const match = link.match(/\/(?:docx|wiki|docs|sheets|base)\/([A-Za-z0-9]+)/);
    if (match) tokens.push(match[1]);
  }
  return [...new Set(tokens)];
}

function extractTaskIds(text: string): string[] {
  const matches = text.match(/(?:task|任务)[:：#-]?([A-Za-z0-9_\-]{4,})/gi) ?? [];
  return [...new Set(matches.map((item) => item.replace(/^(?:task|任务)[:：#-]?/i, "")))];
}

function makeMessageId(input: { text: string; sender: string; timestamp: number; source: NormalizedSource }) {
  const hash = createHash("sha256")
    .update(`${input.source}|${input.sender}|${input.timestamp}|${input.text}`)
    .digest("hex")
    .slice(0, 16);
  return `msg_${hash}`;
}
