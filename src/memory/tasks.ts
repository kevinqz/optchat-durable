import {
  configure, defineTask, type ConversationId, type EntryId, type TaskId, type Tx,
} from "@earendil-works/pi-durable";
import type { OptChatConfig } from "../config.js";
import { COMPACTOR_PROMPT, COMPACTOR_SCALE } from "../prompts.js";
import { MemoryDoc, RawDoc } from "./documents.js";
import { fitView, ingest, priorContext, publishNode, rawText, readNode } from "./store.js";
import { answerText } from "./transcript.js";
import { bytes, key, oneLine, pageText, type Address } from "./tree.js";

type NodeState = { phase: "prepare" } | {
  phase: "ask"; child: ConversationId; prompt: { type: "text"; text: string }[]; attempt: number; failures: number;
  best: string | null; feedback: string; retryAt: number;
};
type BuildState = { phase: "step"; revision: number } | { phase: "check"; children: TaskId[] };
const completed = { status: "terminal", outcome: { status: "completed", result: {} } } as const;
const aborted = { status: "terminal", outcome: { status: "aborted" } } as const;

export async function reference(tx: Tx, conversation: ConversationId, index: number) {
  const ref = await tx.doc(RawDoc, conversation, String(index), {
    index, entryId: 0 as EntryId, ordinal: 0, kind: "", timestamp: 0,
  });
  if (ref.entryId === 0) throw new Error(`Missing memory source ${index}`);
  return ref;
}

