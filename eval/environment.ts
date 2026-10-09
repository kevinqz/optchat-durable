import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireWriterLock } from "../src/writer-lock.js";
import { Budget } from "./budget.js";
import { protocol, protocolHash } from "./protocol.js";

export function outsideCheckout(path: string): string {
  const target = resolve(path);
  const route = relative(fileURLToPath(new URL("..", import.meta.url)), target);
  if (route !== ".." && !route.startsWith(`..${sep}`) && !isAbsolute(route))
    throw new Error("Evaluation output and budget ledgers must be outside the checkout");
  return target;
}
export function evaluationRuntime(live: boolean, piVersion = protocol.piVersion) {
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const installed = JSON.parse(
    execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["ls", "--depth=0", "--json"], {
      encoding: "utf8",
    }),
  ) as { dependencies: Record<string, { version: string }> };
  const runtimeVersions = Object.fromEntries(
    ["pi-ai", "pi-coding-agent", "pi-durable", "chord"].map((name) => {
      const version = installed.dependencies[`@earendil-works/${name}`]?.version;
      if (version !== piVersion)
        throw new Error(
          `Expected ${name}@${piVersion}; installed version is ${version ?? "missing"}`,
        );
      return [name, version];
    }),
  );
  const workingTreeDirty = !!execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim();
  if (live && workingTreeDirty)
    throw new Error("Commit the frozen protocol and runner before live execution");
  return { revision, runtimeVersions, workingTreeDirty };
}
/** Shared preflight prevents either experiment from acquiring its own accidental spending cap. */
export async function evaluationEnvironment(
  output: string,
  live: boolean,
  ledgerPath?: string,
  cap?: string,
  experimentHash = protocolHash,
) {
  if (live && (!process.env.ANTHROPIC_API_KEY || !ledgerPath || !cap))
    throw new Error(
      "Live execution requires ANTHROPIC_API_KEY, --ledger SHARED_DIRECTORY and --budget-usd N",
    );
  const { revision, runtimeVersions } = evaluationRuntime(live);
  const directory = outsideCheckout(output);
  await mkdir(directory, { mode: 0o700 });
  let unlock = () => {};
  let budget: Budget | undefined;
  if (live) {
    const ledger = outsideCheckout(ledgerPath!);
    await mkdir(ledger, { recursive: true, mode: 0o700 });
    unlock = acquireWriterLock(ledger);
    try {
      budget = new Budget(join(ledger, "budget.jsonl"), Number(cap), experimentHash);
    } catch (error) {
      unlock();
      throw error;
    }
  }
  return { directory, revision, runtimeVersions, budget, unlock };
}
