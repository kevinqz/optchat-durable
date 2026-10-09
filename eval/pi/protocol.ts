import { createHash } from "node:crypto";
import { corpusHash } from "../corpus.js";
import { scenario, seedRecords, turns } from "../cache/scenario.js";
import { cacheProtocol as anthropicCache } from "../cache/protocol.js";
import type { CacheSpec } from "../cache/spec.js";
import type { ProviderLimits, QualitySpec } from "../spec.js";

export const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const model = {
  provider: "openai",
  id: "gpt-5.5",
  api: "openai-responses" as const,
  contextWindow: 272_000,
  maxOutputTokens: 128_000,
};

/** Provider tokens bound the workload; they do not measure the account's remaining quota. */
export const tokenPolicy = {
  version: 1,
  model,
  maxAuthorizedTokens: 100_000_000,
  maxAuthorizedCalls: 10_000,
  reservationTokens: model.contextWindow + model.maxOutputTokens,
  accounting: "input + cacheRead + cacheWrite + output; reasoning is already included in output",
  uncertainCalls: "retain full reservation",
  apiKeyFallback: false,
};
export const tokenPolicyHash = hash(tokenPolicy);
const shared = {
  piVersion: "1.1.0",
  model,
  arms: ["ordinary-pi", "optchat-native"] as const,
  repeats: 3,
  thinking: "off" as const,
  cacheRetention: "short" as const,
  cachePolicy: "provider-automatic; not disabled or guaranteed warm",
  outputPolicy:
    "reserve full pinned catalog ceiling; subscription requests omit unsupported max_output_tokens",
  providerRetries: 0,
  providerTimeoutMs: 60_000,
  stopOnProviderError: true,
  accounting: "subscription-tokens" as const,
  tokenPolicyHash,
};

/** A new study, not a replacement for the frozen Anthropic API-price comparison. */
export const piQualityProtocol = {
  id: "native-pi-chatgpt-gpt-5.5-v1",
  ...shared,
  corpusVersion: 1,
  corpusHash,
  trialTimeoutMs: 600_000,
  maxCallsPerTrial: 512,
  gates: {
    overallAccuracy: 0.9,
    categoryAccuracy: 0.8,
    maxPairedAccuracyRegression: 0.05,
    exactSourceFraction: 1,
    forbiddenAnswerCount: 0,
    trialFailureCount: 0,
    p95PreparationMs: 300_000,
    p95TotalMs: 600_000,
    maxMeanTokensPerOptchatTrial: 500_000,
    maxTokenRatio: 100,
  },
} satisfies QualitySpec & ProviderLimits & { [key: string]: unknown };
export const piQualityHash = hash(piQualityProtocol);

// Identical input texts, but a five-and-a-half-minute idle interval is not an OpenAI TTL proof.
export const piCacheTurns = (nonce: string, repeat: number) =>
  turns(nonce, repeat).map((turn) => ({
    ...turn,
    phase: turn.phase === "expired" ? ("idle" as const) : turn.phase,
  }));
const piScenario = { ...scenario, version: 2, pausePhase: "idle" };
export const piScenarioHash = hash({
  scenario: piScenario,
  seed: seedRecords("canonical-fixture", 0),
  turns: piCacheTurns("canonical-fixture", 0),
});
export const piCacheProtocol = {
  id: "native-cache-pi-chatgpt-gpt-5.5-v1",
  ...shared,
  scenario: piScenario,
  scenarioHash: piScenarioHash,
  trialTimeoutMs: 3_600_000,
  maxCallsPerTrial: 2048,
  idlePauseMs: 330_000,
  pauseInterpretation: "observed idle interval; cache expiry is not established",
  systemPrompt: anthropicCache.systemPrompt,
  memory: anthropicCache.memory,
  warmPhases: ["warm", "growth", "resumed", "rewarmed"],
  gates: {
    exactSourceFraction: 1,
    ackFraction: 1,
    trialFailureCount: 0,
    minimumBatchesPerNativeTrial: 1,
    minimumWarmMainTokenReadFraction: 0.8,
    matchingRestartStatus: true,
    minimumIdleGapMs: 330_000,
  },
} satisfies ProviderLimits & { [key: string]: unknown };
export const piCacheHash = hash(piCacheProtocol);
export const piCacheSpec: CacheSpec = {
  ...piCacheProtocol,
  seedCount: piCacheProtocol.scenario.seedRecords,
  seed: seedRecords,
  turns: piCacheTurns,
  pause: { phase: "idle", milliseconds: piCacheProtocol.idlePauseMs },
  minimumBatches: piCacheProtocol.gates.minimumBatchesPerNativeTrial,
  minimumWarmTokenReadFraction: piCacheProtocol.gates.minimumWarmMainTokenReadFraction,
  requireCost: false,
};
