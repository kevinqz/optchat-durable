import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStorage } from "@earendil-works/pi-durable";
import { openApp } from "../../src/app.js";
import { configFromEnv } from "../../src/config.js";
import { serve } from "../../src/server.js";
import { get } from "node:http";

test(
  "local HTTP UI admits durable messages, rejects foreign origins and missing CSRF header",
  { timeout: 15_000 },
  async () => {
    const app = await openApp(configFromEnv({ OPTCHAT_DEMO: "1" }), {
      storage: new MemoryStorage(),
    });
    const server = await serve(app, 0);
    try {
      assert.equal((await fetch(server.url)).status, 200);
      const send = (headers: Record<string, string>) =>
        fetch(`${server.url}/api/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ text: "Olá, memória.", requestId: "http-1" }),
        });
      assert.equal((await send({})).status, 403);
      assert.equal(
        (await send({ "X-OptChat": "1", Origin: "https://untrusted.invalid" })).status,
        403,
      );
      const response = await send({ "X-OptChat": "1", Origin: server.url });
      assert.equal(response.status, 202);
      const job = (await response.json()) as Awaited<ReturnType<typeof app.enqueue>>;
      await app.wait(job.taskId);
      await app.settleMemory();
      const raw = (await (await fetch(`${server.url}/api/zoom?start=0&count=1`)).json()) as {
        text: string;
      };
      assert.equal(raw.text, "user: Olá, memória.");
      assert.equal((await fetch(`${server.url}/.env`)).status, 404);
      const badHostStatus = await new Promise<number | undefined>((resolve, reject) => {
        get(`${server.url}/api/state`, { headers: { Host: "evil.invalid" } }, (response) => {
          response.resume();
          resolve(response.statusCode);
        }).on("error", reject);
      });
      assert.equal(badHostStatus, 403);
    } finally {
      await server.close();
      await app.close();
    }
  },
);
