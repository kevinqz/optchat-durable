import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  Type,
  fauxAssistantMessage,
  fauxToolCall,
  getCurrentSystemPrompt,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { host } from "../helpers/pi.js";
import { userText } from "../helpers/core.js";
import { piDataDirectory, piNativeDirectory } from "../../src/pi/session.js";

const isSummary = (request: TranscriptContext) =>
  getCurrentSystemPrompt(request.messages).includes("You maintain the memory index");
const read = async (pi: Awaited<ReturnType<typeof host>>, params: object) => {
  const tool = pi.runner.getToolDefinition("optchat_memory")!;
  const result = await tool.execute(
    "test-read",
    params,
    undefined,
    undefined,
    pi.runner.createToolContext("test-read", undefined),
  );
  return JSON.parse(
    result.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join(""),
  );
};

for (const mode of ["tui", "print", "rpc"] as const)
  test(`normal Pi prompts use native memory in ${mode} mode`, { timeout: 20_000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-native-"));
    const requests: TranscriptContext[] = [];
    const pi = await host(
      directory,
      (request) => {
        if (isSummary(request)) return fauxAssistantMessage("user: Aurora; talk: recorded.");
        requests.push(structuredClone(request));
        return fauxAssistantMessage("Aurora recorded.");
      },
      "default",
      { native: true, mode },
    );
    try {
      assert.equal((await read(pi, { action: "status" })).started, false);
      await pi.session.prompt("Project Aurora.");
      assert.equal(pi.statusUpdates.at(-1)?.text, "OptChat: 2 records stored");
      await pi.session.prompt("What is its name?");
      assert.equal(pi.statusUpdates.at(-1)?.text, "OptChat: 4 records stored");
      assert.ok(pi.statusUpdates.some((status) => status.text === "OptChat: 0 prior records"));
      assert.ok(pi.statusUpdates.some((status) => status.text === "OptChat: 2 prior records"));
      assert.deepEqual(pi.notifications, []);
      assert.equal(requests.length, 2);
      for (const request of requests) {
        assert.match(getCurrentSystemPrompt(request.messages), /Host persona and rules/);
        assert.match(getCurrentSystemPrompt(request.messages), /<optchat_memory>/);
      }
      assert.match(userText(requests[0]!), /<chat>\n\n<\/chat>\nProject Aurora/);
      assert.match(userText(requests[1]!), /0\+1\|user: Project Aurora/);
      assert.equal(
        requests[1]!.messages.filter((m) => m.role === "assistant").length,
        0,
        "past responses must only appear in the memory view",
      );
      const result = await read(pi, { action: "zoom", start: 0, count: 1 });
      assert.equal(result.text, "user: Project Aurora.");
      assert.equal(typeof result.piEntryId, "string");
      assert.ok((await read(pi, { action: "date", start: 0 })).timestamp);
      assert.ok((await read(pi, { action: "search", query: "Aurora" })).matches.length);
    } finally {
      await pi.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

test("explicit chat retrieval never falls back to native session memory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "optchat-native-scopes-"));
  let calls = 0;
  const pi = await host(
    directory,
    () => {
      calls++;
      return fauxAssistantMessage("Recorded.");
    },
    "default",
    { native: true },
  );
  try {
    await pi.session.prompt("Native-only Aurora record.");
    const callsBeforeReads = calls;
    const absent = await read(pi, { action: "search", scope: "chat", query: "Aurora" });
    assert.equal(absent.started, false);
    assert.equal(absent.scope, "chat");
    assert.equal(absent.matches, undefined, "an empty chat must not leak session results");
    assert.equal(existsSync(join(piDataDirectory(pi.ctx()), "config.json")), false);
    assert.equal(
      (await read(pi, { action: "search", scope: "session", query: "Aurora" })).matches.length,
      1,
    );
    assert.equal(calls, callsBeforeReads, "scope recovery must not start model work");
    await pi.command("chat ask Separate-only Borealis record.");
    await pi.wait((views) => views.some((view) => view.data?.complete));
    const settledCalls = calls;
    assert.equal(
      (await read(pi, { action: "search", scope: "chat", query: "Aurora" })).matches.length,
      0,
    );
    assert.equal(
      (await read(pi, { action: "search", scope: "chat", query: "Borealis" })).matches.length,
      1,
    );
    assert.equal(
      (await read(pi, { action: "search", query: "Borealis" })).matches.length,
      0,
      "omitting scope in native mode must keep selecting the Pi session",
    );
    assert.equal(calls, settledCalls);
  } finally {
    await pi.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  "native tool loop retains host permissions, results, steering and reasoning signatures",
  { timeout: 20_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-native-tools-"));
    let called = 0;
    let step = 0;
    const requests: TranscriptContext[] = [];
    const pi = await host(
      directory,
      (request) => {
        if (isSummary(request))
          return fauxAssistantMessage("user: Aurora; echo: local tool completed.");
        requests.push(structuredClone(request));
        if (step++ === 0)
          return fauxAssistantMessage(
            [
              {
                type: "thinking",
                thinking: "PRIVATE_THOUGHT",
                thinkingSignature: "unchanged-signature",
              },
              fauxToolCall("local_probe", {}),
            ],
            { stopReason: "toolUse" },
          );
        return fauxAssistantMessage("Completed.");
      },
      "default",
      {
        native: true,
        tools: [
          {
            name: "local_probe",
            label: "Probe",
            description: "Local fixture",
            parameters: Type.Object({}),
            execute: async () => {
              called++;
              await pi.session.steer("Keep the original request.");
              return { content: [{ type: "text", text: "LOCAL_RESULT" }], details: {} };
            },
          },
        ],
      },
    );
    try {
      await pi.session.prompt("Run a local probe.");
      assert.deepEqual(pi.notifications, []);
      assert.equal(called, 1);
      assert.equal(requests.length, 2);
      assert.match(JSON.stringify(requests[1]), /unchanged-signature/);
      assert.match(JSON.stringify(requests[1]), /LOCAL_RESULT/);
      assert.match(userText(requests[1]!), /Keep the original request/);
      const views = requests.map((r) => r.messages.find((m) => m.role === "user")!);
      assert.deepEqual(
        views[0],
        views[1],
        "frozen view and initial input must remain identical inside a tool loop",
      );
      assert.equal(
        (await read(pi, { action: "search", query: "PRIVATE_THOUGHT" })).matches.length,
        0,
      );
      await pi.session.prompt("What did the probe return?");
      assert.doesNotMatch(JSON.stringify(requests.at(-1)), /PRIVATE_THOUGHT|unchanged-signature/);
      assert.match(userText(requests.at(-1)!), /LOCAL_RESULT/);
    } finally {
      await pi.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "resume retains originals and tree navigation excludes the discarded branch",
  { timeout: 20_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-native-tree-"));
    const requests: TranscriptContext[] = [];
    const respond = (request: TranscriptContext) => {
      if (isSummary(request)) return fauxAssistantMessage("user: root project.");
      requests.push(structuredClone(request));
      return fauxAssistantMessage("Recorded.");
    };
    const first = await host(directory, respond, "default", { native: true });
    let path!: string;
    let branchPoint!: string;
    try {
      await first.session.prompt("Root fact.");
      branchPoint = first.session.sessionManager.getLeafId()!;
      await first.session.prompt("DISCARDED_BRANCH_SECRET");
      path = first.session.sessionManager.getSessionFile()!;
    } finally {
      await first.close();
    }
    const resumed = await host(directory, respond, "default", {
      native: true,
      session: SessionManager.open(path),
    });
    try {
      const moved = await resumed.session.navigateTree(branchPoint, { summarize: false });
      assert.equal(moved.cancelled, false);
      assert.doesNotMatch(
        JSON.stringify(resumed.session.sessionManager.getBranch()),
        /DISCARDED_BRANCH_SECRET/,
        "Pi must have navigated before checking memory",
      );
      await resumed.session.prompt("New branch fact.");
      assert.deepEqual(resumed.notifications, []);
      assert.doesNotMatch(userText(requests.at(-1)!), /DISCARDED_BRANCH_SECRET/);
      assert.match(userText(requests.at(-1)!), /Root fact/);
      assert.equal(
        (await read(resumed, { action: "search", query: "DISCARDED_BRANCH_SECRET" })).matches
          .length,
        0,
      );
      assert.match(
        await readFile(path, "utf8"),
        /DISCARDED_BRANCH_SECRET/,
        "original branch must not be deleted",
      );
    } finally {
      await resumed.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "a context-transform conflict aborts the main request instead of falling back to raw history",
  { timeout: 20_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-native-block-"));
    let accepted = 0;
    const pi = await host(
      directory,
      (_request, options) => {
        if (!options?.signal?.aborted) accepted++;
        return fauxAssistantMessage("Must not run");
      },
      "default",
      {
        native: true,
        extensions: [
          (api) => {
            api.on("context", (event) => ({
              messages: event.messages.filter((m) => m.role !== "user"),
            }));
          },
        ],
      },
    );
    try {
      await pi.session.prompt("Do not send unprepared history.");
      assert.equal(accepted, 0);
      assert.ok(pi.notifications.some((n) => n.includes("removed or rewrote")));
    } finally {
      await pi.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("--no-session keeps native memory ephemeral", { timeout: 20_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "optchat-native-ephemeral-"));
  const pi = await host(directory, () => fauxAssistantMessage("Recorded."), "default", {
    native: true,
    session: SessionManager.inMemory(join(directory, "workspace")),
  });
  try {
    await pi.session.prompt("Private temporary fact.");
    assert.deepEqual(pi.notifications, []);
    assert.equal((await read(pi, { action: "status" })).directory, ":memory:");
    await assert.rejects(readFile(join(piNativeDirectory(pi.ctx()), "config.json")), {
      code: "ENOENT",
    });
  } finally {
    await pi.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  "failed summarization blocks inference, preserves the full source, and can be retried",
  { timeout: 20_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-native-failure-"));
    const session = SessionManager.inMemory(join(directory, "workspace"));
    const original = "LONG_ORIGINAL " + "ação🙂 ".repeat(300);
    session.appendMessage({ role: "user", content: original, timestamp: 1 });
    let fail = true;
    let inference = 0;
    const pi = await host(
      directory,
      (request, options) => {
        if (isSummary(request))
          return fauxAssistantMessage(fail ? "" : "user: LONG_ORIGINAL preserved.");
        if (!options?.signal?.aborted) inference++;
        return fauxAssistantMessage("Recovered.");
      },
      "default",
      { native: true, session },
    );
    try {
      await pi.session.prompt("Use my history.");
      assert.equal(inference, 0);
      assert.match(pi.notifications.join("\n"), /Empty summary/);
      assert.equal(pi.statusUpdates.at(-1)?.text, "OptChat: blocked · /optchat status");
      assert.equal(
        (await read(pi, { action: "zoom", start: 0, count: 1 })).text,
        `user: ${original}`,
      );
      fail = false;
      await pi.session.prompt("Try again.");
      assert.equal(inference, 1);
    } finally {
      await pi.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "Escape during memory preparation cancels summary work and preserves the pending input",
  { timeout: 20_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-native-abort-"));
    const session = SessionManager.inMemory(join(directory, "workspace"));
    session.appendMessage({ role: "user", content: "History ".repeat(150), timestamp: 1 });
    let preparing!: () => void;
    const ready = new Promise<void>((resolve) => {
      preparing = resolve;
    });
    let cancelled = false;
    let hold = true;
    let inference = 0;
    const pi = await host(
      directory,
      async (request, options) => {
        if (isSummary(request) && hold) {
          preparing();
          await new Promise<void>((_resolve, reject) =>
            options?.signal?.addEventListener(
              "abort",
              () => {
                cancelled = true;
                reject(new Error("aborted"));
              },
              { once: true },
            ),
          );
        }
        if (!isSummary(request) && !options?.signal?.aborted) inference++;
        return fauxAssistantMessage("user: history retained.");
      },
      "default",
      { native: true, session },
    );
    try {
      const pending = pi.session.prompt("PENDING_USER_MESSAGE");
      await ready;
      await pi.session.abort();
      await pending;
      assert.equal(cancelled, true);
      assert.equal(inference, 0);
      assert.equal(pi.statusUpdates.at(-1)?.text, "OptChat: 2 records stored");
      assert.ok(
        (await read(pi, { action: "search", query: "PENDING_USER_MESSAGE" })).matches.length,
      );
      hold = false;
      await pi.session.prompt("Continue safely.");
      assert.equal(inference, 1);
    } finally {
      await pi.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "native memory honors context redactions and host tool permission hooks",
  { timeout: 20_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-native-permission-"));
    let step = 0;
    let executed = 0;
    const requests: TranscriptContext[] = [];
    const pi = await host(
      directory,
      (request) => {
        if (isSummary(request)) return fauxAssistantMessage("user: permission test; echo: denied.");
        requests.push(structuredClone(request));
        if (step++ === 1)
          return fauxAssistantMessage(fauxToolCall("protected_probe", {}), {
            stopReason: "toolUse",
          });
        return fauxAssistantMessage("Done.");
      },
      "default",
      {
        native: true,
        extensions: [
          (api) => {
            api.on("tool_call", (event) =>
              event.toolName === "protected_probe"
                ? { block: true, reason: "HOST_PERMISSION_DENIED" }
                : undefined,
            );
          },
        ],
        tools: [
          {
            name: "protected_probe",
            label: "Protected",
            description: "Protected fixture",
            parameters: Type.Object({}),
            execute: async () => {
              executed++;
              return { content: [], details: {} };
            },
          },
        ],
      },
    );
    try {
      await pi.session.prompt("REDACT_ME");
      const old = pi.session.sessionManager
        .getBranch()
        .find((e) => e.type === "message" && e.message.role === "user")!;
      pi.session.sessionManager.appendContextEdit(old.id, null);
      await pi.session.prompt("Run the protected probe.");
      assert.equal(executed, 0);
      assert.doesNotMatch(userText(requests[1]!), /REDACT_ME/);
      assert.match(JSON.stringify(requests.at(-1)), /HOST_PERMISSION_DENIED/);
      assert.equal((await read(pi, { action: "search", query: "REDACT_ME" })).matches.length, 0);
      assert.deepEqual(pi.notifications, []);
    } finally {
      await pi.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "reload preserves native history; a new session uses an isolated memory directory",
  { timeout: 20_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-native-reload-"));
    const requests: TranscriptContext[] = [];
    const pi = await host(
      directory,
      (request) => {
        if (isSummary(request)) return fauxAssistantMessage("user: reload fixture.");
        requests.push(structuredClone(request));
        return fauxAssistantMessage("Saved.");
      },
      "default",
      { native: true },
    );
    try {
      await pi.session.prompt("RELOAD_FACT");
      const oldDirectory = piNativeDirectory(pi.ctx());
      await pi.session.reload();
      await pi.session.prompt("Is my fact retained?");
      assert.match(userText(requests.at(-1)!), /RELOAD_FACT/);
      await pi.ctx().newSession();
      assert.equal(pi.statusUpdates.at(-1)?.text, undefined);
      await pi.session.prompt("Fresh session.");
      assert.notEqual(piNativeDirectory(pi.ctx()), oldDirectory);
      assert.doesNotMatch(userText(requests.at(-1)!), /RELOAD_FACT/);
      assert.deepEqual(pi.notifications, []);
    } finally {
      await pi.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "native /model and /fork use the host lifecycle without losing or mixing memory",
  { timeout: 20_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-native-model-fork-"));
    const selected: string[] = [];
    const requests: TranscriptContext[] = [];
    const pi = await host(
      directory,
      (request, _options, _state, model) => {
        if (isSummary(request)) return fauxAssistantMessage("user: model and fork fixture.");
        selected.push(model.id);
        requests.push(structuredClone(request));
        return fauxAssistantMessage("Saved.");
      },
      "default",
      { native: true },
    );
    try {
      await pi.session.prompt("FORK_ROOT_FACT");
      const at = pi.session.sessionManager.getLeafId()!;
      const oldDirectory = piNativeDirectory(pi.ctx());
      await pi.session.setModel(pi.models.getModel("faux", "small")!);
      await pi.session.prompt("BEFORE_FORK_ONLY");
      assert.deepEqual(selected, ["test", "small"]);
      assert.match(userText(requests[1]!), /FORK_ROOT_FACT/);
      await pi.ctx().fork(at, { position: "at" });
      assert.notEqual(piNativeDirectory(pi.ctx()), oldDirectory);
      await pi.session.prompt("Continue the fork.");
      assert.match(userText(requests.at(-1)!), /FORK_ROOT_FACT/);
      assert.doesNotMatch(userText(requests.at(-1)!), /BEFORE_FORK_ONLY/);
      assert.deepEqual(pi.notifications, []);
    } finally {
      await pi.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "OptChat owns compaction and disables cache-renewal pings without modifying user settings",
  { timeout: 20_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-native-compaction-"));
    let calls = 0;
    const pi = await host(
      directory,
      () => {
        calls++;
        return fauxAssistantMessage("Saved.");
      },
      "default",
      { native: true },
    );
    try {
      pi.session.settingsManager.applyOverrides({ compaction: { keepRecentTokens: 1 } });
      await pi.session.prompt("Remember this.");
      await pi.session.prompt("A second turn makes the earlier turn eligible for compaction.");
      const count = calls;
      await assert.rejects(pi.session.compact(), /cancel|aborted/i);
      assert.equal(calls, count);
      assert.equal(
        pi.session.sessionManager.getBranch().some((e) => e.type === "compaction"),
        false,
      );
      const result = await pi.runner.emitCacheWarmingDecision({
        type: "cache_warming_decision",
        action: "warm",
        warmCost: 0.1,
        missCost: 1,
        continuationProbability: 1,
      });
      assert.equal(result, "stop");
    } finally {
      await pi.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("native public payload hook marks the frozen view and preserves complete live input", async () => {
  const directory = await mkdtemp(join(tmpdir(), "optchat-native-cache-"));
  const requests: TranscriptContext[] = [];
  const pi = await host(
    directory,
    (request) => {
      if (!isSummary(request)) requests.push(request);
      return fauxAssistantMessage("Recorded.");
    },
    "default",
    { native: true },
  );
  try {
    await pi.session.prompt("first");
    await pi.session.prompt("second");
    await pi.session.prompt("third");
    // Exercise the real extension runner's public hook with an Anthropic-shaped payload.
    // Generation above is deliberately simulated; no cache-hit claim follows from this.
    await pi.session.setModel({ ...pi.session.model!, api: "anthropic-messages" });
    const user = requests.at(-1)!.messages.find((m) => m.role === "user")!;
    assert.ok(Array.isArray(user.content));
    const content = user.content.map((b) => ({ ...b }));
    const last = content.at(-1)!;
    const payload = {
      model: "test",
      system: [{ type: "text", text: "Host persona", cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [...content.slice(0, -1), { ...last, cache_control: { type: "ephemeral" } }],
        },
      ],
    };
    const changed = (await pi.runner.emitBeforeProviderRequest(payload)) as typeof payload;
    assert.ok(JSON.stringify(changed.messages[0]!.content[0]).includes("cache_control"));
    assert.equal(changed.messages[0]!.content.at(-1)!.type, "text");
    assert.ok(JSON.stringify(changed.messages[0]!.content.at(-1)).includes("third"));
    assert.ok(!JSON.stringify(payload.messages[0]!.content[0]).includes("cache_control"));
    assert.deepEqual(pi.notifications, []);
  } finally {
    await pi.close();
    await rm(directory, { recursive: true, force: true });
  }
});
