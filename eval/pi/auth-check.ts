import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { evaluationRuntime, outsideCheckout } from "../environment.js";
import { piQualityProtocol } from "./protocol.js";
import { nativeSubscriptionHost } from "./auth.js";
import { checkSubscriptionAuth } from "./auth-observation.js";

const { values } = parseArgs({
  options: { profile: { type: "string" }, output: { type: "string" } },
});
if (!values.profile || !values.output)
  throw new Error("Use --profile PI_LOGIN_DIRECTORY --output NEW_DIRECTORY");
const runtime = evaluationRuntime(true, piQualityProtocol.piVersion);
const output = outsideCheckout(values.output);
await mkdir(output, { mode: 0o700 });
const startedAt = new Date().toISOString();
try {
  const result = await checkSubscriptionAuth((observation) =>
    nativeSubscriptionHost(values.profile!, output, piQualityProtocol, observation),
  );
  const evidence = {
    schema: "optchat-pi-oauth-auth-check/v1",
    ...runtime,
    startedAt,
    completedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    provider: piQualityProtocol.model.provider,
    ...result,
    limitations: [
      "Authentication only: no model requests or quality/cache qualification.",
      "Refresh is observed only when native Pi decides it is due; expiry is never changed.",
      "Reopen uses a new public ModelRuntime in the same process, not a process crash.",
    ],
  };
  await writeFile(join(output, "auth-check.json"), JSON.stringify(evidence, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  console.log(JSON.stringify(result));
  if (!result.authenticated || !result.reopened) process.exitCode = 1;
} catch {
  await writeFile(
    join(output, "failure.json"),
    JSON.stringify({ ...runtime, startedAt, failure: "native-pi-auth-check-failed" }) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  console.error("Native Pi login check failed. No model request or API-key fallback was used.");
  process.exitCode = 1;
}
