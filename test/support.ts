import { createModels, fauxProvider, type FauxResponseFactory, type TranscriptContext } from "@earendil-works/pi-ai";
import { configFromEnv } from "../src/config.js";

export function fixtureConfig(directory = ".optchat/test") {
  const config = configFromEnv({ OPTCHAT_DEMO: "1", OPTCHAT_DATA_DIR: directory });
  return { ...config, main: { provider: "faux", modelId: "test" }, compactor: { provider: "faux", modelId: "test" }, retryMs: 1, failureTries: 1 };
}
export function scriptedModels(respond: FauxResponseFactory) {
  const models = createModels();
  const faux = fauxProvider({ models: [{ id: "test", contextWindow: 272_000, maxTokens: 16_384 }] });
  const repeat: FauxResponseFactory = (...args) => { faux.appendResponses([repeat]); return respond(...args); };
  faux.setResponses([repeat]); models.setProvider(faux.provider);
  return models;
}
export function userText(context: TranscriptContext): string {
  return context.messages.filter(m => m.role === "user").map(m => typeof m.content === "string" ? m.content
    : m.content.filter(c => c.type === "text").map(c => c.text).join("\n")).join("\n");
}
