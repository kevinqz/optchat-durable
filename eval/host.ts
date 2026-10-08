import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { fauxAssistantMessage, fauxToolCall, type AssistantMessage } from "@earendil-works/pi-ai";
import type { SessionManager } from "@earendil-works/pi-coding-agent";
import { openEvaluationSession, type Arm } from "./session.js";
export type { Arm } from "./session.js";
import { type Case, questionFor, score } from "./corpus.js";
import { protocol } from "./protocol.js";
import type { meterProvider } from "./provider.js";
import { directoryBytes } from "./storage.js";

type ExpectedSource = { id: string; text: string; timestamp: number };

function seed(manager: SessionManager, item: Case): ExpectedSource[] {
  let time = 1_700_000_000_000;
  const expected: ExpectedSource[] = [];
  const add = (message: Parameters<SessionManager["appendMessage"]>[0], text: string) => {
    expected.push({ id: manager.appendMessage(message), text, timestamp: message.timestamp });
  };
  for (let index = 0; index < item.history.length; index++) {
    const record = item.history[index]!;
    if (record.role === "user")
      add({ role: "user", content: record.text, timestamp: time++ }, `user: ${record.text}`);
    else {
      const id = `synthetic-tool-${index}`;
      const message: AssistantMessage = {
        ...fauxAssistantMessage(fauxToolCall("synthetic_reader", {}, { id }), {
          stopReason: "toolUse",
          timestamp: time++,
        }),
        provider: protocol.model.provider,
        model: protocol.model.id,
        api: "anthropic-messages",
      };
      add(message, "tool: synthetic_reader {}");
      add(
        {
          role: "toolResult",
          toolCallId: id,
          toolName: "synthetic_reader",
          content: [{ type: "text", text: record.text }],
          isError: false,
          timestamp: time++,
        },
        `echo: synthetic_reader: ${record.text}`,
      );
    }
    if (index === 0 && item.discardedBranch) {
      const fork = manager.getLeafId()!;
      for (const alternate of item.discardedBranch)
        manager.appendMessage({ role: "user", content: alternate.text, timestamp: time++ });
      manager.branch(fork);
    }
  }
  add(
    {
      ...fauxAssistantMessage("History import complete.", { timestamp: time++ }),
      provider: protocol.model.provider,
      model: protocol.model.id,
      api: "anthropic-messages",
    },
    "talk: History import complete.",
  );
  return expected;
}

export async function runTrial(
  directory: string,
  item: Case,
  arm: Arm,
  meter: ReturnType<typeof meterProvider>,
  dry: boolean,
) {
  let originals: ExpectedSource[] = [];
  const session = await openEvaluationSession(directory, arm, meter, {
    seed: (manager) => {
      originals = seed(manager, item);
    },
  });
  const { runtime, readMemory: read } = session;
  const mainOutputs: string[] = [];
  let mainFailure = false;
  runtime.session.subscribe((event) => {
    if (event.type === "message_end" && event.message.role === "assistant") {
      const message = event.message as AssistantMessage;
      if (["error", "aborted", "length"].includes(message.stopReason)) mainFailure = true;
      const text = message.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      if (text) mainOutputs.push(text);
    }
  });
  let timeout = false;
  const timer = setTimeout(() => {
    timeout = true;
    meter.abort();
    void runtime.session.abort();
  }, protocol.trialTimeoutMs);
  const before = await directoryBytes(directory);
  const started = performance.now();
  const meteredStart = meter.elapsed();
  const callsBefore = meter.calls.length;
  let exactSources = 0;
  let memoryStatus: Record<string, unknown> | undefined;
  try {
    await runtime.session.prompt(questionFor(item));
    await runtime.session.waitForIdle();
    const answeredMs = performance.now() - started;
    if (arm === "optchat-native") {
      do {
        memoryStatus = await read({ action: "status" });
        if (memoryStatus.error) throw new Error("Native archive reported failure");
        if (memoryStatus.pendingTasks === 0) break;
        if (timeout) throw new Error("Trial timeout while draining summaries");
        await new Promise((done) => setTimeout(done, 50));
      } while (true);
      for (const [start, expected] of originals.entries()) {
        let offset = 0;
        let text = "";
        do {
          const page = await read({ action: "zoom", start, count: 1, offset });
          assert.equal(page.piEntryId, expected.id);
          assert.equal(page.timestamp, new Date(expected.timestamp).toISOString());
          text += page.text;
          if (page.next === null) break;
          assert.ok(typeof page.next === "number" && page.next > offset);
          offset = page.next;
        } while (true);
        assert.equal(text, expected.text);
        exactSources++;
      }
      for (const forbidden of item.forbidden ?? []) {
        if (!item.discardedBranch) break;
        let from = 0;
        do {
          const result = await read({ action: "search", query: forbidden, from });
          assert.deepEqual(result.matches, []);
          if (result.next === null) break;
          assert.ok(typeof result.next === "number" && result.next > from);
          from = result.next;
        } while (true);
      }
    }
    const answer = mainOutputs.at(-1) ?? "";
    const totalMs = performance.now() - started;
    const firstMain = meter.calls.slice(callsBefore).find((c) => c.stage === "main");
    return {
      case: item.id,
      category: item.category,
      arm,
      dry,
      answer,
      scoring: dry ? null : score(item, answer),
      failure:
        timeout ||
        session.hookErrors > 0 ||
        mainFailure ||
        meter.blocked ||
        !firstMain ||
        meter.calls.some((c) => ["error", "aborted"].includes(c.stop)),
      expectedSources: originals.length,
      exactSources: arm === "optchat-native" ? exactSources : null,
      answeredMs,
      totalMs,
      preparationMs: firstMain ? firstMain.startedMs - meteredStart : null,
      bytesBefore: before,
      bytesAfter: await directoryBytes(directory),
      calls: meter.calls,
      memoryStatus,
    };
  } finally {
    clearTimeout(timer);
    await runtime.dispose();
  }
}
