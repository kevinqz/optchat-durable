import assert from "node:assert/strict";
import { BACKGROUND_CONTEXT, withCancel } from "@earendil-works/chord/context";
import {
  createModels,
  fauxProvider,
  fauxAssistantMessage,
  fauxToolCall,
  Type,
} from "@earendil-works/pi-ai";
import {
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { createOptChat } from "optchat-durable/extension";

// Credential-free public consumer: host models/tools/storage, detached wait and durable cancel.
const context = BACKGROUND_CONTEXT;
const models = createModels();
const provider = fauxProvider({
  models: [{ id: "host", contextWindow: 272_000, maxTokens: 16_384 }],
});
let firstReady, secondReady, releaseFirst;
const firstStarted = new Promise((resolve) => {
  firstReady = resolve;
});
const secondStarted = new Promise((resolve) => {
  secondReady = resolve;
});
const firstGate = new Promise((resolve) => {
  releaseFirst = resolve;
});
const respond = async (request, options) => {
  provider.appendResponses([respond]);
  if (JSON.stringify(request.messages).includes("SECOND_REQUEST")) {
    secondReady();
    await new Promise((_resolve, reject) =>
      options.signal.addEventListener("abort", () => reject(new Error("cancelled")), {
        once: true,
      }),
    );
  }
  if (!request.messages.some((message) => message.role === "toolResult"))
    return fauxAssistantMessage(fauxToolCall("project_lookup", {}), { stopReason: "toolUse" });
  firstReady();
  await firstGate;
  return fauxAssistantMessage("Aurora is ready.");
};
provider.setResponses([respond]);
models.setProvider(provider.provider);
const registry = createRegistry();
let effects = 0;
const host = defineExtension({
  name: "host",
  tools: [
    defineTool({
      name: "project_lookup",
      description: "Read a synthetic project status",
      parameters: Type.Object({}),
      replay: "safe",
      execute: async () => {
        effects++;
        return { content: [{ type: "text", text: "Aurora is ready." }] };
      },
    }),
  ],
});
const optchat = createOptChat({
  main: { provider: "faux", modelId: "host" },
  compactor: { provider: "faux", modelId: "host" },
});
registry.install(host);
registry.install(optchat.extension);
const storage = new MemoryStorage();
let closes = 0;
const closeStorage = storage.close.bind(storage);
storage.close = async (...args) => {
  closes++;
  await closeStorage(...args);
};
await optchat.prepare(storage);
const harness = await Harness.open(
  storage,
  { registry, models, settings: optchat.settings },
  context,
);
try {
  const root = await harness.root(context, {
    agent: {
      model: optchat.config.main,
      extensions: [host, optchat.extension],
      instructions: "Keep the host's project rules.",
    },
  });
  const chat = optchat.attach(harness, root);
  const first = await chat.enqueue("FIRST_REQUEST: inspect Aurora", "first");
  await firstStarted;
  const observer = withCancel(context);
  const observing = chat.wait(first.taskId, observer.context);
  observer.cancel();
  await assert.rejects(observing);
  assert.equal(
    (await chat.request("first")).status,
    "answering",
    "detaching a waiter must not cancel work",
  );
  assert.equal(effects, 1);
  releaseFirst();
  assert.equal((await chat.wait(first.taskId)).answer, "Aurora is ready.");
  assert.equal((await chat.enqueue("FIRST_REQUEST: inspect Aurora", "first")).taskId, first.taskId);
  const second = await chat.enqueue("SECOND_REQUEST: cancel this request", "second");
  await secondStarted;
  await chat.cancel("second");
  await assert.rejects(chat.wait(second.taskId), /aborted/);
  assert.equal((await chat.request("second")).status, "cancelled");
  assert.equal(effects, 1);
  assert.equal("close" in chat, false);
  assert.equal(closes, 0, "preparation and controller operations must not close host storage");
} finally {
  releaseFirst();
  await harness.close(context);
}
assert.equal(closes, 1);
console.log(
  "PASS: host-owned tools, models, storage, detached observation, durable cancellation and shutdown.",
);
