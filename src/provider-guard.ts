import { createAssistantMessageEventStream, fauxAssistantMessage, type Provider } from "@earendil-works/pi-ai";
import { bytes } from "./memory/tree.js";

/** Bound transport payloads before dispatch, including when using a Pi host's providers. */
export function boundedProvider(provider: Provider, maxOutputTokens: number): Provider {
  return { ...provider, streamSimple(model, context, options) {
    const output = Math.min(model.maxTokens, maxOutputTokens);
    const size = bytes(JSON.stringify(context));
    const limit = model.contextWindow - output - 16_000;
    if (size > limit) {
      const stream = createAssistantMessageEventStream();
      const error = { ...fauxAssistantMessage("", { stopReason: "error",
        errorMessage: `Context safety limit exceeded (${size} UTF-8 bytes > ${limit}). Start a new request to rebuild the memory view.` }),
      api: model.api, provider: model.provider, model: model.id };
      stream.push({ type: "error", reason: "error", error });
      stream.end(error);
      return stream;
    }
    return provider.streamSimple(model, context, { ...options, maxTokens: output });
  } };
}
