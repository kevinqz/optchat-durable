import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { MemoryStorage } from "@earendil-works/pi-durable";
import { openApp } from "../../src/app.js";
import { PiMemoryArchive } from "../../src/pi/archive.js";
import { fingerprint, type Source } from "../../src/pi/sources.js";
import { fixtureConfig, scriptedModels, userText } from "../helpers/core.js";

const source = (id: string, text: string): Source => ({
  id,
  key: `${id}:${fingerprint(text)}`,
  memory: [{ kind: "user", text, timestamp: 1 }],
  original: [{ role: "user", content: text, timestamp: 1 }],
});

for (const samePrefix of [true, false]) {
  test(`concurrent freezes with ${samePrefix ? "identical" : "different"} sources enforce receipt identity`, async () => {
    const app = await openApp(fixtureConfig(), {
      storage: new MemoryStorage(),
      models: scriptedModels(() => fauxAssistantMessage("summary")),
    });
    try {
      const archive = new PiMemoryArchive(app);
      const select = archive.select.bind(archive);
      let selected = 0;
      let release!: () => void;
      const bothSelected = new Promise<void>((resolve) => {
        release = resolve;
      });
      // Both callers have observed an absent receipt before either can publish it.
      archive.select = async (input) => {
        const controller = await select(input);
        if (++selected === 2) release();
        await bothSelected;
        return controller;
      };
      const inputs = [
        [source("a", "FIRST_BRANCH")],
        [source(samePrefix ? "a" : "b", samePrefix ? "FIRST_BRANCH" : "SECOND_BRANCH")],
      ];
      const results = await Promise.allSettled(
        inputs.map((input) => archive.freeze(input, "shared-turn", app.context)),
      );
      const successes = results.filter((result) => result.status === "fulfilled");
      assert.equal(successes.length, samePrefix ? 2 : 1);
      if (samePrefix) {
        assert.deepEqual(successes[0]!.value, successes[1]!.value);
      } else {
        const failure = results.find((result) => result.status === "rejected")!;
        assert.match(String(failure.reason), /historical sources changed/);
        const winner = results.findIndex((result) => result.status === "fulfilled");
        assert.deepEqual(
          await archive.freeze(inputs[winner]!, "shared-turn", app.context),
          successes[0]!.value,
        );
      }
    } finally {
      await app.close();
    }
  });
}

test("native archive reuses prefix summaries without re-summarizing originals or leaking a sibling", async () => {
  const calls: string[] = [];
  const config = { ...fixtureConfig(), viewBytes: 4096 };
  const app = await openApp(config, {
    storage: new MemoryStorage(),
    models: scriptedModels((request) => {
      calls.push(userText(request));
      return fauxAssistantMessage("user: original retained with provenance.");
    }),
  });
  try {
    const archive = new PiMemoryArchive(app);
    const prefix = [
      source("a", "PREFIX_ORIGINAL " + "original words ".repeat(100)),
      source("b", "Common fact"),
    ];
    const first = await archive.select([...prefix, source("c", "SIBLING_SECRET")]);
    await first.settleMemory();
    const before = calls.length;
    const fork = await archive.select([...prefix, source("d", "NEW_BRANCH")]);
    await fork.settleMemory();
    assert.notEqual(first.root.id, fork.root.id);
    assert.equal(
      calls.slice(before).some((call) => call.includes("PREFIX_ORIGINAL")),
      false,
      "immutable common summaries must be reused",
    );
    assert.equal((await fork.search("SIBLING_SECRET")).matches.length, 0);
    assert.equal((await first.search("SIBLING_SECRET")).matches.length, 1);
    const a = await fork.zoom(0, 1);
    const b = await first.zoom(0, 1);
    assert.ok("sourceEntry" in a && "sourceEntry" in b);
    assert.equal(a.sourceEntry, b.sourceEntry);
    const restored = await archive.select([...prefix, source("c", "SIBLING_SECRET")]);
    assert.equal(
      restored.root.id,
      first.root.id,
      "returning to a branch should reuse its existing archive",
    );
  } finally {
    await app.close();
  }
});

test("frozen native views survive later coarsening and a persistent reopen exactly", async () => {
  const directory = await mkdtemp(join(tmpdir(), "optchat-native-receipt-"));
  const config = { ...fixtureConfig(directory), viewBytes: 4096 };
  const input = Array.from({ length: 40 }, (_, i) =>
    source(String(i), `Fact ${i} ` + "a useful original detail ".repeat(10)),
  );
  const models = scriptedModels(() => fauxAssistantMessage("user: facts remain retrievable."));
  let app = await openApp(config, { models });
  try {
    let archive = new PiMemoryArchive(app);
    const frozen = await archive.freeze(input, "turn-1", app.context);
    assert.ok(Buffer.byteLength(frozen.view) <= 4096);
    const extended = [
      ...input,
      ...Array.from({ length: 30 }, (_, i) =>
        source(`new-${i}`, "New historical information ".repeat(15)),
      ),
    ];
    await archive.freeze(extended, "turn-2", app.context);
    await app.close();
    app = await openApp(config, { models, resume: false });
    archive = new PiMemoryArchive(app);
    assert.deepEqual(await archive.freeze(input, "turn-1", app.context), frozen);
    await assert.rejects(
      archive.freeze([source("different", "Changed past")], "turn-1", app.context),
      /historical sources changed/,
    );
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
