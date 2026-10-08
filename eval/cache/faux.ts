import {
  fauxAssistantMessage,
  fauxProvider,
  type FauxResponseFactory,
} from "@earendil-works/pi-ai";
import { COMPACTOR_PROMPT } from "../../src/prompts.js";
import { cacheProtocol as p } from "./protocol.js";

/** Synthetic acknowledgements exercise orchestration; synthetic usage is never a cache measurement. */
export function cacheFauxProvider() {
  const faux = fauxProvider({
    provider: p.model.provider,
    models: [{ id: p.model.id, contextWindow: p.model.contextWindow, maxTokens: 128_000 }],
  });
  const respond: FauxResponseFactory = (context) => {
    faux.appendResponses([respond]);
    const summary = context.messages.some(
      (m) =>
        m.role === "system" &&
        JSON.stringify(m).includes(JSON.stringify(COMPACTOR_PROMPT).slice(1, -1)),
    );
    const user = context.messages.findLast((m) => m.role === "user");
    const text =
      user &&
      (typeof user.content === "string"
        ? user.content
        : user.content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n"));
    const ack = text
      ? [...text.matchAll(/Reply with exactly (\{"ack":"R\d+-T\d+"\})/g)].at(-1)?.[1]
      : undefined;
    return fauxAssistantMessage(
      summary
        ? "Synthetic archival summary. ".repeat(16)
        : (ack ?? "invalid synthetic acknowledgement"),
    );
  };
  faux.setResponses([respond]);
  return faux.provider;
}
