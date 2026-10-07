import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = mkdtempSync(join(tmpdir(), "optchat-package-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
function run(command, args, cwd = temporary, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd, encoding: "utf8", timeout: 180_000, maxBuffer: 5_000_000,
    env: { ...process.env, ...extraEnv },
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

try {
  run(npm, ["run", "build"], root);
  const [pack] = JSON.parse(run(npm, ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary], root));
  const paths = pack.files.map(file => file.path);
  for (const required of ["dist/cli.js", "dist/index.js", "dist/index.d.ts", "dist/extension.js", "dist/extension.d.ts",
    "web/index.html", "web/app.js", "web/style.css", "LICENSE", "THIRD_PARTY_NOTICES.md", ".env.example", "examples/native-host.mjs"]) {
    assert.ok(paths.includes(required), `Missing package file: ${required}`);
  }
  const allowedFile = /^(?:dist\/|src\/|web\/|examples\/|package\.json$|\.env\.example$|LICENSE$|(?:README(?:\.pt-BR)?|ARCHITECTURE|VALIDATION|THIRD_PARTY_NOTICES|CONTRIBUTING|SECURITY)\.md$)/;
  for (const path of paths) {
    assert.match(path, allowedFile, `Unexpected package file: ${path}`);
    assert.doesNotMatch(path, /(?:^|\/)(?:node_modules|\.optchat|\.git)(?:\/|$)|(?:^|\/)\.env(?:$|\.(?!example$))/);
    assert.doesNotMatch(readFileSync(join(root, path), "utf8"), /\/Users\/[^/]+\//, `Personal path in ${path}`);
  }
  writeFileSync(join(temporary, "package.json"), JSON.stringify({ name: "optchat-consumer", private: true, type: "module" }));
  run(npm, ["install", "--prefer-offline", "--ignore-scripts", "--no-audit", "--no-fund", join(temporary, pack.filename)]);
  console.log(`Installed ${pack.filename} in a fresh project without build scripts (${paths.length} packaged files).`);
  const bin = join(temporary, "node_modules", ".bin", "optchat-durable");
  assert.ok(existsSync(bin), "npm did not link the CLI executable");
  const env = { OPTCHAT_DATA_DIR: join(temporary, "conversation"), OPTCHAT_DEMO: "1" };
  assert.match(run(process.execPath, [bin, "--help"], temporary, env), /optchat-durable/);
  assert.match(run(process.execPath, [bin, "ask", "Package smoke Aurora", "--demo"], temporary, env), /Package smoke Aurora/);
  const state = JSON.parse(run(process.execPath, [bin, "status", "--demo"], temporary, env));
  assert.equal(state.demo, true);
  assert.ok(state.memory.messages >= 2);
  const original = JSON.parse(run(process.execPath, [bin, "zoom", "0", "1", "--demo"], temporary, env));
  assert.match(original.text, /Package smoke Aurora/);
  copyFileSync(join(root, "examples/native-host.mjs"), join(temporary, "native-host.mjs"));
  assert.match(run(process.execPath, ["native-host.mjs"]), /Aurora/);

  writeFileSync(join(temporary, "http-smoke.mjs"), `
    import assert from "node:assert/strict";
    import { MemoryStorage } from "@earendil-works/pi-durable";
    import { configFromEnv, openApp, serve } from "optchat-durable";
    const app = await openApp(configFromEnv({ OPTCHAT_DEMO: "1" }), { storage: new MemoryStorage() });
    let server;
    try {
      server = await serve(app, 0);
      for (const asset of ["/", "/app.js", "/style.css"]) {
        const response = await fetch(server.url + asset);
        assert.equal(response.status, 200);
        assert.ok((await response.text()).length > 100);
      }
      assert.equal((await fetch(server.url + "/.env")).status, 404);
      assert.equal((await (await fetch(server.url + "/api/state")).json()).demo, true);
    } finally { await server?.close(); await app.close(); }
  `);
  run(process.execPath, ["http-smoke.mjs"]);
  run(npm, ["install", "--prefer-offline", "--save-dev", "--ignore-scripts", "--no-audit", "--no-fund", "typescript@5.9.3", "@types/node@22.18.6"]);
  writeFileSync(join(temporary, "consumer.mts"), `
    import { configFromEnv, openApp, type AppConfig, type OptChatApp } from "optchat-durable";
    import { createOptChat, type OptChatController } from "optchat-durable/extension";
    const config: AppConfig = configFromEnv();
    const extension = createOptChat(config);
    async function consume(app: OptChatApp) {
      const controller: OptChatController = extension.attach(app.harness, app.root);
      const result: string = (await controller.wait((await controller.enqueue("hello")).taskId)).answer;
      // @ts-expect-error Message input must remain typed, not any.
      await controller.enqueue(123);
      return result;
    }
    const opened: Promise<OptChatApp> = openApp(config);
    void consume; void opened;
  `);
  run(process.execPath, [join(temporary, "node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--skipLibCheck",
    "--target", "ES2023", "--module", "NodeNext", "--moduleResolution", "NodeNext", "consumer.mts"]);
  console.log("PASS: CLI, persistent reopen, native host, packaged UI, private-file exclusion, and TypeScript consumer.");
} finally {
  // This directory was created by this check and contains only synthetic test data.
  rmSync(temporary, { recursive: true, force: true });
}
