import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createModels, fauxProvider } from "@earendil-works/pi-ai";
import { openApp } from "../src/app.js";
import { resolveOptChatConfig } from "../src/config.js";

// Separate process: a closed previous Harness must not inflate cold-open heap measurements.
const directory = process.argv[2];
const records = Number(process.argv[3]);
if (!directory || ![1000, 10_000, 100_000].includes(records))
  throw new Error("Internal storage verifier requires archive directory and record count");
const models = createModels();
models.setProvider(
  fauxProvider({ models: [{ id: "storage", contextWindow: 1_000_000 }] }).provider,
);
const ref = { provider: "faux", modelId: "storage" };
const config = { ...resolveOptChatConfig({ main: ref, compactor: ref }), directory, demo: true };
const started = performance.now();
const app = await openApp(config, { models, resume: false });
const reopenMs = performance.now() - started;
try {
  const last = await app.zoom(records - 1, 1);
  assert.ok("text" in last);
  assert.equal(
    last.text,
    `user: record-${records - 1}: value=${(records - 1) * 7}; Unicode=ação 🌳`,
  );
  assert.equal(last.timestamp, new Date(1_700_000_000_000 + records - 1).toISOString());
  console.log(
    JSON.stringify({
      reopenMs,
      exactLastSourceAfterReopen: true,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
    }),
  );
} finally {
  await app.close();
}
