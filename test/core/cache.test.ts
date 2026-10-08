import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import {
  createAssistantMessageEventStream,
  fauxAssistantMessage,
  normalizeContext,
  Type,
  type Provider,
} from "@earendil-works/pi-ai";
import { cacheProvider, markViewCache } from "../../src/cache.js";
import { viewBlocks } from "../../src/memory/blocks.js";

const view = (count: number) =>
  `<chat>\n${Array.from({ length: count }, (_, i) => `${i}+1|user: α🧠 record ${i}`).join("\n")}\n</chat>`;
const control = { type: "ephemeral" };
const payload = (text: string) => ({
  model: "claude-haiku-5-5",
  system: [{ type: "text", text: "Host instructions", cache_control: control }],
  tools: [{ name: "host_tool", input_schema: { type: "object" }, cache_control: control }],
  messages: [
    {
      role: "user",
      content: [
        ...viewBlocks(text),
        { type: "text", text: "New complete input", cache_control: control },
      ],
    },
  ],
});

test("four-line blocks preserve every byte and the previous complete blocks as the view grows", () => {
  for (let count = 0; count < 40; count++) {
    const text = count ? view(count) : "<chat>\n\n</chat>";
    const blocks = viewBlocks(text);
    assert.equal(blocks.map((b) => b.text).join(""), text);
    const complete = blocks.slice(0, -1);
    assert.ok(complete.every((b) => !b.text.includes("</chat>")));
    assert.deepEqual(viewBlocks(view(count + 1)).slice(0, complete.length), complete);
  }
});

test("cache marking preserves the host payload, opt-out, TTL, mark limit and changed-view boundaries", () => {
  const original = payload(view(9));
  const saved = structuredClone(original);
  const marked = markViewCache(original, view(9))!;
  const content = marked.payload.messages[0] as {
    content: { text: string; cache_control?: object }[];
  };
  assert.deepEqual(content.content[1]!.cache_control, control);
  assert.equal(
    content.content[2]!.cache_control,
    undefined,
    "closing tag must remain in the variable suffix",
  );
  assert.deepEqual(original, saved, "never mutate the host's request object");
  assert.deepEqual(
    markViewCache(marked.payload, view(9))!.payload,
    marked.payload,
    "idempotent when two public adapters see the same request",
  );
  assert.equal(markViewCache(original, view(8)), undefined);
  assert.equal(markViewCache(payload(view(3)), view(3)), undefined);
  const disabled = JSON.parse(
    JSON.stringify(original).replaceAll(',"cache_control":{"type":"ephemeral"}', ""),
  );
  assert.equal(markViewCache(disabled, view(9)), undefined);
  const saturated = { ...original, cache_control: control };
  assert.equal(markViewCache(saturated, view(9)), undefined);
  const mixed = { ...original, cache_control: { type: "ephemeral", ttl: "1h" } };
  assert.equal(markViewCache(mixed, view(9)), undefined);
  const long = JSON.parse(
    JSON.stringify(original).replaceAll('"type":"ephemeral"', '"type":"ephemeral","ttl":"1h"'),
  );
  const longMarked = markViewCache(long, view(9))!;
  assert.ok(JSON.stringify(longMarked.payload).includes('"ttl":"1h"'));
});

