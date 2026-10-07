import { randomUUID } from "node:crypto";
import type { Context } from "@earendil-works/chord";
import { LiveDoc, type Conversation, type Cursor, type Harness, type TaskId } from "@earendil-works/pi-durable";
import type { OptChatConfig } from "./config.js";
import { MemoryDoc, NodeDoc, QueueDoc, RequestDoc } from "./memory/documents.js";
import type { createMemoryTasks } from "./memory/tasks.js";
import { search, zoom } from "./memory/tools.js";
import { bytes, key, render } from "./memory/tree.js";
import { normalize } from "./memory/transcript.js";
import type { createRequestTask, RequestResult } from "./request-task.js";

/** A conversation-scoped client; the host retains ownership of the harness and storage. */
export function createController(config: OptChatConfig, harness: Harness, root: Conversation, context: Context,
  memoryTasks: ReturnType<typeof createMemoryTasks>, RequestTask: ReturnType<typeof createRequestTask>): OptChatController {
  return { harness, root, context, ...createOperations(config, harness, root, context, memoryTasks, RequestTask) };
}

function createOperations(config: OptChatConfig, harness: Harness, root: Conversation, context: Context,
  memoryTasks: ReturnType<typeof createMemoryTasks>, RequestTask: ReturnType<typeof createRequestTask>) {
  const operations = {
    async enqueue(text: string, requestId: string = randomUUID()): Promise<{ requestId: string; taskId: TaskId<RequestResult> }> {
      if (!text.trim() || bytes(text) > config.maxInputBytes) throw new Error(`Message must be nonempty and at most ${config.maxInputBytes} UTF-8 bytes`);
      if (!/^[\w:-]{1,128}$/.test(requestId)) throw new Error("Invalid request ID");
      const createdAt = Date.now();
      const taskId = await root.commit(async tx => {
        const request = await tx.doc(RequestDoc, root.id, requestId, { text, createdAt });
        if (request.text !== text) throw new Error("Request ID already belongs to different text");
        if (request.task) return request.task as TaskId<RequestResult>;
        const queue = await tx.doc(QueueDoc, root.id);
        const task = await tx.createTask(RequestTask, { requestId, text, createdAt, previous: queue.tail }, { ownership: { kind: "conversation" }, background: true });
        request.task = task;
        queue.tail = task;
        queue.recent = [...queue.recent, requestId].slice(-50);
        return task;
      }, context);
      harness.resume();
      return { requestId, taskId };
    },
    async wait(taskId: TaskId<RequestResult>): Promise<RequestResult> {
      const result = (await harness.waitForTask(taskId, context)).state.outcome;
      if (result.status !== "completed") throw new Error("error" in result && result.error ? result.error.message : `Request ${result.status}`);
      return result.result;
    },
    async cancel(requestId: string) {
      const request = await harness.snapshot(RequestDoc, root.id, requestId, context);
      if (!request?.task) throw new Error("Unknown request");
      return harness.abortTask(request.task, context);
    },
    async settleMemory() {
      const id = await root.commit(tx => memoryTasks.ensureBuild(tx, root.id), context);
      const task = await harness.waitForTask(id, context);
      if (task.state.outcome.status !== "completed") throw new Error(JSON.stringify(task.state.outcome));
    },
    async request(requestId: string) { return harness.snapshot(RequestDoc, root.id, requestId, context); },
    async zoom(start: number, count: number, offset = 0) { return root.commit(tx => zoom(tx, root.id, start, count, offset), context); },
    async search(query: string, from = 0) { return root.commit(tx => search(tx, root.id, query, from), context); },
    async history(cursor?: Cursor) {
      const page = await root.entries({}, 100, cursor, context);
      return { items: [...page.items].reverse().flatMap(e => normalize(e).map(m => ({ ...m, entryId: e.id }))), next: page.next };
    },
    async status() {
      const [memory, queue, live, usage, inspection] = await Promise.all([
        harness.snapshot(MemoryDoc, root.id, context), harness.snapshot(QueueDoc, root.id, context),
        harness.snapshot(LiveDoc, root.id, context), harness.usage(context), harness.inspect(context),
      ]);
      const nodes = await Promise.all((memory?.parts ?? []).map(p => harness.snapshot(NodeDoc, root.id, key(p), context)));
      const view = render(nodes.flatMap(n => n?.value ? [n.value] : []));
      const requests = await Promise.all((queue?.recent ?? []).map(async id => {
        const request = await harness.snapshot(RequestDoc, root.id, id, context);
        if (!request) return null;
        const { frozen, ...rest } = request;
        const task = request.task ? await harness.getTask(request.task, context) : undefined;
        const fault = task?.state.status === "terminal" && task.state.outcome.status === "faulted" ? task.state.outcome.error.message : null;
        return { id, ...rest, status: fault ? "failed" : request.status, error: fault ?? request.error, frozenBytes: frozen ? bytes(frozen) : null };
      }));
      return { model: config.main, compactor: config.compactor,
        memory: { messages: memory?.count ?? 0, summarized: memory?.processed ?? 0, parts: memory?.parts.length ?? 0,
          view, viewBytes: bytes(view), budget: config.viewBytes, error: memory?.error ?? null },
        requests: requests.filter(r => r !== null), live, usage, tasks: inspection.tasks.length };
    },
  };
  return {
    ...operations,
    /** Enqueue and await one reply using the same durable/idempotent path as the lower-level API. */
    async prompt(text: string, requestId?: string): Promise<RequestResult> {
      return operations.wait((await operations.enqueue(text, requestId)).taskId);
    },
  };
}
export type OptChatController = ReturnType<typeof createOperations> & {
  harness: Harness; root: Conversation; context: Context;
};
