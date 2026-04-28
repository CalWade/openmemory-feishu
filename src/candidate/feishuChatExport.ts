import { normalizeMessage } from "./normalize.js";
import type { NormalizedMessage } from "./types.js";

export type NormalizeFeishuChatExportOptions = {
  docToken?: string;
  uri?: string;
  chatId?: string;
};

/**
 * 解析飞书“会话导出到云文档”的 Markdown。
 *
 * 典型格式：
 * <text color="gray">
 * 韦贺文 2026年4月17日 11:31
 * </text>没事，现在已经上架了一版了
 */
export function normalizeFeishuChatExport(markdown: string, options: NormalizeFeishuChatExportOptions = {}): NormalizedMessage[] {
  const prepared = markdown
    .replace(/\r\n/g, "\n")
    // 飞书有时会把 </text> 和消息内容放在同一行，这里强制切开，方便正则处理。
    .replace(/<\/text>/g, "</text>\n");

  const pattern = /<text\s+color="gray"[^>]*>\s*([\s\S]*?)\s*<\/text>\s*\n?([\s\S]*?)(?=\n\s*<text\s+color="gray"|$)/g;
  const messages: NormalizedMessage[] = [];
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(prepared)) !== null) {
    const meta = cleanText(match[1]);
    const body = cleanMessageBody(match[2]);
    const parsed = parseMeta(meta);
    if (!parsed || !body) continue;

    messages.push(normalizeMessage({
      text: body,
      sender: parsed.sender,
      timestamp: parsed.timestamp,
      source: "feishu_chat",
      chat_id: options.chatId,
      raw: {
        docToken: options.docToken,
        uri: options.uri,
        exportIndex: index++,
        rawMeta: meta,
      },
    }));
  }

  return messages;
}

export function parseFeishuChatMeta(meta: string): { sender: string; timestamp: number } | undefined {
  return parseMeta(meta);
}

function parseMeta(meta: string): { sender: string; timestamp: number } | undefined {
  const compact = cleanText(meta);
  const match = compact.match(/^(.+?)\s+(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const [, sender, year, month, day, hour, minute] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0,
  );
  return { sender: sender.trim(), timestamp: date.getTime() };
}

function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMessageBody(text: string): string {
  return text
    .replace(/<image\s+[^>]*\/>/g, "[图片]")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("> 查看原消息记录"))
    .join("\n")
    .trim();
}
