import type { ConversationId, Cursor, EntryId, Tx } from "@earendil-works/pi-durable";
import { MemoryDoc, NodeDoc, RawDoc, type RawReference } from "./documents.js";
import { normalize } from "./transcript.js";
import {
  assertPartition,
  bytes,
  fit,
  key,
  oneLine,
  render,
  type Address,
  type Summary,
} from "./tree.js";

/** Read a source reference without depending on the summarization task definitions. */
export async function reference(tx: Tx, conversation: ConversationId, index: number) {
  const ref = await tx.doc(RawDoc, conversation, String(index), {
    index,
    entryId: 0 as EntryId,
    ordinal: 0,
    kind: "",
    timestamp: 0,
  });
  if (ref.entryId === 0) throw new Error(`Missing memory source ${index}`);
  return ref;
}

export async function ingest(tx: Tx, conversation: ConversationId): Promise<void> {
  const state = await tx.doc(MemoryDoc, conversation);
  const entries = [];
  let cursor: Cursor | undefined;
  do {
    const page = await tx.scanEntries(
      { conversationId: conversation, minEntryId: (state.watermark + 1) as EntryId },
      256,
      cursor,
    );
    entries.push(...page.items);
    cursor = page.next;
  } while (cursor);
  for (const entry of entries.reverse()) {
    for (const [ordinal, message] of normalize(entry).entries()) {
      const index = state.count++;
      await tx.doc(RawDoc, conversation, String(index), {
        index,
        entryId: entry.id,
        ordinal,
        kind: message.kind,
        timestamp: message.timestamp,
      });
    }
    state.watermark = Math.max(state.watermark, entry.id);
  }
}

export async function rawText(tx: Tx, ref: RawReference): Promise<string> {
  const entry = await tx.entry(ref.entryId);
  const message = entry && normalize(entry)[ref.ordinal];
  if (!message) throw new Error(`Source missing for memory message ${ref.index}`);
  return `${message.kind}: ${message.text}`;
}

export async function readNode(
  tx: Tx,
  conversation: ConversationId,
  address: Address,
): Promise<Summary | null> {
  return (await tx.doc(NodeDoc, conversation, key(address), null)).value;
}

export async function publishNode(
  tx: Tx,
  conversation: ConversationId,
  node: Summary,
): Promise<void> {
  const doc = await tx.doc(NodeDoc, conversation, key(node), null);
  if (doc.value) return;
  doc.value = node;
  const state = await tx.doc(MemoryDoc, conversation);
  if (node.count === 1) {
    if (state.processed !== node.start)
      throw new Error("Leaf summaries must commit in chronological order");
    state.processed++;
    state.parts.push({ start: node.start, count: 1 });
  }
  const parent = { start: node.start - (node.start % (node.count * 2)), count: node.count * 2 };
  if (!state.pending.some((p) => key(p) === key(parent))) state.pending.push(parent);
}

export async function fitView(
  tx: Tx,
  conversation: ConversationId,
  budget: number,
): Promise<string> {
  const state = await tx.doc(MemoryDoc, conversation);
  const nodes = new Map<string, Summary>();
  for (const part of state.parts) {
    let p = { ...part };
    while (p.start + p.count <= state.processed) {
      const k = key(p);
      if (nodes.has(k)) break;
      const node = await readNode(tx, conversation, p);
      if (node) nodes.set(k, node);
      p = { start: p.start - (p.start % (p.count * 2)), count: p.count * 2 };
    }
  }
  state.parts = fit(state.parts, nodes, budget);
  assertPartition(state.parts, state.processed);
  return render(
    state.parts.map((p) => {
      const node = nodes.get(key(p));
      if (!node) throw new Error(`Unbuilt view node ${key(p)}`);
      return node;
    }),
  );
}

/** Prior context has summaries only and no addresses. Does not change the agent's persisted view. */
export async function priorContext(
  tx: Tx,
  conversation: ConversationId,
  end: number,
  budget: number,
): Promise<string> {
  const state = await tx.doc(MemoryDoc, conversation);
  const parts: Address[] = [];
  // Preserve the CURRENT view's useful resolution. Split a crossing part only in this temporary
  // prefix projection; the persisted main view is never split or recomputed.
  const takePrefix = (part: Address): void => {
    if (part.start >= end) return;
    if (part.start + part.count <= end) {
      parts.push({ ...part });
      return;
    }
    takePrefix({ start: part.start, count: part.count / 2 });
    takePrefix({ start: part.start + part.count / 2, count: part.count / 2 });
  };
  for (const part of state.parts) takePrefix(part);
  assertPartition(parts, end);
  const nodes = new Map<string, Summary>();
  for (const part of parts) {
    let address = { ...part };
    while (address.start + address.count <= end) {
      if (nodes.has(key(address))) break;
      const node = await readNode(tx, conversation, address);
      if (node) nodes.set(key(address), node);
      address = {
        start: address.start - (address.start % (address.count * 2)),
        count: address.count * 2,
      };
    }
  }
  const fitted = fit(parts, nodes, budget);
  const result = fitted
    .map((p) => {
      const node = nodes.get(key(p));
      if (!node) throw new Error("Compactor context contains an unfinished leaf");
      return oneLine(node.text);
    })
    .join("\n");
  if (bytes(result) > budget)
    throw new Error("Compactor context cannot fit; increase viewBytes or finish pending parents");
  return result;
}
