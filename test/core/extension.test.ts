import { test } from "node:test";
import assert from "node:assert/strict";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxToolCall, Type } from "@earendil-works/pi-ai";
import {
  createRegistry,
  defineExtension,
  defineTool,
  section,
  Harness,
  MemoryStorage,
  UserEntry,
} from "@earendil-works/pi-durable";
import { openApp } from "../../src/app.js";
import { memoryTools } from "../../src/memory/tools.js";
import { APP_INSTRUCTIONS, LEGACY_MAIN_PROMPT } from "../../src/prompts.js";
import { createOptChat } from "../../src/extension.js";
import { RequestDoc } from "../../src/memory/documents.js";
import { fixtureConfig, scriptedModels, userText } from "../helpers/core.js";

test(
  "native extension works in a host-owned harness and isolates conversations",
  { timeout: 15_000 },
  async () => {
    const context = BACKGROUND_CONTEXT;
    const config = fixtureConfig();
    const optchat = createOptChat(config);
    const registry = createRegistry();
    registry.install(optchat.extension);
    const models = scriptedModels(() => fauxAssistantMessage("Acknowledged."));
    const storage = new MemoryStorage();
    await optchat.prepare(storage);
    const harness = await Harness.open(
      storage,
      { models, registry, settings: optchat.settings },
      context,
    );
    try {
      const first = await harness.root(context, {
        agent: { model: config.main, extensions: [optchat.extension] },
      });
      const second = await harness.createConversation(
        {
          ownership: { kind: "ownerless" },
          agent: { model: config.main, extensions: [optchat.extension] },
        },
        context,
      );
      const unrelated = await harness.createConversation(
        { ownership: { kind: "ownerless" }, agent: { model: config.main, extensions: [] } },
        context,
      );
      const a = optchat.attach(harness, first);
      const b = optchat.attach(harness, second);
      const [ja, jb] = await Promise.all([
        a.enqueue("Project Alpha", "same-id"),
        b.enqueue("Project Beta", "same-id"),
      ]);
      await Promise.all([a.wait(ja.taskId), b.wait(jb.taskId)]);
      await Promise.all([a.settleMemory(), b.settleMemory()]);
      assert.equal((await a.status()).memory.messages, 2);
      assert.equal((await b.status()).memory.messages, 2);
      assert.equal((await a.search("Beta")).matches.length, 0);
      assert.equal((await b.search("Alpha")).matches.length, 0);
      assert.equal((await a.search("Alpha")).matches.length, 1);
      assert.deepEqual((await first.agent(context)).tools.map((t) => t.name).sort(), [
        "date",
        "search",
        "zoom",
      ]);
      assert.deepEqual((await unrelated.agent(context)).tools, []);
      const receipt = await (
        await unrelated.submit(
          { type: "input", content: "A host conversation", requestId: "host-1" },
          context,
        )
      ).wait(context);
      assert.equal(receipt.status, "done");
      assert.equal((await a.search("host conversation")).matches.length, 0);
      assert.equal("close" in a, false, "the controller must not own the host lifecycle");
    } finally {
      await harness.close(context);
    }
  },
);

