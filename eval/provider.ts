import { appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  createAssistantMessageEventStream,
  fauxAssistantMessage,
  type Provider,
  type AssistantMessage,
  type AssistantMessageEvent,
  type TranscriptContext,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { COMPACTOR_PROMPT } from "../src/prompts.js";
import { protocol } from "./protocol.js";
import type { CallBudget, ProviderLimits } from "./spec.js";
import { contextView } from "../src/memory/blocks.js";

export type CallLabel = { phase: string; turn: number };

export type Call = {
  number: number;
  stage: "summary" | "main";
  inputHash: string;
  inputBytes: number;
  elapsedMs: number;
  startedMs: number;
  stop: string;
  usage?: Omit<AssistantMessage["usage"], "cost"> & { cost?: AssistantMessage["usage"]["cost"] };
  costUsd?: number;
  reservationId?: string;
  failure?: "subscription-limit" | "provider-failed";
  label?: CallLabel;
  idleBeforeMs?: number;
  view?: {
    hash: string;
    bytes: number;
    parts: number;
    commonPrefixBytes: number;
    appendOnlyFromPrevious: boolean | null;
  };
};

/** Observes the public stream boundary. Does not persist prompts, auth, headers or reasoning. */
export function meterProvider(
  base: Provider,
  trial: string,
  path: string,
  budget?: CallBudget,
  limits: ProviderLimits = protocol,
) {
  const calls: Call[] = [];
  let count = 0;
  let blocked = false;
  const epoch = performance.now();
  const abort = new AbortController();
  let label: CallLabel | undefined;
  let lastCompletion: number | undefined;
  const previousViews = new Map<Call["stage"], string>();
  const stream: Provider["streamSimple"] = (model, context, options) => {
    const out = createAssistantMessageEventStream();
    const number = ++count;
    const request = JSON.stringify(context);
    const stage = context.messages.some(
      (m) =>
        m.role === "system" &&
        JSON.stringify(m).includes(JSON.stringify(COMPACTOR_PROMPT).slice(1, -1)),
    )
      ? "summary"
      : "main";
    const start = performance.now();
    const callLabel = label ? { ...label } : undefined;
    const idleBeforeMs = lastCompletion === undefined ? undefined : start - lastCompletion;
    const view = contextView(context as TranscriptContext);
    let viewEvidence: Call["view"];
    if (view !== undefined) {
      const body = view.slice(0, -8);
      const previous = previousViews.get(stage);
      let common = 0;
      while (
        previous &&
        common < body.length &&
        common < previous.length &&
        body[common] === previous[common]
      )
        common++;
      viewEvidence = {
        hash: createHash("sha256").update(view).digest("hex"),
        bytes: Buffer.byteLength(view),
        parts: view === "<chat>\n\n</chat>" ? 0 : view.split("\n").length - 2,
        commonPrefixBytes: Buffer.byteLength(body.slice(0, common)),
        appendOnlyFromPrevious: previous === undefined ? null : body.startsWith(previous),
      };
      previousViews.set(stage, body);
    }
    let reservationId: string | undefined;
    void (async () => {
      let result: AssistantMessage;
      let terminal: AssistantMessageEvent | undefined;
      try {
        if (blocked || abort.signal.aborted || number > limits.maxCallsPerTrial)
          throw new Error("Evaluation request limit");
        if (
          model.id !== limits.model.id ||
          model.provider !== limits.model.provider ||
          model.contextWindow !== limits.model.contextWindow
        )
          throw new Error("Unexpected evaluation model");
        reservationId = budget?.reserve(trial);
        const effective: SimpleStreamOptions = {
          ...options,
          maxTokens: limits.model.maxOutputTokens,
          maxRetries: limits.providerRetries,
          timeoutMs: limits.providerTimeoutMs,
          cacheRetention: limits.cacheRetention,
          signal: AbortSignal.any([
            abort.signal,
            ...(options?.signal ? [options.signal] : []),
            AbortSignal.timeout(limits.providerTimeoutMs),
          ]),
        };
        const source = base.streamSimple(model, context as TranscriptContext, effective);
        for await (const event of source) {
          if (event.type === "done" || event.type === "error") terminal = event;
          else out.push(event);
        }
        result = await source.result();
        if (reservationId && result.stopReason !== "error" && result.stopReason !== "aborted")
          budget!.settle(reservationId, result.usage);
      } catch {
        // Provider exceptions may include credentials or headers. Only classify the failure.
        blocked = true;
        result = {
          ...fauxAssistantMessage("", {
            stopReason: "error",
            errorMessage:
              "Evaluation provider, accounting or request limit failed; inspect sanitized calls and budget reservations.",
          }),
          api: model.api,
          provider: model.provider,
          model: model.id,
        };
        terminal = { type: "error", reason: "error", error: result };
      }
      const known = result.stopReason !== "error" && result.stopReason !== "aborted";
      const failure = known
        ? undefined
        : result.errorMessage?.includes("subscription_sharing_usage_limit_exceeded")
          ? ("subscription-limit" as const)
          : ("provider-failed" as const);
      if (!known && limits.stopOnProviderError) {
        // Stop future dispatches, including queued summary retries. Already in-flight requests
        // retain their reservations until their own terminal result; never switch billing modes.
        blocked = true;
        abort.abort();
        result = { ...result, content: [], errorMessage: `Evaluation stopped: ${failure}.` };
        terminal = {
          type: "error",
          reason: result.stopReason as "error" | "aborted",
          error: result,
        };
      }
      const costUsd = known
        ? (budget?.cost(result.usage) ??
          (limits.accounting === "subscription-tokens" ? undefined : 0))
        : undefined;
      const recordedUsage =
        limits.accounting === "subscription-tokens"
          ? (Object.fromEntries(
              Object.entries(result.usage).filter(([key]) => key !== "cost"),
            ) as Call["usage"])
          : result.usage;
      const call: Call = {
        number,
        stage,
        inputHash: createHash("sha256").update(request).digest("hex"),
        inputBytes: Buffer.byteLength(request),
        startedMs: start - epoch,
        elapsedMs: performance.now() - start,
        stop: result.stopReason,
        ...(known ? { usage: recordedUsage } : {}),
        ...(costUsd === undefined ? {} : { costUsd }),
        ...(failure ? { failure } : {}),
        ...(reservationId ? { reservationId } : {}),
        ...(callLabel ? { label: callLabel } : {}),
        ...(idleBeforeMs === undefined ? {} : { idleBeforeMs }),
        ...(viewEvidence ? { view: viewEvidence } : {}),
      };
      calls.push(call);
      lastCompletion = performance.now();
      appendFileSync(path, JSON.stringify({ trial, ...call }) + "\n", { mode: 0o600, flush: true });
      if (terminal) out.push(terminal);
      out.end(result);
    })().catch(() => {
      blocked = true;
      const error = {
        ...fauxAssistantMessage("", {
          stopReason: "error",
          errorMessage: "Evaluation evidence could not be saved.",
        }),
        api: model.api,
        provider: model.provider,
        model: model.id,
      };
      out.push({ type: "error", reason: "error", error });
      out.end(error);
    });
    return out;
  };
  const provider: Provider = {
    ...base,
    streamSimple: stream,
    stream: (model, context, options) => stream(model, context, options as SimpleStreamOptions),
  };
  return {
    provider,
    calls,
    get blocked() {
      return blocked;
    },
    elapsed: () => performance.now() - epoch,
    abort: () => abort.abort(),
    label: (next: CallLabel) => {
      label = { ...next };
    },
  };
}
