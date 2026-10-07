import { test } from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fauxAssistantMessage, type Message } from "@earendil-works/pi-ai";
import type { TaskId } from "@earendil-works/pi-durable";
import { openApp } from "../src/app.js";
import { fixtureConfig, scriptedModels } from "./support.js";
import type { RequestResult } from "../src/request-task.js";

for (const mode of ["answer", "compactor"]) test(`SIGKILL recovery during ${mode} preserves the exact request and a single writer`, { timeout: 30_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "optchat-recovery-"));
  const child = fork(fileURLToPath(new URL("./fixtures/crash-worker.ts", import.meta.url)), [directory, mode], {
    execArgv: ["--import", "tsx"], stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let errors = "";
  child.stderr?.on("data", chunk => { errors += String(chunk); });
  const exit = once(child, "exit");
  let app: Awaited<ReturnType<typeof openApp>> | undefined;
  try {
    const ready = await Promise.race([
      once(child, "message").then(([message]) => message as { taskId: TaskId<RequestResult>; frozen: string; messages: Message[] }),
      exit.then(() => { throw new Error(`Child exited early: ${errors}`); }),
    ]);
    const config = fixtureConfig(directory);
    const captured: Message[][] = [];
    const models = scriptedModels(context => { captured.push(context.messages); return fauxAssistantMessage(mode === "answer" ? "Aurora confirmada via memória." : "Usuário solicita preservar integralmente os dados de Aurora."); });
    await assert.rejects(() => openApp(config, { models }), /Another OptChat process owns/);
    child.kill("SIGKILL");
    await exit;
    app = await openApp(config, { models, resume: false });
    await app.status();
    assert.equal(captured.length, 0, "read-only inspection resumed a model request");
    if (mode === "answer") {
      assert.equal((await app.wait(ready.taskId)).answer, "Aurora confirmada via memória.");
      assert.equal((await app.request("crash"))?.frozen, ready.frozen);
    }
    await app.settleMemory();
    assert.deepEqual(captured[0], ready.messages, "provider context changed on recovery");
    const history = await app.history();
    assert.equal(history.items.filter(m => m.kind === "user").length, mode === "answer" ? 2 : 1, "duplicated user input on replay");
    if (mode === "answer") {
      assert.equal(history.items.filter(m => m.kind === "tool").length, 1);
      assert.equal(history.items.filter(m => m.kind === "echo").length, 1);
    }
    const view = (await app.status()).memory.view;
    await app.close();
    app = await openApp(config, { models });
    assert.equal((await app.status()).memory.view, view, "persisted view changed merely by reopening");
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exit; }
    await app?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
