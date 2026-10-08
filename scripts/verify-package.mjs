import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--output" || !args[1])) {
  throw new Error("Usage: npm run check:package -- [--output DIRECTORY]");
}
const output = args[1] ? resolve(args[1]) : undefined;
const temporary = mkdtempSync(join(tmpdir(), "optchat-package-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
function run(command, args, cwd = temporary, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 5_000_000,
    env: { ...process.env, ...extraEnv },
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.error ?? ""}\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result.stdout;
}

try {
  run(npm, ["run", "build"], root);
  const [pack] = JSON.parse(
    run(npm, ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary], root),
  );
  const paths = pack.files.map((file) => file.path);
  const citation = JSON.parse(readFileSync(join(root, "CITATION.cff"), "utf8"));
  assert.equal(
    citation.version,
    pack.version,
    "Citation version must match the distributed package",
  );
  assert.ok(
    citation.references.some((ref) =>
      ref.authors.some((author) => author["family-names"] === "Taelin"),
    ),
  );
  assert.ok(
    citation.references.some((ref) =>
      ref.authors.some((author) => author["family-names"] === "Zechner"),
    ),
  );
  const piReference = citation.references.find(
    (ref) => ref["repository-code"] === "https://github.com/earendil-works/pi",
  );
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(
    piReference?.version,
    manifest.dependencies["@earendil-works/pi-durable"],
    "Upstream citation version must match Pi Durable",
  );

  for (const required of [
    "dist/cli.js",
    "dist/index.js",
    "dist/index.d.ts",
    "dist/extension.js",
    "dist/extension.d.ts",
    "pi/index.ts",
    "src/pi/extension.ts",
    "docs/README.md",
    "docs/guides/pi.md",
    "docs/guides/sdk.md",
    "docs/guides/standalone.md",
    "docs/reference/conformance.md",
    "docs/reference/configuration.md",
    "web/index.html",
    "web/app.js",
    "web/style.css",
    "LICENSE",
    "CREDITS.md",
    "CITATION.cff",
    "NOTICE",
    "THIRD_PARTY_NOTICES.md",
    ".env.example",
    "examples/native-host.mjs",
  ]) {
    assert.ok(paths.includes(required), `Missing package file: ${required}`);
  }
  const allowedFile =
    /^(?:dist\/|src\/|pi\/|web\/|examples\/|docs\/|package\.json$|\.env\.example$|LICENSE$|NOTICE$|CITATION\.cff$|(?:README(?:\.pt-BR)?|THIRD_PARTY_NOTICES|CONTRIBUTING|SECURITY|CREDITS|CHANGELOG)\.md$)/;
  for (const path of paths) {
    assert.match(path, allowedFile, `Unexpected package file: ${path}`);
    assert.doesNotMatch(
      path,
      /(?:^|\/)(?:node_modules|\.optchat|\.git)(?:\/|$)|(?:^|\/)\.env(?:$|\.(?!example$))/,
    );
    assert.doesNotMatch(
      readFileSync(join(root, path), "utf8"),
      /\/Users\/[^/]+\//,
      `Personal path in ${path}`,
    );
  }
  writeFileSync(
    join(temporary, "package.json"),
    JSON.stringify({ name: "optchat-consumer", private: true, type: "module" }),
  );
  run(npm, [
    "install",
    "--prefer-offline",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    join(temporary, pack.filename),
  ]);
  console.log(
    `Installed ${pack.filename} in a fresh project without build scripts (${paths.length} packaged files).`,
  );
  const bin = join(temporary, "node_modules", ".bin", "optchat-durable");
  assert.ok(existsSync(bin), "npm did not link the CLI executable");
  const env = { OPTCHAT_DATA_DIR: join(temporary, "conversation"), OPTCHAT_DEMO: "1" };
  assert.match(run(process.execPath, [bin, "--help"], temporary, env), /optchat-durable/);
  const credits = run(process.execPath, [bin, "credits"], temporary, env);
  for (const author of ["Victor Taelin", "Mario Zechner", "Earendil Works"])
    assert.ok(credits.includes(author));
  assert.match(
    run(process.execPath, [bin, "ask", "Package smoke Aurora", "--demo"], temporary, env),
    /Package smoke Aurora/,
  );
  const state = JSON.parse(run(process.execPath, [bin, "status", "--demo"], temporary, env));
  assert.equal(state.demo, true);
  assert.ok(state.memory.messages >= 2);
  const original = JSON.parse(
    run(process.execPath, [bin, "zoom", "0", "1", "--demo"], temporary, env),
  );
  assert.match(original.text, /Package smoke Aurora/);
  const inspection = JSON.parse(
    run(process.execPath, [bin, "archive", "inspect", env.OPTCHAT_DATA_DIR]),
  );
  assert.ok(inspection.entries >= 2);
  const exported = join(temporary, "evidence.jsonl");
  run(process.execPath, [bin, "archive", "export", env.OPTCHAT_DATA_DIR, exported]);
  const records = readFileSync(exported, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(records[0].format, "optchat-archive");
  assert.equal(records.at(-1).type, "summary");
  assert.match(JSON.stringify(records), /Package smoke Aurora/);
  copyFileSync(join(root, "examples/native-host.mjs"), join(temporary, "native-host.mjs"));
  assert.match(run(process.execPath, ["native-host.mjs"]), /Aurora/);
  copyFileSync(
    join(root, "examples/host-owned-lifecycle.mjs"),
    join(temporary, "host-owned-lifecycle.mjs"),
  );
  assert.match(run(process.execPath, ["host-owned-lifecycle.mjs"]), /PASS: host-owned tools/);

  writeFileSync(
    join(temporary, "http-smoke.mjs"),
    `
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
  `,
  );
  run(process.execPath, ["http-smoke.mjs"]);
  run(npm, [
    "install",
    "--prefer-offline",
    "--save-dev",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "typescript@5.9.3",
    "@types/node@22.18.6",
  ]);
  writeFileSync(
    join(temporary, "consumer.mts"),
    `
    import { configFromEnv, openApp, inspectArchive, exportArchive, type ArchiveInspection, type AppConfig, type OptChatApp } from "optchat-durable";
    import { createOptChat, type OptChatController } from "optchat-durable/extension";
    const config: AppConfig = configFromEnv();
    const extension = createOptChat({ main: config.main, compactor: config.compactor });
    async function consume(app: OptChatApp) {
      const controller: OptChatController = extension.attach(app.harness, app.root);
      const result: string = (await controller.prompt("hello", "typed-request")).answer;
      // @ts-expect-error Message input must remain typed, not any.
      await controller.enqueue(123);
      return result;
    }
    const opened: Promise<OptChatApp> = openApp(config);
    const inspected: Promise<ArchiveInspection> = inspectArchive("archive-directory");
    const exported: Promise<ArchiveInspection> = exportArchive("archive-directory", "evidence.jsonl");
    void inspected; void exported;
    void consume; void opened;
  `,
  );
  run(process.execPath, [
    join(temporary, "node_modules/typescript/bin/tsc"),
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--target",
    "ES2023",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "consumer.mts",
  ]);
  console.log(
    "PASS: CLI, persistent reopen, native host, packaged UI, private-file exclusion, and TypeScript consumer.",
  );
  if (output) {
    mkdirSync(output, { recursive: true });
    const destination = join(output, pack.filename);
    assert.ok(!existsSync(destination), `Refusing to replace existing artifact: ${destination}`);
    const sha256 = createHash("sha256")
      .update(readFileSync(join(temporary, pack.filename)))
      .digest("hex");
    copyFileSync(join(temporary, pack.filename), destination);
    writeFileSync(join(output, `${pack.filename}.sha256`), `${sha256}  ${pack.filename}\n`, {
      flag: "wx",
    });
    console.log(`Verified release artifact: ${destination}\nSHA-256: ${sha256}`);
  }
} finally {
  // This directory was created by this check and contains only synthetic test data.
  rmSync(temporary, { recursive: true, force: true });
}
