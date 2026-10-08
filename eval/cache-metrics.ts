import type { Call } from "./provider.js";

/** Pi's Anthropic usage separates uncached input, cache reads and cache writes. */
export function cacheMetrics(calls: readonly Pick<Call, "usage">[], measured: boolean) {
  const known = calls.flatMap(({ usage }) =>
    usage &&
    [usage.input, usage.cacheRead, usage.cacheWrite].every((n) => Number.isSafeInteger(n) && n >= 0)
      ? [{ read: usage.cacheRead, write: usage.cacheWrite, input: usage.input }]
      : [],
  );
  const input = known.reduce((n, c) => n + c.input, 0);
  const read = known.reduce((n, c) => n + c.read, 0);
  const write = known.reduce((n, c) => n + c.write, 0);
  const total = input + read + write;
  const fractions = known
    .flatMap((c) => {
      const n = c.input + c.read + c.write;
      return n ? [c.read / n] : [];
    })
    .sort((a, b) => a - b);
  const complete = measured && known.length === calls.length;
  const percentile = (p: number) =>
    complete && fractions.length
      ? fractions[Math.max(0, Math.ceil(fractions.length * p) - 1)]!
      : null;
  return {
    measured,
    calls: calls.length,
    unknownUsageCalls: calls.length - known.length,
    uncachedInputTokens: input,
    cacheReadTokens: read,
    cacheWriteTokens: write,
    totalInputTokens: total,
    tokenReadFraction: complete && total ? read / total : null,
    requestsWithInput: fractions.length,
    requestHitFraction:
      complete && fractions.length
        ? fractions.filter((n) => n > 0).length / fractions.length
        : null,
    perRequestReadFraction: { p10: percentile(0.1), p50: percentile(0.5), p95: percentile(0.95) },
  };
}
