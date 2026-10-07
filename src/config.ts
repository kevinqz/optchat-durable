import { resolve } from "node:path";
import type { ModelRef } from "@earendil-works/pi-durable";

export type OptChatConfig = {
  main: ModelRef; compactor: ModelRef;
  nodeBytes: number; viewBytes: number; jobs: number; sizeTries: number;
  retryMs: number; failureTries: number; maxInputBytes: number; maxOutputTokens: number;
};

export type AppConfig = OptChatConfig & { directory: string; demo: boolean };

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const provider = env.OPTCHAT_PROVIDER ?? (env.ANTHROPIC_API_KEY && !env.OPENAI_API_KEY ? "anthropic" : "openai");
  if (!["openai", "anthropic"].includes(provider)) throw new Error("OPTCHAT_PROVIDER must be openai or anthropic");
  const compactorProvider = env.OPTCHAT_COMPACTOR_PROVIDER ?? provider;
  if (!["openai", "anthropic"].includes(compactorProvider)) throw new Error("Invalid compactor provider");
  const integer = (name: string, fallback: number, min: number, max: number): number => {
    const value = env[name] === undefined ? fallback : Number(env[name]);
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be ${min}..${max}`);
    return value;
  };
  const demo = env.OPTCHAT_DEMO === "1";
  return {
    directory: resolve(env.OPTCHAT_DATA_DIR ?? (demo ? ".optchat/demo" : ".optchat/live")), demo,
    main: { provider: demo ? "faux" : provider, modelId: demo ? "optchat-demo" : env.OPTCHAT_MODEL ?? (provider === "anthropic" ? "claude-opus-4-8" : "gpt-6-sol") },
    compactor: { provider: demo ? "faux" : compactorProvider, modelId: demo ? "optchat-demo" : env.OPTCHAT_COMPACTOR_MODEL ?? (compactorProvider === "anthropic" ? "claude-haiku-4-5" : "gpt-6-luna") },
    nodeBytes: 512, viewBytes: integer("OPTCHAT_VIEW_BYTES", 128_000, 4096, 256_000),
    jobs: integer("OPTCHAT_COMPACTOR_JOBS", 8, 1, 8), sizeTries: 5, retryMs: 10_000, failureTries: 3,
    maxInputBytes: integer("OPTCHAT_MAX_INPUT_BYTES", 32_000, 512, 128_000),
    maxOutputTokens: integer("OPTCHAT_MAX_OUTPUT_TOKENS", 8192, 512, 32_768),
  };
}
