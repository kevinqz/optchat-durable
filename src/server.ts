import { createServer, type IncomingMessage } from "node:http";
import { readFile } from "node:fs/promises";
import type { OptChatApp } from "./app.js";

async function body(request: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  if (!request.headers["content-type"]?.startsWith("application/json")) throw new Error("Expected application/json");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("Request is too large");
    chunks.push(chunk);
  }
  const result: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Expected JSON object");
  return result as Record<string, unknown>;
}

export async function serve(app: OptChatApp, port = 4317) {
  const assets = new Map(await Promise.all(["index.html", "app.js", "style.css"].map(async name =>
    [name, await readFile(new URL(`../web/${name}`, import.meta.url))] as const)));
  const clients = new Set<import("node:http").ServerResponse>();
  let actualPort = port;
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const hosts = new Set([`127.0.0.1:${actualPort}`, `localhost:${actualPort}`]);
    const host = req.headers.host ?? "";
    const origin = req.headers.origin;
    if (!hosts.has(host) || (origin && origin !== `http://${host}`)) { res.writeHead(403).end("Forbidden origin"); return; }
    const url = new URL(req.url ?? "/", `http://${host}`);
    const json = (value: unknown, status = 200) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(value)); };
    try {
      if (req.method === "GET" && url.pathname === "/api/events") {
        if (clients.size >= 16) { json({ error: "Too many listeners" }, 429); return; }
        res.writeHead(200, { "Content-Type": "text/event-stream", Connection: "keep-alive" });
        res.write("data: ready\n\n"); clients.add(res);
        req.on("close", () => clients.delete(res));
      } else if (req.method === "GET" && url.pathname === "/api/state") json(await app.status());
      else if (req.method === "GET" && url.pathname === "/api/zoom") {
        json(await app.zoom(Number(url.searchParams.get("start")), Number(url.searchParams.get("count")), Number(url.searchParams.get("offset") ?? 0)));
      } else if (req.method === "GET" && url.pathname === "/api/search") {
        json(await app.search(url.searchParams.get("q") ?? "", Number(url.searchParams.get("from") ?? 0)));
      } else if (req.method === "POST") {
        if (req.headers["x-optchat"] !== "1") { json({ error: "Missing X-OptChat header" }, 403); return; }
        const data = await body(req, 6 * app.config.maxInputBytes + 1024);
        if (url.pathname === "/api/messages") {
          if (typeof data.text !== "string" || typeof data.requestId !== "string") throw new Error("Expected text and requestId strings");
          json(await app.enqueue(data.text, data.requestId), 202);
        } else if (url.pathname === "/api/cancel") {
          if (typeof data.requestId !== "string") throw new Error("Expected requestId");
          json({ status: await app.cancel(data.requestId) });
        } else json({ error: "Not found" }, 404);
      } else if (req.method === "GET") {
        const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        const asset = assets.get(name);
        if (!asset) { json({ error: "Not found" }, 404); return; }
        const type = name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : "text/html";
        res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` }); res.end(asset);
      } else json({ error: "Method not allowed" }, 405);
    } catch (error) { json({ error: error instanceof Error ? error.message : "Request failed" }, 400); }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No server address");
  actualPort = address.port;
  let timer: NodeJS.Timeout | undefined;
  const unsubscribe = app.harness.subscribeCommits(() => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      for (const client of clients) if (!client.write("data: changed\n\n")) { client.end(); clients.delete(client); }
    }, 120);
  });
  return {
    url: `http://127.0.0.1:${actualPort}`,
    async close() {
      unsubscribe(); clearTimeout(timer);
      for (const client of clients) client.end();
      clients.clear();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
