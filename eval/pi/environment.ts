import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { evaluationRuntime, outsideCheckout } from "../environment.js";
import { acquireWriterLock } from "../../src/writer-lock.js";
import { TokenBudget } from "./budget.js";

export async function subscriptionEnvironment(options: {
  output: string;
  live: boolean;
  profile?: string;
  ledger?: string;
  maxTokens?: string;
  maxCalls?: string;
  protocolHash: string;
}) {
  if (
    options.live &&
    (!options.profile || !options.ledger || !options.maxTokens || !options.maxCalls)
  )
    throw new Error(
      "Live subscription studies require --profile, a shared --ledger, --max-tokens and --max-calls explicitly authorized for this workload",
    );
  const runtime = evaluationRuntime(options.live);
  const directory = outsideCheckout(options.output);
  await mkdir(directory, { mode: 0o700 });
  let unlock = () => {};
  let budget: TokenBudget | undefined;
  if (options.live) {
    const ledger = outsideCheckout(options.ledger!);
    await mkdir(ledger, { recursive: true, mode: 0o700 });
    unlock = acquireWriterLock(ledger);
    try {
      budget = new TokenBudget(
        join(ledger, "tokens.jsonl"),
        Number(options.maxTokens),
        Number(options.maxCalls),
        options.protocolHash,
      );
    } catch (error) {
      unlock();
      throw error;
    }
  }
  return { ...runtime, directory, budget, unlock };
}
