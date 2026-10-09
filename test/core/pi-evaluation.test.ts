import assert from "node:assert/strict";
import { test } from "node:test";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  InMemoryCredentialStore,
  fauxAssistantMessage,
  fauxProvider,
  normalizeContext,
  type OAuthCredential,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { oauthOnly, subscriptionBridge } from "../../eval/pi/auth.js";
import { TokenBudget, usageTokens } from "../../eval/pi/budget.js";
import {
  piQualityProtocol as quality,
  piQualityHash,
  piCacheProtocol as cache,
  piCacheHash,
  piCacheSpec,
  tokenPolicy,
  hash,
} from "../../eval/pi/protocol.js";
import { meterProvider } from "../../eval/provider.js";
import { report } from "../../eval/report.js";
import { cacheReport } from "../../eval/cache/report.js";
import { corpus } from "../../eval/corpus.js";
import { runTrial } from "../../eval/host.js";
import { qualityFauxProvider } from "../../eval/pi/studies.js";
import { protocol, protocolHash } from "../../eval/protocol.js";
import { cacheProtocol, cacheProtocolHash } from "../../eval/cache/protocol.js";
import { acquireWriterLock } from "../../src/writer-lock.js";

const context = normalizeContext({
  messages: [{ role: "user", content: "Synthetic evaluation only", timestamp: 0 }],
});
const usage = {
  ...fauxAssistantMessage("").usage,
  input: 10,
  output: 5,
  reasoning: 2,
  cacheRead: 20,
  cacheWrite: 3,
  cacheWrite1h: 1,
};

test("independent Pi subscription protocols preserve frozen Anthropic studies and distinguish idle from expiry", async () => {
  for (const [p, expected] of [
    [quality, piQualityHash],
    [cache, piCacheHash],
    [protocol, protocolHash],
    [cacheProtocol, cacheProtocolHash],
  ] as const) {
    const frozen = JSON.parse(
      await readFile(new URL(`../../eval/protocols/${p.id}.json`, import.meta.url), "utf8"),
    );
    assert.equal(frozen.protocolHash, expected);
    assert.equal(expected, hash(p));
    assert.deepEqual(frozen.protocol, p);
  }
  const sequence = piCacheSpec.turns("fixture", 0);
  assert.equal(sequence.length, 180);
  assert.ok(sequence.some((turn) => turn.phase === "idle"));
  assert.ok(sequence.every((turn) => turn.phase !== "expired"));
  assert.equal(report([], false, quality).passed, false);
  assert.equal(report([], true, quality).arms["optchat-native"]!.costUsd, null);
  assert.equal(cacheReport([], false, piCacheSpec).passed, false);
  assert.equal(cacheReport([], true, piCacheSpec).arms["optchat-native"]!.all.knownCostUsd, null);
  assert.equal(cacheReport([], false, piCacheSpec).gates.expiryGap, undefined);
  assert.equal(cacheReport([], false, piCacheSpec).gates.idleGap, false);
});

test("subscription ledger counts token subsets once, shares limits, preserves uncertainty and refuses corruption", async () => {
  const directory = await mkdtemp(join(tmpdir(), "optchat-token-ledger-"));
  const unlock = acquireWriterLock(directory);
  try {
    assert.throws(() => acquireWriterLock(directory), /Another OptChat process/);
    assert.equal(usageTokens(usage), 38);
    assert.throws(() => usageTokens({ ...usage, reasoning: 6 }), /Invalid/);
    assert.throws(() => usageTokens({ ...usage, input: Number.NaN }), /Invalid/);
    const path = join(directory, "tokens.jsonl");
    const cap = tokenPolicy.reservationTokens * 2;
    const first = new TokenBudget(path, cap, 3, piQualityHash);
    const pending = first.reserve("quality");
    const second = new TokenBudget(path, cap, 3, piCacheHash);
    const settled = second.reserve("cache");
    assert.throws(() => second.reserve("excess"), /cap reached/);
    second.settle(settled, usage);
    const third = new TokenBudget(path, cap, 3, piQualityHash);
    assert.equal(third.pendingCalls, 1);
    assert.equal(third.committedTokens, tokenPolicy.reservationTokens + 38);
    third.settle(pending, usage);
    third.reserve("third");
    assert.throws(() => third.reserve("fourth"), /cap reached/);
    assert.throws(() => new TokenBudget(path, cap, 4, piQualityHash), /mismatch/);
    const before = await readFile(path, "utf8");
    assert.throws(() => third.settle(settled, usage), /settled/);
    assert.equal(await readFile(path, "utf8"), before);
    assert.ok(before.includes(piCacheHash) && before.includes(piQualityHash));
    await appendFile(path, '{"type":');
    assert.throws(() => new TokenBudget(path, cap, 3, piQualityHash), /Torn/);
  } finally {
    unlock();
    await rm(directory, { recursive: true, force: true });
  }
});

