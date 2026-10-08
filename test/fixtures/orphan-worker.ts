import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { piNativeDirectory } from "../../src/pi/session.js";
import { host } from "../helpers/pi.js";

process.on("message", () => {});
const pi = await host(process.argv[2]!, () => fauxAssistantMessage("unreachable"), "default", {
  native: true,
  extensions: [
    (api) => {
      // Extension factories follow the source-loaded OptChat hook. Pause after its
      // journal commit, before AgentSession persists this first user message.
      api.on("message_end", async (event, ctx) => {
        if (event.message.role !== "user") return;
        process.send?.({
          directory: piNativeDirectory(ctx),
          sessionFile: ctx.sessionManager.getSessionFile(),
        });
        await new Promise<void>(() => {});
      });
    },
  ],
});
await pi.session.prompt("ORPHAN_ORIGINAL ação🙂 before the first assistant answer.");
