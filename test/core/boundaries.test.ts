import { test } from "node:test";
import assert from "node:assert/strict";
import { fauxAssistantMessage, fauxThinking, fauxText, type Message } from "@earendil-works/pi-ai";
import { MemoryStorage, UserEntry } from "@earendil-works/pi-durable";
import { openApp } from "../../src/app.js";
import { scriptedModels, fixtureConfig, userText } from "../helpers/core.js";
import { NodeDoc } from "../../src/memory/documents.js";
import { bytes } from "../../src/memory/tree.js";

test(
  "fresh runs use frozen memory plus complete new input in two blocks; thoughts are excluded",
  { timeout: 15_000 },
  async () => {
    const requests: Message[][] = [];
    const models = scriptedModels((context) => {
      requests.push(context.messages);
      return fauxAssistantMessage([
        fauxThinking("PRIVATE TEST REASONING"),
        fauxText("Decisão pública registrada."),
      ]);
    });
    const app = await openApp(fixtureConfig(), { models, storage: new MemoryStorage() });
    try {
      const first = await app.enqueue("Preferência: respostas em português.", "a");
      await app.wait(first.taskId);
      const second = await app.enqueue("Segunda mensagem completa.", "b");
      await app.wait(second.taskId);
      const users = requests[1]!.filter((m) => m.role === "user");
      assert.equal(users.length, 1);
      assert.ok(Array.isArray(users[0]!.content));
      assert.equal(users[0]!.content.length, 2);
      assert.ok(!JSON.stringify(requests[1]).includes("PRIVATE TEST REASONING"));
      assert.equal(requests[1]!.filter((m) => m.role === "assistant").length, 0);
      await app.settleMemory();
      assert.ok(!(await app.status()).memory.view.includes("PRIVATE TEST REASONING"));
    } finally {
      await app.close();
    }
  },
);

test(
  "failed summarization blocks the next request and preserves the original without a truncated fallback",
  { timeout: 15_000 },
  async () => {
    let mainCalls = 0;
    const models = scriptedModels((context) => {
      if (userText(context).includes("<target>"))
        return fauxAssistantMessage("", {
          stopReason: "error",
          errorMessage: "test compactor unavailable",
        });
      mainCalls++;
      return fauxAssistantMessage("Recebido.");
    });
    const app = await openApp(fixtureConfig(), { models, storage: new MemoryStorage() });
    try {
      const original = "Documento integral sem perda. ".repeat(90);
      const first = await app.enqueue(original, "first");
      await app.wait(first.taskId);
      await assert.rejects(() => app.settleMemory());
      const next = await app.enqueue("Continue.", "blocked");
      await assert.rejects(() => app.wait(next.taskId));
      assert.equal(mainCalls, 1);
      assert.equal((await app.request("blocked"))?.frozen, null);
      const raw = await app.zoom(0, 1);
      assert.ok("text" in raw && raw.text === `user: ${original}`);
    } finally {
      await app.close();
    }
  },
);

test(
  "many queued turns keep chronological coverage and enforce a small actual view budget",
  { timeout: 30_000 },
  async () => {
    const config = { ...fixtureConfig(), viewBytes: 4096 };
    const models = scriptedModels((context) =>
      fauxAssistantMessage(
        userText(context).includes("<target>")
          ? "Resumo contextual preserva as decisões e referências de origem. ".repeat(4)
          : "Resposta registrada com os fatos relevantes e a decisão atual. ".repeat(3),
      ),
    );
    const app = await openApp(config, { models, storage: new MemoryStorage() });
    try {
      const jobs = [];
      for (let i = 0; i < 35; i++)
        jobs.push(
          await app.enqueue(
            `Mensagem ${i}: registrar a decisão número ${i}. ` + "Contexto confiável. ".repeat(9),
            `job-${i}`,
          ),
        );
      await app.wait(jobs.at(-1)!.taskId);
      await app.settleMemory();
      for (let i = 0; i < jobs.length; i++)
        assert.equal((await app.request(`job-${i}`))?.through, 2 * i);
      const state = await app.status();
      assert.equal(state.memory.messages, 70);
      assert.equal(state.memory.summarized, 70);
      assert.ok(state.memory.viewBytes <= config.viewBytes);
      assert.ok(state.memory.parts < 70);
      assert.ok("text" in (await app.zoom(0, 1)));
    } finally {
      await app.close();
    }
  },
);

test(
  "oversized summaries get five attempts, retain the shortest complete answer, and stay zoomable",
  { timeout: 15_000 },
  async () => {
    const calls = new Map<string, number>();
    const models = scriptedModels((context, options) => {
      if (!userText(context).includes("<target>")) return fauxAssistantMessage("Recebido.");
      const session = options!.sessionId!;
      const n = (calls.get(session) ?? 0) + 1;
      calls.set(session, n);
      return fauxAssistantMessage("a".repeat(610 - 10 * n));
    });
    const app = await openApp(fixtureConfig(), { models, storage: new MemoryStorage() });
    try {
      const first = await app.enqueue("Fonte original. ".repeat(80), "oversized");
      await app.wait(first.taskId);
      await app.settleMemory();
      const node = await app.harness.snapshot(NodeDoc, app.root.id, "0+1", app.context);
      assert.equal(node?.value?.text.length, 560);
      assert.equal(node?.value?.oversized, true);
      assert.ok([...calls.values()].every((n) => n === 5));
      assert.ok("text" in (await app.zoom(0, 1)));
    } finally {
      await app.close();
    }
  },
);

