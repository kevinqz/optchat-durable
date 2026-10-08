import assert from "node:assert/strict";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { cpus, platform, release } from "node:os";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createModels, fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { UserEntry } from "@earendil-works/pi-durable";
import { openApp } from "../src/app.js";
import { resolveOptChatConfig } from "../src/config.js";

export async function directoryBytes(directory: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(path);
    else if (entry.isFile()) total += (await stat(path)).size;
  }
  return total;
}

/** A disk/fsync workload, not a recall or model-cost benchmark. Never reads credentials. */
export async function measureStorage(
  directory: string,
  records: number,
  progress: (value: Record<string, unknown>) => Promise<void> = async () => {},
) {
  let calls = 0;
  const faux = fauxProvider({ models: [{ id: "storage", contextWindow: 1_000_000 }] });
  const respond = () => {
    calls++;
    faux.appendResponses([respond]);
    return fauxAssistantMessage("Synthetic interval; open originals for exact records.");
  };
  faux.setResponses([respond]);
  const models = createModels();
  models.setProvider(faux.provider);
  const ref = { provider: "faux", modelId: "storage" };
  const config = {
    ...resolveOptChatConfig({ main: ref, compactor: ref }),
    directory,
    demo: true,
  };
  const reports: string[] = [];
  const app = await openApp(config, {
    models,
    resume: false,
    onReport: (e) => reports.push(String(e)),
  });
  const start = performance.now();
  try {
    for (let offset = 0; offset < records; offset += 256) {
      await app.root.commit(async (tx) => {
        for (let i = offset; i < Math.min(records, offset + 256); i++)
          await tx.appendEntry(UserEntry, app.root.id, {
            model: [
              {
                role: "user",
                content: `record-${i}: value=${i * 7}; Unicode=ação 🌳`,
                timestamp: 1_700_000_000_000 + i,
              },
            ],
          });
      }, app.context);
    }
    const admittedMs = performance.now() - start;
    const bytesBeforeBuild = await directoryBytes(directory);
    await progress({ phase: "admitted", records, admittedMs, bytesBeforeBuild });
    const preparing = performance.now();
    await app.settleMemory();
    const prepareMs = performance.now() - preparing;
    await progress({ phase: "prepared", records, prepareMs });
    const status = await app.status();
    assert.equal(status.memory.messages, records);
    assert.equal(status.memory.summarized, records);
    assert.ok(status.memory.viewBytes <= config.viewBytes);
    const queries: number[] = [];
    for (const index of [...new Set([0, 1, 63, 255, Math.floor(records / 2), records - 1])]) {
      const at = performance.now();
      const raw = await app.zoom(index, 1);
      queries.push(performance.now() - at);
      assert.ok("text" in raw);
      assert.equal(raw.text, `user: record-${index}: value=${index * 7}; Unicode=ação 🌳`);
      assert.equal(raw.timestamp, new Date(1_700_000_000_000 + index).toISOString());
    }
    await app.close();
    const bytesAfterBuild = await directoryBytes(directory);
    await progress({ phase: "closed", records, bytesAfterBuild, sampledSources: queries.length });
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        "--max-old-space-size=4096",
        "--import",
        "tsx",
        fileURLToPath(new URL("./reopen.ts", import.meta.url)),
        directory,
        String(records),
      ],
      { timeout: 1_800_000, maxBuffer: 1_000_000 },
    );
    const reopened = JSON.parse(stdout.trim()) as {
      reopenMs: number;
      exactLastSourceAfterReopen: boolean;
      peakRssBytes: number;
    };
    assert.equal(reopened.exactLastSourceAfterReopen, true);
    assert.deepEqual(reports, []);
    return {
      records,
      admittedMs,
      prepareMs,
      reopenMs: reopened.reopenMs,
      reopenPeakRssBytes: reopened.peakRssBytes,
      retrievalMs: queries,
      bytesBeforeBuild,
      bytesAfterBuild,
      viewBytes: status.memory.viewBytes,
      fauxSummaryCalls: calls,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
      sourceSamplesPassed: queries.length,
      exactLastSourceAfterReopen: true,
    };
  } finally {
    await app.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2];
  const records = Number(process.argv[3]);
  if (!directory || ![1000, 10_000, 100_000].includes(records))
    throw new Error("Usage: npm run eval:storage -- NEW_DIRECTORY 1000|10000|100000");
  await mkdir(directory, { mode: 0o700 }); // never reuse an archive or overwrite a result
  let phase: Record<string, unknown> = { phase: "starting", records };
  let result: unknown;
  let failed = false;
  try {
    result = await measureStorage(join(directory, "archive"), records, async (value) => {
      phase = value;
      await writeFile(join(directory, "progress.jsonl"), JSON.stringify(value) + "\n", {
        flag: "a",
        mode: 0o600,
        flush: true,
      });
      console.log(JSON.stringify(value));
    });
  } catch (error) {
    failed = true;
    result = {
      failed: true,
      lastCompletedPhase: phase,
      code: (error as NodeJS.ErrnoException).code ?? null,
      signal: (error as { signal?: string }).signal ?? null,
    };
    process.exitCode = 1;
  }
  const report = {
    schema: "optchat-storage-evaluation/v1",
    kind: "synthetic-no-network",
    status: failed ? "failed" : "completed",
    environment: {
      node: process.version,
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model,
    },
    backend: "Pi Durable 1.1.0 Node JSONL; fsync=true",
    config: { nodeBytes: 512, viewBytes: 128_000, jobs: 8 },
    result,
  };
  await writeFile(join(directory, "result.json"), JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
  });
  console.log(JSON.stringify(report));
}
