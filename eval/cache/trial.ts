import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fauxAssistantMessage, type AssistantMessage } from "@earendil-works/pi-ai";
import type { SessionManager } from "@earendil-works/pi-coding-agent";
import { openEvaluationSession, type Arm, type EvaluationSession } from "../session.js";
import type { meterProvider } from "../provider.js";
import { directoryBytes } from "../storage.js";
import { cacheProtocol } from "./protocol.js";
import { seedRecords, turns, type Turn } from "./scenario.js";

export type TurnResult = Pick<Turn, "number" | "phase"> & {
  ack: boolean;
  mainCalls: number;
  summaryCalls: number;
  elapsedMs: number;
};
export type CacheTrialResult = {
  turns: TurnResult[];
  failure: boolean;
  exactSources: number | null;
  expectedSources: number;
  restartStatusMatches: boolean | null;
  expiryGapMs: number | null;
  totalMs: number;
  archiveBytes: number;
};
const assistant = (text: string, timestamp: number): AssistantMessage => ({
  ...fauxAssistantMessage(text, { timestamp }),
  api: "anthropic-messages",
  provider: cacheProtocol.model.provider,
  model: cacheProtocol.model.id,
});
const systemPrompt = cacheProtocol.systemPrompt;
function seed(manager: SessionManager, nonce: string, repeat: number) {
  let timestamp = 1_700_000_000_000;
  for (const text of seedRecords(nonce, repeat))
    manager.appendMessage({ role: "user", content: text, timestamp: timestamp++ });
  manager.appendMessage(assistant("Synthetic history import complete.", timestamp));
}

/** Independent oracle from Pi's public selected branch, without using OptChat normalization. */
async function verifySources(session: EvaluationSession) {
  const expected = session.manager.getBranch().flatMap((entry) => {
    if (entry.type !== "message") return [];
    const message = entry.message;
    if (message.role === "system") return [];
    if (message.role === "user") {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content
              .map((c) => {
                assert.equal(c.type, "text");
                return c.type === "text" ? c.text : "";
              })
              .join("\n");
      return [{ id: entry.id, text: `user: ${text}`, timestamp: message.timestamp }];
    }
    assert.equal(
      message.role,
      "assistant",
      "Cache workload must not invoke external or retrieval tools",
    );
    const reply = message as AssistantMessage;
    assert.ok(!reply.content.some((c) => c.type === "toolCall"));
    return reply.content.flatMap((c) =>
      c.type === "text" && c.text
        ? [{ id: entry.id, text: `talk: ${c.text}`, timestamp: message.timestamp }]
        : [],
    );
  });
  for (const [start, record] of expected.entries()) {
    let offset = 0;
    let text = "";
    do {
      const page = await session.readMemory({ action: "zoom", start, count: 1, offset });
      assert.equal(page.piEntryId, record.id);
      assert.equal(page.timestamp, new Date(record.timestamp).toISOString());
      text += page.text;
      if (page.next === null) break;
      assert.ok(typeof page.next === "number" && page.next > offset);
      offset = page.next;
    } while (true);
    assert.equal(text, record.text);
  }
  return expected.length;
}