for (const [cancelFollower, failLeader] of [
  [false, false],
  [true, false],
  [false, true],
])
  test(`concurrent prefix writes ${cancelFollower ? "allow cancellation while waiting" : failLeader ? "release followers after a failed leader" : "wait only until the leader response starts"}`, async () => {
    const base = anthropicProvider();
    const model = base.getModels().find((m) => m.id === "claude-haiku-5-5")!;
    let begin!: () => void;
    const permitted = new Promise<void>((resolve) => {
      begin = resolve;
    });
    let dispatched = 0;
    let callbacks = 0;
    let entered!: () => void;
    const both = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const fake: Provider = {
      ...base,
      streamSimple(_model, _context, options) {
        const out = createAssistantMessageEventStream();
        void (async () => {
          try {
            const attempt = ++callbacks;
            if (attempt === 2) entered();
            await options?.onPayload?.(payload(view(8)), model);
            // A retry can reuse the same callback before receiving a response.
            await options?.onPayload?.(payload(view(8)), model);
            dispatched++;
            await permitted;
            if (attempt === 1 && failLeader) {
              const error = fauxAssistantMessage("", { stopReason: "error" });
              out.push({ type: "error", reason: "error", error });
              out.end(error);
              return;
            }
            const message = {
              ...fauxAssistantMessage("done"),
              api: model.api,
              provider: model.provider,
              model: model.id,
            };
            out.push({ type: "start", partial: message });
            out.push({ type: "done", reason: "stop", message });
            out.end(message);
          } catch {
            const error = fauxAssistantMessage("", { stopReason: "aborted" });
            out.push({ type: "error", reason: "aborted", error });
            out.end(error);
          }
        })();
        return out;
      },
    };
    const wrapped = cacheProvider(fake);
    const context = normalizeContext({
      messages: [
        {
          role: "user",
          content: [...viewBlocks(view(8)), { type: "text", text: "task" }],
          timestamp: 0,
        },
      ],
    });
    const leader = wrapped.streamSimple(model, context);
    // Wait for its public payload callback to reserve the prefix, without timing-based assertions.
    await new Promise<void>((resolve) => setImmediate(resolve));
    const controller = new AbortController();
    const follower = wrapped.streamSimple(model, context, { signal: controller.signal });
    await both;
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(dispatched, 1);
    if (cancelFollower) {
      controller.abort();
      assert.equal((await follower.result()).stopReason, "aborted");
      assert.equal(dispatched, 1);
    }
    begin();
    assert.equal((await leader.result()).stopReason, failLeader ? "error" : "stop");
    if (!cancelFollower) {
      assert.equal((await follower.result()).stopReason, "stop");
      assert.equal(dispatched, 2);
    }
  });

test("real Pi Anthropic adapter sends four native markers and respects cacheRetention none", async () => {
  const requests: (ReturnType<typeof payload> & { metadata: { user_id: string } })[] = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    response.writeHead(400, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "Synthetic payload inspection; no model call",
        },
      }),
    );
  });
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = anthropicProvider();
    const model = {
      ...base.getModels().find((m) => m.id === "claude-haiku-5-5")!,
      baseUrl: `http://127.0.0.1:${address.port}`,
    };
    const provider = cacheProvider(base);
    for (const cacheRetention of ["short", "none"] as const) {
      await provider
        .streamSimple(
          model,
          normalizeContext({
            messages: [
              {
                role: "system",
                content: "Stable host instructions",
                toolsAdded: [
                  {
                    name: "host_tool",
                    description: "Original host tool",
                    parameters: Type.Object({}),
                  },
                ],
                timestamp: 0,
              },
              {
                role: "user",
                content: [...viewBlocks(view(9)), { type: "text", text: "Complete new input" }],
                timestamp: 0,
              },
            ],
          }),
          {
            apiKey: "synthetic-loopback-only",
            cacheRetention,
            maxRetries: 0,
            timeoutMs: 5000,
            onPayload: (value) => ({
              ...(value as object),
              metadata: { user_id: "synthetic-host-metadata" },
            }),
          },
        )
        .result();
    }
    assert.equal(requests.length, 2);
    const cached = requests[0]!;
    assert.equal(cached.metadata.user_id, "synthetic-host-metadata");
    assert.equal(JSON.stringify(cached).match(/cache_control/g)?.length, 4);
    const user = cached.messages.find((m) => m.role === "user")!;
    assert.deepEqual((user.content[1] as { cache_control?: object }).cache_control, control);
    assert.equal(
      user.content
        .slice(0, -1)
        .map((b) => b.text)
        .join(""),
      view(9),
    );
    assert.equal(user.content.at(-1)!.text, "Complete new input");
    assert.ok(!JSON.stringify(requests[1]).includes("cache_control"));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
