import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { PiOptChatSession, piDataDirectory } from "../../src/pi/session.js";
import { host } from "../helpers/pi.js";
import { userText } from "../helpers/core.js";

test(
  "Pi's real loader, slash command and retrieval tool share the durable core without changing Pi context",
  { timeout: 20_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-pi-"));
    let calls = 0;
    const pi = await host(directory, (request, options) => {
      calls++;
      assert.ok(userText(request).includes("<chat>"));
      assert.equal(options?.maxTokens, 8192, "host bridge must retain the transport output bound");
      return fauxAssistantMessage("Aurora retained by the native durable runtime.");
    });
    try {
      const path = piDataDirectory(pi.ctx());
      await pi.command("help");
      await pi.command("status");
      assert.equal(calls, 0);
      assert.equal(
        existsSync(path),
        false,
        "loading/help/status must not create storage or call a model",
      );
      await pi.command("ask Remember Aurora.");
      await pi.wait((views) => views.some((v) => v.data?.complete));
      assert.equal(calls, 1, "slash command must not trigger the coding-agent model as well");
      assert.deepEqual(pi.notifications, []);
      assert.ok(
        !JSON.stringify(pi.session.sessionManager.buildSessionContext().messages).includes(
          "Aurora",
        ),
        "display entries must stay outside the coding-agent context",
      );
      const tool = pi.runner.getToolDefinition("optchat_memory")!;
      const result = await tool.execute(
        "retrieve",
        { action: "search", scope: "chat", query: "Aurora" },
        new AbortController().signal,
        undefined,
        pi.runner.createToolContext("retrieve", undefined),
      );
      assert.match(JSON.stringify(result.content), /Aurora/);
      assert.equal(calls, 1, "retrieval must not call a model");
      const saved = JSON.parse(await readFile(join(path, "config.json"), "utf8"));
      assert.equal(saved.config.main.modelId, "test");
      assert.doesNotMatch(
        JSON.stringify(saved),
        /"(?:apiKey|headers|credentials?|access_token|refresh_token)"\s*:/i,
      );
      await pi.command("ask");
      await pi.command("unknown-command");
      assert.equal(calls, 1, "invalid commands must not become prompts");
      assert.equal(pi.notifications.length, 2);
    } finally {
      await pi.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "Pi's cancel command aborts a pending request and the next queued prompt still completes",
  { timeout: 20_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-pi-cancel-"));
    let started!: () => void;
    const called = new Promise<void>((resolve) => {
      started = resolve;
    });
    let calls = 0;
    const pi = await host(directory, async (_request, options) => {
      if (++calls > 1) return fauxAssistantMessage("Next prompt completed.");
      started();
      await new Promise<void>((_resolve, reject) =>
        options?.signal?.addEventListener("abort", () => reject(new Error("cancelled")), {
          once: true,
        }),
      );
      return fauxAssistantMessage("unreachable");
    });
    try {
      await pi.command("ask Please wait.");
      await called;
      await pi.command("cancel");
      await pi.wait((views) => views.some((v) => v.data?.content.includes("request stopped")));
      await pi.command("ask Continue now.");
      await pi.wait((views) => views.some((v) => v.data?.complete));
      assert.deepEqual(pi.notifications, []);
      assert.equal(calls, 2);
    } finally {
      await pi.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "OptChat survives a new Pi session before Pi has persisted a transcript, while channels stay isolated",
  { timeout: 20_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-pi-reopen-"));
    const first = await host(directory, () => fauxAssistantMessage("Recorded."));
    let path: string;
    try {
      path = piDataDirectory(first.ctx());
      await first.command("ask Project Aurora exists.");
      await first.wait((views) => views.some((v) => v.data?.complete));
      assert.equal(
        existsSync(first.session.sessionManager.getSessionFile()!),
        false,
        "fixture must exercise Pi's unflushed, extension-only session",
      );
    } finally {
      await first.close();
    }
    const second = await host(directory, (request) => {
      assert.match(userText(request), /Project Aurora exists/);
      return fauxAssistantMessage("Aurora is still here.");
    });
    try {
      assert.equal(piDataDirectory(second.ctx()), path!);
      await second.command("ask What did I say?");
      await second.wait((views) => views.some((v) => v.data?.complete));
      assert.deepEqual(second.notifications, []);
      const isolated = new PiOptChatSession({ channel: "another" });
      try {
        assert.equal(await isolated.open(second.ctx()), undefined);
      } finally {
        await isolated.close();
      }
      assert.throws(() => piDataDirectory(second.ctx(), "../escape"), /optchat-channel/);
    } finally {
      await second.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "shutdown releases the lock and stops observers without cancelling durable work; resume uses the live Pi registry",
  { timeout: 20_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-pi-pending-"));
    let started!: () => void;
    const called = new Promise<void>((resolve) => {
      started = resolve;
    });
    const first = await host(directory, async (_request, options) => {
      started();
      await new Promise<void>((_resolve, reject) =>
        options?.signal?.addEventListener("abort", () => reject(new Error("closing host")), {
          once: true,
        }),
      );
      return fauxAssistantMessage("unreachable");
    });
    await first.command("ask A pending durable request.");
    await called;
    await first.close();
    let calls = 0;
    const second = await host(directory, () => {
      calls++;
      return fauxAssistantMessage("Recovered through the new Pi host.");
    });
    try {
      await second.command("status");
      assert.equal(calls, 0, "inspection must not resume billable work");
      assert.match(second.views.at(-1)!.data!.content, /answering/);
      await second.command("resume");
      await second.wait((views) => views.some((v) => v.data?.complete));
      assert.equal(calls, 1);
      assert.deepEqual(second.notifications, []);
      const manager = new PiOptChatSession();
      try {
        await assert.rejects(() => manager.open(second.ctx()), /Another OptChat process/);
      } finally {
        await manager.close();
      }
    } finally {
      await second.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "concurrent first readers and writers share one lazy open; missing login does not admit a request",
  { timeout: 20_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "optchat-pi-open-"));
    const pi = await host(directory, () => fauxAssistantMessage("Ready."));
    const manager = new PiOptChatSession();
    try {
      const ctx = pi.ctx();
      const [missing, a, b] = await Promise.all([
        manager.open(ctx),
        manager.open(ctx, true),
        manager.open(ctx, true),
      ]);
      assert.equal(missing, undefined);
      assert.ok(a);
      assert.equal(a, b);
      await a.prompt("Synthetic fixture", "only-once");
      assert.equal((await a.status()).requests.length, 1);
      const checkAuth = ctx.modelRegistry.hasConfiguredAuth;
      const unauthenticated = new PiOptChatSession({ channel: "no-login" });
      ctx.modelRegistry.hasConfiguredAuth = () => false;
      try {
        await assert.rejects(() => unauthenticated.open(ctx, true), /\/login/);
        assert.equal(existsSync(piDataDirectory(ctx, "no-login")), false);
      } finally {
        ctx.modelRegistry.hasConfiguredAuth = checkAuth;
        await unauthenticated.close();
      }
    } finally {
      await manager.close();
      await pi.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
