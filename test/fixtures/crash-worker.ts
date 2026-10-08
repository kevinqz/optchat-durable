import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { openApp } from "../../src/app.js";
import { fixtureConfig, scriptedModels, userText } from "../helpers/core.js";

const config = fixtureConfig(process.argv[2]!);
const mode = process.argv[3] ?? "answer";
process.on("message", () => {}); // Keep the test worker alive while its provider is intentionally suspended.
const models = scriptedModels(async (context, options) => {
  const text = userText(context);
  const compactor = text.includes("<target>");
  if (mode === "compactor" && !compactor) return fauxAssistantMessage("Recebido.");
  if (mode === "answer" && !text.includes("Consultar Aurora"))
    return fauxAssistantMessage("Aurora foi registrada.");
  if (mode === "answer" && !context.messages.some((m) => m.role === "toolResult")) {
    return fauxAssistantMessage(
      fauxToolCall("zoom", { start: 0, count: 1 }, { id: "zoom-before-crash" }),
      { stopReason: "toolUse" },
    );
  }
  const request = await app.request(mode === "answer" ? "crash" : "first");
  process.send?.({
    event: "provider-pending",
    taskId: request!.task,
    frozen: request!.frozen,
    messages: context.messages,
  });
  await new Promise<void>((_resolve, reject) =>
    options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }),
  );
  return fauxAssistantMessage("unreachable");
});
const app = await openApp(config, { models });
const first = await app.enqueue(
  mode === "compactor"
    ? "Fato integral: preservar Aurora. ".repeat(80)
    : "O projeto se chama Aurora.",
  "first",
);
await app.wait(first.taskId);
if (mode === "answer") {
  await app.settleMemory();
  const request = await app.enqueue("Consultar Aurora com zoom e confirmar.", "crash");
  await app.wait(request.taskId);
} else await app.settleMemory();
