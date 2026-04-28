export type NormalizedSource =
  | "feishu_chat"
  | "feishu_doc"
  | "feishu_task"
  | "meeting_minutes"
  | "cli"
  | "manual";

/**
 * Candidate Segment Pipeline 的标准输入。
 *
 * 不管原始来源是飞书群聊、文档、任务还是 CLI，进入候选片段生成前
 * 都先转成 NormalizedMessage，避免后续逻辑依赖具体平台格式。
 */
export type NormalizedMessage = {
  id: string;
  sender: string;
  text: string;
  timestamp: number;

  chat_id?: string;
  thread_id?: string;
  reply_to?: string;

  mentions: string[];
  links: string[];
  doc_tokens: string[];
  task_ids: string[];

  source: NormalizedSource;
  raw?: unknown;
};
