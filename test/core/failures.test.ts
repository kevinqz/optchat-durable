import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { MemoryStorage } from "@earendil-works/pi-durable";
import { openApp } from "../../src/app.js";
import { fixtureConfig, scriptedModels, userText } from "../helpers/core.js";

test("invalid and oversized UTF-8 inputs fail before admission without truncating valid input", async () => {
  let calls = 0;
  const app = await openApp(
    { ...fixtureConfig(), maxInputBytes: 512 },
    {
      storage: new MemoryStorage(),
      models: scriptedModels(() => {
        calls++;
        return fauxAssistantMessage("recorded");
      }),
    },
  );
  try {
    for (const input of ["", "  \n", "🙂".repeat(129)])
      await assert.rejects(app.enqueue(input, "invalid"), /nonempty and at most 512 UTF-8 bytes/);
    await assert.rejects(app.enqueue("hello", "invalid/id"), /Invalid request ID/);
    assert.equal(await app.request("invalid"), undefined);
    assert.equal((await app.harness.inspect(app.context)).tasks.length, 0);
    assert.equal(calls, 0);
    const input = "🙂".repeat(128);
    await app.prompt(input, "valid");
    const original = await app.zoom(0, 1);
    assert.ok("text" in original);
    assert.equal(original.text, `user: ${input}`);
  } finally {
    await app.close();
  }
});

for (const failure of ["unavailable", "empty"] as const) {
  test(`${failure} compactor replies exhaust the configured limit and block main inference`, async () => {
    const attempts = new Map<string, number>();
    let main = 0;
    const config = { ...fixtureConfig(), failureTries: 3, sizeTries: 4 };
    const app = await openApp(config, {
      storage: new MemoryStorage(),
      models: scriptedModels((request, options) => {
        if (userText(request).includes("<target>")) {
          const session = options!.sessionId!;
          attempts.set(session, (attempts.get(session) ?? 0) + 1);
          return failure === "empty"
            ? fauxAssistantMessage("")
            : fauxAssistantMessage("", {
                stopReason: "error",
                errorMessage: "Injected provider outage",
              });
        }
        main++;
        return fauxAssistantMessage("Initial answer.");
      }),
    });
    try {
      const source = "PRESERVED_ORIGINAL ".repeat(100);
      await app.prompt(source, "first");
      const next = await app.enqueue("May proceed only with complete memory", "blocked");
      await assert.rejects(app.wait(next.taskId), /Compactor did not answer|Empty summary/);
      assert.equal(main, 1);
      assert.ok(attempts.size > 0);
      for (const count of attempts.values()) assert.equal(count, failure === "empty" ? 4 : 3);
      assert.equal((await app.request("blocked"))?.frozen, null);
      assert.equal((await app.request("blocked"))?.status, "failed");
      const original = await app.zoom(0, 1);
      assert.ok("text" in original);
      assert.equal(original.text, `user: ${source}`);
    } finally {
      await app.close();
    }
  });
}
