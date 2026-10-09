import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { corpus } from "../corpus.js";
import {
  piQualityProtocol,
  piQualityHash,
  piCacheProtocol,
  piCacheHash,
  tokenPolicy,
} from "./protocol.js";
import { nativeSubscriptionProvider } from "./auth.js";
import { subscriptionEnvironment } from "./environment.js";
import { cacheStudy, qualityStudy } from "./studies.js";

const { values } = parseArgs({
  options: {
    study: { type: "string" },
    output: { type: "string" },
    live: { type: "boolean", default: false },
    profile: { type: "string" },
    ledger: { type: "string" },
    "max-tokens": { type: "string" },
    "max-calls": { type: "string" },
    cases: { type: "string" },
  },
});
if (!values.output || !["quality", "cache"].includes(values.study ?? ""))
  throw new Error(
    "Use --study quality|cache --output NEW_DIRECTORY; add --live only after authorizing subscription quota use",
  );
const chosen = values.cases?.split(",");
if (
  chosen &&
  (values.live ||
    values.study !== "quality" ||
    chosen.some((id) => !corpus.some((c) => c.id === id)))
)
  throw new Error("--cases accepts known cases only for a dry quality rehearsal");
if (
  !values.live &&
  [values.profile, values.ledger, values["max-tokens"], values["max-calls"]].some(
    (value) => value !== undefined,
  )
)
  throw new Error("Dry runs never use a login or quota ledger; omit the live-only options");
const protocol = values.study === "quality" ? piQualityProtocol : piCacheProtocol;
const protocolHash = values.study === "quality" ? piQualityHash : piCacheHash;
const frozen = JSON.parse(
  await readFile(new URL(`../protocols/${protocol.id}.json`, import.meta.url), "utf8"),
);
if (
  frozen.protocolHash !== protocolHash ||
  JSON.stringify(frozen.protocol) !== JSON.stringify(protocol)
)
  throw new Error("Protocol changed; freeze a new version before evaluation");
const { directory, budget, unlock, ...runtime } = await subscriptionEnvironment({
  output: values.output,
  live: values.live,
  profile: values.profile,
  ledger: values.ledger,
  maxTokens: values["max-tokens"],
  maxCalls: values["max-calls"],
  protocolHash,
});
const nonce = randomUUID();
const write = (name: string, value: unknown) =>
  writeFile(join(directory, name), JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
try {
  await write("manifest.json", {
    protocol,
    protocolHash,
    tokenPolicy,
    ...runtime,
    nonce,
    live: values.live,
    startedAt: new Date().toISOString(),
    node: process.version,
    auth: values.live ? "native-pi-subscription-oauth" : "synthetic-no-auth",
    authorizationCaps: budget ? { tokens: budget.capTokens, calls: budget.capCalls } : null,
    actualSubscriptionChargeUsd: null,
    remainingSubscriptionQuota: null,
    ...(values.study === "cache"
      ? {
          restart: "same-process-public-runtime-reopen",
          idlePauseSkipped: !values.live,
          cacheExpiryEstablished: false,
        }
      : {}),
  });
  const base = values.live
    ? await nativeSubscriptionProvider(values.profile!, directory, protocol)
    : undefined;
  const run = { directory, budget, base, live: values.live };
  const { outcome, rehearsalFailed } =
    values.study === "quality" ? await qualityStudy(run, chosen) : await cacheStudy(run, nonce);
  const usageSettledWithinCap = !budget?.exceeded && (budget?.pendingCalls ?? 0) === 0;
  const result = {
    ...outcome,
    protocolHash,
    passed: outcome.passed && usageSettledWithinCap,
    usageSettledWithinCap,
    committedTokens: budget?.committedTokens ?? null,
    reservedCalls: budget?.calls ?? null,
    pendingUsageReservations: budget?.pendingCalls ?? 0,
    actualSubscriptionChargeUsd: null,
    remainingSubscriptionQuota: null,
  };
  await write("report.json", result);
  console.log(
    JSON.stringify({
      report: join(directory, "report.json"),
      passed: result.passed,
      dry: !values.live,
    }),
  );
  if (values.live ? !result.passed : rehearsalFailed) process.exitCode = 1;
} catch {
  await write("failure.json", {
    failure: "subscription-evaluation-failed",
    pendingUsageReservations: budget?.pendingCalls ?? 0,
    committedTokens: budget?.committedTokens ?? null,
  });
  console.error(
    "Subscription evaluation failed. Keep its output and shared ledger; check native Pi login and sanitized evidence. No API-key fallback is enabled.",
  );
  process.exitCode = 1;
} finally {
  unlock();
}
