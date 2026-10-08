import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ConversationId, type Tx } from "@earendil-works/pi-durable";
import { MemoryDoc, NodeDoc } from "./documents.js";
import { reference } from "./tasks.js";
import { rawText } from "./store.js";
import { key, pageText, validAddress } from "./tree.js";

export async function readDate(tx: Tx, conversation: ConversationId, index: number) {
  const memory = await tx.doc(MemoryDoc, conversation);
  if (!Number.isSafeInteger(index) || index < 0 || index >= memory.count) throw new Error("Unknown memory message");
  return (await reference(tx, conversation, index)).timestamp;
}

export async function zoom(tx: Tx, conversation: ConversationId, start: number, count: number, offset = 0, limit = 24_000) {
  const memory = await tx.doc(MemoryDoc, conversation);
  if (!validAddress(start, count) || start + count > (count === 1 ? memory.count : memory.processed)) throw new Error("Unknown or unbuilt memory address");
  if (count === 1) {
    const ref = await reference(tx, conversation, start);
    const source = await tx.entry(ref.entryId);
    return { address: `${start}+1`, sourceEntry: ref.entryId, timestamp: new Date(ref.timestamp).toISOString(),
      ...(source?.kind === "optchat.source" ? { piEntryId: (source.data as { id: string }).id } : {}),
      ...pageText(await rawText(tx, ref), offset, limit) };
  }
  const children = [];
  for (const at of [start, start + count / 2]) {
    const address = { start: at, count: count / 2 };
    const node = (await tx.doc(NodeDoc, conversation, key(address), null)).value;
    if (!node) throw new Error(`Unbuilt child ${key(address)}`);
    children.push({ address: key(address), text: node.text });
  }
  return { address: `${start}+${count}`, children };
}

export async function search(tx: Tx, conversation: ConversationId, query: string, from = 0) {
  const memory = await tx.doc(MemoryDoc, conversation);
  if (!query.trim() || query.length > 200 || !Number.isSafeInteger(from) || from < 0) throw new Error("Invalid search");
  const matches = [];
  const end = Math.min(memory.count, from + 250);
  let next = from;
  for (; next < end && matches.length < 20; next++) {
    const ref = await reference(tx, conversation, next);
    const text = await rawText(tx, ref);
    const at = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
    if (at >= 0) matches.push({ address: `${next}+1`, sourceEntry: ref.entryId, snippet: text.slice(Math.max(0, at - 80), at + 180) });
  }
  return { matches, next: next < memory.count ? next : null, scanned: next - from, total: memory.count };
}

export function memoryTools() {
  return [
    defineTool({
      name: "zoom", description: "Expand an OptChat start+count binary interval into its children; count=1 reads the original message. Read further pages with the returned next byte offset.", replay: "safe",
      parameters: Type.Object({ start: Type.Integer({ minimum: 0 }), count: Type.Integer({ minimum: 1 }), offset: Type.Optional(Type.Integer({ minimum: 0 })) }),
      execute: async (args, api, context) => ({ content: [{ type: "text", text: JSON.stringify(await api.commit(tx => zoom(tx, api.conversationId, args.start, args.count, args.offset), context)) }] }),
    }),
    defineTool({
      name: "date", description: "Get the original timestamp of memory message index, or the current time when index is absent.", replay: "safe",
      parameters: Type.Object({ index: Type.Optional(Type.Integer({ minimum: 0 })) }),
      execute: async (args, api, context) => {
        const timestamp = args.index === undefined
          ? await api.memo("timestamp", Date.now(), context)
          : await api.commit(tx => readDate(tx, api.conversationId, args.index!), context);
        return { content: [{ type: "text", text: new Date(timestamp).toISOString() }] };
      },
    }),
    defineTool({
      name: "search", description: "Search original memory text independently of lossy summaries. Continue from next until null to search the entire history.", replay: "safe",
      parameters: Type.Object({ query: Type.String({ minLength: 1, maxLength: 200 }), from: Type.Optional(Type.Integer({ minimum: 0 })) }),
      execute: async (args, api, context) => ({ content: [{ type: "text", text: JSON.stringify(await api.commit(tx => search(tx, api.conversationId, args.query, args.from), context)) }] }),
    }),
  ];
}
