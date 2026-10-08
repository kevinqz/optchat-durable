import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertPartition,
  bytes,
  fit,
  key,
  pageText,
  render,
  type Summary,
} from "../../src/memory/tree.js";

test("view covers every message, coarsens incrementally, and budgets real UTF-8 markup", () => {
  const nodes = new Map<string, Summary>();
  let parts: { start: number; count: number }[] = [];
  for (let i = 0; i < 257; i++) {
    for (let count = 1; (i + 1) % count === 0; count *= 2) {
      const node: Summary = {
        start: i + 1 - count,
        count,
        text: "Memória útil: decisão αβ 🧠.".repeat(2),
        method: "model",
        oversized: false,
      };
      nodes.set(key(node), node);
    }
    const old = parts.map((p) => ({ ...p }));
    parts = fit([...parts, { start: i, count: 1 }], nodes, 1200);
    assertPartition(parts, i + 1);
    assert.ok(bytes(render(parts.map((p) => nodes.get(key(p))!))) <= 1200);
    for (const previous of old)
      assert.ok(
        parts.some(
          (p) => p.start <= previous.start && p.start + p.count >= previous.start + previous.count,
        ),
        "an existing part was split",
      );
  }
  assert.throws(() => assertPartition([{ start: 1, count: 1 }], 1));
});

test("unbuilt parents never replace children, even if the view must wait over budget", () => {
  const nodes = new Map<string, Summary>(
    [0, 1].map((start) => [
      `${start}+1`,
      { start, count: 1, text: "a".repeat(100), method: "verbatim", oversized: false },
    ]),
  );
  const parts = [
    { start: 0, count: 1 },
    { start: 1, count: 1 },
  ];
  assert.deepEqual(fit(parts, nodes, 100), parts);
});

test("merge order matches an independent binary rollback counter for 20,001 pushes", () => {
  const slots: { start: number; full: boolean }[] = [];
  const nodes = new Map<string, Summary>();
  let parts: { start: number; count: number }[] = [];
  for (let end = 1; end <= 20_001; end++) {
    let carried = end - 1;
    for (let level = 0; ; level++) {
      const slot = slots[level];
      if (!slot) {
        slots.push({ start: carried, full: false });
        break;
      }
      if (!slot.full) {
        slot.full = true;
        break;
      }
      slots[level] = { start: carried, full: false };
      carried = slot.start;
    }
    for (let count = 1; end % count === 0; count *= 2) {
      const address = { start: end - count, count };
      nodes.set(key(address), {
        ...address,
        text: "x".repeat(48 - key(address).length - 1),
        method: "model",
        oversized: false,
      });
    }
    // Fixed wire length per node makes this an independent line-count budget.
    parts = fit([...parts, { start: end - 1, count: 1 }], nodes, 14 + 49 * slots.length);
    const boundaries = slots.map((s) => s.start).reverse();
    assert.deepEqual(
      parts,
      boundaries.map((start, i) => ({ start, count: (boundaries[i + 1] ?? end) - start })),
      `push ${end}`,
    );
  }
});

test("at ten messages the recent pair merges before the old 0..7 prefix", () => {
  const nodes = new Map<string, Summary>();
  for (const [start, count] of [
    [0, 4],
    [4, 4],
    [8, 1],
    [9, 1],
    [0, 8],
    [8, 2],
  ]) {
    const node: Summary = {
      start: start!,
      count: count!,
      text: "x".repeat(44),
      method: "model",
      oversized: false,
    };
    nodes.set(key(node), node);
  }
  assert.deepEqual(
    fit(
      [
        { start: 0, count: 4 },
        { start: 4, count: 4 },
        { start: 8, count: 1 },
        { start: 9, count: 1 },
      ],
      nodes,
      165,
    ),
    [
      { start: 0, count: 4 },
      { start: 4, count: 4 },
      { start: 8, count: 2 },
    ],
  );
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
