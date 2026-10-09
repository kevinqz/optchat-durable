import { appendFileSync } from "node:fs";
import { join } from "node:path";
import {
  fauxAssistantMessage,
  fauxProvider,
  type FauxResponseFactory,
  type Provider,
} from "@earendil-works/pi-ai";
import { corpus } from "../corpus.js";
import { meterProvider } from "../provider.js";
import { runTrial } from "../host.js";
import { report, type TrialRecord } from "../report.js";
import { cacheFauxProvider } from "../cache/faux.js";
import { runCacheTrial } from "../cache/trial.js";
import { cacheReport, type CacheTrial } from "../cache/report.js";
import { piQualityProtocol as quality, piCacheProtocol as cache, piCacheSpec } from "./protocol.js";
import type { TokenBudget } from "./budget.js";

type Run = { directory: string; live: boolean; base?: Provider; budget?: TokenBudget };
const save = (path: string, value: unknown) =>
  appendFileSync(path, JSON.stringify(value) + "\n", { mode: 0o600, flush: true });
const stopped = (meter: ReturnType<typeof meterProvider>, run: Run) =>
  meter.blocked || run.budget?.exceeded;
export function qualityFauxProvider() {
  const faux = fauxProvider({
    api: quality.model.api,
    provider: quality.model.provider,
    models: [
      {
        id: quality.model.id,
        contextWindow: quality.model.contextWindow,
        maxTokens: quality.model.maxOutputTokens,
      },
    ],
  });
  const respond: FauxResponseFactory = () => {
    faux.appendResponses([respond]);
    return fauxAssistantMessage('{"answer":null}'); // No answer key and never scored.
  };
  faux.setResponses([respond]);
  return faux.provider;
}

export async function qualityStudy(run: Run, chosen?: string[]) {
  const cases = chosen ? corpus.filter((c) => chosen.includes(c.id)) : corpus;
  const trials: TrialRecord[] = [];
  runs: for (let repeat = 0; repeat < (run.live ? quality.repeats : 1); repeat++) {
    for (const [index, item] of cases.entries()) {
      const arms = (repeat + index) % 2 ? [...quality.arms].reverse() : quality.arms;
      for (const arm of arms) {
        const id = `${repeat}-${item.id}-${arm}`;
        const meter = meterProvider(
          run.base ?? qualityFauxProvider(),
          id,
          join(run.directory, "calls.jsonl"),
          run.budget,
          quality,
        );
        const trial: TrialRecord = { case: item.id, repeat, arm, calls: meter.calls };
        try {
          trial.result = await runTrial(
            join(run.directory, id),
            item,
            arm,
            meter,
            !run.live,
            quality,
          );
          const status = trial.result.memoryStatus;
          if (status)
            trial.result.memoryStatus = {
              mode: status.mode,
              memory: status.memory,
              compactor: status.compactor,
              pendingTasks: status.pendingTasks,
              error: status.error ? "memory-failed" : null,
            }; // Keep private paths/session IDs and host API-price estimates out of trial evidence.
        } catch {
          trial.error = "trial-failed";
        }
        trials.push(trial);
        save(join(run.directory, "trials.jsonl"), trial);
        console.log(
          JSON.stringify({
            trial: id,
            failure: !!trial.error || trial.result?.failure,
            calls: meter.calls.length,
            committedTokens: run.budget?.committedTokens ?? null,
          }),
        );
        if (stopped(meter, run)) break runs;
      }
    }
  }
  return {
    outcome: report(trials, !run.live, quality),
    rehearsalFailed: trials.some((t) => t.error || t.result?.failure),
  };
}

export async function cacheStudy(run: Run, nonce: string) {
  const trials: CacheTrial[] = [];
  runs: for (let repeat = 0; repeat < (run.live ? cache.repeats : 1); repeat++) {
    const arms = repeat % 2 ? [...cache.arms].reverse() : cache.arms;
    for (const arm of arms) {
      const id = `${repeat}-${arm}`;
      const meter = meterProvider(
        run.base ?? cacheFauxProvider(cache),
        id,
        join(run.directory, "calls.jsonl"),
        run.budget,
        cache,
      );
      const trial: CacheTrial = { repeat, arm, calls: meter.calls };
      try {
        trial.result = await runCacheTrial(
          join(run.directory, id),
          arm,
          meter,
          nonce,
          repeat,
          !run.live,
          (turn) => {
            save(join(run.directory, "turns.jsonl"), { trial: id, ...turn });
            console.log(
              JSON.stringify({
                trial: id,
                ...turn,
                committedTokens: run.budget?.committedTokens ?? null,
              }),
            );
          },
          piCacheSpec,
        );
      } catch {
        trial.error = "trial-failed";
      }
      trials.push(trial);
      save(join(run.directory, "trials.jsonl"), trial);
      if (stopped(meter, run)) break runs;
    }
  }
  const outcome = cacheReport(trials, !run.live, piCacheSpec);
  return {
    outcome,
    rehearsalFailed:
      trials.some((t) => t.error || t.result?.failure) ||
      !outcome.gates.sources ||
      !outcome.gates.batches ||
      !outcome.gates.restart,
  };
}