/** Closes/reopens the public Pi runtime in-process. Process-crash recovery is covered separately. */
export async function runCacheTrial(
  directory: string,
  arm: Arm,
  meter: ReturnType<typeof meterProvider>,
  nonce: string,
  repeat: number,
  dry: boolean,
  onTurn: (result: TurnResult) => void = () => {},
): Promise<CacheTrialResult> {
  let session = await openEvaluationSession(directory, arm, meter, {
    seed: (manager) => seed(manager, nonce, repeat),
    systemPrompt,
  });
  const timeout = new AbortController();
  const timer = setTimeout(() => {
    timeout.abort();
    meter.abort();
    void session.runtime.session.abort();
  }, cacheProtocol.trialTimeoutMs);
  const started = performance.now();
  const completed: TurnResult[] = [];
  let restartStatusMatches: boolean | null = null;
  let expiryGapMs: number | null = null;
  let failed = false;
  let expectedSources = 0;
  let exactSources: number | null = null;
  const checkedConfigs = new Set<string>();
  const drain = async () => {
    await session.runtime.session.waitForIdle();
    if (arm === "ordinary-pi") return null;
    while (true) {
      timeout.signal.throwIfAborted();
      const status = await session.readMemory({ action: "status" });
      assert.equal(status.error, null);
      assert.equal(session.hookErrors, 0);
      assert.equal(typeof status.directory, "string");
      const path = join(status.directory as string, "config.json");
      if (!checkedConfigs.has(path)) {
        const saved = JSON.parse(await readFile(path, "utf8"));
        for (const [key, value] of Object.entries(cacheProtocol.memory))
          assert.equal(saved.config[key], value);
        for (const key of ["main", "compactor"])
          assert.deepEqual(saved.config[key], {
            provider: cacheProtocol.model.provider,
            modelId: cacheProtocol.model.id,
          });
        checkedConfigs.add(path);
      }
      if (status.pendingTasks === 0) return status.memory;
      await delay(50, undefined, { signal: timeout.signal });
    }
  };
  try {
    for (const turn of turns(nonce, repeat)) {
      timeout.signal.throwIfAborted();
      meter.label({ phase: turn.phase, turn: turn.number });
      if (turn.phase === "restart") {
        const before = await drain();
        const sessionFile = session.manager.getSessionFile();
        assert.ok(sessionFile);
        assert.equal(session.hookErrors, 0);
        await session.runtime.dispose();
        checkedConfigs.clear();
        session = await openEvaluationSession(directory, arm, meter, { sessionFile, systemPrompt });
        const after = await drain();
        restartStatusMatches = JSON.stringify(before) === JSON.stringify(after);
        assert.ok(restartStatusMatches);
      }
      if (turn.phase === "expired") {
        await drain();
        // Dry execution never pretends that a provider TTL elapsed.
        if (!dry) await delay(cacheProtocol.expiryPauseMs, undefined, { signal: timeout.signal });
      }
      const first = meter.calls.length;
      const begin = performance.now();
      const messages: AssistantMessage[] = [];
      const unsubscribe = session.runtime.session.subscribe((event) => {
        if (event.type === "message_end" && event.message.role === "assistant")
          messages.push(event.message as AssistantMessage);
      });
      try {
        await session.runtime.session.prompt(turn.text);
        await drain();
      } finally {
        unsubscribe();
      }
      const calls = meter.calls.slice(first);
      const main = calls.filter((c) => c.stage === "main");
      const answer = messages
        .at(-1)
        ?.content.filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      let ack = false;
      try {
        ack = JSON.stringify(JSON.parse(answer ?? "")) === JSON.stringify({ ack: turn.ack });
      } catch {
        /* Failed acknowledgement remains evidence. */
      }
      if (turn.phase === "expired") expiryGapMs = main[0]?.idleBeforeMs ?? null;
      const result = {
        number: turn.number,
        phase: turn.phase,
        ack,
        mainCalls: main.length,
        summaryCalls: calls.length - main.length,
        elapsedMs: performance.now() - begin,
      };
      completed.push(result);
      onTurn(result);
      if (
        !ack ||
        main.length !== 1 ||
        meter.blocked ||
        session.hookErrors ||
        messages.some((m) => ["error", "aborted", "length", "toolUse"].includes(m.stopReason)) ||
        calls.some((c) => ["error", "aborted", "length"].includes(c.stop))
      ) {
        failed = true;
        break;
      }
    }
    if (arm === "optchat-native" && !failed) {
      exactSources = await verifySources(session);
      const status = await session.readMemory({ action: "status" });
      expectedSources = (status.memory as { messages: number }).messages;
      assert.equal(exactSources, expectedSources);
    }
    return {
      turns: completed,
      failure: failed || timeout.signal.aborted,
      exactSources,
      expectedSources,
      restartStatusMatches,
      expiryGapMs,
      totalMs: performance.now() - started,
      archiveBytes: await directoryBytes(directory),
    };
  } finally {
    clearTimeout(timer);
    await session.runtime.dispose();
  }
}
