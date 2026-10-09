import assert from "node:assert/strict";
import { test } from "node:test";
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fauxAssistantMessage, normalizeContext } from "@earendil-works/pi-ai";
import { Budget } from "../../eval/budget.js";
import { protocolHash } from "../../eval/protocol.js";
import { cacheProtocol, cacheProtocolHash } from "../../eval/cache/protocol.js";
import { scenario, seedRecords, turns } from "../../eval/cache/scenario.js";
import { cacheReport, type CacheTrial } from "../../eval/cache/report.js";
import { cacheFauxProvider } from "../../eval/cache/faux.js";
import { meterProvider, type Call } from "../../eval/provider.js";
import { runCacheTrial } from "../../eval/cache/trial.js";

const usage = { ...fauxAssistantMessage("").usage, input: 1, cacheRead: 99 };

test("quality and cache share pending and settled charges across budget reopens", async () => {
  const directory = await mkdtemp(join(tmpdir(), "optchat-shared-budget-"));
  try {
    const path = join(directory, "budget.jsonl");
    const quality = new Budget(path, 2.1);
    const id = quality.reserve("quality");
    const cache = new Budget(path, 2.1, cacheProtocolHash);
    cache.reserve("cache");
    assert.equal(cache.pendingCalls, 2);
    assert.throws(() => cache.reserve("excess"), /spending cap/);
    cache.settle(id, usage);
    const reopened = new Budget(path, 2.1);
    assert.equal(reopened.pendingCalls, 1);
    const before = await readFile(path, "utf8");
    assert.throws(() => reopened.reserve(""), /Invalid budget/);
    assert.throws(() => reopened.settle(id, usage), /already settled/);
    assert.equal(
      await readFile(path, "utf8"),
      before,
      "invalid requests must not corrupt the ledger",
    );
    assert.ok(before.includes(protocolHash) && before.includes(cacheProtocolHash));
    await appendFile(path, '{"type":"refund","id":"invented","usd":0}\n');
    assert.throws(() => new Budget(path, 2.1), /Invalid budget event/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("legacy quality ledgers keep their charges and cannot silently start a cache budget", async () => {
  const directory = await mkdtemp(join(tmpdir(), "optchat-legacy-budget-"));
  try {
    const path = join(directory, "budget.jsonl");
    const original =
      JSON.stringify({ type: "header", protocolHash, capUsd: 2.1 }) +
      "\n" +
      JSON.stringify({ type: "reserve", id: "pending", trial: "quality", usd: 1.02048 }) +
      "\n";
    await writeFile(path, original);
    assert.equal(new Budget(path, 2.1).pendingCalls, 1);
    assert.throws(() => new Budget(path, 2.1, cacheProtocolHash), /Legacy ledger/);
    assert.equal(await readFile(path, "utf8"), original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("cache scenario is frozen, includes every lifecycle phase, and keeps raw records below one node", async () => {
  const frozen = JSON.parse(
    await readFile(
      new URL("../../eval/protocols/native-cache-haiku-5.5-v1.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(frozen.protocolHash, cacheProtocolHash);
  assert.deepEqual(frozen.protocol, cacheProtocol);
  assert.equal(turns("fixture", 0).length, 180);
  assert.equal(seedRecords("fixture", 0).length, scenario.seedRecords);
  for (const text of [...seedRecords("fixture", 0), ...turns("fixture", 0).map((t) => t.text)])
    assert.ok(Buffer.byteLength(`user: ${text}`) < 512);
  assert.notDeepEqual(seedRecords("one", 0), seedRecords("two", 0));
});

test("cache report cannot pass simulated, missing, misordered, unknown-usage or poor-cache results", () => {
  const rows: CacheTrial[] = cacheProtocol.arms.flatMap((arm) =>
    Array.from({ length: 3 }, (_, repeat) => {
      const sequence = turns("fixture", repeat);
      const calls: Call[] = sequence.map((t) => ({
        number: t.number,
        stage: "main",
        inputHash: "synthetic",
        inputBytes: 1,
        elapsedMs: 1,
        startedMs: t.number,
        stop: "stop",
        usage,
        costUsd: 0.001,
        label: { phase: t.phase, turn: t.number },
        ...(arm === "optchat-native"
          ? {
              view: {
                hash: "synthetic",
                bytes: 1,
                parts: 1,
                commonPrefixBytes: 0,
                appendOnlyFromPrevious: t.number !== 20,
              },
            }
          : {}),
      }));
      return {
        repeat,
        arm,
        calls,
        result: {
          turns: sequence.map((t) => ({
            number: t.number,
            phase: t.phase,
            ack: true,
            mainCalls: 1,
            summaryCalls: 0,
            elapsedMs: 1,
          })),
          failure: false,
          exactSources: arm === "optchat-native" ? 681 : null,
          expectedSources: 681,
          restartStatusMatches: true,
          expiryGapMs: 330_000,
          totalMs: 340_000,
          archiveBytes: 100,
        },
      };
    }),
  );
  assert.equal(
    cacheReport(rows, false).passed,
    true,
    "synthetic report fixture, not a provider observation",
  );
  const groups = cacheReport(rows, false).arms["optchat-native"]!;
  assert.ok(groups.main.knownCostUsd !== null && groups.main.knownCostUsd > 0);
  assert.equal(groups.summary.knownCostUsd, 0);
  assert.equal(groups.main.latencyMs.p50, 1);
  assert.equal(groups.summary.latencyMs.p50, null);
  assert.equal(cacheReport(rows, true).passed, false);
  assert.equal(cacheReport(rows.slice(1), false).passed, false);
  const broken = structuredClone(rows);
  broken[0]!.calls[0]!.usage = undefined;
  assert.equal(cacheReport(broken, false).passed, false);
  const order = structuredClone(rows);
  order[0]!.result!.turns.reverse();
  assert.equal(cacheReport(order, false).passed, false);
  for (const row of rows)
    for (const call of row.calls) call.usage = { ...usage, input: 99, cacheRead: 1 };
  assert.equal(cacheReport(rows, false).gates.warmMain, false);
});

test("cache meter keeps host options, sets short retention, and records only sanitized prefix evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "optchat-cache-meter-"));
  try {
    const base = cacheFauxProvider();
    let retention: unknown;
    const wrapped = {
      ...base,
      streamSimple: ((model, context, options) => {
        retention = options?.cacheRetention;
        assert.equal(options?.apiKey, "private-test-key");
        return base.streamSimple(model, context, options);
      }) as typeof base.streamSimple,
    };
    const meter = meterProvider(
      wrapped,
      "cache",
      join(directory, "calls.jsonl"),
      undefined,
      cacheProtocol,
    );
    const model = base.getModels()[0]!;
    for (const [turn, lines] of ["0+1|first", "0+1|first\n1+1|second", "0+2|merged"].entries()) {
      meter.label({ phase: "growth", turn });
      await meter.provider
        .streamSimple(
          model,
          normalizeContext({
            messages: [
              {
                role: "user",
                timestamp: 0,
                content: [{ type: "text", text: `<chat>\n${lines}\n</chat>` }],
              },
            ],
          }),
          { apiKey: "private-test-key", cacheRetention: "none" },
        )
        .result();
    }
    assert.equal(retention, "short");
    assert.deepEqual(
      meter.calls.map((c) => c.view!.appendOnlyFromPrevious),
      [null, true, false],
    );
    assert.deepEqual(
      meter.calls.map((c) => c.label!.turn),
      [0, 1, 2],
    );
    const evidence = await readFile(join(directory, "calls.jsonl"), "utf8");
    assert.ok(!evidence.includes("private-test-key") && !evidence.includes("0+1|first"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  "continuous native cache rehearsal uses real Pi lifecycle, batches, resumes and retrieves every original",
  { timeout: 180_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-cache-trial-"));
    try {
      const meter = meterProvider(
        cacheFauxProvider(),
        "cache",
        join(directory, "calls.jsonl"),
        undefined,
        cacheProtocol,
      );
      const result = await runCacheTrial(directory, "optchat-native", meter, "ci-fixture", 0, true);
      assert.equal(result.failure, false);
      assert.equal(result.turns.length, 180);
      assert.equal(result.exactSources, 681);
      assert.equal(result.exactSources, result.expectedSources);
      assert.equal(result.restartStatusMatches, true);
      assert.ok(result.expiryGapMs! < 330_000, "dry runs must not sleep or claim a TTL expiry");
      assert.ok(meter.calls.some((c) => c.stage === "summary"));
      assert.ok(
        meter.calls.some((c) => c.stage === "main" && c.view?.appendOnlyFromPrevious === false),
      );
      assert.equal(
        cacheReport([{ repeat: 0, arm: "optchat-native", calls: meter.calls, result }], true)
          .passed,
        false,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
