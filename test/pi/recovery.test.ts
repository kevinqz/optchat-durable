import assert from "node:assert/strict";
import { test } from "node:test";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { fauxAssistantMessage, getCurrentSystemPrompt, type Message } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { host } from "../helpers/pi.js";

test(
  "SIGKILL in native memory preparation resumes the same summary context without replaying host work",
  { timeout: 30_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-native-kill-"));
    const child = fork(
      fileURLToPath(new URL("../fixtures/pi-crash-worker.ts", import.meta.url)),
      [directory],
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
    let pi: Awaited<ReturnType<typeof host>> | undefined;
    try {
      const ready = await Promise.race([
        once(child, "message").then(
          ([message]) => message as { sessionFile: string; messages: Message[] },
        ),
        exited.then(() => {
          throw new Error(errors);
        }),
      ]);
      child.kill("SIGKILL");
      await exited;
      const summaries: Message[][] = [];
      let main = 0;
      pi = await host(
        directory,
        (request) => {
          if (getCurrentSystemPrompt(request.messages).includes("You maintain the memory index")) {
            summaries.push(structuredClone(request.messages));
            return fauxAssistantMessage("talk: CRASH_ORIGINAL Unicode evidence preserved.");
          }
          main++;
          return fauxAssistantMessage("Recovered memory.");
        },
        "default",
        { native: true, session: SessionManager.open(ready.sessionFile) },
      );
      const tool = pi.runner.getToolDefinition("optchat_memory")!;
      const result = await tool.execute(
        "inspect",
        { action: "search", query: "CRASH_ORIGINAL" },
        undefined,
        undefined,
        pi.runner.createToolContext("inspect", undefined),
      );
      assert.match(JSON.stringify(result.content), /CRASH_ORIGINAL/);
      assert.equal(summaries.length, 0, "opening/searching may not resume billable work");
      assert.equal(main, 0);
      await pi.session.prompt("Continue with the recorded evidence.");
      assert.equal(main, 1, "only the explicitly submitted new host prompt may execute");
      assert.deepEqual(
        summaries[0],
        ready.messages,
        "the interrupted durable summary must retain its exact context",
      );
      assert.deepEqual(pi.notifications, []);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await exited;
      }
      await pi?.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
