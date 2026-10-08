import { defineDoc, defineDocFamily, type ConversationId, type EntryId, type Tx } from "@earendil-works/pi-durable";
import type { Context, JsonValue } from "@earendil-works/chord";
import type { OptChatApp } from "../app.js";
import { MemoryDoc, RawDoc, type RawReference } from "../memory/documents.js";
import { fitView, publishNode, readNode } from "../memory/store.js";
import { bytes, type Summary } from "../memory/tree.js";
import { reference } from "../memory/tasks.js";
import { fingerprint, withoutThinking, sourceMessages, type Source, type HostMessage } from "./sources.js";

type SourceIndex = { key: string; entry: EntryId; through: number };
const Branches = defineDoc<{ branches: ConversationId[] }>({ kind: "optchat.pi.branches", version: 1, scope: "session", initial: () => ({ branches: [] }) });
const Sources = defineDoc<{ items: SourceIndex[] }>({ kind: "optchat.pi.sources", version: 1, scope: "conversation", history: "latest", fork: "initial", initial: () => ({ items: [] }) });
const Journal = defineDocFamily<{ entry: EntryId | null }, null>({ kind: "optchat.pi.journal-index", version: 1, scope: "session", family: true, initial: () => ({ entry: null }) });
export type FrozenView = { conversation: ConversationId; view: string; through: number };
type Receipt = FrozenView & { prefix: string };
export const FrozenViews = defineDocFamily<Receipt, Receipt>({
  kind: "optchat.pi.view", version: 1, scope: "session", family: true, initial: value => ({ ...value }),
});

function common(a: readonly SourceIndex[], b: readonly Source[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i]!.key === b[i]!.key) i++;
  return i;
}

/** Branch on immutable native entries. Reuse only summaries wholly inside the common prefix. */
async function capturePrefix(tx: Tx, from: ConversationId, count: number) {
  const raw: RawReference[] = [];
  const nodes: Summary[] = [];
  for (let index = 0; index < count; index++) raw.push({ ...await reference(tx, from, index) });
  let processed = 0;
  for (let start = 0; start < count; start++) {
    const leaf = await readNode(tx, from, { start, count: 1 });
    if (!leaf) break;
    nodes.push({ ...leaf }); processed++;
  }
  for (let size = 2; size <= processed; size *= 2) {
    for (let start = 0; start + size <= processed; start += size) {
      const node = await readNode(tx, from, { start, count: size });
      if (node) nodes.push({ ...node });
    }
  }
  return { raw, nodes };
}

/** Memory only: this client never submits a main model request or executes a host tool. */
export class PiMemoryArchive {
  constructor(readonly app: OptChatApp) {}

  async record(message: HostMessage, parent: string | null) {
    if (!sourceMessages(message).length) return;
    const original = JSON.parse(JSON.stringify(withoutThinking(message))) as JsonValue;
    await this.app.root.commit(async tx => {
      const receipt = await tx.doc(Journal, fingerprint({ parent, original }), null);
      if (!receipt.entry) receipt.entry = (await tx.appendEntry(this.app.root.id, {
        kind: "optchat.pi.journal", data: { parent, original },
      })).id;
    }, this.app.context);
  }

  async select(input: readonly Source[]) {
    const id = await this.app.root.commit(async tx => {
      const branches = await tx.doc(Branches);
      let best = this.app.root.id;
      let matched = -1;
      let previous: SourceIndex[] = [];
      for (const id of branches.branches) {
        const items = (await tx.doc(Sources, id)).items;
        const length = common(items, input);
        if (length > matched || (length === matched && items.length === length)) { best = id; matched = length; previous = items; }
        if (length === input.length && length === items.length) break;
      }
      if (!branches.branches.length) branches.branches.push(best);
      if (matched < 0) matched = 0;
      if (matched < previous.length) {
        // Pi Durable requires all table reads before the first table write. Read
        // immutable prefix references first, then publish the fork and its index atomically.
        const count = previous[matched - 1]?.through ?? 0;
        const prefix = await capturePrefix(tx, best, count);
        const fork = matched
          ? await tx.forkConversation(best, previous[matched - 1]!.entry, { ownership: { kind: "ownerless" } })
          : await tx.createConversation({ ownership: { kind: "ownerless" } });
        const state = await tx.doc(Sources, fork.id);
        state.items = previous.slice(0, matched).map(x => ({ ...x }));
        const memory = await tx.doc(MemoryDoc, fork.id);
        memory.count = count;
        memory.watermark = previous[matched - 1]?.entry ?? 0;
        for (const ref of prefix.raw) await tx.doc(RawDoc, fork.id, String(ref.index), ref);
        for (const node of prefix.nodes) await publishNode(tx, fork.id, node);
        await fitView(tx, fork.id, this.app.config.viewBytes);
        best = fork.id;
        branches.branches.push(best);
      }
      const state = await tx.doc(Sources, best);
      const memory = await tx.doc(MemoryDoc, best);
      let through = state.items.at(-1)?.through ?? 0;
      for (const source of input.slice(matched)) {
        const entry = await tx.appendEntry(best, { kind: "optchat.source", data: source });
        for (const [ordinal, message] of source.memory.entries()) {
          const index = memory.count++;
          await tx.doc(RawDoc, best, String(index), { index, entryId: entry.id, ordinal, kind: message.kind, timestamp: message.timestamp });
        }
        memory.watermark = entry.id;
        through += source.memory.length;
        state.items.push({ key: source.key, entry: entry.id, through });
      }
      return best;
    }, this.app.context);
    const conversation = await this.app.harness.conversation(id, this.app.context);
    if (!conversation) throw new Error("Missing Pi memory branch");
    return this.app.forConversation(conversation);
  }

  async freeze(input: readonly Source[], request: string, context: Context, budget = this.app.config.viewBytes, signal?: AbortSignal): Promise<FrozenView> {
    const prefix = fingerprint(input.map(s => s.key));
    const saved = await this.app.harness.snapshot(FrozenViews, request, context);
    if (saved) {
      if (saved.prefix !== prefix) throw new Error("This turn's historical sources changed; submit a new message to rebuild memory");
      return { conversation: saved.conversation, view: saved.view, through: saved.through };
    }
    const controller = await this.select(input);
    try { await controller.settleMemory(context); }
    catch (error) { if (signal?.aborted) await controller.cancelMemory(); throw error; }
    return controller.root.commit(async tx => {
      const memory = await tx.doc(MemoryDoc, controller.root.id);
      const view = await fitView(tx, controller.root.id, budget);
      if (memory.processed !== memory.count || bytes(view) > budget) throw new Error("OptChat memory is not complete within its budget");
      const receipt = await tx.doc(FrozenViews, request, { prefix, conversation: controller.root.id, view, through: memory.count });
      return { conversation: controller.root.id, view: receipt.view, through: receipt.through };
    }, context);
  }
}
