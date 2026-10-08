import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { MemoryStorage } from "@earendil-works/pi-durable";
import { openApp } from "../../src/app.js";
import { fixtureConfig, scriptedModels } from "../helpers/core.js";

async function until(predicate: () => Promise<boolean>) {
  const deadline = Date.now() + 5_000;
  while (!(await predicate())) {
    assert.ok(Date.now() < deadline, "queue did not reach the expected state");
    await setImmediate();
  }
}

test("cancelling a middle request preserves the barrier behind the active predecessor", async () => {
  let release!: () => void;
  let started!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  let calls = 0;
  const app = await openApp(fixtureConfig(), {
    storage: new MemoryStorage(),
    models: scriptedModels(async () => {
      if (++calls === 1) {
        started();
        await blocked;
        return fauxAssistantMessage("FIRST_COMPLETED_ANSWER");
      }
      return fauxAssistantMessage("LAST_COMPLETED_ANSWER");
    }),
  });
  try {
    const first = await app.enqueue("First input", "first");
    await ready;
    const middle = await app.enqueue("Cancelled input", "middle");
    const last = await app.enqueue("Last input", "last");
    await until(async () => {
      const task = await app.harness.getTask(last.taskId, app.context);
      return task?.state.status === "waiting" && task.state.on.includes(middle.taskId);
    });
    await app.cancel("middle");
    await assert.rejects(app.wait(middle.taskId), /aborted/);
    await until(async () => {
      const task = await app.harness.getTask(last.taskId, app.context);
      return (
        task?.state.status === "terminal" ||
        (task?.state.status === "waiting" && task.state.on.includes(first.taskId))
      );
    });
    const lastTask = await app.harness.getTask(last.taskId, app.context);
    assert.equal(
      lastTask?.state.status,
      "waiting",
      "the active predecessor must still be a barrier",
    );
    assert.equal((await app.request("last"))?.frozen, null);
    assert.equal(calls, 1);
    release();
    assert.equal((await app.wait(first.taskId)).answer, "FIRST_COMPLETED_ANSWER");
    assert.equal((await app.wait(last.taskId)).answer, "LAST_COMPLETED_ANSWER");
    const receipt = await app.request("last");
    assert.equal(receipt?.through, 2);
    assert.match(receipt!.frozen!, /FIRST_COMPLETED_ANSWER/);
    assert.doesNotMatch(receipt!.frozen!, /Cancelled input/);
    assert.equal(calls, 2, "the cancelled input must never reach the model");
  } finally {
    release();
    await app.close();
  }
});
