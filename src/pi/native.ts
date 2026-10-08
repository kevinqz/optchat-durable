import { BACKGROUND_CONTEXT, withCancel } from "@earendil-works/chord/context";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { PiOptChatSession, piNativeDirectory } from "./session.js";
import { PiMemoryArchive, type FrozenView } from "./archive.js";
import { sources, fingerprint } from "./sources.js";
import { checkRequest, project, NATIVE_GUIDANCE, RUN_ENTRY, turnBoundary } from "./projection.js";
import { requirePiModels } from "./models.js";
import { markViewCache } from "../cache.js";

export type MemoryQuery = {
  action: "status" | "search" | "zoom" | "date";
  query?: string;
  from?: number;
  start?: number;
  count?: number;
  offset?: number;
};

/** Public Pi hooks own the host loop; Pi Durable owns only the archive and summary tasks. */
export function installNativeMemory(pi: ExtensionAPI) {
  pi.registerFlag("optchat-mode", {
    type: "string",
    default: "native",
    description:
      "native: memory for normal Pi messages (default); chat: only the separate /optchat chat",
  });
  let manager: PiOptChatSession | undefined;
  let archive: PiMemoryArchive | undefined;
  let sessionId: string | undefined;
  let stopped = false;
  let error: Error | undefined;
  let frozen: { id: string; prefix: string; value: FrozenView } | undefined;
  let opening: Promise<void> = Promise.resolve();
  let cancelWait: (() => void) | undefined;
  const enabled = () => pi.getFlag("optchat-mode") !== "chat";
  const options = () => ({
    native: true,
    channel: pi.getFlag("optchat-channel") as string | undefined,
    compactor: pi.getFlag("optchat-compactor") as string | undefined,
  });
  const report = (ctx: ExtensionContext, failure: unknown) => {
    error = failure instanceof Error ? failure : new Error(String(failure));
    if (!stopped) {
      ctx.ui.setStatus("optchat-native", "OptChat: blocked · /optchat status");
      ctx.ui.notify(`OptChat: ${error.message}`, "error");
    }
  };
  const close = async () => {
    stopped = true;
    cancelWait?.();
    await opening;
    await manager?.close();
    manager = undefined;
    archive = undefined;
    frozen = undefined;
    sessionId = undefined;
  };
  const open = (ctx: ExtensionContext, create = false): Promise<PiMemoryArchive | undefined> => {
    const pending = opening.then(async () => {
      if (stopped) throw new Error("OptChat is shutting down");
      const current = ctx.sessionManager.getSessionId();
      if (sessionId !== current) {
        await manager?.close();
        manager = new PiOptChatSession({
          ...options(),
          onReport: (failure) => report(ctx, failure),
        });
        archive = undefined;
        frozen = undefined;
        sessionId = current;
      }
      const app = await manager!.open(ctx, create);
      if (app) archive ??= new PiMemoryArchive(app);
      return archive;
    });
    opening = pending.then(
      () => {},
      () => {},
    );
    return pending;
  };

  pi.on("session_start", () => {
    stopped = false;
    error = undefined;
    frozen = undefined;
  });
  pi.on("session_shutdown", close);
  pi.on("input", (_event, ctx) => {
    if (!enabled()) return;
    error = undefined;
    const mode = pi.getFlag("optchat-mode");
    if (mode !== "native") {
      report(ctx, new Error("--optchat-mode must be native or chat"));
      return { action: "handled" };
    }
    if (!pi.getActiveTools().includes("optchat_memory")) {
      report(
        ctx,
        new Error(
          "Native memory needs optchat_memory in Pi's active tools. Add it to --tools, or use --optchat-mode chat.",
        ),
      );
      return { action: "handled" };
    }
  });
  pi.on("before_agent_start", (event) => {
    if (!enabled()) return;
    frozen = undefined;
    event.systemPromptOptions.sections.optchat_memory = NATIVE_GUIDANCE;
    pi.appendEntry(RUN_ENTRY, { version: 1 });
  });
  pi.on("context_with_system", async (event, ctx) => {
    if (!enabled()) return;
    try {
      if (error) throw error;
      if (!pi.getActiveTools().includes("optchat_memory"))
        throw new Error("OptChat's retrieval tool was disabled during the turn");
      ctx.signal?.throwIfAborted();
      const memory = await open(ctx, true);
      if (!memory) throw new Error("Cannot open native memory");
      const boundary = turnBoundary(ctx.sessionManager.getBranch());
      const input = sources(boundary.before);
      const prefix = fingerprint(input.map((s) => s.key));
      if (frozen && frozen.id === boundary.requestId && frozen.prefix !== prefix)
        throw new Error(
          "Historical context was edited during this turn; submit a new message to rebuild its memory safely.",
        );
      if (!frozen || frozen.id !== boundary.requestId) {
        requirePiModels(ctx.modelRegistry, {
          ...memory.app.config,
          main: memory.app.config.compactor,
        });
        const waiting = withCancel(BACKGROUND_CONTEXT);
        cancelWait = waiting.cancel;
        const abort = () => waiting.cancel();
        ctx.signal?.addEventListener("abort", abort, { once: true });
        if (ctx.signal?.aborted) abort();
        ctx.ui.setStatus("optchat-native", "OptChat: preparing memory…");
        try {
          const budget = Math.min(
            memory.app.config.viewBytes,
            Math.floor((ctx.model?.contextWindow ?? 0) / 3),
          );
          if (budget < 4096) throw new Error("Selected model is too small for OptChat memory");
          frozen = {
            id: boundary.requestId,
            prefix,
            value: await memory.freeze(
              input,
              boundary.requestId,
              waiting.context,
              budget,
              ctx.signal,
            ),
          };
        } finally {
          ctx.signal?.removeEventListener("abort", abort);
          waiting.cancel();
          cancelWait = undefined;
        }
      }
      ctx.signal?.throwIfAborted();
      const messages = project(event.messages, boundary.anchor, frozen.value.view);
      checkRequest(messages, ctx);
      ctx.ui.setStatus("optchat-native", `OptChat: ${frozen.value.through} memory records`);
      return { messages };
    } catch (failure) {
      // Pi reports hook exceptions and continues. Explicit cancellation and a stopped
      // projection prevent a fallback to the unbounded/raw history on this path.
      if (!ctx.signal?.aborted) report(ctx, failure);
      ctx.abort();
      return {
        messages: [
          {
            role: "system",
            content: "OptChat stopped this request because its memory is unavailable.",
            timestamp: 0,
          },
        ],
      };
    }
  });
  pi.on("before_provider_request", (event, ctx) => {
    if (!enabled() || error || !frozen || ctx.model?.api !== "anthropic-messages") return;
    return markViewCache(event.payload, frozen.value.view)?.payload;
  });
  pi.on("message_end", async (event, ctx) => {
    if (!enabled() || stopped) return;
    try {
      await (await open(ctx, true))?.record(event.message, ctx.sessionManager.getLeafId());
    } catch (failure) {
      report(ctx, failure);
      ctx.abort();
    }
  });
  // Reject new tool admissions after an archive failure. Already-running actions
  // remain subject to Pi's own cancellation and external side-effect semantics.
  pi.on("tool_call", () =>
    error && enabled() ? { block: true, reason: error.message, terminate: true } : undefined,
  );
  const synchronize = async (ctx: ExtensionContext, build: boolean) => {
    if (!enabled() || stopped || error) return;
    try {
      const memory = await open(ctx);
      if (memory) {
        const controller = await memory.select(sources(ctx.sessionManager.getBranch()));
        if (build) await controller.buildMemory();
      }
    } catch (failure) {
      report(ctx, failure);
      ctx.abort();
    }
  };
  pi.on("turn_end", (event, ctx) => synchronize(ctx, event.outcome === "completed"));
  pi.on("agent_settled", (event, ctx) => synchronize(ctx, !event.aborted));
  pi.on("session_before_compact", (event, ctx) => {
    if (!enabled()) return;
    if (event.reason === "manual")
      ctx.ui.notify(
        "OptChat prepares memory automatically before each new turn. Originals remain available through optchat_memory.",
        "info",
      );
    if (event.reason === "overflow") {
      report(
        ctx,
        new Error(
          "The live tool loop filled this model's context. Start a new turn or select a larger model; no tool is automatically replayed.",
        ),
      );
      ctx.abort();
    }
    return { cancel: true };
  });
  pi.on("cache_warming_decision", () => (enabled() ? { action: "stop" } : undefined));

  return {
    enabled,
    async read(params: MemoryQuery, ctx: ExtensionContext, signal?: AbortSignal): Promise<unknown> {
      signal?.throwIfAborted();
      const memory = await open(ctx);
      if (!memory)
        return {
          started: false,
          mode: enabled() ? "native" : "chat",
          directory: piNativeDirectory(ctx, options().channel),
          message: "Native OptChat memory starts with your first ordinary Pi message.",
        };
      const controller = await memory.select(sources(ctx.sessionManager.getBranch()));
      signal?.throwIfAborted();
      if (params.action === "status") {
        const state = await controller.status();
        return {
          started: true,
          mode: "native",
          sessionId,
          directory: memory.app.config.directory,
          memory: { ...state.memory, view: undefined },
          compactor: state.compactor,
          summaryUsage: state.usage,
          pendingTasks: state.tasks,
          error: error?.message ?? null,
          execution: "Pi coding-agent; no automatic replay of external tools",
        };
      }
      if (params.action === "search") {
        if (!params.query?.trim()) throw new Error("search requires a nonempty query");
        return controller.search(params.query, params.from ?? 0);
      }
      if (params.start === undefined) throw new Error("zoom/date requires start");
      if (params.action === "date") return { timestamp: await controller.date(params.start) };
      if (params.count === undefined) throw new Error("zoom requires count");
      return controller.zoom(params.start, params.count, params.offset ?? 0);
    },
  };
}
