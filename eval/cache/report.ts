import type { Arm } from "../session.js";
import type { Call } from "../provider.js";
import { cacheMetrics } from "../cache-metrics.js";
import { percentile } from "../report.js";
import { legacyCacheSpec, type CacheSpec } from "./spec.js";
import type { CacheTrialResult } from "./trial.js";

export type CacheTrial = {
  repeat: number;
  arm: Arm;
  calls: Call[];
  result?: CacheTrialResult;
  error?: "trial-failed";
};
const batches = (calls: Call[]) =>
  calls.filter((c) => c.stage === "main" && c.view?.appendOnlyFromPrevious === false);

export function cacheReport(trials: CacheTrial[], dry: boolean, p: CacheSpec = legacyCacheSpec) {
  const phases = [...new Set(p.turns("canonical-fixture", 0).map((t) => t.phase))];
  const warmMain = (calls: Call[]) =>
    calls.filter((c) => c.stage === "main" && p.warmPhases.includes(c.label?.phase ?? ""));
  const group = (calls: Call[]) => ({
    ...cacheMetrics(calls, !dry),
    knownCostUsd: p.requireCost ? calls.reduce((n, c) => n + (c.costUsd ?? 0), 0) : null,
    unknownCostCalls: calls.filter((c) => c.costUsd === undefined).length,
    latencyMs: {
      p50: percentile(
        calls.map((c) => c.elapsedMs),
        0.5,
      ),
      p95: percentile(
        calls.map((c) => c.elapsedMs),
        0.95,
      ),
    },
  });
  const summarize = (calls: Call[]) => ({
    all: group(calls),
    main: group(calls.filter((c) => c.stage === "main")),
    summary: group(calls.filter((c) => c.stage === "summary")),
  });
  const arms = Object.fromEntries(
    p.arms.map((arm) => {
      const rows = trials.filter((t) => t.arm === arm);
      const calls = rows.flatMap((t) => t.calls);
      return [
        arm,
        {
          ...summarize(calls),
          warmMain: cacheMetrics(warmMain(calls), !dry),
          phases: Object.fromEntries(
            phases.map((phase) => [
              phase,
              summarize(calls.filter((c) => c.label?.phase === phase)),
            ]),
          ),
          batchRequests: summarize(batches(calls)),
          trials: rows.map((t) => ({
            repeat: t.repeat,
            failure: !!t.error || !t.result || t.result.failure,
            batches: batches(t.calls).length,
            warmMain: cacheMetrics(warmMain(t.calls), !dry),
            ...t.result,
          })),
        },
      ];
    }),
  );
  const complete =
    trials.length === p.arms.length * p.repeats &&
    p.arms.every((arm) =>
      Array.from(
        { length: p.repeats },
        (_, repeat) => trials.filter((t) => t.arm === arm && t.repeat === repeat).length === 1,
      ).every(Boolean),
    );
  const native = trials.filter((t) => t.arm === "optchat-native");
  const sequence = p.turns("canonical-fixture", 0);
  const gates = {
    complete,
    noFailures:
      trials.length > 0 &&
      trials.every(
        (t) =>
          !t.error &&
          t.result &&
          !t.result.failure &&
          cacheMetrics(t.calls, !dry).unknownUsageCalls === 0 &&
          t.calls.every(
            (c) =>
              !["error", "aborted", "length"].includes(c.stop) &&
              (!p.requireCost || (Number.isFinite(c.costUsd) && c.costUsd! >= 0)),
          ),
      ),
    completeTurns:
      trials.length > 0 &&
      trials.every(
        (t) =>
          t.result?.turns.length === sequence.length &&
          t.result.turns.every(
            (turn, i) =>
              turn.number === i &&
              turn.phase === sequence[i]!.phase &&
              turn.ack &&
              turn.mainCalls === 1,
          ),
      ),
    sources:
      native.length > 0 &&
      native.every(
        (t) =>
          (t.result?.expectedSources ?? 0) >= p.seedCount + 1 + 2 * sequence.length &&
          t.result?.exactSources === t.result?.expectedSources,
      ),
    batches: native.length > 0 && native.every((t) => batches(t.calls).length >= p.minimumBatches),
    restart: trials.length > 0 && trials.every((t) => t.result?.restartStatusMatches === true),
    [p.pause.phase === "idle" ? "idleGap" : "expiryGap"]:
      !dry &&
      trials.length > 0 &&
      trials.every(
        (t) =>
          ((p.pause.phase === "idle" ? t.result?.idleGapMs : t.result?.expiryGapMs) ?? -1) >=
          p.pause.milliseconds,
      ),
    warmMain:
      !dry &&
      native.length > 0 &&
      native.every(
        (t) =>
          (cacheMetrics(warmMain(t.calls), true).tokenReadFraction ?? -1) >=
          p.minimumWarmTokenReadFraction,
      ),
  };
  return {
    schema: p.requireCost ? "optchat-cache-report/v1" : "optchat-subscription-cache-report/v1",
    protocol: p.id,
    dry,
    measured: !dry,
    passed: !dry && Object.values(gates).every(Boolean),
    gates,
    arms,
  };
}