test(
  "ready parent summaries execute concurrently without exceeding the configured worker limit",
  { timeout: 15_000 },
  async () => {
    let active = 0,
      peak = 0;
    const config = { ...fixtureConfig(), jobs: 4 };
    const models = scriptedModels(async () => {
      active++;
      peak = Math.max(active, peak);
      try {
        await new Promise((resolve) => setTimeout(resolve, 8));
        return fauxAssistantMessage("Resumo com informações do histórico. ".repeat(8));
      } finally {
        active--;
      }
    });
    const app = await openApp(config, { models, storage: new MemoryStorage() });
    try {
      await app.root.commit(async (tx) => {
        for (let i = 0; i < 32; i++)
          await tx.appendEntry(UserEntry, app.root.id, {
            model: [
              { role: "user", content: `Fato ${i}: ` + "a".repeat(280), timestamp: 1_000 + i },
            ],
          });
      }, app.context);
      await app.settleMemory();
      assert.ok(peak > 1, "ready parents were unnecessarily serialized");
      assert.ok(peak <= 4, `observed ${peak} concurrent calls`);
      assert.equal((await app.status()).memory.summarized, 32);
    } finally {
      await app.close();
    }
  },
);

test(
  "cancelling an active native run retains input and allows the next queued request to complete",
  { timeout: 15_000 },
  async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const models = scriptedModels(async (context, options) => {
      if (
        userText(context).includes("Mensagem a cancelar") &&
        !userText(context).includes("Próxima mensagem")
      ) {
        started();
        await new Promise<void>((_resolve, reject) => {
          if (options?.signal?.aborted) reject(new Error("aborted"));
          else
            options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
              once: true,
            });
        });
      }
      return fauxAssistantMessage("Próxima mensagem respondida.");
    });
    const app = await openApp(fixtureConfig(), { models, storage: new MemoryStorage() });
    try {
      const first = await app.enqueue("Mensagem a cancelar", "cancel");
      await ready;
      const next = await app.enqueue("Próxima mensagem", "next");
      await app.cancel("cancel");
      await assert.rejects(() => app.wait(first.taskId), /aborted/);
      assert.ok((await app.wait(next.taskId)).answer.includes("respondida"));
      assert.equal((await app.request("cancel"))?.status, "cancelled");
      await app.settleMemory();
      assert.ok((await app.search("Mensagem a cancelar")).matches.length > 0);
    } finally {
      await app.close();
    }
  },
);

test(
  "compactor sees a bounded prior view without addresses and a content-free byte ruler",
  { timeout: 15_000 },
  async () => {
    const captured: Message[][] = [];
    const models = scriptedModels((context) => {
      captured.push(context.messages);
      return fauxAssistantMessage("Resumo geral omite detalhes menores; originais preservados.");
    });
    const app = await openApp(fixtureConfig(), { models, storage: new MemoryStorage() });
    try {
      await app.root.commit(async (tx) => {
        for (let i = 0; i < 4; i++)
          await tx.appendEntry(UserEntry, app.root.id, {
            model: [
              {
                role: "user",
                content: `MARCADOR_DE_CONTEXTO_${i} ` + "dado ".repeat(58),
                timestamp: 1_000 + i,
              },
            ],
          });
      }, app.context);
      await app.settleMemory();
      captured.length = 0;
      await app.root.commit(
        (tx) =>
          tx.appendEntry(UserEntry, app.root.id, {
            model: [
              {
                role: "user",
                content: "REFERENCIA LONGA: use aquele marcador. ".repeat(30),
                timestamp: 2_000,
              },
            ],
          }),
        app.context,
      );
      await app.settleMemory();
      const user = captured[0]!.find((m) => m.role === "user")!;
      assert.ok(Array.isArray(user.content));
      if (!Array.isArray(user.content)) return;
      const text = user.content.filter((b) => b.type === "text").map((b) => b.text);
      const first = text.slice(0, -1).join("");
      assert.ok(
        first.includes("MARCADOR_DE_CONTEXTO_3"),
        "compactor lost detail that was still in the current view",
      );
      assert.ok(!/^\d+\+\d+\|/m.test(first));
      const target = text.at(-1)!;
      assert.ok(target.includes("REFERENCIA LONGA"));
      assert.equal(bytes(target.split("\n")[1]!), 512);
      assert.equal(target.split("\n")[1], "-".repeat(512));
    } finally {
      await app.close();
    }
  },
);
