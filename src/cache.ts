import {
  createAssistantMessageEventStream,
  fauxAssistantMessage,
  type Provider,
  type StreamOptions,
} from "@earendil-works/pi-ai";
import { contextView, viewBlocks } from "./memory/blocks.js";

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Public Anthropic payload contract, through Pi's documented onPayload/extension hook. */
export function markViewCache(payload: unknown, view: string) {
  if (!object(payload) || !Array.isArray(payload.messages)) return;
  const expected = viewBlocks(view);
  if (expected.length < 2) return; // No complete group of four lines yet.
  const at = payload.messages.findIndex((m) => object(m) && m.role === "user");
  const message: unknown = payload.messages[at];
  if (!object(message) || !Array.isArray(message.content)) return;
  const content = message.content;
  if (
    !expected.every(
      (b, i) => object(content[i]) && content[i].type === "text" && content[i].text === b.text,
    )
  )
    return; // A host transform changed the view; leave its request alone.
  const marks: ObjectValue[] = [];
  const inspect = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(inspect);
    else if (object(value)) {
      if ("cache_control" in value) {
        if (!object(value.cache_control)) marks.push({ invalid: true });
        else marks.push(value.cache_control);
      }
      for (const [key, child] of Object.entries(value)) if (key !== "cache_control") inspect(child);
    }
  };
  inspect(payload);
  // Preserve disabled caching, mixed TTL policies, and all of the host's existing marks.
  if (
    !marks.length ||
    marks.some(
      (m) =>
        m.type !== "ephemeral" || ![undefined, "5m", "1h"].includes(m.ttl as string | undefined),
    )
  )
    return;
  const ttl = marks[0]!.ttl ?? "5m";
  if (marks.some((m) => (m.ttl ?? "5m") !== ttl)) return;
  const index = expected.length - 2;
  const block = content[index] as ObjectValue;
  if (!block.cache_control && marks.length >= 4) return;
  const blocks = [...content];
  blocks[index] = { ...block, cache_control: block.cache_control ?? { ...marks[0] } };
  const messages = [...payload.messages];
  messages[at] = { ...message, content: blocks };
  const result = { ...payload, messages };
  // No credentials or user IDs are retained. This key lives only while a request is starting.
  const prefix = JSON.stringify({
    model: payload.model,
    tools: payload.tools,
    system: payload.system,
    thinking: payload.thinking,
    output_config: payload.output_config,
    messages: [...messages.slice(0, at), { ...message, content: blocks.slice(0, index + 1) }],
  });
  return { payload: result, prefix };
}

/** Opt-in SDK adapter; native Pi and the standalone model factory install it automatically. */
export function cacheProvider(provider: Provider): Provider {
  const pending = new Map<string, Promise<void>>();
  const wrap =
    (simple: boolean): Provider["streamSimple"] =>
    (model, context, options) => {
      const call = simple ? provider.streamSimple.bind(provider) : provider.stream.bind(provider);
      const view = model.api === "anthropic-messages" ? contextView(context) : undefined;
      if (!view) return call(model, context, options);
      const output = createAssistantMessageEventStream();
      let release: (() => void) | undefined;
      let ownedKey: string | undefined;
      void (async () => {
        try {
          const effective: StreamOptions = {
            ...options,
            onPayload: async (payload, actualModel) => {
              const previous = await options?.onPayload?.(payload, actualModel);
              const marked = markViewCache(previous ?? payload, view);
              if (!marked) return previous;
              const key = `${model.provider}:${model.baseUrl}:${marked.prefix}`;
              // A provider may invoke onPayload again for a transport retry.
              // Never wait on this very request's own not-yet-started response.
              if (ownedKey === key) return marked.payload;
              release?.();
              release = undefined;
              ownedKey = undefined;
              const earlier = pending.get(key);
              if (earlier) {
                const signal = AbortSignal.any([
                  ...(options?.signal ? [options.signal] : []),
                  AbortSignal.timeout(options?.timeoutMs ?? 120_000),
                ]);
                await waitForPrefix(earlier, signal);
              } else {
                let done!: () => void;
                const ready = new Promise<void>((resolve) => {
                  done = resolve;
                });
                pending.set(key, ready);
                ownedKey = key;
                release = () => {
                  if (pending.get(key) === ready) pending.delete(key);
                  done();
                };
              }
              return marked.payload;
            },
          };
          const source = call(model, context, effective);
          for await (const event of source) {
            if (event.type === "start") release?.();
            output.push(event);
          }
          output.end(await source.result());
        } catch {
          const error = {
            ...fauxAssistantMessage("", {
              stopReason: options?.signal?.aborted ? "aborted" : "error",
              errorMessage: "Cache-aware provider request failed before completion.",
            }),
            api: model.api,
            provider: model.provider,
            model: model.id,
          };
          output.push({
            type: "error",
            reason: error.stopReason === "aborted" ? "aborted" : "error",
            error,
          });
          output.end(error);
        } finally {
          release?.();
        }
      })();
      return output;
    };
  return { ...provider, stream: wrap(false) as Provider["stream"], streamSimple: wrap(true) };
}

function waitForPrefix(ready: Promise<void>, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    void ready.then(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    });
  });
}
