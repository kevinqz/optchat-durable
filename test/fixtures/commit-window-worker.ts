import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import type { StorageWrite } from "@earendil-works/pi-durable";
import { openNodeJsonlStorage } from "@earendil-works/pi-durable/storage/jsonl/node";
import { openApp } from "../../src/app.js";
import { acquireWriterLock } from "../../src/writer-lock.js";
import { fixtureConfig, scriptedModels, userText } from "../helpers/core.js";

const [directory, boundary, edge] = process.argv.slice(2) as [string, string, string];
await mkdir(directory, { recursive: true });
const unlock = acquireWriterLock(directory);
const storage = await openNodeJsonlStorage(join(directory, "pi"), BACKGROUND_CONTEXT, {
  fsync: true,
});
const commit = storage.commit.bind(storage);
process.on("message", () => {});

function matches(write: StorageWrite): boolean {
  if (write.type === "task") {
    const task = write.value;
    const input = task.input as { requestId?: string };
    const settled = task.state.status === "terminal" || task.state.status === "completing";
    if (boundary === "summary")
      return (
        task.kind === "optchat.summarize" && settled && task.state.outcome?.status === "completed"
      );
    if (task.kind !== "optchat.request" || input.requestId !== "crash") return false;
    return boundary === "admission"
      ? task.state.status === "pending"
      : boundary === "delivery" && settled && task.state.outcome?.status === "completed";
  }
  if (write.type !== "entry") return false;
  const entry = write.value;
  if (boundary === "freeze")
    return (
      entry.kind === "optchat.view" && (entry.data as { requestId?: string })?.requestId === "crash"
    );
  if (boundary === "source")
    return entry.kind === "pi.user" && JSON.stringify(entry.model).includes("COMMIT_QUESTION");
  if (boundary === "answer")
    return entry.kind === "pi.assistant" && JSON.stringify(entry.model).includes("COMMIT_ANSWER");
  return false;
}

storage.commit = async (writes, context) => {
  const stop = async () => {
    process.send?.({ boundary, edge });
    await new Promise<void>(() => {});
  };
  const matched = writes.some(matches);
  if (matched && edge === "before") await stop();
  const seq = await commit(writes, context);
  if (matched && edge === "after") await stop();
  return seq;
};
const app = await openApp(fixtureConfig(directory), {
  storage,
  models: scriptedModels((request) =>
    fauxAssistantMessage(
      userText(request).includes("<target>")
        ? "ORIGINAL fact preserved."
        : userText(request).includes("COMMIT_QUESTION")
          ? "COMMIT_ANSWER"
          : "Seed acknowledged.",
    ),
  ),
});
try {
  await app.prompt("ORIGINAL ação🙂 ".repeat(80), "seed");
  await app.settleMemory();
  await app.prompt("COMMIT_QUESTION: verify the original.", "crash");
  throw new Error(`Did not reach commit window ${boundary}/${edge}`);
} finally {
  await app.close();
  unlock();
}
