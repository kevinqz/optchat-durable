import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStorage } from "@earendil-works/pi-durable";
import { configFromEnv } from "../src/config.js";
import { openApp } from "../src/app.js";

test("native Pi queue answers, indexes the transcript, and deduplicates input", { timeout: 20_000 }, async () => {
  const config = configFromEnv({ OPTCHAT_DEMO: "1" });
  const app = await openApp(config, { storage: new MemoryStorage() });
  try {
    const first = await app.enqueue("Meu projeto se chama Aurora.", "first");
    const duplicate = await app.enqueue("Meu projeto se chama Aurora.", "first");
    assert.equal(first.taskId, duplicate.taskId);
    await assert.rejects(() => app.enqueue("Texto diferente", "first"));
    assert.ok((await app.wait(first.taskId)).answer.includes("Demonstração"));
    await app.settleMemory();
    const before = await app.status();
    assert.equal(before.memory.messages, 2);
    assert.equal(before.memory.summarized, 2);
    const next = await app.enqueue("Qual é o nome?", "second");
    await app.wait(next.taskId);
    const request = await app.request("second");
    assert.equal(request?.through, 2);
    assert.ok(request?.frozen?.includes("Aurora"));
    assert.ok(!request?.frozen?.includes("Qual é o nome?"));
    const raw = await app.zoom(0, 1);
    assert.ok("text" in raw && raw.text.includes("Aurora"));
    assert.ok((await app.search("Aurora")).matches.length > 0);
    await app.settleMemory();
    assert.equal((await app.status()).memory.messages, 4);
  } finally { await app.close(); }
});

test("long messages and parents use native child conversations and keep full originals", { timeout: 30_000 }, async () => {
  const config = configFromEnv({ OPTCHAT_DEMO: "1" });
  const app = await openApp(config, { storage: new MemoryStorage() });
  try {
    const original = "Decisão importante: preservar todos os dados. ".repeat(90) + "FIM-EXATO";
    const request = await app.enqueue(original, "long");
    await app.wait(request.taskId);
    await app.settleMemory();
    const status = await app.status();
    assert.equal(status.memory.summarized, 2);
    assert.ok(status.memory.viewBytes <= config.viewBytes);
    const result = await app.zoom(0, 1);
    assert.ok("text" in result && result.text.endsWith("FIM-EXATO"));
    assert.ok(Object.keys(status.usage.models).length > 0);
    const history = await app.history();
    assert.equal(history.items.filter(m => m.kind === "user").length, 1, "compactor conversations must not enter the main log");
  } finally { await app.close(); }
});
