import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import type { Usage } from "@earendil-works/pi-ai";
import { protocol, protocolHash } from "./protocol.js";

/** One authorization covers both quality and cache experiments, including repeated runs. */
export const billingPolicy = {
  version: 2,
  model: protocol.model,
  pricingUsdPerMillion: protocol.pricingUsdPerMillion,
  maxAuthorizedUsd: protocol.maxAuthorizedUsd,
};
export const billingHash = createHash("sha256").update(JSON.stringify(billingPolicy)).digest("hex");

export function usageCost(usage: Usage): number {
  const numbers = [
    usage.input,
    usage.output,
    usage.cacheRead,
    usage.cacheWrite,
    usage.cacheWrite1h ?? 0,
  ];
  if (numbers.some((n) => !Number.isSafeInteger(n) || n < 0)) throw new Error("Invalid usage");
  if ((usage.cacheWrite1h ?? 0) > usage.cacheWrite) throw new Error("Invalid cache usage");
  const pricing = protocol.pricingUsdPerMillion;
  const rates =
    usage.input + usage.cacheRead + usage.cacheWrite > pricing.threshold
      ? pricing.long
      : pricing.short;
  return (
    (usage.input * rates.input +
      usage.output * rates.output +
      usage.cacheRead * rates.cacheRead +
      (usage.cacheWrite - (usage.cacheWrite1h ?? 0)) * rates.cacheWrite +
      (usage.cacheWrite1h ?? 0) * rates.cacheWrite1h) /
    1_000_000
  );
}

type Event =
  | { type: "reserve"; id: string; usd: number; trial: string; protocolHash: string }
  | { type: "settle"; id: string; usd: number };

/** Caller holds a process-wide writer lock. Pending/uncertain calls retain their whole reservation. */
export class Budget {
  private entries = new Map<string, { usd: number; settled: boolean }>();
  exceeded = false;
  constructor(
    readonly path: string,
    readonly capUsd: number,
    readonly experimentHash: string = protocolHash,
  ) {
    if (!/^[a-f0-9]{64}$/.test(experimentHash)) throw new Error("Invalid experiment protocol hash");
    if (!Number.isFinite(capUsd) || capUsd <= 0 || capUsd > protocol.maxAuthorizedUsd)
      throw new Error(`Explicit --budget-usd must be in (0, ${protocol.maxAuthorizedUsd}]`);
    if (!existsSync(path))
      writeFileSync(
        path,
        JSON.stringify({ type: "header", version: 2, billingHash, capUsd }) + "\n",
        {
          flag: "wx",
          mode: 0o600,
          flush: true,
        },
      );
    const source = readFileSync(path, "utf8");
    if (!source.endsWith("\n"))
      throw new Error("Torn budget ledger; do not resume or reset its budget");
    const lines = source
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const header = lines.shift();
    const legacy = header?.version === undefined && header?.protocolHash === protocolHash;
    if (
      header?.type !== "header" ||
      (!legacy && (header.version !== 2 || header.billingHash !== billingHash)) ||
      header.capUsd !== capUsd
    )
      throw new Error("Budget ledger billing policy/cap mismatch");
    if (legacy && experimentHash !== protocolHash)
      throw new Error(
        "Legacy ledger is bound to the quality protocol; do not reset its budget to run another experiment",
      );
    for (const line of lines) {
      // Preserve historical reservations without rewriting the ledger or forgetting any charge.
      const event =
        legacy && line?.type === "reserve" && line.protocolHash === undefined
          ? { ...line, protocolHash }
          : line;
      this.validate(event);
      this.apply(event);
    }
  }
  private validate(event: Event) {
    if (
      !event ||
      !["reserve", "settle"].includes(event.type) ||
      typeof event.id !== "string" ||
      !event.id ||
      !Number.isFinite(event.usd) ||
      event.usd < 0
    )
      throw new Error("Invalid budget event");
    const previous = this.entries.get(event.id);
    if (event.type === "reserve") {
      if (
        typeof event.trial !== "string" ||
        !event.trial ||
        !/^[a-f0-9]{64}$/.test(event.protocolHash)
      )
        throw new Error("Invalid budget reservation");
      if (previous) throw new Error("Duplicate reservation");
    } else if (!previous || previous.settled) throw new Error("Invalid settlement");
  }
  private apply(event: Event) {
    this.entries.set(event.id, { usd: event.usd, settled: event.type === "settle" });
    this.exceeded ||= this.committedUsd > this.capUsd;
  }
  private append(event: Event) {
    this.validate(event);
    appendFileSync(this.path, JSON.stringify(event) + "\n", { flush: true });
    this.apply(event);
  }
  get committedUsd() {
    return [...this.entries.values()].reduce((sum, item) => sum + item.usd, 0);
  }
  get pendingCalls() {
    return [...this.entries.values()].filter((item) => !item.settled).length;
  }
  reserve(trial: string) {
    // Full context priced at the most expensive published input/cache rate, plus bounded output.
    const { input, cacheRead, cacheWrite, cacheWrite1h, output } =
      protocol.pricingUsdPerMillion.long;
    const usd =
      (protocol.model.contextWindow * Math.max(input, cacheRead, cacheWrite, cacheWrite1h) +
        protocol.model.maxOutputTokens * output) /
      1_000_000;
    if (this.exceeded || this.committedUsd + usd > this.capUsd)
      throw new Error("Evaluation spending cap reached; no request dispatched");
    const id = randomUUID();
    this.append({ type: "reserve", id, usd, trial, protocolHash: this.experimentHash });
    return id;
  }
  settle(id: string, usage: Usage) {
    if (!this.entries.has(id) || this.entries.get(id)!.settled)
      throw new Error("Unknown or already settled reservation");
    this.append({ type: "settle", id, usd: usageCost(usage) });
  }
  cost(usage: Usage) {
    return usageCost(usage);
  }
}
