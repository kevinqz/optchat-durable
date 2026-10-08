import type { EntryRecord } from "@earendil-works/pi-durable";
import type { Message } from "@earendil-works/pi-ai";

export type MemoryMessage = { kind: string; text: string; timestamp: number };
type Content = { type: string; text?: string };
const textOf = (content: string | readonly Content[]): string => typeof content === "string" ? content
  : content.map(c => c.type === "text" ? c.text ?? "" : c.type === "thinking" ? "" : `[${c.type}: preserved in Pi entry]`).filter(Boolean).join("\n");

/** Index committed source entries, never context resets, generated summaries, or reasoning blocks. */
export function normalize(entry: EntryRecord): MemoryMessage[] {
  if (entry.kind === "optchat.source") return (entry.data as { memory: MemoryMessage[] }).memory;
  if (!["pi.user", "pi.assistant", "pi.tool-result"].includes(entry.kind)) return [];
  return normalizeMessages(entry.model ?? []);
}

export function normalizeMessages(messages: readonly Message[]): MemoryMessage[] {
  const out: MemoryMessage[] = [];
  for (const message of messages) {
    if (message.role === "user") out.push({ kind: "user", text: textOf(message.content), timestamp: message.timestamp });
    if (message.role === "assistant") {
      for (const content of message.content) {
        if (content.type === "thinking") continue;
        const status = ["error", "aborted"].includes(message.stopReason) ? ` [${message.stopReason}]` : "";
        if (content.type === "text" && content.text) out.push({ kind: "talk", text: content.text + status, timestamp: message.timestamp });
        if (content.type === "toolCall") out.push({ kind: "tool", text: `${content.name} ${JSON.stringify(content.arguments)}${status}`, timestamp: message.timestamp });
      }
    }
    if (message.role === "toolResult") out.push({ kind: "echo", text: `${message.toolName}${message.isError ? " [error]" : ""}: ${textOf(message.content)}`, timestamp: message.timestamp });
  }
  return out;
}

export function answerText(entry: EntryRecord | undefined): string {
  return (entry?.model ?? []).filter(m => m.role === "assistant").flatMap(m => m.content)
    .filter(c => c.type === "text").map(c => c.text).join("\n");
}
