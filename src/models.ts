import {
  createAssistantMessageEventStream, createModels, fauxAssistantMessage, fauxProvider,
  type FauxResponseFactory, type Models, type Provider, type TranscriptContext,
} from "@earendil-works/pi-ai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import type { AppConfig } from "./config.js";
import { bytes, pageText } from "./memory/tree.js";

/** Transport guard, not a fail-open generation hook. The Pi provider still owns auth, cache, streaming and usage. */
export function boundedProvider(provider: Provider, maxOutputTokens: number): Provider {
  return { ...provider, streamSimple(model, context, options) {
    const output = Math.min(model.maxTokens, maxOutputTokens);
    const size = bytes(JSON.stringify(context));
    // Conservative text-only bound; provider limits remain authoritative. No automatic destructive compaction.
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

function textMessages(context: TranscriptContext): string[] {
  return context.messages.filter(m => m.role === "user").map(m => typeof m.content === "string"
    ? m.content : m.content.filter(c => c.type === "text").map(c => c.text).join("\n"));
}

export async function makeModels(config: AppConfig, requireAuth = true): Promise<Models> {
  const models = createModels();
  if (config.demo) {
    const faux = fauxProvider({ models: [{ id: "optchat-demo", contextWindow: 272_000, maxTokens: 16_384 }] });
    const respond: FauxResponseFactory = context => {
      faux.appendResponses([respond]);
      const messages = textMessages(context);
      const source = messages.find(m => m.includes("<target>"));
      if (source) {
        const target = source.match(/<target>\n([\s\S]*?)\n<\/target>/)?.[1] ?? source;
        return fauxAssistantMessage(`[DEMO] ${pageText(target, 0, 460).text.replace(/\s+/g, " ")}`);
      }
      const lastUser = context.messages.findLast(m => m.role === "user");
      const newText = !lastUser || lastUser.role !== "user" ? "" : typeof lastUser.content === "string" ? lastUser.content
        : lastUser.content.filter(c => c.type === "text").at(-1)?.text ?? "";
      return fauxAssistantMessage(`Demonstração local, sem chamada a um modelo real.\n\nMensagem recebida: ${pageText(newText, 0, 400).text}\n\nA fila, o histórico, a árvore e a retomada usam o Pi Durable real. Configure um provedor para obter respostas e resumos de IA.`);
    };
    faux.setResponses([respond]);
    models.setProvider(boundedProvider(faux.provider, config.maxOutputTokens));
  } else {
    models.setProvider(boundedProvider(openaiProvider(), config.maxOutputTokens));
    models.setProvider(boundedProvider(anthropicProvider(), config.maxOutputTokens));
  }
  for (const ref of [config.main, config.compactor]) {
    const model = models.getModel(ref.provider, ref.modelId);
    if (!model) throw new Error(`Model ${ref.provider}/${ref.modelId} is absent from Pi AI 1.0.4. Use the models command to list supported IDs.`);
    if (config.viewBytes + config.maxInputBytes + 24_000 + config.maxOutputTokens > model.contextWindow) {
      throw new Error(`Configured memory/input budgets exceed the conservative context allowance for ${ref.modelId}. Lower OPTCHAT_VIEW_BYTES or OPTCHAT_MAX_INPUT_BYTES.`);
    }
    if (requireAuth && !config.demo && !await models.getAuth(ref.provider)) {
      throw new Error(`Missing authentication for ${ref.provider}. Set ${ref.provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"} in your shell or a private .env file. Use --demo for an explicitly simulated session.`);
    }
  }
  return models;
}

export function availableModels() {
  return [openaiProvider(), anthropicProvider()].flatMap(p => p.getModels().map(m => ({ provider: p.id, id: m.id, contextWindow: m.contextWindow })));
}
