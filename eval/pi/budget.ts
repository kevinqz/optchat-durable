import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { Usage } from "@earendil-works/pi-ai";
import { tokenPolicy, tokenPolicyHash } from "./protocol.js";

export function usageTokens(
  usage: Pick<
    Usage,
    "input" | "output" | "cacheRead" | "cacheWrite" | "reasoning" | "cacheWrite1h"
  >,
) {
  const parts = [usage.input, usage.output, usage.cacheRead, usage.cacheWrite];
  const subsets = [usage.reasoning ?? 0, usage.cacheWrite1h ?? 0];
  if (
    [...parts, ...subsets].some((n) => !Number.isSafeInteger(n) || n < 0) ||
    (usage.reasoning ?? 0) > usage.output ||
    (usage.cacheWrite1h ?? 0) > usage.cacheWrite
  )
    throw new Error("Invalid provider token usage");
  const total = parts.reduce((n, value) => n + value, 0);
  if (!Number.isSafeInteger(total)) throw new Error("Token usage exceeds integer range");
  return total;
}
type Event =
  | { type: "reserve"; id: string; trial: string; protocolHash: string; tokens: number }
  | { type: "settle"; id: string; tokens: number };

/** The caller holds the same OS writer lock for quality, cache and later attempts. */
export class TokenBudget {
  private entries = new Map<string, { tokens: number; settled: boolean }>();
  exceeded = false;
  constructor(
    readonly path: string,
    readonly capTokens: number,
    readonly capCalls: number,
    readonly experimentHash: string,
  ) {
    if (!/^[a-f0-9]{64}$/.test(experimentHash)) throw new Error("Invalid experiment hash");
    for (const [value, max] of [
      [capTokens, tokenPolicy.maxAuthorizedTokens],
      [capCalls, tokenPolicy.maxAuthorizedCalls],
    ])
      if (!Number.isSafeInteger(value) || value! <= 0 || value! > max!)
        throw new Error("Explicit positive integer token/call caps must fit the frozen policy");
    if (!existsSync(path))
      writeFileSync(
        path,
        JSON.stringify({ type: "header", version: 1, tokenPolicyHash, capTokens, capCalls }) + "\n",
        { flag: "wx", mode: 0o600, flush: true },
      );
    const source = readFileSync(path, "utf8");
    if (!source.endsWith("\n")) throw new Error("Torn token ledger; do not reset its limits");
    const [header, ...events] = source
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    if (
      header?.type !== "header" ||
      header.version !== 1 ||
      header.tokenPolicyHash !== tokenPolicyHash ||
      header.capTokens !== capTokens ||
      header.capCalls !== capCalls
    )
      throw new Error("Token ledger policy/cap mismatch");
    for (const event of events) {
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
      !Number.isSafeInteger(event.tokens) ||
      event.tokens < 0
    )
      throw new Error("Invalid token ledger event");
    const previous = this.entries.get(event.id);
    if (event.type === "reserve") {
      if (
        previous ||
        !event.trial ||
        typeof event.trial !== "string" ||
        !/^[a-f0-9]{64}$/.test(event.protocolHash) ||
        event.tokens !== tokenPolicy.reservationTokens
      )
        throw new Error("Invalid token reservation");
    } else if (!previous || previous.settled)
      throw new Error("Unknown or settled token reservation");
  }
  private apply(event: Event) {
    this.entries.set(event.id, { tokens: event.tokens, settled: event.type === "settle" });
    this.exceeded ||=
      this.committedTokens > this.capTokens ||
      this.calls > this.capCalls ||
      event.tokens > tokenPolicy.reservationTokens;
  }
  private append(event: Event) {
    this.validate(event);
    appendFileSync(this.path, JSON.stringify(event) + "\n", { flush: true });
    this.apply(event);
  }
  get committedTokens() {
    return [...this.entries.values()].reduce((n, item) => n + item.tokens, 0);
  }
  get calls() {
    return this.entries.size;
  }
  get pendingCalls() {
    return [...this.entries.values()].filter((item) => !item.settled).length;
  }
  reserve(trial: string) {
    if (
      this.exceeded ||
      this.calls >= this.capCalls ||
      this.committedTokens + tokenPolicy.reservationTokens > this.capTokens
    )
      throw new Error("Evaluation token/call cap reached; no request dispatched");
    const id = randomUUID();
    this.append({
      type: "reserve",
      id,
      trial,
      protocolHash: this.experimentHash,
      tokens: tokenPolicy.reservationTokens,
    });
    return id;
  }
  settle(id: string, usage: Usage) {
    this.append({ type: "settle", id, tokens: usageTokens(usage) });
  }
  cost() {
    return undefined;
  } // A subscription quota is not an API invoice.
}
