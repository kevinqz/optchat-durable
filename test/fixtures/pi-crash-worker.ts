import { fauxAssistantMessage, getCurrentSystemPrompt } from "@earendil-works/pi-ai";
import { host } from "../helpers/pi.js";

const directory = process.argv[2]!;
const pi = await host(
  directory,
  async (request, options) => {
    if (getCurrentSystemPrompt(request.messages).includes("You maintain the memory index")) {
      process.send?.({
        sessionFile: pi.session.sessionManager.getSessionFile(),
        messages: request.messages,
      });
      await new Promise<void>((_resolve, reject) =>
        options?.signal?.addEventListener("abort", () => reject(new Error("Stopped")), {
          once: true,
        }),
      );
    }
    return fauxAssistantMessage(
      "CRASH_ORIGINAL " + "Unicode ação🙂 evidence retained. ".repeat(40),
    );
  },
  "default",
  { native: true },
);
await pi.session.prompt("Archive this before the process dies.");
// The parent terminates this disposable worker after the summary request begins.
setInterval(() => {}, 1000);
