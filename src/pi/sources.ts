import { createHash } from "node:crypto";
import { convertToLlm, sessionEntryToContextMessages, type ContextWithSystemEvent, type SessionEntry } from "@earendil-works/pi-coding-agent";
import type { JsonValue } from "@earendil-works/chord";
import { normalizeMessages, type MemoryMessage } from "../memory/transcript.js";

export type HostMessage = ContextWithSystemEvent["messages"][number];
export type Source = { key: string; id: string; memory: MemoryMessage[]; original: JsonValue };
export const fingerprint = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Reasoning stays in Pi's live transcript; it never enters the memory archive or compactor. */
export function withoutThinking(message: HostMessage): HostMessage {
  return message.role === "assistant" ? { ...message, content: message.content.filter(c => c.type !== "thinking") } : message;
}

export function sourceMessages(message: HostMessage): MemoryMessage[] {
  if (message.role === "system" || message.role === "compactionSummary") return [];
  if (message.role === "bashExecution" && message.excludeFromContext) return [];
  const normalized = normalizeMessages(convertToLlm([withoutThinking(message)]));
  // Extension output and branch summaries must never acquire the authority of user instructions.
  if (message.role === "custom" || message.role === "branchSummary") return normalized.map(m => ({ ...m, kind: "note" }));
  if (message.role === "bashExecution") return normalized.map(m => ({ ...m, kind: "echo" }));
  return normalized;
}

/** Full selected ancestry, including pre-compaction originals, with explicit context edits honored. */
export function sources(entries: readonly SessionEntry[]): Source[] {
  const edits = new Map(entries.filter(e => e.type === "context_edit").map(e => [e.targetId, e.replacement]));
  return entries.flatMap(entry => {
    if (entry.type === "compaction") return [];
    const replacement = edits.get(entry.id);
    if (replacement === null) return [];
    const messages = sessionEntryToContextMessages(entry).map(message => {
      if (replacement && "content" in message) return { ...message, content: replacement.content } as HostMessage;
      return message;
    });
    const memory = messages.flatMap(sourceMessages);
    if (!memory.length) return [];
    const original = JSON.parse(JSON.stringify(messages.map(withoutThinking))) as JsonValue;
    return [{ id: entry.id, key: `${entry.id}:${fingerprint(original)}`, memory, original }];
  });
}
