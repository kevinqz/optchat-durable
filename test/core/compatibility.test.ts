import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import {
  createRegistry,
  createSession,
  defineDoc,
  defineTask,
  Harness,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { openApp } from "../../src/app.js";
import { createOptChat } from "../../src/extension.js";
import { MemoryDoc } from "../../src/memory/documents.js";
import { archiveHashes } from "../helpers/files.js";
import { fixtureConfig, scriptedModels } from "../helpers/core.js";

function trackedStorage() {
  const storage = new MemoryStorage();
  const commit = storage.commit.bind(storage);
  const close = storage.close.bind(storage);
  let commits = 0;
  let closes = 0;
  storage.commit = async (...args) => {
    commits++;
    return commit(...args);
  };
  storage.close = async (...args) => {
    closes++;
    return close(...args);
  };
  return { storage, commits: () => commits, closes: () => closes };
}

test("SDK storage preparation is idempotent, validates settings and retains host ownership", async () => {
  const config = fixtureConfig();
  const optchat = createOptChat(config);
  const tracked = trackedStorage();
  try {
    assert.deepEqual(await optchat.check(tracked.storage), { mode: "new", pendingTasks: 0 });
    assert.equal(tracked.commits(), 0, "checking a new store must not bind its configuration");
    assert.equal((await optchat.prepare(tracked.storage)).mode, "new");
    const before = tracked.commits();
    assert.deepEqual(await optchat.check(tracked.storage), { mode: "current", pendingTasks: 0 });
    assert.equal((await optchat.prepare(tracked.storage)).mode, "current");
    assert.equal(tracked.commits(), before);
    for (const change of [
      { viewBytes: 4096 },
      { retryMs: 10 },
      { main: { provider: "faux", modelId: "other" } },
    ]) {
      const changed = createOptChat({ ...config, ...change });
      for (const inspect of [changed.check, changed.prepare]) {
        await assert.rejects(inspect(tracked.storage), /models or budgets differ/);
        assert.equal(tracked.commits(), before, "mismatch must be rejected without a commit");
      }
    }
    assert.equal(
      (await tracked.storage.scanConversations({}, 10, undefined, context)).items.length,
      0,
    );
    assert.equal(tracked.closes(), 0);
  } finally {
    await tracked.storage.close(context);
  }
});

test("a preflight does not reserve storage or replace preparation's configuration check", async () => {
  const config = fixtureConfig();
  const first = createOptChat(config);
  const changed = createOptChat({ ...config, viewBytes: 4096 });
  const tracked = trackedStorage();
  try {
    assert.equal((await first.check(tracked.storage)).mode, "new");
    assert.equal((await changed.prepare(tracked.storage)).mode, "new");
    const before = tracked.commits();
    await assert.rejects(first.prepare(tracked.storage), /models or budgets differ/);
    assert.equal(tracked.commits(), before);
    assert.equal((await changed.check(tracked.storage)).mode, "current");
  } finally {
    await tracked.storage.close(context);
  }
});

test("read-only preflight reports pending host tasks without executing or closing storage", async () => {
  const tracked = trackedStorage();
  const HostTask = defineTask<null, { phase: "run" }, null>({
    name: "host.pending",
    version: 1,
    initial: () => ({ phase: "run" }),
    phases: { run: async () => assert.fail("preflight must not run a task") },
    abort: async () => assert.fail("preflight must not abort a task"),
  });
  const session = createSession(tracked.storage);
  try {
    const task = await session.commit(async (tx) => {
      const conversation = await tx.createConversation({ ownership: { kind: "ownerless" } });
      return tx.createTask(HostTask, null, {
        ownership: { kind: "conversation" },
        conversationId: conversation.id,
      });
    }, context);
    const before = tracked.commits();
    const optchat = createOptChat(fixtureConfig());
    assert.deepEqual(await optchat.check(tracked.storage), { mode: "new", pendingTasks: 1 });
    assert.equal(tracked.commits(), before);
    assert.equal((await tracked.storage.task(task, context))?.state.status, "pending");
    await optchat.prepare(tracked.storage);
    const prepared = tracked.commits();
    assert.deepEqual(await optchat.check(tracked.storage), { mode: "current", pendingTasks: 1 });
    assert.equal(tracked.commits(), prepared);
    assert.equal((await tracked.storage.task(task, context))?.state.status, "pending");
    assert.equal(tracked.closes(), 0);
  } finally {
    await session.close(context);
  }
});

test("an unprepared SDK controller refuses admission before changing the host conversation", async () => {
  const tracked = trackedStorage();
  const optchat = createOptChat(fixtureConfig());
  const registry = createRegistry();
  registry.install(optchat.extension);
  const harness = await Harness.open(
    tracked.storage,
    { registry, models: scriptedModels(() => fauxAssistantMessage("unexpected")) },
    context,
  );
  try {
    const root = await harness.root(context);
    const chat = optchat.attach(harness, root);
    const before = tracked.commits();
    await assert.rejects(chat.enqueue("hello", "rejected"), /optchat.prepare/);
    assert.equal(tracked.commits(), before);
    assert.equal(await chat.request("rejected"), undefined);
  } finally {
    await harness.close(context);
  }
});

for (const kind of ["document", "task"]) {
  test(`unknown ${kind} versions are rejected before storage mutation`, async () => {
    const tracked = trackedStorage();
    const session = createSession(tracked.storage);
    try {
      await session.commit(async (tx) => {
        const conversation = await tx.createConversation({ ownership: { kind: "ownerless" } });
        if (kind === "document") {
          const Future = defineDoc({
            kind: "optchat.memory",
            version: 99,
            scope: "conversation",
            history: "latest",
            fork: "initial",
            initial: () => ({ count: 0 }),
          });
          await tx.doc(Future, conversation.id);
        } else {
          const Future = defineTask<
            Record<string, never>,
            { phase: "step" },
            Record<string, never>
          >({
            name: "optchat.build-memory",
            version: 99,
            initial: () => ({ phase: "step" }),
            phases: { step: async () => {} },
            abort: async () => {},
          });
          await tx.createTask(
            Future,
            {},
            { ownership: { kind: "conversation" }, conversationId: conversation.id },
          );
        }
      }, context);
      const before = tracked.commits();
      const optchat = createOptChat(fixtureConfig());
      for (const inspect of [optchat.check, optchat.prepare]) {
        await assert.rejects(inspect(tracked.storage), /Unsupported OptChat .* version 99/);
        assert.equal(tracked.commits(), before);
      }
    } finally {
      await session.close(context);
    }
  });
}

for (const pending of [false, true]) {
  test(`legacy adoption ${pending ? "refuses pending work" : "requires the original configuration"}`, async () => {
    const config = fixtureConfig();
    const optchat = createOptChat(config);
    const tracked = trackedStorage();
    const session = createSession(tracked.storage);
    try {
      await session.commit(async (tx) => {
        const conversation = await tx.createConversation({ ownership: { kind: "ownerless" } });
        await tx.doc(MemoryDoc, conversation.id);
        if (pending) {
          const OldTask = defineTask<
            Record<string, never>,
            { phase: "step" },
            Record<string, never>
          >({
            name: "optchat.build-memory",
            version: 1,
            initial: () => ({ phase: "step" }),
            phases: { step: async () => {} },
            abort: async () => {},
          });
          await tx.createTask(
            OldTask,
            {},
            { ownership: { kind: "conversation" }, conversationId: conversation.id },
          );
        }
      }, context);
      const before = tracked.commits();
      for (const inspect of [optchat.check, optchat.prepare]) {
        if (pending)
          await assert.rejects(inspect(tracked.storage, { legacyConfig: config }), /pending work/);
        else {
          await assert.rejects(inspect(tracked.storage), /original legacyConfig/);
          await assert.rejects(
            inspect(tracked.storage, { legacyConfig: { ...config, jobs: 2 } }),
            /original legacyConfig/,
          );
        }
        assert.equal(tracked.commits(), before);
      }
      if (!pending) {
        assert.deepEqual(await optchat.check(tracked.storage, { legacyConfig: config }), {
          mode: "legacy",
          pendingTasks: 0,
        });
        assert.equal(tracked.commits(), before, "checking legacy storage must not adopt it");
        assert.equal(
          (await optchat.prepare(tracked.storage, { legacyConfig: config })).mode,
          "legacy",
        );
      }
    } finally {
      await session.close(context);
    }
  });
}

test("Node preflight rejects changed configuration before JSONL tail repair and releases its lock", async () => {
  const directory = await mkdtemp(join(tmpdir(), "optchat-compatible-"));
  const config = fixtureConfig(directory);
  const models = scriptedModels(() => fauxAssistantMessage("recorded"));
  let app = await openApp(config, { models });
  try {
    await app.prompt("ORIGINAL_UNCHANGED", "original");
    await app.settleMemory();
    await app.close();
    await appendFile(join(directory, "pi", "main.jsonl"), '{"incomplete":');
    const before = await archiveHashes(directory);
    await assert.rejects(
      openApp({ ...config, nodeBytes: 1024 }, { models }),
      /models or budgets differ/,
    );
    assert.deepEqual(await archiveHashes(directory), before);
    app = await openApp(config, { models, resume: false });
    assert.ok((await app.search("ORIGINAL_UNCHANGED")).matches.length > 0);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
