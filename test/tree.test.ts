import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPartition, bytes, fit, key, pageText, render, type Summary } from "../src/memory/tree.js";

test("view covers every message, coarsens incrementally, and budgets real UTF-8 markup", () => {
  const nodes = new Map<string, Summary>();
  let parts: { start: number; count: number }[] = [];
  for (let i = 0; i < 257; i++) {
    for (let count = 1; (i + 1) % count === 0; count *= 2) {
      const node: Summary = { start: i + 1 - count, count, text: "Memória útil: decisão αβ 🧠.".repeat(2), method: "model", oversized: false };
      nodes.set(key(node), node);
    }
    const old = parts.map(p => ({ ...p }));
    parts = fit([...parts, { start: i, count: 1 }], nodes, 1200);
    assertPartition(parts, i + 1);
    assert.ok(bytes(render(parts.map(p => nodes.get(key(p))!))) <= 1200);
    for (const previous of old) assert.ok(parts.some(p => p.start <= previous.start && p.start + p.count >= previous.start + previous.count), "an existing part was split");
  }
  assert.throws(() => assertPartition([{ start: 1, count: 1 }], 1));
});

test("unbuilt parents never replace children, even if the view must wait over budget", () => {
  const nodes = new Map<string, Summary>([0, 1].map(start => [`${start}+1`, { start, count: 1, text: "a".repeat(100), method: "verbatim", oversized: false }]));
  const parts = [{ start: 0, count: 1 }, { start: 1, count: 1 }];
  assert.deepEqual(fit(parts, nodes, 100), parts);
});

test("raw pagination recovers every UTF-8 byte without broken characters", () => {
  const original = "á🧠漢字a".repeat(3000);
  let offset: number | null = 0;
  let restored = "";
  while (offset !== null) {
    const page = pageText(original, offset, 97);
    assert.ok(!page.text.includes("�"));
    assert.ok(bytes(page.text) <= 97);
    restored += page.text;
    offset = page.next;
  }
  assert.equal(restored, original);
  assert.throws(() => pageText("🧠", 1));
});
