import type { SessionSpec } from "../spec.js";
import { cacheProtocol as p } from "./protocol.js";
import { seedRecords, turns, type Turn } from "./scenario.js";

/** Map frozen protocol data to the shared lifecycle without renaming historical evidence. */
export type CacheSpec = SessionSpec & {
  id: string;
  arms: readonly ("ordinary-pi" | "optchat-native")[];
  repeats: number;
  trialTimeoutMs: number;
  systemPrompt: string;
  memory: typeof p.memory;
  seedCount: number;
  seed: typeof seedRecords;
  turns: (nonce: string, repeat: number) => Turn[];
  pause: { phase: "expired" | "idle"; milliseconds: number };
  warmPhases: readonly string[];
  minimumBatches: number;
  minimumWarmTokenReadFraction: number;
  requireCost: boolean;
};
export const legacyCacheSpec: CacheSpec = {
  ...p,
  seedCount: p.scenario.seedRecords,
  seed: seedRecords,
  turns,
  pause: { phase: "expired", milliseconds: p.expiryPauseMs },
  minimumBatches: p.gates.minimumBatchesPerNativeTrial,
  minimumWarmTokenReadFraction: p.gates.minimumWarmMainTokenReadFraction,
  requireCost: true,
};
