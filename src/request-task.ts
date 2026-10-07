import { configure, defineTask, LiveDoc, type Extension, type TaskId } from "@earendil-works/pi-durable";
import type { OptChatConfig } from "./config.js";
import { MemoryDoc, RequestDoc } from "./memory/documents.js";
import { fitView } from "./memory/store.js";
import { answerText } from "./memory/transcript.js";
import { bytes } from "./memory/tree.js";
import { MAIN_PROMPT } from "./prompts.js";
import type { createMemoryTasks } from "./memory/tasks.js";

type RequestInput = { requestId: string; text: string; createdAt: number; previous: TaskId | null };
type RequestCheckpoint = { phase: "queue" } | { phase: "prepare" } | { phase: "freeze"; build: TaskId } | { phase: "answer" };
export type RequestResult = { requestId: string; answer: string };

export function createRequestTask(config: OptChatConfig, memoryTasks: ReturnType<typeof createMemoryTasks>, extension: () => Extension) {
  return defineTask<RequestInput, RequestCheckpoint, RequestResult>({
    name: "optchat.request", version: 1, initial: () => ({ phase: "queue" }),
    phases: {
      queue: async (task, api, context) => {
        await api.commit(() => task.input.previous
          ? { status: "waiting", checkpoint: { phase: "prepare" }, on: [task.input.previous], policy: "allSettled" }
          : { status: "running", checkpoint: { phase: "prepare" } }, context);
      },
      prepare: async (task, api, context) => {
        await api.commit(async tx => {
          const request = await tx.doc(RequestDoc, task.conversationId, task.input.requestId, task.input);
          request.status = "preparing";
          const build = await memoryTasks.ensureBuild(tx, task.conversationId);
          return { status: "waiting", checkpoint: { phase: "freeze", build }, on: [build], policy: "allSettled" };
        }, context);
      },
      freeze: async (task, api, context) => {
        const [outcome] = await api.outcomes([task.state.checkpoint.build], context);
        await api.commit(async tx => {
          const request = await tx.doc(RequestDoc, task.conversationId, task.input.requestId, task.input);
          if (!outcome || outcome.status !== "completed") {
            request.status = "failed";
            request.error = outcome && "error" in outcome && outcome.error ? outcome.error.message : "Memory preparation was cancelled";
            return { status: "terminal", outcome: { status: "failed", error: { message: request.error } } };
          }
          const live = await tx.doc(LiveDoc, task.conversationId);
          if (live.run) throw new Error("Cannot reset an active Pi run");
          const memory = await tx.doc(MemoryDoc, task.conversationId);
          const view = await fitView(tx, task.conversationId, config.viewBytes);
          if (memory.count !== memory.processed || bytes(view) > config.viewBytes) throw new Error("Memory is not settled within its budget");
          request.frozen = view;
          request.through = memory.count;
          request.status = "answering";
          // The reset, frozen view, and task checkpoint are a SINGLE durable transaction.
          // A recovery cannot reset the context again after input has been submitted.
          await configure(tx, task.conversationId, { model: config.main, extensions: [extension()], instructions: MAIN_PROMPT, thinkingLevel: "medium" });
          await tx.appendEntry(task.conversationId, {
            kind: "optchat.view", head: "self", data: { requestId: task.input.requestId, through: memory.count },
            model: [{ role: "user", content: [{ type: "text", text: view }], timestamp: task.input.createdAt }],
          });
          return { status: "running", checkpoint: { phase: "answer" } };
        }, context);
      },
      answer: async (task, api, context) => {
        const conversation = await api.conversation(task.conversationId, context);
        if (!conversation) throw new Error("Missing main conversation");
        const receipt = await (await conversation.submit({ type: "input", content: task.input.text,
          requestId: `optchat:${task.input.requestId}`, whenBusy: "reject" }, context)).wait(context);
        await api.commit(async tx => {
          const answer = receipt.status === "done" && receipt.type === "input" ? answerText(await tx.entry(receipt.answer)) : null;
          const request = await tx.doc(RequestDoc, task.conversationId, task.input.requestId, task.input);
          request.answer = answer;
          request.status = receipt.status === "done" ? "done" : "failed";
          request.error = receipt.status === "done" ? null : `Pi run ${receipt.reason}`;
          // Continue indexing without keeping the user's completed response busy.
          await memoryTasks.ensureBuild(tx, task.conversationId);
          return receipt.status === "done"
            ? { status: "terminal", outcome: { status: "completed", result: { requestId: task.input.requestId, answer: answer! } } }
            : { status: "terminal", outcome: { status: "failed", error: { message: request.error! } } };
        }, context);
      },
    },
    abort: async (task, api, context) => {
      if (task.state.checkpoint.phase === "answer") await (await api.conversation(task.conversationId, context))?.abort(context);
      await api.commit(async tx => {
        const request = await tx.doc(RequestDoc, task.conversationId, task.input.requestId, task.input);
        request.status = "cancelled";
        request.error = "Cancelled by user; input and source history retained";
        return { status: "terminal", outcome: { status: "aborted" } };
      }, context);
    },
  });
}
