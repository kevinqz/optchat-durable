import { Type } from "@earendil-works/pi-ai";
import { BACKGROUND_CONTEXT, withCancel } from "@earendil-works/chord/context";
import {
  getMarkdownTheme,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Markdown } from "@earendil-works/pi-tui";
import type { OptChatApp } from "../app.js";
import { requirePiModels } from "./models.js";
import { PiOptChatSession, piDataDirectory } from "./session.js";
import { installNativeMemory } from "./native.js";

const entryType = "optchat-durable";
type DisplayEntry = { content: string; requestId?: string; complete?: boolean };
const help = `**OptChat Durable** — hierarchical memory for your normal Pi conversation.

Talk to Pi normally. Its existing tools, permissions, streaming and steering remain available.
- \`/optchat status\` — inspect this session's native memory and data location.
- \`/optchat search <text>\` — search originals on the selected branch.
- \`/optchat zoom <start> <count> [offset]\` — retrieve this session's memory.
- \`/optchat date <start>\` — the original timestamp of a memory record.

The separate durable chat from v0.3 is still available:

- \`/optchat ask <message>\` — queue a message using your Pi model and login.
- \`/optchat chat status\` — separate chat models, memory, usage and pending requests.
- \`/optchat resume\` — explicitly resume unfinished work and recover answers.
- \`/optchat cancel [request-id]\` — cancel the oldest pending request or a specific one.
- \`/optchat chat search <text>\` — search separate chat originals.
- \`/optchat chat zoom <start> <count> [offset]\` — retrieve separate chat originals.

Native mode keeps Pi's selected main model. The compactor and budgets are saved at first use;
summaries use the initially selected model unless you set \`--optchat-compactor provider/model-id\`.
Native memory follows Pi sessions and branches. The separate chat saves both models at first use
and shares its workspace/channel history across Pi sessions. \`--optchat-channel <name>\` provides
an additional namespace for either mode.
Use \`--optchat-mode chat\` to disable native memory. Model calls use your provider's normal billing.

OptChat design: Victor Taelin. Pi: Mario Zechner, Earendil Works and contributors.
[Documentation and credits](https://github.com/kevinqz/optchat-durable)`;

function overview(app: OptChatApp, state: Awaited<ReturnType<OptChatApp["status"]>>) {
  return {
    model: state.model,
    compactor: state.compactor,
    directory: app.config.directory,
    memory: { ...state.memory, view: undefined },
    usage: state.usage,
    requests: state.requests.map((r) => ({ id: r.id, status: r.status, error: r.error })),
  };
}

