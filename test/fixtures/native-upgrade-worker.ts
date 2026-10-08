import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout } from "node:timers/promises";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { host } from "../helpers/pi.js";
import { scriptedModels } from "../helpers/core.js";

const [action, directory, consumer] = process.argv.slice(2) as [string, string, string];
const fromConsumer = createRequire(join(consumer, "package.json"));
// Resolve only public exports, against the selected installed release.
const { openApp } = (await import(
  pathToFileURL(join(consumer, "public-api.mjs")).href
)) as typeof import("../../src/index.js");
const packageRoot = join(fromConsumer.resolve("optchat-durable/package.json"), "..");
const savedPath = join(directory, "native-fixture.json");
const saved = action === "seed" ? undefined : JSON.parse(await readFile(savedPath, "utf8"));
const pi = await host(
  directory,
  () => fauxAssistantMessage("Native upgrade source remains retrievable."),
  "default",
  {
    native: true,
    extensionPath: join(packageRoot, "pi", "index.ts"),
    session: saved ? SessionManager.open(saved.sessionFile) : undefined,
  },
);
const query = async (params: { action: "zoom" | "status"; start?: number; count?: number }) => {
  const result = await pi.runner
    .getToolDefinition("optchat_memory")!
    .execute(
      "upgrade-inspect",
      params,
      undefined,
      undefined,
      pi.runner.createToolContext("upgrade-inspect", undefined),
    );
  return JSON.parse(
    result.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join(""),
  );
};
let dataDirectory: string;
try {
  if (action === "seed") {
    await pi.session.prompt("NATIVE_UPGRADE_SOURCE ação🙂");
    await pi.session.prompt("Keep the original for the next version.");
  } else {
    assert.deepEqual(await query({ action: "zoom", start: 0, count: 1 }), saved.original);
    await pi.session.prompt("Continue normally after the native package upgrade.");
    assert.deepEqual(await query({ action: "zoom", start: 0, count: 1 }), saved.original);
  }
  dataDirectory = (await query({ action: "status" })).directory;
  if (action === "seed")
    await writeFile(
      savedPath,
      JSON.stringify({
        sessionFile: pi.session.sessionManager.getSessionFile(),
        directory: dataDirectory,
        original: await query({ action: "zoom", start: 0, count: 1 }),
      }),
    );
  assert.deepEqual(pi.notifications, []);
} finally {
  await pi.close();
}

// Complete background memory using the same release's public SDK and saved native config.
// No main request is admitted; native external tools never run in this harness.
const savedConfig = JSON.parse(await readFile(join(dataDirectory!, "config.json"), "utf8"));
const app = await openApp(
  { ...savedConfig.config, directory: dataDirectory!, demo: false },
  { models: scriptedModels(() => fauxAssistantMessage("Original retained.")) },
);
try {
  await app.settleMemory();
  const deadline = Date.now() + 10_000;
  while ((await app.harness.inspect(app.context)).tasks.length) {
    assert.ok(Date.now() < deadline, "native archive did not settle");
    await setTimeout(5);
  }
} finally {
  await app.close();
}
console.log(`PASS native ${action}`);
