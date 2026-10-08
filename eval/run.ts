import { readFile, writeFile } from "node:fs/promises";
import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { join } from "node:path";
import {
  fauxAssistantMessage,
  fauxProvider,
  type FauxResponseFactory,
  type Provider,
} from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { corpus, corpusHash } from "./corpus.js";
import { protocol, protocolHash } from "./protocol.js";
import { meterProvider } from "./provider.js";
import { runTrial } from "./host.js";
import { report, type TrialRecord } from "./report.js";
import { evaluationEnvironment } from "./environment.js";

const { values } = parseArgs({
  options: {
    live: { type: "boolean", default: false },
    output: { type: "string" },
    "budget-usd": { type: "string" },
    ledger: { type: "string" },
    cases: { type: "string" },
  },
});
if (!values.output)
  throw new Error(
    "Use --output NEW_DIRECTORY; live also requires --budget-usd N --ledger SHARED_DIRECTORY and ANTHROPIC_API_KEY",
  );
const live = values.live;
if (
  live &&
  (!process.env.ANTHROPIC_API_KEY || !values.ledger || !values["budget-usd"] || values.cases)
)
  throw new Error(
    "Live qualification requires an API key, explicit shared budget ledger/cap and the complete corpus",
  );
const frozen = JSON.parse(
  await readFile(new URL("./protocols/native-haiku-5.5-v1.json", import.meta.url), "utf8"),
);
if (
  frozen.protocolHash !== protocolHash ||
  frozen.corpusHash !== corpusHash ||
  JSON.stringify(frozen.protocol) !== JSON.stringify(protocol)
)
  throw new Error("Protocol/corpus changed; freeze a new version before evaluation");
const { directory, revision, runtimeVersions, budget, unlock } = await evaluationEnvironment(
  values.output,
  live,
  values.ledger,
  values["budget-usd"],
);

try {
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify(
      {
        protocol,
        protocolHash,
        corpusHash,
        revision,
        live,
        startedAt: new Date().toISOString(),
        node: process.version,
        runtimeVersions,
        authorizationCapUsd: budget?.capUsd ?? null,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  const chosen = values.cases?.split(",");
  if (chosen?.some((id) => !corpus.some((c) => c.id === id)))
    throw new Error("Unknown dry-run case");
  const cases = chosen ? corpus.filter((c) => chosen.includes(c.id)) : corpus;
  const trials: TrialRecord[] = [];
  runs: for (let repeat = 0; repeat < (live ? protocol.repeats : 1); repeat++) {
    for (const [index, item] of cases.entries()) {
      // Alternate paired order without opportunistic cherry-picking or shared sessions.
      const arms = (repeat + index) % 2 ? [...protocol.arms].reverse() : protocol.arms;
      for (const arm of arms) {
        const id = `${repeat}-${item.id}-${arm}`;
        let base: Provider = anthropicProvider();
        if (!live) {
          const faux = fauxProvider({
            provider: protocol.model.provider,
            models: [
              {
                id: protocol.model.id,
                contextWindow: protocol.model.contextWindow,
                maxTokens: 128_000,
              },
            ],
          });
          const respond: FauxResponseFactory = () => {
            faux.appendResponses([respond]);
            return fauxAssistantMessage('{"answer":null}'); // no answer-key access; never scored
          };
          faux.setResponses([respond]);
          base = faux.provider;
        }
        const meter = meterProvider(base, id, join(directory, "calls.jsonl"), budget);
        const trial: TrialRecord = { case: item.id, repeat, arm, calls: meter.calls };
        try {
          trial.result = await runTrial(join(directory, id), item, arm, meter, !live);
        } catch {
          trial.error = "trial-failed";
        }
        trials.push(trial);
        appendFileSync(join(directory, "trials.jsonl"), JSON.stringify(trial) + "\n", {
          mode: 0o600,
          flush: true,
        });
        console.log(
          JSON.stringify({
            trial: id,
            failure: !!trial.error || trial.result?.failure,
            calls: meter.calls.length,
            committedUsd: budget?.committedUsd ?? 0,
          }),
        );
        if (meter.blocked || budget?.exceeded) break runs;
      }
    }
  }
  const outcome = report(trials, !live);
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
  if (live ? !result.passed : trials.some((t) => t.error || t.result?.failure))
    process.exitCode = 1;
} finally {
  unlock();
}
