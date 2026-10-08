import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { appendFile, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { exportArchive, inspectArchive } from "../../src/recovery.js";
import { archiveHashes } from "../helpers/files.js";

test(
  "a journal orphaned before Pi's first flush exports without repair, credentials or replay",
  { timeout: 30_000 },
  async () => {
    const temporary = await mkdtemp(join(tmpdir(), "optchat-orphan-"));
    const child = fork(
      fileURLToPath(new URL("../fixtures/orphan-worker.ts", import.meta.url)),
      [temporary],
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
    try {
      const ready = await Promise.race([
        once(child, "message").then(
          ([message]) => message as { directory: string; sessionFile: string },
        ),
        exited.then(() => {
          throw new Error(errors);
        }),
      ]);
      assert.equal(
        existsSync(ready.sessionFile),
        false,
        "fixture must die before Pi's first transcript flush",
      );
      await assert.rejects(inspectArchive(ready.directory), /Another OptChat process owns/);
      child.kill("SIGKILL");
      await exited;
      // An uncommitted torn tail is repaired only on the disposable inspection copy.
      await appendFile(join(ready.directory, "pi", "main.jsonl"), '{"torn":');
      const before = await archiveHashes(ready.directory);
      const info = await inspectArchive(ready.directory);
      assert.equal(info.host?.sessionFile, ready.sessionFile);
      assert.ok(info.entryKinds["optchat.pi.journal"]! > 0);
      const output = join(temporary, "recovered.jsonl");
      await exportArchive(ready.directory, output);
      const lines = (await readFile(output, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      assert.equal(lines[0].format, "optchat-archive");
      assert.equal(lines.at(-1).type, "summary");
      const entries = lines.filter((line) => line.type === "entry");
      assert.equal(new Set(entries.map((line) => line.record.id)).size, entries.length);
      const journals = entries.filter((line) => line.record.kind === "optchat.pi.journal");
      assert.ok(
        journals.some((line) =>
          JSON.stringify(line.record.data.original).includes("ORPHAN_ORIGINAL ação🙂"),
        ),
      );
      assert.ok(journals.every((line) => line.commitSeq > 0 && "parent" in line.record.data));
      assert.equal((await stat(output)).mode & 0o777, 0o600);
      await assert.rejects(exportArchive(ready.directory, output), /EEXIST/);
      await assert.rejects(
        exportArchive(ready.directory, join(ready.directory, "export.jsonl")),
        /outside the source/,
      );
      assert.deepEqual(await archiveHashes(ready.directory), before);
      assert.equal(
        existsSync(ready.sessionFile),
        false,
        "inspection must not synthesize a Pi transcript",
      );

      // A complete corrupt record is not an ignorable torn tail.
      const main = join(ready.directory, "pi", "main.jsonl");
      const committed = (await readFile(main, "utf8")).slice(0, -'{"torn":'.length);
      await writeFile(main, committed + "{}\n");
      const corrupt = await archiveHashes(ready.directory);
      await assert.rejects(inspectArchive(ready.directory), /Invalid commit marker/);
      assert.deepEqual(await archiveHashes(ready.directory), corrupt);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await exited;
      }
      await rm(temporary, { recursive: true, force: true });
    }
  },
);
