import type { Api, ModelThinkingLevel, Usage } from "@earendil-works/pi-ai";

/** Execution contracts shared by independently frozen provider studies. */
export type SessionSpec = {
  model: {
    provider: string;
    id: string;
    api?: Api;
    contextWindow: number;
    maxOutputTokens: number;
  };
  thinking: ModelThinkingLevel;
};
export type ProviderLimits = Pick<SessionSpec, "model"> & {
  providerRetries: number;
  providerTimeoutMs: number;
  maxCallsPerTrial: number;
  cacheRetention: "none" | "short" | "long";
  stopOnProviderError?: boolean;
  accounting?: "subscription-tokens";
};
export type CallBudget = {
  reserve(trial: string): string;
  settle(id: string, usage: Usage): void;
  cost(usage: Usage): number | undefined;
};
export type QualitySpec = SessionSpec & {
  id: string;
  arms: readonly ("ordinary-pi" | "optchat-native")[];
  repeats: number;
  trialTimeoutMs: number;
  gates: {
    overallAccuracy: number;
    categoryAccuracy: number;
    maxPairedAccuracyRegression: number;
    exactSourceFraction: number;
    forbiddenAnswerCount: number;
    trialFailureCount: number;
    p95PreparationMs: number;
    p95TotalMs: number;
  } & (
    | { maxMeanUsdPerOptchatTrial: number; maxCostRatio: number }
    | { maxMeanTokensPerOptchatTrial: number; maxTokenRatio: number }
  );
};
