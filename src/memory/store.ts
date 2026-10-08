import type { ConversationId, Cursor, EntryId, Tx } from "@earendil-works/pi-durable";
import { MemoryDoc, NodeDoc, RawDoc, ViewDoc, type RawReference } from "./documents.js";
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
    const view = await tx.doc(ViewDoc, conversation);
    if (view.compactor) {
      if (view.compactor.processed !== node.start)
        throw new Error("Compactor view must advance with the source index");
      view.compactor.parts.push({ start: node.start, count: 1 });
      view.compactor.processed++;
    }
  }
  const parent = { start: node.start - (node.start % (node.count * 2)), count: node.count * 2 };
  if (!state.pending.some((p) => key(p) === key(parent))) state.pending.push(parent);
}

async function availableNodes(
  tx: Tx,
  conversation: ConversationId,
  parts: readonly Address[],
  total: number,
): Promise<Map<string, Summary>> {
  const nodes = new Map<string, Summary>();
  for (const part of parts) {
    let p = { ...part };
    while (p.start + p.count <= total) {
      const k = key(p);
      if (nodes.has(k)) break;
      const node = await readNode(tx, conversation, p);
      if (node) nodes.set(k, node);
      p = { start: p.start - (p.start % (p.count * 2)), count: p.count * 2 };
    }
  }
  return nodes;
}

function rendered(parts: readonly Address[], nodes: ReadonlyMap<string, Summary>): string {
  return render(
    parts.map((p) => {
      const node = nodes.get(key(p));
      if (!node) throw new Error(`Unbuilt view node ${key(p)}`);
      return node;
    }),
  );
}

/** Append between batches; retain an unfinished low-water target across commits/restarts. */
function batch(
  parts: readonly Address[],
  nodes: ReadonlyMap<string, Summary>,
  budget: number,
  target: number | null,
) {
  const low = Math.floor(budget / 2);
  if (bytes(rendered(parts, nodes)) > budget) target = Math.min(target ?? low, low);
  const next = target === null ? [...parts] : fit(parts, nodes, target);
  const text = rendered(next, nodes);
  return { parts: next, text, target: target !== null && bytes(text) > target ? target : null };
}

export async function fitView(
  tx: Tx,
  conversation: ConversationId,
  budget: number,
): Promise<string> {
  const state = await tx.doc(MemoryDoc, conversation);
  const view = await tx.doc(ViewDoc, conversation);
  const nodes = await availableNodes(tx, conversation, state.parts, state.processed);
  const next = batch(state.parts, nodes, budget, view.target);
  if (next.parts.length !== state.parts.length) view.revision++;
  view.target = next.target;
  state.parts = next.parts;
  assertPartition(state.parts, state.processed);
  return next.text;
}

/** A persisted smaller sawtooth shared by summary jobs; source IDs stay out of the prompt. */
export async function priorContext(
  tx: Tx,
  conversation: ConversationId,
  end: number,
  budget: number,
): Promise<string> {
  const state = await tx.doc(MemoryDoc, conversation);
  if (!Number.isSafeInteger(end) || end < 0 || end > state.processed)
    throw new Error("Compactor context extends beyond completed summaries");
  const preferred = Math.floor(budget / 4);
  const view = await tx.doc(ViewDoc, conversation);
  // Seed once from the persisted main partition, and only reset after a main-view merge.
  // Never reconstruct either live view from the raw log on a turn or restart.
  if (!view.compactor || view.compactor.revision !== view.revision) {
    view.compactor = {
      parts: state.parts.map((p) => ({ ...p })),
      processed: state.processed,
      revision: view.revision,
      target: Math.floor(preferred / 2),
    };
  }
  const cache = view.compactor;
  assertPartition(cache.parts, state.processed);
  const available = await availableNodes(tx, conversation, cache.parts, state.processed);
  const next = batch(cache.parts, available, preferred, cache.target);
  cache.parts = next.parts;
  cache.target = next.target;
  const parts: Address[] = [];
  // Historical merges need an earlier prefix. Split a crossing node in this temporary
  // projection only; never put later messages or unfinished leaves in a summary's input.
  const takePrefix = (part: Address): void => {
    if (part.start >= end) return;
    if (part.start + part.count <= end) {
      parts.push({ ...part });
      return;
    }
    takePrefix({ start: part.start, count: part.count / 2 });
    takePrefix({ start: part.start + part.count / 2, count: part.count / 2 });
  };
  for (const part of cache.parts) takePrefix(part);
  assertPartition(parts, end);
  const nodes = await availableNodes(tx, conversation, parts, end);
  const fitted = fit(parts, nodes, preferred);
  const result = fitted
    .map((p) => {
      const node = nodes.get(key(p));
      if (!node) throw new Error("Compactor context contains an unfinished leaf");
      return oneLine(node.text);
    })
    .join("\n");
  // Missing parents can make the preferred quarter-budget unattainable. Keep the
  // complete summarized prefix (within the hard main budget) so the very jobs
  // needed to shrink it can run; never truncate context or invent a placeholder.
  if (bytes(`<chat>\n${result}\n</chat>`) > budget)
    throw new Error("Compactor context cannot fit; increase viewBytes or finish pending parents");
  return result;
}
