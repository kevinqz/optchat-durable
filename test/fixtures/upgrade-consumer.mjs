import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createModels, fauxProvider, fauxAssistantMessage } from "@earendil-works/pi-ai";
import { configFromEnv, openApp } from "optchat-durable";

// Copied into independent consumers of the published candidate and current tarball.
// Every OptChat/Pi import is public; no private module is used to seed or inspect state.
const [action, directory] = process.argv.slice(2);
const config = {
  ...configFromEnv({ OPTCHAT_DEMO: "1", OPTCHAT_DATA_DIR: directory }),
  main: { provider: "faux", modelId: "upgrade" },
  compactor: { provider: "faux", modelId: "upgrade" },
};
const models = createModels();
const faux = fauxProvider({
  models: [{ id: "upgrade", contextWindow: 272_000, maxTokens: 16_384 }],
});
let started;
const ready = new Promise((resolve) => {
  started = resolve;
});
let calls = 0;
const respond = async (request, options) => {
  faux.appendResponses([respond]);
  calls++;
  const text = JSON.stringify(request.messages);
  if (
    action === "pending" &&
    text.includes("PENDING_UPGRADE_REQUEST") &&
    !text.includes("<target>")
  ) {
    started();
    await new Promise((_resolve, reject) =>
      options.signal.addEventListener("abort", () => reject(new Error("shutdown")), { once: true }),
    );
  }
  return fauxAssistantMessage(
    text.includes("<target>") ? "UPGRADE_SOURCE original is retrievable." : "Recorded.",
  );
};
faux.setResponses([respond]);
models.setProvider(faux.provider);

if (action === "reject-pending") {
  await assert.rejects(openApp(config, { models, legacyConfig: config }), /pending work/);
  assert.equal(calls, 0);
} else {
  if (action === "upgrade")
    await assert.rejects(openApp(config, { models }), /original legacyConfig/);
  const app = await openApp(config, {
    models,
    ...(action === "upgrade" ? { legacyConfig: config } : {}),
  });
  try {
    if (action === "seed") {
      await app.prompt("UPGRADE_SOURCE ação🙂 ".repeat(80), "source");
      await app.settleMemory();
      const source = (await app.root.entries({}, 100, undefined, app.context)).items.find(
        (entry) => entry.kind === "pi.user",
      );
      const branch = await app.root.fork(
        source.id,
        { ownership: { kind: "ownerless" } },
        app.context,
      );
      const fork = app.forConversation(branch);
      await fork.prompt("BRANCH_ONLY", "branch");
      await app.prompt("SIBLING_ONLY", "sibling");
      await fork.settleMemory();
      await app.settleMemory();
      await writeFile(
        join(directory, "fixture.json"),
        JSON.stringify({ branch: branch.id, original: await app.zoom(0, 1) }),
      );
    } else if (action === "pending") {
      await app.enqueue("PENDING_UPGRADE_REQUEST", "pending");
      await ready;
    } else if (action === "settle") {
      const request = await app.request("pending");
      await app.wait(request.task);
      await app.settleMemory();
    } else {
      const fixture = JSON.parse(await readFile(join(directory, "fixture.json"), "utf8"));
      const fork = app.forConversation(await app.harness.conversation(fixture.branch, app.context));
      assert.deepEqual(await app.zoom(0, 1), fixture.original);
      assert.deepEqual(await fork.zoom(0, 1), fixture.original);
      assert.equal((await app.search("BRANCH_ONLY")).matches.length, 0);
      assert.equal((await fork.search("SIBLING_ONLY")).matches.length, 0);
      assert.equal((await app.search("SIBLING_ONLY")).matches.length, 1);
      assert.equal((await fork.search("BRANCH_ONLY")).matches.length, 1);
      if (action === "upgrade") {
        await app.prompt("Continue after the verified upgrade.", "after-upgrade");
        await app.settleMemory();
        assert.deepEqual(await app.zoom(0, 1), fixture.original);
      }
    }
  } finally {
    await app.close();
  }
}
console.log(`PASS ${action}`);
