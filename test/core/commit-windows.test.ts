import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { openApp } from "../../src/app.js";
import { fixtureConfig, scriptedModels, userText } from "../helpers/core.js";

for (const boundary of ["admission", "source", "summary", "freeze", "answer", "delivery"]) {
  for (const edge of ["before", "after"]) {
    test(
      `SIGKILL ${edge} ${boundary} commit preserves source, receipt and admission identity`,
      { timeout: 30_000 },
      async () => {
        const directory = await mkdtemp(join(tmpdir(), "optchat-commit-window-"));
        const child = fork(
          fileURLToPath(new URL("../fixtures/commit-window-worker.ts", import.meta.url)),
          [directory, boundary, edge],
          {
            execArgv: ["--import", "tsx"],
            stdio: ["ignore", "pipe", "pipe", "ipc"],
          },
        );
        const exited = once(child, "exit");
        let errors = "";
        child.stderr?.on("data", (data) => {
          errors += String(data);
        });
        let app: Awaited<ReturnType<typeof openApp>> | undefined;
        try {
          await Promise.race([
            once(child, "message"),
            exited.then(() => {
              throw new Error(errors);
            }),
          ]);
          child.kill("SIGKILL");
          await exited;
          let mainCalls = 0;
          let summaryCalls = 0;
          app = await openApp(fixtureConfig(directory), {
            resume: false,
            models: scriptedModels((request) => {
              if (userText(request).includes("<target>")) {
                summaryCalls++;
                return fauxAssistantMessage("ORIGINAL fact preserved.");
              }
              mainCalls++;
              return fauxAssistantMessage("COMMIT_ANSWER");
            }),
          });
          const frozen = (await app.request("crash"))?.frozen;
          if (boundary !== "summary") {
            const request = await app.enqueue("COMMIT_QUESTION: verify the original.", "crash");
            const duplicate = await app.enqueue("COMMIT_QUESTION: verify the original.", "crash");
            assert.equal(duplicate.taskId, request.taskId);
            assert.equal((await app.wait(request.taskId)).answer, "COMMIT_ANSWER");
            const completed = await app.request("crash");
            assert.equal(completed?.through, 2);
            if (frozen !== null && frozen !== undefined) assert.equal(completed?.frozen, frozen);
            await assert.rejects(app.enqueue("Different content", "crash"), /different text/);
            const callsExpected =
              boundary === "delivery" || (boundary === "answer" && edge === "after") ? 0 : 1;
            assert.equal(
              mainCalls,
              callsExpected,
              "an already committed answer must not invoke the provider again",
            );
          }
          await app.settleMemory();
          assert.equal(
            summaryCalls,
            0,
            "a committed compactor answer can be adopted without another provider call",
          );
          const original = await app.zoom(0, 1);
          assert.ok("text" in original);
          assert.equal(original.text, "user: " + "ORIGINAL ação🙂 ".repeat(80));
          const entries = (await app.root.entries({}, 100, undefined, app.context)).items;
          assert.equal(
            entries.filter((entry) => entry.kind === "optchat.view").length,
            boundary === "summary" ? 1 : 2,
          );
          const history = await app.history();
          assert.equal(
            history.items.filter((message) => message.kind === "user").length,
            boundary === "summary" ? 1 : 2,
          );
        } finally {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
            await exited;
          }
          await app?.close();
          await rm(directory, { recursive: true, force: true });
        }
      },
    );
  }
}