export function createMemoryTasks(config: OptChatConfig) {
  const NodeTask = defineTask<Address, NodeState, Record<string, never>>({
    name: "optchat.summarize", version: 1, initial: () => ({ phase: "prepare" }),
    phases: {
      prepare: async (task, api, context) => {
        await api.commit(async tx => {
          const { start, count } = task.input;
          let target: string;
          if (count === 1) target = await rawText(tx, await reference(tx, task.conversationId, start));
          else {
            const left = await readNode(tx, task.conversationId, { start, count: count / 2 });
            const right = await readNode(tx, task.conversationId, { start: start + count / 2, count: count / 2 });
            if (!left || !right) throw new Error("Parent started before both children were built");
            target = `${oneLine(left.text)}\n${oneLine(right.text)}`;
          }
          const previous = await priorContext(tx, task.conversationId, count === 1 ? start : start + count, config.viewBytes);
          const prompt: { type: "text"; text: string }[] = [
            { type: "text", text: `<chat>\n${previous}\n</chat>` },
            { type: "text", text: `For scale, this realistic example has exactly 512 UTF-8 bytes:\n${COMPACTOR_SCALE}\n\n${count === 1 ? "Compress this complete message" : "Merge these two summaries"} into one line of at most ${config.nodeBytes} UTF-8 bytes:\n<target>\n${target}\n</target>` },
          ];
          const child = await tx.createConversation({ ownership: { kind: "task", taskId: task.id } });
          await configure(tx, child.id, { model: config.compactor, extensions: [], tools: [], instructions: COMPACTOR_PROMPT, thinkingLevel: "medium" });
          return { status: "running", checkpoint: { phase: "ask", child: child.id, prompt, attempt: 0, failures: 0, best: null, feedback: "", retryAt: 0 } };
        }, context);
      },
      ask: async (task, api, context) => {
        const state = task.state.checkpoint;
        if (state.retryAt) await api.sleep(state.retryAt, context);
        const child = await api.conversation(state.child, context);
        if (!child) throw new Error("Missing compactor conversation");
        const receipt = await (await child.submit({
          type: "input", content: state.attempt === 0 && state.failures === 0 ? state.prompt : state.feedback || state.prompt,
          requestId: `node:${task.id}:${state.attempt}:${state.failures}`, whenBusy: "reject",
        }, context)).wait(context);
        await api.commit(async tx => {
          if (receipt.status !== "done") {
            const failures = state.failures + 1;
            const error = `Compactor did not answer ${key(task.input)}: ${receipt.reason}`;
            if (failures >= config.failureTries) return { status: "terminal", outcome: { status: "failed", error: { message: error } } };
            return { status: "running", checkpoint: { ...state, failures, retryAt: api.now() + config.retryMs, feedback: "The previous attempt failed. Please summarize the original target now." } };
          }
          if (receipt.type !== "input" || !receipt.answer) throw new Error("Missing summary answer entry");
          const text = oneLine(answerText(await tx.entry(receipt.answer)));
          const best = text && (!state.best || bytes(text) < bytes(state.best)) ? text : state.best;
          const attempt = state.attempt + 1;
          if (best && (bytes(best) <= config.nodeBytes || attempt >= config.sizeTries)) {
            await publishNode(tx, task.conversationId, { ...task.input, text: best, method: "model", oversized: bytes(best) > config.nodeBytes });
            return completed;
          }
          if (attempt >= config.sizeTries) return { status: "terminal", outcome: { status: "failed", error: { message: `Empty summary for ${key(task.input)}` } } };
          // This excerpt is SIZE FEEDBACK only, never a published summary or memory fallback.
          const prefix = text ? pageText(text, 0, Math.max(4, config.nodeBytes)).text : "(empty)";
          return { status: "running", checkpoint: { ...state, attempt, best, retryAt: 0,
            feedback: `Your summary has ${bytes(text)} UTF-8 bytes. Target: ${config.nodeBytes}. The prefix that fits is:\n${prefix}\nRewrite the complete original target more concisely; do not merely truncate. Return only the summary.` } };
        }, context);
      },
    },
    abort: async (_task, api, context) => { await api.commit(() => aborted, context); },
  });

  const BuildTask = defineTask<Record<string, never>, BuildState, Record<string, never>>({
    name: "optchat.build-memory", version: 1, initial: () => ({ phase: "step", revision: 0 }),
    phases: {
      step: async (task, api, context) => {
        await api.commit(async tx => {
          await ingest(tx, task.conversationId);
          const memory = await tx.doc(MemoryDoc, task.conversationId);
          const work: Address[] = [];
          // Leaves are built sequentially. Small messages are lossless and incur no model call.
          for (let n = 0; n < Math.max(1, Math.min(64, Math.floor(config.viewBytes / config.nodeBytes / 4))) && memory.processed < memory.count; n++) {
            const address = { start: memory.processed, count: 1 };
            const text = await rawText(tx, await reference(tx, task.conversationId, address.start));
            if (bytes(text) > config.nodeBytes) { work.push(address); break; }
            await publishNode(tx, task.conversationId, { ...address, text, method: "verbatim", oversized: false });
          }
          // Nodes are immutable. A ready parent can run in parallel with the next leaf and other parents.
          const pending = memory.pending.map(p => ({ ...p }));
          const keep: Address[] = [];
          for (const address of pending) {
            if (await readNode(tx, task.conversationId, address)) continue;
            keep.push(address);
            if (work.length >= config.jobs || address.start + address.count > memory.processed) continue;
            const left = await readNode(tx, task.conversationId, { start: address.start, count: address.count / 2 });
            const right = await readNode(tx, task.conversationId, { start: address.start + address.count / 2, count: address.count / 2 });
            if (!left || !right) continue;
            const text = `${left.text}\n${right.text}`;
            if (bytes(text) <= config.nodeBytes) await publishNode(tx, task.conversationId, { ...address, text, method: "concat", oversized: false });
            else work.push(address);
          }
          // publishNode may have queued new ancestors while processing the snapshot.
          const additions = memory.pending.filter(p => !pending.some(q => key(q) === key(p)));
          memory.pending = [...keep, ...additions];
          const view = await fitView(tx, task.conversationId, config.viewBytes);
          if (work.length) {
            const children: TaskId[] = [];
            for (const address of work) children.push(await tx.createTask(NodeTask, address, { ownership: { kind: "task", taskId: task.id } }));
            return { status: "waiting", checkpoint: { phase: "check", children }, on: children, policy: "allSettled" };
          }
          if (memory.processed < memory.count || memory.pending.some(p => p.start + p.count <= memory.processed)) {
            return { status: "running", checkpoint: { phase: "step", revision: task.state.checkpoint.revision + 1 } };
          }
          if (bytes(view) > config.viewBytes) {
            memory.error = `Memory view is ${bytes(view)} bytes; budget is ${config.viewBytes}. No complete merge can make it fit.`;
            return { status: "terminal", outcome: { status: "failed", error: { message: memory.error } } };
          }
          memory.error = null;
          return completed;
        }, context);
      },
      check: async (task, api, context) => {
        const outcomes = await api.outcomes(task.state.checkpoint.children, context);
        const failed = outcomes.find(o => o.status !== "completed");
        await api.commit(async tx => {
          if (failed) {
            const error = "error" in failed && failed.error ? failed.error.message : `Summary task ${failed.status}`;
            (await tx.doc(MemoryDoc, task.conversationId)).error = error;
            return { status: "terminal", outcome: { status: "failed", error: { message: error } } };
          }
          return { status: "running", checkpoint: { phase: "step", revision: 0 } };
        }, context);
      },
    },
    abort: async (_task, api, context) => { await api.commit(() => aborted, context); },
  });

  async function ensureBuild(tx: Tx, conversation: ConversationId): Promise<TaskId> {
    const memory = await tx.doc(MemoryDoc, conversation);
    const previous = memory.buildTask && await tx.task(memory.buildTask);
    if (previous && previous.state.status !== "terminal") return previous.id;
    memory.error = null;
    const id = await tx.createTask(BuildTask, {}, { ownership: { kind: "conversation" }, conversationId: conversation, background: true });
    memory.buildTask = id;
    return id;
  }
  return { NodeTask, BuildTask, ensureBuild };
}
