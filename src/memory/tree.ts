/** Pure OptChat binary-tree/view rules. Sizes include the actual UTF-8 wire markup. */
export type Address = { start: number; count: number };
export type Summary = Address & { text: string; method: "verbatim" | "concat" | "model"; oversized: boolean };
export const bytes = (text: string): number => Buffer.byteLength(text, "utf8");
export const key = ({ start, count }: Address): string => `${start}+${count}`;
export const oneLine = (text: string): string => text.replace(/\s+/gu, " ").trim();
export const line = (node: Summary): string => `${key(node)}|${oneLine(node.text)}`;
export const render = (nodes: readonly Summary[]): string => `<chat>\n${nodes.map(line).join("\n")}\n</chat>`;

export function validAddress(start: number, count: number): boolean {
  return Number.isSafeInteger(start) && start >= 0 && Number.isSafeInteger(count) && count > 0
    && Number.isInteger(Math.log2(count)) && start % count === 0 && Number.isSafeInteger(start + count);
}

export function assertPartition(parts: readonly Address[], total: number): void {
  let end = 0;
  for (const part of parts) {
    if (!validAddress(part.start, part.count) || part.start !== end) throw new Error("Invalid memory partition");
    end += part.count;
  }
  if (end !== total) throw new Error(`Memory covers ${end} of ${total} messages`);
}

/** Never split a persisted part. Only replace available sibling pairs, oldest relative to size first. */
export function fit(parts: readonly Address[], nodes: ReadonlyMap<string, Summary>, budget: number): Address[] {
  const result = parts.map(p => ({ ...p }));
  const total = result.reduce((sum, p) => sum + p.count, 0);
  assertPartition(result, total);
  const get = (p: Address): Summary => {
    const n = nodes.get(key(p));
    if (!n) throw new Error(`Unbuilt summary ${key(p)}`);
    return n;
  };
  while (bytes(render(result.map(get))) > budget) {
    let best = -1;
    let due = -Infinity;
    for (let i = 0; i + 1 < result.length; i++) {
      const a = result[i]!;
      const b = result[i + 1]!;
      if (a.count !== b.count || a.start % (2 * a.count) || b.start !== a.start + a.count) continue;
      const parent = { start: a.start, count: 2 * a.count };
      const score = (total - a.start) / (4 * a.count);
      if (nodes.has(key(parent)) && score > due) { best = i; due = score; }
    }
    if (best < 0) break;
    const a = result[best]!;
    result.splice(best, 2, { start: a.start, count: 2 * a.count });
  }
  return result;
}

/** UTF-8 pages with byte offsets that never divide a Unicode code point. */
export function pageText(text: string, offset = 0, limit = 24_000): { text: string; bytes: number; next: number | null } {
  const data = Buffer.from(text);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > data.length ||
      (offset < data.length && (data[offset]! & 0xc0) === 0x80)) throw new Error("Invalid UTF-8 byte offset");
  if (!Number.isSafeInteger(limit) || limit < 4 || limit > 30_000) throw new Error("Page size must be 4..30000 bytes");
  let end = Math.min(data.length, offset + limit);
  while (end < data.length && (data[end]! & 0xc0) === 0x80) end--;
  return { text: data.subarray(offset, end).toString("utf8"), bytes: data.length, next: end < data.length ? end : null };
}
