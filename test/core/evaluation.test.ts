import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  normalizeContext,
  type FauxResponseFactory,
} from "@earendil-works/pi-ai";
import { MemoryStorage } from "@earendil-works/pi-durable";
import { Budget, usageCost } from "../../eval/budget.js";
import { corpus, score } from "../../eval/corpus.js";
import { protocol } from "../../eval/protocol.js";
import { meterProvider } from "../../eval/provider.js";
import { interval, report } from "../../eval/report.js";
import { runTrial } from "../../eval/host.js";
import { openApp } from "../../src/app.js";
import { resolveOptChatConfig } from "../../src/config.js";
import { cacheMetrics } from "../../eval/cache-metrics.js";

test("cache read rates are token-weighted, separate requests, and never hide missing usage", () => {
  const usage = (input: number, cacheRead: number, cacheWrite = 0) => ({
    ...fauxAssistantMessage("").usage,
    input,
    cacheRead,
    cacheWrite,
  });
  const calls = [{ usage: usage(0, 98_000, 1000) }, { usage: usage(1000, 0) }];
  const observed = cacheMetrics(calls, true);
  assert.equal(observed.tokenReadFraction, 0.98);
  assert.equal(observed.requestHitFraction, 0.5);
  assert.equal(observed.totalInputTokens, 100_000);
  assert.equal(cacheMetrics(calls, false).tokenReadFraction, null);
  assert.equal(cacheMetrics([...calls, {}], true).tokenReadFraction, null);
  assert.equal(cacheMetrics([{ usage: usage(0, 0) }], true).tokenReadFraction, null);
  assert.equal(cacheMetrics([{ usage: usage(-1, 100) }], true).unknownUsageCalls, 1);
});

