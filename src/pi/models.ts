import {
  createModels,
  type Api,
  type ApiStreamOptions,
  type Model,
  type Models,
  type ModelsApiStreamOptions,
  type Provider,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { OptChatConfig } from "../config.js";
import { boundedProvider } from "../provider-guard.js";
import { cacheProvider } from "../cache.js";

export type PiModels = Pick<
  ModelRegistry,
  "find" | "getAll" | "hasConfiguredAuth" | "stream" | "streamSimple"
>;

/** Delegate requests, including OAuth refresh and custom providers, to the live Pi host. */
export function modelsFromPi(registry: PiModels, config: OptChatConfig): Models {
  const models = createModels();
  for (const id of new Set([config.main.provider, config.compactor.provider])) {
    const provider: Provider = {
      id,
      name: `Pi: ${id}`,
      // This adapter owns no credentials. Authentication happens inside the host's
      // stream/streamSimple call, for each request, rather than copying a token.
      auth: { apiKey: { name: "Pi host", resolve: async () => ({ auth: {}, source: "Pi host" }) } },
      getModels: () => registry.getAll().filter((model) => model.provider === id),
      stream<T extends Api>(
        model: Model<T>,
        context: TranscriptContext,
        options?: ApiStreamOptions<T>,
      ) {
        return registry.stream<T>(model, context, options as ModelsApiStreamOptions<T> | undefined);
      },
      streamSimple: (model, context, options) => registry.streamSimple(model, context, options),
    };
    models.setProvider(cacheProvider(boundedProvider(provider, config.maxOutputTokens)));
  }
  return models;
}

export function requirePiModels(registry: PiModels, config: OptChatConfig): void {
  for (const ref of [config.main, config.compactor]) {
    const model = registry.find(ref.provider, ref.modelId);
    if (!model)
      throw new Error(`OptChat model ${ref.provider}/${ref.modelId} is unavailable in Pi.`);
    if (!registry.hasConfiguredAuth(model))
      throw new Error(`Use Pi's /login for ${ref.provider} before starting OptChat.`);
    if (
      config.viewBytes + config.maxInputBytes + 24_000 + config.maxOutputTokens >
      model.contextWindow
    ) {
      throw new Error(
        `OptChat's saved budgets exceed the current context window of ${ref.provider}/${ref.modelId}.`,
      );
    }
  }
}
