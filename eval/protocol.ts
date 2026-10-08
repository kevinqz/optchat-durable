import { createHash } from "node:crypto";
import { corpusHash } from "./corpus.js";

/** Change the ID and rerun when any gate, corpus, model or sampling rule changes. */
export const protocol = {
  id: "native-haiku-5.5-v1",
  corpusVersion: 1,
  corpusHash,
  piVersion: "1.1.0",
  model: {
    provider: "anthropic",
    id: "claude-haiku-5-5",
    contextWindow: 1_000_000,
    maxOutputTokens: 8192,
  },
  arms: ["ordinary-pi", "optchat-native"] as const,
  repeats: 3,
  thinking: "medium" as const,
  cacheRetention: "none" as const,
  providerRetries: 0,
  providerTimeoutMs: 60_000,
  trialTimeoutMs: 600_000,
  maxCallsPerTrial: 512,
  maxAuthorizedUsd: 25,
  pricingUsdPerMillion: {
    threshold: 100_000,
    short: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125, cacheWrite1h: 0.2 },
    long: { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625, cacheWrite1h: 1 },
  },
  gates: {
    overallAccuracy: 0.9,
    categoryAccuracy: 0.8,
    maxPairedAccuracyRegression: 0.05,
    exactSourceFraction: 1,
    forbiddenAnswerCount: 0,
    trialFailureCount: 0,
    p95PreparationMs: 300_000,
    p95TotalMs: 600_000,
    maxMeanUsdPerOptchatTrial: 0.25,
    maxCostRatio: 100,
  },
};
export const protocolHash = createHash("sha256").update(JSON.stringify(protocol)).digest("hex");