for (const fault of ["rate-limit", "timeout", "connection-reset"] as const) {
  test(`real Anthropic adapter against loopback injected ${fault} dispatches once and preserves uncertain billing`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-transport-eval-"));
    let requests = 0;
    const server = createServer((request, response) => {
      requests++;
      if (fault === "rate-limit") {
        response.writeHead(429, { "content-type": "application/json", "retry-after": "0" });
        response.end(
          JSON.stringify({
            type: "error",
            error: { type: "rate_limit_error", message: "Synthetic loopback fault" },
          }),
        );
      } else if (fault === "connection-reset") request.socket.destroy();
      // Timeout intentionally leaves the response open until the caller aborts.
    });
    try {
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const provider = anthropicProvider();
      const catalog = provider.getModels().find((m) => m.id === protocol.model.id)!;
      const model = { ...catalog, baseUrl: `http://127.0.0.1:${address.port}` };
      const budget = new Budget(join(directory, "budget.jsonl"), 25);
      const meter = meterProvider(provider, fault, join(directory, "calls.jsonl"), budget);
      const message = await meter.provider
        .streamSimple(
          model,
          normalizeContext({
            messages: [{ role: "user", content: "Synthetic transport test", timestamp: 0 }],
          }),
          {
            apiKey: "synthetic-loopback-only",
            signal: AbortSignal.timeout(fault === "timeout" ? 1000 : 5000),
          },
        )
        .result();
      assert.ok(["error", "aborted"].includes(message.stopReason));
      assert.equal(requests, 1, "provider SDK retries must remain disabled");
      assert.equal(budget.pendingCalls, 1);
      assert.equal(meter.calls.length, 1);
      assert.equal(meter.calls[0]!.usage, undefined);
      assert.ok(
        !(await readFile(join(directory, "calls.jsonl"), "utf8")).includes(
          "synthetic-loopback-only",
        ),
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("evaluation scoring rejects case changes, decorated answers and instruction leakage", () => {
  const id = corpus.find((c) => c.id === "identifier-sensitive-case")!;
  assert.equal(score(id, JSON.stringify({ answer: id.expected })).correct, true);
  assert.equal(score(id, JSON.stringify({ answer: id.expected!.toLowerCase() })).correct, false);
  assert.equal(score(id, `Answer: ${JSON.stringify({ answer: id.expected })}`).correct, false);
  const missing = corpus.find((c) => c.id === "branch-absent")!;
  assert.equal(score(missing, '{"answer":null}').correct, true);
  assert.equal(score(missing, '{"answer":"LEAK_NIMBUS_66"}').leak, true);
  assert.equal(report([], false).passed, false);
  assert.equal(report([], true).passed, false);
  assert.deepEqual(interval([0.5, 0.5, 0.5]), [0.5, 0.5]);
});

test("budget reserves before dispatch, keeps interrupted charges and refuses altered or torn ledgers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "optchat-budget-"));
  try {
    const path = join(directory, "budget.jsonl");
    const budget = new Budget(path, 2.1);
    const first = budget.reserve("one");
    budget.reserve("two");
    assert.throws(() => budget.reserve("three"), /spending cap/);
    const reopened = new Budget(path, 2.1);
    assert.equal(reopened.pendingCalls, 2);
    assert.equal(reopened.committedUsd, budget.committedUsd);
    const usage = { ...fauxAssistantMessage("").usage, input: 100_001, output: 10 };
    assert.equal(usageCost(usage), (100_001 * 0.5 + 10 * 2.5) / 1_000_000);
    reopened.settle(first, usage);
    assert.equal(reopened.pendingCalls, 1);
    assert.ok(reopened.committedUsd > 1, "unknown second request must retain its full reservation");
    assert.throws(() => new Budget(path, 3), /mismatch/);
    await appendFile(path, '{"type":');
    assert.throws(() => new Budget(path, 2.1), /Torn/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const label of ["HTTP 429 rate limit", "ETIMEDOUT", "ECONNRESET"]) {
  test(`injected ${label} retains billing uncertainty and counts the successful compactor retry`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-provider-eval-"));
    const path = join(directory, "calls.jsonl");
    const budget = new Budget(join(directory, "budget.jsonl"), 25);
    const faux = fauxProvider({
      provider: protocol.model.provider,
      models: [
        { id: protocol.model.id, contextWindow: protocol.model.contextWindow, maxTokens: 128_000 },
      ],
    });
    let injected = false;
    const respond: FauxResponseFactory = (context, options) => {
      faux.appendResponses([respond]);
      assert.equal(options?.maxRetries, 0);
      assert.equal(options?.cacheRetention, "none");
      assert.equal(options?.maxTokens, 8192);
      if (!injected && JSON.stringify(context).includes("<target>")) {
        injected = true;
        return fauxAssistantMessage("", {
          stopReason: "error",
          errorMessage: `${label}: secret-placeholder-must-not-be-logged`,
        });
      }
      return fauxAssistantMessage("Synthetic summary.");
    };
    faux.setResponses([respond]);
    const meter = meterProvider(faux.provider, label, path, budget);
    const models = createModels();
    models.setProvider(meter.provider);
    const ref = { provider: protocol.model.provider, modelId: protocol.model.id };
    const app = await openApp(
      { ...resolveOptChatConfig({ main: ref, compactor: ref, retryMs: 1 }), directory, demo: true },
      { models, storage: new MemoryStorage() },
    );
    try {
      const original = "The complete source remains available. ".repeat(40);
      await app.prompt(original, "seed");
      await app.settleMemory();
      assert.equal(injected, true);
      assert.equal(meter.calls.filter((c) => c.stop === "error").length, 1);
      assert.ok(meter.calls.filter((c) => c.stage === "summary" && c.stop === "stop").length >= 1);
      assert.equal(budget.pendingCalls, 1);
      assert.ok(!(await readFile(path, "utf8")).includes("secret-placeholder"));
      const raw = await app.zoom(0, 1);
      assert.ok("text" in raw && raw.text === `user: ${original}`);
    } finally {
      await app.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test(
  "dry evaluation uses ordinary Pi without OptChat and validates native paged originals without a quality claim",
  { timeout: 30_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-eval-native-"));
    try {
      for (const arm of protocol.arms) {
        const faux = fauxProvider({
          provider: protocol.model.provider,
          models: [
            {
              id: protocol.model.id,
              contextWindow: protocol.model.contextWindow,
              maxTokens: 128_000,
            },
          ],
        });
        const respond: FauxResponseFactory = () => {
          faux.appendResponses([respond]);
          return fauxAssistantMessage('{"answer":null}');
        };
        faux.setResponses([respond]);
        const meter = meterProvider(faux.provider, arm, join(directory, "calls.jsonl"));
        const result = await runTrial(
          join(directory, arm),
          corpus.find((c) => c.id === "oversized-page")!,
          arm,
          meter,
          true,
        );
        assert.equal(result.failure, false);
        assert.equal(result.scoring, null);
        assert.equal(
          arm === "ordinary-pi" ? meter.calls.length : result.exactSources,
          arm === "ordinary-pi" ? 1 : result.expectedSources,
        );
        if (arm === "optchat-native") assert.ok(meter.calls.some((c) => c.stage === "summary"));
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