export default function optchatPi(pi: ExtensionAPI): void {
  pi.registerFlag("optchat-compactor", {
    type: "string",
    description:
      "Summary model for a new OptChat session (provider/model-id); defaults to the selected Pi model",
  });
  pi.registerFlag("optchat-channel", {
    type: "string",
    default: "default",
    description: "OptChat history within this workspace (letters, digits, underscores, hyphens)",
  });
  const native = installNativeMemory(pi);
  let session: PiOptChatSession | undefined;
  let stopped = false;
  const watching = new Map<string, Promise<void>>();
  const observer = withCancel(BACKGROUND_CONTEXT);
  const delivered = new Set<string>();
  let lastContext: ExtensionContext | undefined;
  const channel = () => pi.getFlag("optchat-channel") as string | undefined;
  const manager = () =>
    (session ??= new PiOptChatSession({
      compactor: pi.getFlag("optchat-compactor") as string | undefined,
      channel: channel(),
      onReport: (error) => {
        if (!stopped) lastContext?.ui.notify(`OptChat: ${String(error)}`, "error");
      },
    }));
  const display = (content: string, requestId?: string, complete = false) => {
    if (stopped) return;
    pi.appendEntry<DisplayEntry>(entryType, { content, requestId, complete });
    if (complete && requestId) delivered.add(requestId);
  };
  const status = (ctx: ExtensionContext) => {
    if (!stopped)
      ctx.ui.setStatus(
        entryType,
        watching.size ? `OptChat: ${watching.size} pending · /optchat cancel` : undefined,
      );
  };
  const observe = (
    app: OptChatApp,
    id: string,
    task: Parameters<OptChatApp["wait"]>[0],
    ctx: ExtensionContext,
  ) => {
    if (watching.has(id)) return;
    const pending = app
      .wait(task, observer.context)
      .then((result) => {
        if (!delivered.has(id)) display(`**OptChat** · \`${id}\`\n\n${result.answer}`, id, true);
      })
      .catch((error) => {
        if (!stopped)
          display(
            `**OptChat request stopped** · \`${id}\`\n\n${error instanceof Error ? error.message : String(error)}`,
          );
      })
      .finally(() => {
        watching.delete(id);
        status(ctx);
      });
    watching.set(id, pending);
    status(ctx);
  };

  pi.registerEntryRenderer<DisplayEntry>(
    entryType,
    (entry) => new Markdown(entry.data?.content ?? "", 0, 0, getMarkdownTheme()),
  );
  pi.on("session_start", (_event, ctx) => {
    lastContext = ctx;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === entryType) {
        const data = entry.data as DisplayEntry | undefined;
        if (data?.complete && data.requestId) delivered.add(data.requestId);
      }
    }
    // A resumed Pi session does not silently resume billable OptChat work.
  });
  pi.on("session_shutdown", async (_event, ctx) => {
    stopped = true;
    observer.cancel();
    ctx.ui.setStatus(entryType, undefined);
    await session?.close();
    await Promise.allSettled(watching.values());
  });

  pi.registerCommand("optchat", {
    description:
      "Inspect Pi conversation memory or use the separate durable chat; /optchat for help",
    getArgumentCompletions: (prefix) =>
      ["status", "search", "zoom", "date", "chat", "ask", "resume", "cancel", "help"]
        .filter((value) => value.startsWith(prefix))
        .map((value) => ({ value, label: value })),
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui")
        throw new Error(
          "/optchat commands use Pi's interactive terminal. For scripting, use the OptChat SDK/CLI or the optchat_memory retrieval tool.",
        );
      lastContext = ctx;
      try {
        const separate = /^chat(?:\s|$)/.test(args.trim()) || !native.enabled();
        const input = args.trim().replace(/^chat(?:\s+|$)/, "");
        const [command = "help", ...parts] = input.split(/\s+/);
        const text = input.slice(command.length).trim();
        if (!command || command === "help") {
          display(help);
          return;
        }
        if (!separate && ["status", "search", "zoom", "date"].includes(command)) {
          if (command === "search" && !text) throw new Error("Use /optchat search <text>.");
          if (
            command === "zoom" &&
            (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p)))
          )
            throw new Error("Use /optchat zoom <start> <count> [offset].");
          if (command === "date" && (parts.length !== 1 || !/^\d+$/.test(parts[0]!)))
            throw new Error("Use /optchat date <start>.");
          const result = await native.read(
            command === "status"
              ? { action: "status" }
              : command === "search"
                ? { action: "search", query: text }
                : command === "date"
                  ? { action: "date", start: Number(parts[0]) }
                  : {
                      action: "zoom",
                      start: Number(parts[0]),
                      count: Number(parts[1]),
                      offset: Number(parts[2] ?? 0),
                    },
            ctx,
          );
          display("```json\n" + JSON.stringify(result, null, 2) + "\n```");
          return;
        }
        if (!["ask", "status", "resume", "cancel", "search", "zoom"].includes(command))
          throw new Error("Unknown command. Use /optchat for help.");
        if (command === "ask" && !text) throw new Error("Use /optchat ask <message>.");
        if (["ask", "resume"].includes(command) && !ctx.isIdle())
          throw new Error("Wait for Pi's current response before starting an OptChat request.");
        const app = await manager().open(ctx, command === "ask");
        if (stopped) return;
        if (!app) {
          display(
            `OptChat has not started in this workspace/channel. Use \`/optchat ask <message>\`.\n\nData location: \`${piDataDirectory(ctx, channel())}\``,
          );
          return;
        }
        if (command === "ask") {
          requirePiModels(ctx.modelRegistry, app.config);
          const job = await app.enqueue(text);
          display(`**You → OptChat** · \`${job.requestId}\`\n\n${text}`);
          observe(app, job.requestId, job.taskId, ctx);
        } else if (command === "status")
          display(
            "```json\n" + JSON.stringify(overview(app, await app.status()), null, 2) + "\n```",
          );
        else if (command === "search") {
          if (!text) throw new Error("Use /optchat search <text>.");
          display("```json\n" + JSON.stringify(await app.search(text), null, 2) + "\n```");
        } else if (command === "zoom") {
          if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p)))
            throw new Error("Use /optchat zoom <start> <count> [offset].");
          display(
            "```json\n" +
              JSON.stringify(
                await app.zoom(Number(parts[0]), Number(parts[1]), Number(parts[2] ?? 0)),
                null,
                2,
              ) +
              "\n```",
          );
        } else {
          const state = await app.status();
          const pending = state.requests.filter((r) =>
            ["queued", "preparing", "answering"].includes(r.status),
          );
          if (command === "cancel") {
            const id = text || pending[0]?.id;
            if (!id) {
              display("No pending OptChat requests.");
              return;
            }
            await app.cancel(id);
            display(`Cancellation requested for \`${id}\`. Original history is retained.`);
          } else {
            requirePiModels(ctx.modelRegistry, app.config);
            for (const request of state.requests) {
              if (
                request.status === "done" &&
                request.answer !== null &&
                !delivered.has(request.id)
              ) {
                display(
                  `**Recovered OptChat answer** · \`${request.id}\`\n\n${request.answer}`,
                  request.id,
                  true,
                );
              }
            }
            for (const request of pending)
              if (request.task)
                observe(app, request.id, request.task as Parameters<OptChatApp["wait"]>[0], ctx);
            app.harness.resume();
            display(`OptChat resumed. ${pending.length} pending request(s) in the recent queue.`);
          }
        }
      } catch (error) {
        if (!stopped)
          ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerTool({
    name: "optchat_memory",
    label: "OptChat memory",
    description:
      "Read OptChat memory: default scope is the selected Pi session branch in native mode, or the separate chat in chat mode. Search originals, zoom start+count addresses, retrieve a date, or inspect status. Continue search with from=next and text pages with offset=next until null. Set scope=session or scope=chat explicitly to select a history. No model calls.",
    promptSnippet: "Search and retrieve original conversation memory",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("search"),
        Type.Literal("zoom"),
        Type.Literal("status"),
        Type.Literal("date"),
      ]),
      scope: Type.Optional(Type.Union([Type.Literal("session"), Type.Literal("chat")])),
      query: Type.Optional(Type.String({ minLength: 1 })),
      from: Type.Optional(Type.Integer({ minimum: 0 })),
      start: Type.Optional(Type.Integer({ minimum: 0 })),
      count: Type.Optional(Type.Integer({ minimum: 1 })),
      offset: Type.Optional(Type.Integer({ minimum: 0 })),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async execute(_id, params, signal, _update, ctx) {
      signal?.throwIfAborted();
      lastContext = ctx;
      if (params.scope === "session" || (params.scope === undefined && native.enabled())) {
        const result = await native.read(params, ctx, signal);
        return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
      }
      const app = await manager().open(ctx);
      signal?.throwIfAborted();
      let result: unknown;
      if (!app)
        result = {
          started: false,
          message: "Use /optchat ask <message> to start this workspace/channel's durable chat.",
        };
      else if (params.action === "status") result = overview(app, await app.status());
      else if (params.action === "search") {
        if (!params.query?.trim()) throw new Error("search requires a nonempty query");
        result = await app.search(params.query, params.from ?? 0);
      } else if (params.action === "date") {
        if (params.start === undefined) throw new Error("date requires start");
        result = { timestamp: await app.date(params.start) };
      } else {
        if (params.start === undefined || params.count === undefined)
          throw new Error("zoom requires start and count");
        result = await app.zoom(params.start, params.count, params.offset ?? 0);
      }
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
  });
}
