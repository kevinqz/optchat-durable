import { createHash } from "node:crypto";

export const scenario = {
  version: 1,
  seedRecords: 320,
  seedWidth: 440,
  promptWidth: 480,
  warmTurns: 12,
  growthTurns: 160,
  resumedTurns: 3,
  rewarmedTurns: 2,
};
export type Phase = "cold" | "warm" | "growth" | "restart" | "resumed" | "expired" | "rewarmed";
export type Turn = { number: number; phase: Phase; text: string; ack: string };
const padded = (text: string, width: number) =>
  (text + " Neutral archival sensor data: no external actions are requested.".repeat(width)).slice(
    0,
    width,
  );

/** A fresh run nonce reduces cross-run message-prefix reuse; it cannot flush a provider's cache. */
export function seedRecords(nonce: string, repeat: number): string[] {
  return Array.from({ length: scenario.seedRecords }, (_, i) =>
    padded(
      `Synthetic archive ${nonce} repetition ${repeat} record ${i}: sensor ${i * 31 + 7}.`,
      scenario.seedWidth,
    ),
  );
}
export function turns(nonce: string, repeat: number): Turn[] {
  const phases: Phase[] = [
    "cold",
    ...Array<Phase>(scenario.warmTurns).fill("warm"),
    ...Array<Phase>(scenario.growthTurns).fill("growth"),
    "restart",
    ...Array<Phase>(scenario.resumedTurns).fill("resumed"),
    "expired",
    ...Array<Phase>(scenario.rewarmedTurns).fill("rewarmed"),
  ];
  return phases.map((phase, number) => {
    const ack = `R${repeat}-T${String(number).padStart(3, "0")}`;
    return {
      number,
      phase,
      ack,
      text: padded(
        `Reply with exactly {"ack":"${ack}"}. Synthetic cache probe ${nonce}; this turn is ${number}.`,
        scenario.promptWidth,
      ),
    };
  });
}
export const scenarioHash = createHash("sha256")
  .update(
    JSON.stringify({
      scenario,
      seed: seedRecords("canonical-fixture", 0),
      turns: turns("canonical-fixture", 0),
    }),
  )
  .digest("hex");
