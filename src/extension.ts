import type { Context } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  defineExtension,
  GenerationTask,
  hook,
  section,
  type Conversation,
  type Extension,
  type Harness,
  type HarnessSettings,
} from "@earendil-works/pi-durable";
import { resolveOptChatConfig, type OptChatConfig, type OptChatOptions } from "./config.js";
import { MEMORY_PROMPT } from "./prompts.js";
import { createController, type OptChatController } from "./controller.js";
import { createMemoryTasks } from "./memory/tasks.js";
import { memoryTools } from "./memory/tools.js";
import { createRequestTask } from "./request-task.js";

/** Create once per registry. Install before Harness.open(), including on recovery. */
export function createOptChat(options: OptChatOptions) {
  const config = resolveOptChatConfig(options);
  const memoryTasks = createMemoryTasks(config);
  let extension: Extension;
  const RequestTask = createRequestTask(config, memoryTasks, () => extension);
  extension = defineExtension({
    name: "optchat",
    sections: [section("optchat_memory", () => MEMORY_PROMPT, { tag: false })],
    tools: memoryTools(),
    tasks: [memoryTasks.NodeTask, memoryTasks.BuildTask, RequestTask],
    hooks: [
      hook(GenerationTask, {
        beforeRequest: ({ messages }) => {
          // Cache-friendly two text blocks. Correctness is already guaranteed by the persisted head entry.
          const first = messages.findIndex((m) => m.role === "user");
          const a = messages[first];
          const b = messages[first + 1];
          if (!a || a.role !== "user" || !b || b.role !== "user" || typeof a.content === "string")
            return;
          if (
            a.content.length !== 1 ||
            a.content[0]?.type !== "text" ||
            !a.content[0].text.startsWith("<chat>\n")
          )
            return;
          const next =
            typeof b.content === "string"
              ? [{ type: "text" as const, text: b.content }]
              : b.content;
          return {
            messages: [
              ...messages.slice(0, first),
              { ...a, content: [...a.content, ...next] },
              ...messages.slice(first + 2),
            ],
          };
        },
      }),
    ],
  });

  const settings: HarnessSettings = {
    compaction: { enabled: false },
    stream: { cacheRetention: "short", timeoutMs: 120_000, maxRetries: 0 },
    retry: { enabled: false },
    toolExecution: "parallel",
  };
  return {
    extension,
    settings,
    config,
    /** Use a dedicated conversation and submit all of its input through this controller. */
    attach(
      harness: Harness,
      conversation: Conversation,
      context: Context = BACKGROUND_CONTEXT,
    ): OptChatController {
      return createController(config, harness, conversation, context, memoryTasks, RequestTask);
    },
  };
}
export type OptChat = ReturnType<typeof createOptChat>;
export type { OptChatController, OptChatConfig, OptChatOptions };
