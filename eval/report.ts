import { corpus } from "./corpus.js";
import type { runTrial, Arm } from "./host.js";
import { protocol } from "./protocol.js";
import type { Call } from "./provider.js";
import { cacheMetrics } from "./cache-metrics.js";
import type { QualitySpec } from "./spec.js";

export type TrialRecord = {
  case: string;
  repeat: number;
  arm: Arm;
  calls: Call[];
  result?: Awaited<ReturnType<typeof runTrial>>;
  error?: "trial-failed";
};
export const percentile = (values: number[], p: number) =>
  values.length
    ? [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)]!
    : null;

/** Descriptive cluster bootstrap: resample cases, retaining their correlated repeats. */
export function interval(values: number[]) {
  if (!values.length) return null;
  let state = 0x4f505443;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const estimates = Array.from(
    { length: 2000 },
    () =>
      Array.from(
        { length: values.length },
        () => values[Math.floor(random() * values.length)]!,
      ).reduce((s, n) => s + n, 0) / values.length,
  );
  return [percentile(estimates, 0.025), percentile(estimates, 0.975)];
}

export function report(trials: TrialRecord[], dry: boolean, spec: QualitySpec = protocol) {
  const subscription = "maxMeanTokensPerOptchatTrial" in spec.gates;
  const successes = (rows: TrialRecord[]) =>
    rows.filter((r) => !r.error && !r.result?.failure && r.result?.scoring?.correct).length;
  const rate = (rows: TrialRecord[]) => (rows.length ? successes(rows) / rows.length : 0);
  const arms = Object.fromEntries(
    spec.arms.map((arm) => {
      const rows = trials.filter((t) => t.arm === arm);
      const calls = rows.flatMap((r) => r.calls);
      const costs = calls.map((c) => c.costUsd ?? 0);
      const categories = Object.fromEntries(
        [...new Set(corpus.map((c) => c.category))].map((category) => {
          const ids = corpus.filter((c) => c.category === category).map((c) => c.id);
          const group = rows.filter((t) => ids.includes(t.case));
          return [
            category,
            {
              trials: group.length,
              correct: successes(group),
              accuracy: dry ? null : rate(group),
              interval95: dry
                ? null
                : interval(ids.map((id) => rate(group.filter((t) => t.case === id)))),
            },
          ];
        }),
      );
      const times = (key: "preparationMs" | "totalMs") =>
        rows.flatMap((r) => (typeof r.result?.[key] === "number" ? [r.result[key]!] : []));
      return [
        arm,
        {
          trials: rows.length,
          failures: rows.filter((r) => r.error || !r.result || r.result.failure).length,
          accuracy: dry ? null : rate(rows),
          interval95: dry
            ? null
            : interval(corpus.map((c) => rate(rows.filter((t) => t.case === c.id)))),
          abstentions: dry ? null : rows.filter((r) => r.result?.scoring?.abstained).length,
          forbiddenAnswers: rows.filter((r) => r.result?.scoring?.leak).length,
          exactSources: rows.reduce((s, r) => s + (r.result?.exactSources ?? 0), 0),
          expectedSources: rows.reduce((s, r) => s + (r.result?.expectedSources ?? 0), 0),
          preparationMs: {
            p50: percentile(times("preparationMs"), 0.5),
            p95: percentile(times("preparationMs"), 0.95),
          },
          totalMs: {
            p50: percentile(times("totalMs"), 0.5),
            p95: percentile(times("totalMs"), 0.95),
          },
          costUsd: subscription ? null : costs.reduce((s, c) => s + c, 0),
          unknownUsageCalls: calls.filter((c) => !c.usage).length,
          calls: calls.length,
          summaryCalls: calls.filter((c) => c.stage === "summary").length,
          cache: {
            all: cacheMetrics(calls, !dry),
            main: cacheMetrics(
              calls.filter((c) => c.stage === "main"),
              !dry,
            ),
            summary: cacheMetrics(
              calls.filter((c) => c.stage === "summary"),
              !dry,
            ),
          },
          tokens: Object.fromEntries(
            ["input", "output", "cacheRead", "cacheWrite"].map((key) => [
              key,
              calls.reduce((sum, c) => sum + (c.usage?.[key as "input"] ?? 0), 0),
            ]),
          ),
          archiveBytes: rows.map((r) => ({
            case: r.case,
            repeat: r.repeat,
            before: r.result?.bytesBefore ?? null,
            after: r.result?.bytesAfter ?? null,
          })),
          categories,
        },
      ];
    }),
  );
  const native = arms["optchat-native"]!;
  const baseline = arms["ordinary-pi"]!;
  const complete =
    trials.length === corpus.length * spec.repeats * spec.arms.length &&
    corpus.every((c) =>
      spec.arms.every((arm) =>
        Array.from(
          { length: spec.repeats },
          (_, repeat) =>
            trials.filter((t) => t.case === c.id && t.arm === arm && t.repeat === repeat).length ===
            1,
        ).every(Boolean),
      ),
    );
  const gates = spec.gates;
  const totalTokens = (arm: typeof native) =>
    Object.values(arm.tokens).reduce((sum, n) => sum + n, 0);
  const resources =
    "maxMeanTokensPerOptchatTrial" in gates
      ? {
          tokens:
            !dry &&
            native.trials > 0 &&
            totalTokens(native) / native.trials <= gates.maxMeanTokensPerOptchatTrial,
          tokenRatio:
            !dry &&
            totalTokens(baseline) > 0 &&
            totalTokens(native) / totalTokens(baseline) <= gates.maxTokenRatio,
        }
      : {
          cost:
            !dry &&
            native.trials > 0 &&
            native.costUsd! / native.trials <= gates.maxMeanUsdPerOptchatTrial,
          costRatio:
            !dry &&
            baseline.costUsd! > 0 &&
            native.costUsd! / baseline.costUsd! <= gates.maxCostRatio,
        };
  const checks = {
    complete,
    realProvider: !dry,
    accuracy: !dry && native.accuracy! >= gates.overallAccuracy,
    categories:
      !dry && Object.values(native.categories).every((c) => c.accuracy! >= gates.categoryAccuracy),
    baselineRegression:
      !dry && native.accuracy! - baseline.accuracy! >= -gates.maxPairedAccuracyRegression,
    originals:
      native.expectedSources > 0 &&
      native.exactSources / native.expectedSources === gates.exactSourceFraction,
    forbiddenAnswers: !dry && native.forbiddenAnswers === gates.forbiddenAnswerCount,
    failures: native.failures + baseline.failures === gates.trialFailureCount,
    measuredUsage: native.unknownUsageCalls + baseline.unknownUsageCalls === 0,
    preparation:
      native.preparationMs.p95 !== null && native.preparationMs.p95 <= gates.p95PreparationMs,
    latency: native.totalMs.p95 !== null && native.totalMs.p95 <= gates.p95TotalMs,
    ...resources,
  };
  return {
    schema: subscription ? "optchat-subscription-quality-report/v1" : "optchat-quality-report/v1",
    dry,
    complete,
    passed: Object.values(checks).every(Boolean),
    checks,
    arms,
    pairedDifferenceInterval95: dry
      ? null
      : interval(
          corpus.map(
            (c) =>
              rate(trials.filter((t) => t.case === c.id && t.arm === "optchat-native")) -
              rate(trials.filter((t) => t.case === c.id && t.arm === "ordinary-pi")),
          ),
        ),
  };
}