test("native Pi owns locked OAuth refresh and never resolves caller, stored or ambient API keys", async () => {
  const directory = await mkdtemp(join(tmpdir(), "optchat-oauth-host-"));
  try {
    const credentials = new InMemoryCredentialStore();
    const expired: OAuthCredential = {
      type: "oauth",
      access: "synthetic-expired",
      refresh: "synthetic-refresh",
      expires: 0,
    };
    await credentials.modify("openai", async () => expired);
    let refreshes = 0;
    let rejectRefresh = false;
    let apiKeys = 0;
    const requests: SimpleStreamOptions[] = [];
    const native = openaiProvider();
    const fake = qualityFauxProvider();
    const host = await ModelRuntime.create({
      credentials,
      modelsPath: null,
      modelsStorePath: join(directory, "models.json"),
      refreshOnCreate: false,
    });
    host.registerNativeProvider(
      oauthOnly({
        ...native,
        auth: {
          apiKey: {
            name: "must not run",
            resolve: async () => {
              apiKeys++;
              return { auth: { apiKey: "synthetic-paid-key" } };
            },
          },
          oauth: {
            ...native.auth.oauth!,
            refresh: async (previous) => {
              refreshes++;
              if (rejectRefresh) throw new Error("synthetic-private-refresh-error");
              await new Promise((done) => setTimeout(done, 20));
              return {
                ...previous,
                access: "synthetic-refreshed",
                expires: Date.now() + 3_600_000,
              };
            },
            toAuth: async (credential) => ({ apiKey: credential.access }),
          },
        },
        streamSimple: (model, transcript, options) => {
          requests.push(options!);
          options?.onProviderStreamEvent?.(
            {
              type: "response.completed",
              response: {
                status: "completed",
                usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
              },
            },
            model,
          );
          return fake.streamSimple(model, transcript, options);
        },
      }),
    );
    await host.refresh({ allowNetwork: false });
    const bridge = subscriptionBridge(host, quality);
    const model = bridge.getModels()[0]!;
    const answers = await Promise.all(
      [1, 2].map(() =>
        bridge
          .streamSimple(model, context, {
            apiKey: "synthetic-caller-key",
            headers: { authorization: "synthetic-caller-authorization" },
            env: { OPENAI_API_KEY: "synthetic-env-key" },
            maxTokens: 99_999,
            maxRetries: 99,
          })
          .result(),
      ),
    );
    assert.ok(answers.every((answer) => answer.stopReason === "stop"));
    assert.equal(refreshes, 1, "concurrent expired-token calls use Pi's locked refresh");
    assert.equal(apiKeys, 0);
    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.equal(request.apiKey, "synthetic-refreshed");
      assert.equal(request.headers, undefined);
      assert.equal(request.env, undefined);
      assert.equal(request.maxRetries, 0);
      assert.equal(request.maxTokens, 128_000);
      assert.equal(request.transport, "sse");
    }
    // A profile changed to a paid key is refused; a removed OAuth login has no ambient fallback.
    await credentials.modify("openai", async () => ({
      type: "api_key",
      key: "synthetic-stored-key",
    }));
    assert.equal((await bridge.streamSimple(model, context).result()).stopReason, "error");
    await credentials.delete("openai");
    assert.equal((await bridge.streamSimple(model, context).result()).stopReason, "error");
    assert.equal(requests.length, 2);
    assert.equal(apiKeys, 0);
    rejectRefresh = true;
    await credentials.modify("openai", async () => expired);
    const rejected = await bridge.streamSimple(model, context).result();
    assert.equal(rejected.stopReason, "error");
    assert.ok(!JSON.stringify(rejected).includes("synthetic-private-refresh-error"));
    assert.equal(requests.length, 2);
    assert.equal(apiKeys, 0);
    const safe = requests[0]!;
    await assert.rejects(
      async () => safe.onPayload!({ model: model.id, store: true, stream: true }, model),
      /Payload changed/,
    );
    await assert.rejects(
      async () =>
        safe.onPayload!(
          { model: model.id, store: false, stream: true, max_output_tokens: 8192 },
          model,
        ),
      /Payload changed/,
    );
    assert.ok(await safe.onPayload!({ model: model.id, store: false, stream: true }, model));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const fixture of [
  "completed",
  "missing-usage",
  "invalid-usage",
  "quota",
  "interrupted",
] as const) {
  test(`native OpenAI adapter with injected ${fixture} validates completion, usage and dispatch count`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-responses-eval-"));
    try {
      const credentials = new InMemoryCredentialStore();
      await credentials.modify("openai", async () => ({
        type: "oauth",
        access: "synthetic-oauth",
        refresh: "synthetic-refresh",
        expires: Date.now() + 3_600_000,
      }));
      const native = openaiProvider();
      let requests = 0;
      const host = await ModelRuntime.create({
        credentials,
        modelsPath: null,
        modelsStorePath: join(directory, "models.json"),
        refreshOnCreate: false,
      });
      host.registerNativeProvider(
        oauthOnly({
          ...native,
          auth: {
            oauth: {
              ...native.auth.oauth!,
              toAuth: async (credential) => ({ apiKey: credential.access }),
            },
          },
          streamSimple: (model, transcript, options) =>
            native.streamSimple({ ...model, api: "openai-responses" }, transcript, {
              ...options,
              fetch: async (url, init) => {
                requests++;
                assert.equal(String(url), "https://api.openai.com/v1/responses");
                const body = JSON.parse(init!.body as string);
                assert.equal(body.model, quality.model.id);
                assert.equal(body.store, false);
                assert.equal(body.stream, true);
                assert.equal(
                  body.max_output_tokens,
                  undefined,
                  "subscription transport omits unsupported output cap",
                );
                const event =
                  fixture === "quota"
                    ? {
                        type: "response.failed",
                        response: {
                          status: "failed",
                          error: {
                            code: "subscription_sharing_usage_limit_exceeded",
                            message: "synthetic-private-quota-detail",
                          },
                        },
                      }
                    : fixture === "interrupted"
                      ? {
                          type: "response.created",
                          response: { id: "synthetic-response", status: "in_progress" },
                        }
                      : {
                          type: "response.completed",
                          response: {
                            id: "synthetic-response",
                            status: "completed",
                            output: [],
                            ...(fixture === "completed" || fixture === "invalid-usage"
                              ? {
                                  usage: {
                                    input_tokens:
                                      fixture === "invalid-usage"
                                        ? quality.model.contextWindow + 1
                                        : 100,
                                    input_tokens_details: { cached_tokens: 80 },
                                    output_tokens: 3,
                                    output_tokens_details: { reasoning_tokens: 2 },
                                    total_tokens:
                                      fixture === "invalid-usage"
                                        ? quality.model.contextWindow + 4
                                        : 103,
                                  },
                                }
                              : {}),
                          },
                        };
                return new Response(`data: ${JSON.stringify(event)}\n\n`, {
                  headers: { "content-type": "text/event-stream" },
                });
              },
            }),
        }),
      );
      await host.refresh({ allowNetwork: false });
      const bridge = subscriptionBridge(host, quality);
      const budget = new TokenBudget(join(directory, "tokens.jsonl"), 1_000_000, 5, piQualityHash);
      const path = join(directory, "calls.jsonl");
      const meter = meterProvider(bridge, fixture, path, budget, quality);
      const model = bridge.getModels()[0]!;
      const result = await meter.provider.streamSimple(model, context).result();
      if (fixture === "completed") {
        assert.equal(result.stopReason, "stop");
        assert.equal(budget.committedTokens, 103);
        assert.equal(budget.pendingCalls, 0);
        assert.equal(meter.calls[0]!.usage!.input, 20, "cached input is counted once");
        assert.equal(meter.calls[0]!.usage!.cacheRead, 80);
        assert.equal(meter.calls[0]!.usage!.reasoning, 2);
        assert.equal(meter.calls[0]!.usage!.cost, undefined);
      } else {
        assert.equal(result.stopReason, "error");
        assert.equal(budget.pendingCalls, 1);
        assert.equal(budget.committedTokens, tokenPolicy.reservationTokens);
        await meter.provider.streamSimple(model, context).result();
        assert.equal(meter.blocked, true);
      }
      assert.equal(requests, 1, "no SDK retry or later dispatch after a terminal failure");
      if (fixture === "quota") assert.equal(meter.calls[0]!.failure, "subscription-limit");
      assert.ok(!(await readFile(path, "utf8")).includes("synthetic-private"));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("subscription limit stops subsequent dispatch, sanitizes failures and retains uncertain reservation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "optchat-quota-stop-"));
  try {
    const faux = fauxProvider({
      provider: quality.model.provider,
      api: quality.model.api,
      models: [{ id: quality.model.id, contextWindow: quality.model.contextWindow }],
    });
    faux.setResponses([
      fauxAssistantMessage("", {
        stopReason: "error",
        errorMessage: "subscription_sharing_usage_limit_exceeded synthetic-private-error",
      }),
    ]);
    const path = join(directory, "calls.jsonl");
    const budget = new TokenBudget(join(directory, "tokens.jsonl"), 1_000_000, 5, piQualityHash);
    const meter = meterProvider(faux.provider, "quota", path, budget, quality);
    const model = faux.getModel();
    const first = await meter.provider.streamSimple(model, context).result();
    await meter.provider.streamSimple(model, context).result();
    assert.equal(faux.state.callCount, 1);
    assert.equal(meter.blocked, true);
    assert.equal(budget.calls, 1);
    assert.equal(budget.pendingCalls, 1);
    assert.equal(meter.calls[0]!.failure, "subscription-limit");
    assert.equal(meter.calls[0]!.usage, undefined);
    assert.equal(meter.calls[0]!.costUsd, undefined);
    assert.ok(!JSON.stringify(first).includes("synthetic-private-error"));
    assert.ok(!(await readFile(path, "utf8")).includes("synthetic-private-error"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  "Pi subscription rehearsal uses isolated profiles, exact original pages and no fictional dollar cost",
  { timeout: 30_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-pi-quality-"));
    try {
      for (const arm of quality.arms) {
        const meter = meterProvider(
          qualityFauxProvider(),
          arm,
          join(directory, "calls.jsonl"),
          undefined,
          quality,
        );
        const result = await runTrial(
          join(directory, arm),
          corpus.find((c) => c.id === "oversized-page")!,
          arm,
          meter,
          true,
          quality,
        );
        assert.equal(result.failure, false);
        assert.equal(result.scoring, null);
        if (arm === "optchat-native") assert.equal(result.exactSources, result.expectedSources);
        assert.ok(
          meter.calls.every((call) => call.usage && !call.usage.cost && call.costUsd === undefined),
        );
        assert.equal(
          report([{ case: result.case, arm, repeat: 0, calls: meter.calls, result }], true, quality)
            .passed,
          false,
        );
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
