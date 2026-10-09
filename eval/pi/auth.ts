import { join, resolve } from "node:path";
import { realpath } from "node:fs/promises";
import {
  createAssistantMessageEventStream,
  fauxAssistantMessage,
  type Provider,
  type AssistantMessageEvent,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { SessionSpec } from "../spec.js";
import { outsideCheckout } from "../environment.js";
import type { SubscriptionAuthObservation } from "./auth-observation.js";

/** Disable the API-key path at the public provider boundary, including ambient fallback. */
export function oauthOnly(provider: Provider): Provider {
  if (!provider.auth.oauth?.isSubscription) throw new Error("Expected native subscription OAuth");
  return { ...provider, auth: { oauth: provider.auth.oauth } };
}
type Host = Pick<ModelRuntime, "getModel" | "listCredentials" | "streamSimple">;

/** The host owns refresh and storage. Trial profiles receive a credential-free forwarding provider. */
export function subscriptionBridge(
  host: Host,
  spec: SessionSpec,
  observation?: SubscriptionAuthObservation,
): Provider {
  const model = host.getModel(spec.model.provider, spec.model.id);
  if (
    !model ||
    model.api !== spec.model.api ||
    model.contextWindow !== spec.model.contextWindow ||
    model.maxTokens !== spec.model.maxOutputTokens ||
    model.baseUrl !== "https://api.openai.com/v1"
  )
    throw new Error("The frozen model does not match the pinned native Pi catalog");
  const stream: Provider["streamSimple"] = (requested, context, options) => {
    const out = createAssistantMessageEventStream();
    void (async () => {
      try {
        if (
          requested.id !== model.id ||
          requested.provider !== model.provider ||
          requested.api !== model.api ||
          requested.contextWindow !== model.contextWindow
        )
          throw new Error("Unexpected model");
        const credentials = await host.listCredentials({ signal: options?.signal });
        if (
          !credentials.some(
            (entry) => entry.providerId === model.provider && entry.type === "oauth",
          )
        )
          throw new Error("Native Pi subscription login is required");
        let completedWithUsage = false;
        // Allow only inference settings and the native context-payload hook. In particular,
        // callers cannot supply API keys, authorization headers, endpoints, env or custom fetch.
        const safe: SimpleStreamOptions = {
          signal: options?.signal,
          maxTokens: spec.model.maxOutputTokens,
          maxRetries: 0,
          timeoutMs: options?.timeoutMs,
          cacheRetention: options?.cacheRetention,
          sessionId: options?.sessionId,
          transport: "sse",
          reasoning: spec.thinking === "off" ? undefined : spec.thinking,
          onProviderStreamEvent: (data) => {
            // Pi's normalized zero counters alone cannot prove that usage arrived. Observe the
            // public raw-event hook without storing provider payloads, reasoning or account data.
            const event = data as {
              type?: string;
              response?: {
                status?: string;
                usage?: {
                  input_tokens: number;
                  output_tokens: number;
                  total_tokens: number;
                  input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
                  output_tokens_details?: { reasoning_tokens?: number };
                };
              };
            };
            const usage = event?.response?.usage;
            if (
              event?.type !== "response.completed" ||
              event.response?.status !== "completed" ||
              !usage
            )
              return;
            const cached = usage.input_tokens_details?.cached_tokens ?? 0;
            const written = usage.input_tokens_details?.cache_write_tokens ?? 0;
            const reasoning = usage.output_tokens_details?.reasoning_tokens ?? 0;
            completedWithUsage =
              [
                usage.input_tokens,
                usage.output_tokens,
                usage.total_tokens,
                cached,
                written,
                reasoning,
              ].every((n) => Number.isSafeInteger(n) && n >= 0) &&
              cached + written <= usage.input_tokens &&
              reasoning <= usage.output_tokens &&
              usage.input_tokens <= spec.model.contextWindow &&
              usage.output_tokens <= spec.model.maxOutputTokens &&
              usage.total_tokens === usage.input_tokens + usage.output_tokens;
          },
          onPayload: async (payload, current) => {
            const changed = (await options?.onPayload?.(payload, current)) ?? payload;
            if (!changed || typeof changed !== "object") throw new Error("Invalid native payload");
            const body = changed as Record<string, unknown>;
            if (
              body.model !== model.id ||
              body.store !== false ||
              body.stream !== true ||
              body.max_output_tokens !== undefined
            )
              throw new Error("Payload changed the frozen model, storage or output policy");
            return changed;
          },
        };
        const source = host.streamSimple(model, context, safe);
        let terminal: AssistantMessageEvent | undefined;
        for await (const event of source) {
          if (event.type === "done" || event.type === "error") terminal = event;
          else out.push(event);
        }
        let result = await source.result();
        if (result.stopReason !== "error" && result.stopReason !== "aborted" && !completedWithUsage)
          throw new Error("Provider completion or usage was missing");
        if (result.stopReason !== "error" && result.stopReason !== "aborted")
          observation?.responseCompleted();
        if (result.stopReason === "error" || result.stopReason === "aborted") {
          result = {
            ...fauxAssistantMessage("", {
              stopReason: result.stopReason,
              errorMessage: result.errorMessage?.includes(
                "subscription_sharing_usage_limit_exceeded",
              )
                ? "subscription_sharing_usage_limit_exceeded"
                : "Native Pi subscription authentication or request failed.",
            }),
            provider: model.provider,
            model: model.id,
            api: model.api,
          };
          terminal = {
            type: "error",
            reason: result.stopReason as "error" | "aborted",
            error: result,
          };
        }
        if (terminal) out.push(terminal);
        out.end(result);
      } catch {
        const result = {
          ...fauxAssistantMessage("", {
            stopReason: "error",
            errorMessage:
              "Native Pi subscription authentication or request failed; no API-key fallback was used.",
          }),
          provider: model.provider,
          model: model.id,
          api: model.api,
        };
        out.push({ type: "error", reason: "error", error: result });
        out.end(result);
      }
    })();
    return out;
  };
  return {
    id: model.provider,
    name: "Pi subscription evaluation host",
    auth: { apiKey: { name: "Pi host", resolve: async () => ({ auth: {}, source: "Pi host" }) } },
    getModels: () => [model],
    streamSimple: stream,
    stream: (current, context, options) => stream(current, context, options as SimpleStreamOptions),
  };
}

export async function nativeSubscriptionHost(
  profile: string,
  output: string,
  spec: SessionSpec,
  observation?: SubscriptionAuthObservation,
) {
  const source = outsideCheckout(await realpath(profile));
  const destination = await realpath(output);
  if (
    source === destination ||
    source.startsWith(destination + "/") ||
    destination.startsWith(source + "/")
  )
    throw new Error("The login profile and evaluation output must be separate directories");
  const host = await ModelRuntime.create({
    authPath: join(source, "auth.json"),
    modelsPath: null,
    modelsStorePath: resolve(output, "host-models-cache.json"),
    refreshOnCreate: false,
  });
  const provider = oauthOnly(openaiProvider());
  host.registerNativeProvider(observation ? observation.provider(provider) : provider);
  await host.refresh({ allowNetwork: false });
  if (
    !(await host.listCredentials()).some(
      (entry) => entry.providerId === spec.model.provider && entry.type === "oauth",
    )
  )
    throw new Error(
      "Log in through the selected Pi profile with Sign in with ChatGPT before running this study",
    );
  return host;
}

export async function nativeSubscriptionProvider(
  profile: string,
  output: string,
  spec: SessionSpec,
  observation?: SubscriptionAuthObservation,
) {
  const host = await nativeSubscriptionHost(profile, output, spec, observation);
  return subscriptionBridge(host, spec, observation);
}