test(
  "native composition retains host tools and instructions while isolating the compactor",
  { timeout: 15_000 },
  async () => {
    const context = BACKGROUND_CONTEXT;
    const config = fixtureConfig();
    const optchat = createOptChat({ main: config.main, compactor: config.compactor });
    const registry = createRegistry();
    let executions = 0,
      summaries = 0;
    const host = defineExtension({
      name: "host",
      sections: [section("host_rules", () => "HOST_SECTION_AURORA")],
      tools: [
        defineTool({
          name: "project_lookup",
          description: "Read the synthetic project's status",
          parameters: Type.Object({}),
          replay: "safe",
          execute: async () => {
            executions++;
            return { content: [{ type: "text", text: "Aurora is ready." }] };
          },
        }),
      ],
    });
    registry.install(host);
    registry.install(optchat.extension);
    const models = scriptedModels((request) => {
      const tools = request.messages.flatMap((m) =>
        m.role === "system" ? (m.toolsAdded ?? []) : [],
      );
      if (userText(request).includes("<target>")) {
        summaries++;
        assert.equal(tools.length, 0);
        assert.ok(!JSON.stringify(request.messages).includes("HOST_SECTION_AURORA"));
        assert.ok(!JSON.stringify(request.messages).includes("HOST_PERSONA_AURORA"));
        return fauxAssistantMessage("Project Aurora's complete source remains retrievable.");
      }
      assert.ok(JSON.stringify(request.messages).includes("HOST_SECTION_AURORA"));
      assert.ok(JSON.stringify(request.messages).includes("HOST_PERSONA_AURORA"));
      assert.ok(JSON.stringify(request.messages).includes("Memory lines use start+count|summary"));
      assert.ok(
        !JSON.stringify(request.messages).includes(
          "No filesystem, shell, email or browser actions",
        ),
      );
      assert.deepEqual(tools.map((t) => t.name).sort(), [
        "date",
        "project_lookup",
        "search",
        "zoom",
      ]);
      return request.messages.some((m) => m.role === "toolResult")
        ? fauxAssistantMessage("Aurora is ready.")
        : fauxAssistantMessage(fauxToolCall("project_lookup", {}), { stopReason: "toolUse" });
    });
    const storage = new MemoryStorage();
    await optchat.prepare(storage);
    const harness = await Harness.open(
      storage,
      { models, registry, settings: optchat.settings },
      context,
    );
    try {
      // The request task adds its own extension without replacing this existing host selection.
      const root = await harness.root(context, {
        agent: {
          model: config.main,
          extensions: [host],
          instructions: "HOST_PERSONA_AURORA",
          thinkingLevel: "high",
          cwd: "/synthetic-project",
        },
      });
      const chat = optchat.attach(harness, root);
      const input = "Remember this long source for project Aurora. ".repeat(40);
      assert.equal((await chat.prompt(input, "compose-1")).answer, "Aurora is ready.");
      assert.equal((await chat.prompt(input, "compose-1")).answer, "Aurora is ready.");
      assert.equal(executions, 1, "prompt convenience API bypassed idempotency");
      await chat.prompt("Check again", "compose-2");
      await chat.settleMemory();
      assert.equal(executions, 2);
      assert.ok(summaries > 0);
      const agent = await root.agent(context);
      assert.equal(agent.instructions, "HOST_PERSONA_AURORA");
      assert.equal(agent.thinkingLevel, "high");
      assert.equal(agent.cwd, "/synthetic-project");
      assert.deepEqual(
        agent.extensions.map((e) => e.name),
        ["host", "optchat"],
      );
    } finally {
      await harness.close(context);
    }
  },
);

test("known v0.1 instructions migrate and existing source history remains retrievable", async () => {
  const app = await openApp(fixtureConfig(), {
    storage: new MemoryStorage(),
    models: scriptedModels(() => fauxAssistantMessage("Recorded.")),
  });
  try {
    await app.root.configure({ instructions: LEGACY_MAIN_PROMPT }, app.context);
    await app.root.commit(
      (tx) =>
        tx.appendEntry(UserEntry, app.root.id, {
          model: [
            { role: "user", content: "Aurora existed before this upgrade.", timestamp: 1234 },
          ],
        }),
      app.context,
    );
    await app.prompt("Continue", "upgrade");
    const agent = await app.root.agent(app.context);
    assert.equal(agent.instructions, APP_INSTRUCTIONS);
    const raw = await app.zoom(0, 1);
    assert.ok("text" in raw && raw.text.includes("existed before this upgrade"));
    assert.ok((await app.request("upgrade"))?.frozen?.includes("Aurora existed"));
  } finally {
    await app.close();
  }
});

test("a host tool policy excluding memory fails before any model request", async () => {
  let calls = 0;
  const app = await openApp(fixtureConfig(), {
    storage: new MemoryStorage(),
    models: scriptedModels(() => {
      calls++;
      return fauxAssistantMessage("unexpected");
    }),
  });
  try {
    await app.root.configure(
      { tools: { remove: memoryTools().filter((t) => t.name === "zoom") } },
      app.context,
    );
    await assert.rejects(() => app.prompt("hello", "blocked"), /requires zoom, date and search/);
    const stored = await app.harness.snapshot(RequestDoc, app.root.id, "blocked", app.context);
    assert.notEqual(stored?.status, "failed", "the failed phase transaction did not commit");
    const receipt = await app.request("blocked");
    assert.equal(receipt?.status, "failed");
    assert.match(receipt!.error!, /requires zoom, date and search/);
    const status = (await app.status()).requests.find((request) => request.id === "blocked");
    assert.equal(status?.status, receipt?.status);
    assert.equal(status?.error, receipt?.error);
    assert.deepEqual(
      await app.harness.snapshot(RequestDoc, app.root.id, "blocked", app.context),
      stored,
      "inspection must not mutate the failed request or replay its work",
    );
    assert.equal(await app.request("missing"), undefined);
    assert.equal(calls, 0);
    assert.throws(() => createOptChat({ ...fixtureConfig(), jobs: 0 }), /jobs must/);
  } finally {
    await app.close();
  }
});
