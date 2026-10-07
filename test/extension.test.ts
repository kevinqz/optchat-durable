import { test } from "node:test";
import assert from "node:assert/strict";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { createRegistry, Harness, MemoryStorage } from "@earendil-works/pi-durable";
import { createOptChat } from "../src/extension.js";
import { fixtureConfig, scriptedModels } from "./support.js";

test("native extension works in a host-owned harness and isolates conversations", { timeout: 15_000 }, async () => {
  const context = BACKGROUND_CONTEXT;
  const config = fixtureConfig();
  const optchat = createOptChat(config);
  const registry = createRegistry();
  registry.install(optchat.extension);
  const models = scriptedModels(() => fauxAssistantMessage("Acknowledged."));
  const harness = await Harness.open(new MemoryStorage(), { models, registry, settings: optchat.settings }, context);
  try {
    const first = await harness.root(context, { agent: { model: config.main, extensions: [optchat.extension] } });
    const second = await harness.createConversation({ ownership: { kind: "ownerless" }, agent: { model: config.main, extensions: [optchat.extension] } }, context);
    const unrelated = await harness.createConversation({ ownership: { kind: "ownerless" }, agent: { model: config.main, extensions: [] } }, context);
    const a = optchat.attach(harness, first);
    const b = optchat.attach(harness, second);
    const [ja, jb] = await Promise.all([a.enqueue("Project Alpha", "same-id"), b.enqueue("Project Beta", "same-id")]);
    await Promise.all([a.wait(ja.taskId), b.wait(jb.taskId)]);
    await Promise.all([a.settleMemory(), b.settleMemory()]);
    assert.equal((await a.status()).memory.messages, 2);
    assert.equal((await b.status()).memory.messages, 2);
    assert.equal((await a.search("Beta")).matches.length, 0);
    assert.equal((await b.search("Alpha")).matches.length, 0);
    assert.equal((await a.search("Alpha")).matches.length, 1);
    assert.deepEqual((await first.agent(context)).tools.map(t => t.name).sort(), ["date", "search", "zoom"]);
    assert.deepEqual((await unrelated.agent(context)).tools, []);
    const receipt = await (await unrelated.submit({ type: "input", content: "A host conversation", requestId: "host-1" }, context)).wait(context);
    assert.equal(receipt.status, "done");
    assert.equal((await a.search("host conversation")).matches.length, 0);
    assert.equal("close" in a, false, "the controller must not own the host lifecycle");
  } finally { await harness.close(context); }
});
