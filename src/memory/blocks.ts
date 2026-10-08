import type { TextContent, TranscriptContext } from "@earendil-works/pi-ai";

/** Stable four-line blocks. Keep the closing tag outside the last complete block. */
export function viewBlocks(view: string): TextContent[] {
  if (!view.startsWith("<chat>\n") || !view.endsWith("\n</chat>"))
    throw new Error("Invalid OptChat view envelope");
  const body = view.slice(7, -8);
  const lines = body ? body.split("\n") : [];
  const blocks: TextContent[] = [];
  let rest = "<chat>\n";
  for (let i = 0; i + 4 <= lines.length; i += 4) {
    blocks.push({ type: "text", text: rest + lines.slice(i, i + 4).join("\n") + "\n" });
    rest = "";
  }
  const tail = lines.slice(Math.floor(lines.length / 4) * 4);
  rest += tail.join("\n");
  if (tail.length || !lines.length) rest += "\n";
  blocks.push({ type: "text", text: rest + "</chat>" });
  return blocks;
}

/** Only the leading user view; never search later user input or tool results for tags. */
export function contextView(context: TranscriptContext): string | undefined {
  const user = context.messages.find((m) => m.role === "user");
  if (!user || !Array.isArray(user.content)) return;
  let view = "";
  for (const block of user.content) {
    if (block.type !== "text") return;
    view += block.text;
    if (!view.startsWith("<chat>\n")) return;
    if (view.endsWith("\n</chat>")) return view;
  }
}
