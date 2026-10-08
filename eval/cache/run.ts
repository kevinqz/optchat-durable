import { readFile, writeFile } from "node:fs/promises";
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { evaluationEnvironment } from "../environment.js";
import { meterProvider } from "../provider.js";
import { cacheProtocol, cacheProtocolHash } from "./protocol.js";
import { cacheFauxProvider } from "./faux.js";
import { runCacheTrial } from "./trial.js";
import { cacheReport, type CacheTrial } from "./report.js";

const { values } = parseArgs({
  options: {
    live: { type: "boolean", default: false },
    output: { type: "string" },
    ledger: { type: "string" },
    "budget-usd": { type: "string" },
  },
});
if (!values.output)
  throw new Error(
    "Use --output NEW_DIRECTORY; live also requires --budget-usd N --ledger SHARED_DIRECTORY and ANTHROPIC_API_KEY",
  );
const live = values.live;
const frozen = JSON.parse(
  await readFile(new URL("../protocols/native-cache-haiku-5.5-v1.json", import.meta.url), "utf8"),
);
if (
  frozen.protocolHash !== cacheProtocolHash ||
  JSON.stringify(frozen.protocol) !== JSON.stringify(cacheProtocol)
)
  throw new Error("Cache protocol/scenario changed; freeze a new version before evaluation");
const { directory, revision, runtimeVersions, budget, unlock } = await evaluationEnvironment(
  values.output,
  live,
  values.ledger,
  values["budget-usd"],
  cacheProtocolHash,
);
const nonce = randomUUID();
try {
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify(
      {
        protocol: cacheProtocol,
        protocolHash: cacheProtocolHash,
        revision,
        nonce,
        live,
        startedAt: new Date().toISOString(),
        node: process.version,
        runtimeVersions,
        authorizationCapUsd: budget?.capUsd ?? null,
        restart: "same-process-public-runtime-reopen",
        expiryPauseSkipped: !live,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  const trials: CacheTrial[] = [];
  runs: for (let repeat = 0; repeat < (live ? cacheProtocol.repeats : 1); repeat++) {
    const arms = repeat % 2 ? [...cacheProtocol.arms].reverse() : cacheProtocol.arms;
    for (const arm of arms) {
      const id = `${repeat}-${arm}`;
      const meter = meterProvider(
        live ? anthropicProvider() : cacheFauxProvider(),
        id,
        join(directory, "calls.jsonl"),
        budget,
        cacheProtocol,
      );
      const trial: CacheTrial = { repeat, arm, calls: meter.calls };
      try {
        trial.result = await runCacheTrial(
          join(directory, id),
          arm,
          meter,
          nonce,
          repeat,
          !live,
          (turn) => {
            appendFileSync(
              join(directory, "turns.jsonl"),
              JSON.stringify({ trial: id, ...turn }) + "\n",
              { mode: 0o600, flush: true },
            );
            console.log(
              JSON.stringify({
                trial: id,
                phase: turn.phase,
                turn: turn.number,
                ack: turn.ack,
                committedUsd: budget?.committedUsd ?? 0,
              }),
            );
          },
        );
      } catch {
        trial.error = "trial-failed";
      }
      trials.push(trial);
      appendFileSync(join(directory, "trials.jsonl"), JSON.stringify(trial) + "\n", {
        mode: 0o600,
        flush: true,
      });
      if (meter.blocked || budget?.exceeded) break runs;
    }
  }
  const outcome = cacheReport(trials, !live);
  const billingSettledWithinCap = !budget?.exceeded && (budget?.pendingCalls ?? 0) === 0;
  const result = {
    ...outcome,
    passed: outcome.passed && billingSettledWithinCap,
    billingSettledWithinCap,
    committedUsd: budget?.committedUsd ?? 0,
    pendingBillingReservations: budget?.pendingCalls ?? 0,
  };
  await writeFile(join(directory, "report.json"), JSON.stringify(result, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    JSON.stringify({ report: join(directory, "report.json"), passed: result.passed, dry: !live }),
  );
  if (
    live
      ? !result.passed
      : trials.some((t) => t.error || t.result?.failure) ||
        !result.gates.sources ||
        !result.gates.batches ||
        !result.gates.restart
  )
    process.exitCode = 1;
} finally {
  unlock();
}
