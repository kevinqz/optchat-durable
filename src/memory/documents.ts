import { defineDoc, defineDocFamily, type EntryId, type TaskId } from "@earendil-works/pi-durable";
import type { Address, Summary } from "./tree.js";

export type RawReference = {
  index: number;
  entryId: EntryId;
  ordinal: number;
  kind: string;
  timestamp: number;
};
export type MemoryState = {
  count: number;
  processed: number;
  watermark: number;
  parts: Address[];
  pending: Address[];
  buildTask: TaskId | null;
  error: string | null;
};
export const MemoryDoc = defineDoc<MemoryState>({
  kind: "optchat.memory",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({
    count: 0,
    processed: 0,
    watermark: 0,
    parts: [],
    pending: [],
    buildTask: null,
    error: null,
  }),
});
/** Separate from the v1 source index: older compatibility-aware readers reject this new kind. */
export const ViewDoc = defineDoc<{
  target: number | null;
  revision: number;
  compactor: {
    parts: Address[];
    processed: number;
    revision: number;
    target: number | null;
  } | null;
}>({
  kind: "optchat.view-policy",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ target: null, revision: 0, compactor: null }),
});
export const RawDoc = defineDocFamily<RawReference, RawReference>({
  kind: "optchat.raw-reference",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  family: true,
  initial: (seed) => ({ ...seed }),
});
export const NodeDoc = defineDocFamily<{ value: Summary | null }, null>({
  kind: "optchat.node",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  family: true,
  initial: () => ({ value: null }),
});
export const QueueDoc = defineDoc<{ tail: TaskId | null; recent: string[] }>({
  kind: "optchat.queue",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ tail: null, recent: [] }),
});
export type RequestState = {
  task: TaskId | null;
  text: string;
  status: "queued" | "preparing" | "answering" | "done" | "failed" | "cancelled";
  answer: string | null;
  error: string | null;
  frozen: string | null;
  through: number | null;
  createdAt: number;
};
export const RequestDoc = defineDocFamily<RequestState, { text: string; createdAt: number }>({
  kind: "optchat.request",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  family: true,
  initial: (seed) => ({
    task: null,
    ...seed,
    status: "queued",
    answer: null,
    error: null,
    frozen: null,
    through: null,
  }),
});
