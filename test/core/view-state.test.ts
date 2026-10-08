import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStorage, type Tx, type ConversationId } from "@earendil-works/pi-durable";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { openApp } from "../../src/app.js";
import { fixtureConfig, scriptedModels } from "../helpers/core.js";
import { MemoryDoc, ViewDoc } from "../../src/memory/documents.js";
import { fitView, priorContext, publishNode } from "../../src/memory/store.js";
import { bytes } from "../../src/memory/tree.js";

async function node(tx: Tx, id: ConversationId, start: number, count: number) {
  await publishNode(tx, id, {
    start,
    count,
    text: `source-${start}-through-${start + count - 1} ` + "x".repeat(370),
    method: "model",
    oversized: false,
  });
}

test("unfinished view batch survives JSONL reopen and appends leave the prefix unchanged", async () => {
  const directory = await mkdtemp(join(tmpdir(), "optchat-cache-view-"));
  const config = { ...fixtureConfig(directory), viewBytes: 4096 };
  const models = scriptedModels(() => fauxAssistantMessage("unused"));
  let app = await openApp(config, { models });
  try {
    await app.root.commit(async (tx) => {
      for (let i = 0; i < 12; i++) await node(tx, app.root.id, i, 1);
      (await tx.doc(MemoryDoc, app.root.id)).count = 12;
      const text = await fitView(tx, app.root.id, 4096);
      assert.ok(bytes(text) > 4096, "no parent may be invented to meet the budget");
      assert.equal((await tx.doc(ViewDoc, app.root.id)).target, 2048);
      await node(tx, app.root.id, 0, 2);
      await fitView(tx, app.root.id, 4096);
    }, app.context);
    const saved = await app.harness.snapshot(ViewDoc, app.root.id, app.context);
    const parts = await app.harness.snapshot(MemoryDoc, app.root.id, app.context);
    await app.close();
    app = await openApp(config, { models, resume: false });
    assert.deepEqual(await app.harness.snapshot(ViewDoc, app.root.id, app.context), saved);
    assert.deepEqual(await app.harness.snapshot(MemoryDoc, app.root.id, app.context), parts);
    await app.root.commit(async (tx) => {
      for (const count of [2, 4, 8])
        for (let start = 0; start + count <= 12; start += count)
          await node(tx, app.root.id, start, count);
      const compacted = await fitView(tx, app.root.id, 4096);
      assert.ok(bytes(compacted) <= 2048);
      const policy = await tx.doc(ViewDoc, app.root.id);
      assert.equal(policy.target, null);
      const revision = policy.revision;
      await node(tx, app.root.id, 12, 1);
      (await tx.doc(MemoryDoc, app.root.id)).count = 13;
      const grown = await fitView(tx, app.root.id, 4096);
      assert.ok(grown.startsWith(compacted.slice(0, -8) + "\n"));
      assert.equal(policy.revision, revision);
      assert.equal(await fitView(tx, app.root.id, 4096), grown);
    }, app.context);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("compactor partition grows independently, resets on a main merge, and excludes future context", async () => {
  const app = await openApp(fixtureConfig(), {
    models: scriptedModels(() => fauxAssistantMessage("unused")),
    storage: new MemoryStorage(),
  });
  try {
    await app.root.commit(async (tx) => {
      const add = async (start: number, end: number) => {
        for (let i = start; i < end; i++) {
          await node(tx, app.root.id, i, 1);
          for (let count = 2; (i + 1) % count === 0; count *= 2)
            await node(tx, app.root.id, i + 1 - count, count);
        }
        (await tx.doc(MemoryDoc, app.root.id)).count = end;
      };
      await add(0, 100);
      await fitView(tx, app.root.id, 128_000);
      const first = await priorContext(tx, app.root.id, 100, 128_000);
      assert.ok(bytes(first) <= 16_000);
      const policy = await tx.doc(ViewDoc, app.root.id);
      const oldParts = JSON.parse(JSON.stringify(policy.compactor!.parts));
      await add(100, 105);
      const second = await priorContext(tx, app.root.id, 105, 128_000);
      assert.ok(second.startsWith(first + "\n"));
      assert.deepEqual(policy.compactor!.parts.slice(0, oldParts.length), oldParts);
      const beforeHistorical = JSON.parse(JSON.stringify(policy.compactor));
      const earlier = await priorContext(tx, app.root.id, 3, 128_000);
      assert.ok(!earlier.includes("source-3-") && !earlier.includes("through-3"));
      assert.deepEqual(
        policy.compactor,
        beforeHistorical,
        "an earlier job must not rewind the shared partition",
      );
      await assert.rejects(priorContext(tx, app.root.id, 106, 128_000), /completed summaries/);
      await fitView(tx, app.root.id, 4096);
      assert.ok(policy.revision > beforeHistorical.revision);
      await priorContext(tx, app.root.id, 105, 128_000);
      assert.equal(policy.compactor!.revision, policy.revision);
    }, app.context);
  } finally {
    await app.close();
  }
});
