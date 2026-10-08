import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = mkdtempSync(join(tmpdir(), "optchat-pi-package-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 180_000, maxBuffer: 5_000_000,
    env: { ...process.env, ...env } });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed\n${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

try {
  const [pack] = JSON.parse(run(npm, ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary], root));
  run("tar", ["-xzf", join(temporary, pack.filename), "-C", temporary], temporary);
  const source = join(temporary, "package");
  // Emulate the source tree used by a Git install, where no compiled dist exists.
  rmSync(join(source, "dist"), { recursive: true, force: true });
  run(npm, ["install", "--omit=dev", "--legacy-peer-deps", "--ignore-scripts", "--prefer-offline", "--no-audit", "--no-fund"], source);
  for (const absent of ["dist", "node_modules/typescript", "node_modules/@earendil-works/pi-coding-agent", "node_modules/@earendil-works/pi-tui"]) {
    assert.equal(existsSync(join(source, absent)), false, `Git package must not need its own ${absent}`);
  }
  const manifest = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
  assert.deepEqual(manifest.pi.extensions, ["./pi/index.ts"]);
  assert.ok(manifest.keywords.includes("pi-package"));
  for (const supplied of ["@earendil-works/pi-ai", "@earendil-works/pi-coding-agent", "@earendil-works/pi-tui"]) {
    assert.equal(manifest.peerDependencies[supplied], "*");
    assert.equal(manifest.dependencies[supplied], undefined);
  }
  assert.equal(manifest.scripts.prepare, undefined, "Git installs omit the compiler; never require a prepare build");

  const host = join(temporary, "host");
  mkdirSync(host);
  writeFileSync(join(host, "package.json"), JSON.stringify({ private: true, type: "module" }));
  run(npm, ["install", "--ignore-scripts", "--prefer-offline", "--no-audit", "--no-fund", "@earendil-works/pi-coding-agent@1.1.0"], host);
  const cli = join(host, "node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js");
  const env = { PI_CODING_AGENT_DIR: join(temporary, "agent"), PI_SKIP_VERSION_CHECK: "1" };
  run(process.execPath, [cli, "install", source], host, env);
  assert.ok(run(process.execPath, [cli, "list"], host, env).includes(source));

  // Exercise the distributed, bundled Pi CLI and its real tool loop without a
  // network model call. This catches host module-alias and source-loader failures.
  const provider = join(host, "smoke-provider.ts");
  writeFileSync(provider, `
    import { fauxProvider, fauxAssistantMessage, fauxToolCall, getCurrentSystemPrompt } from "@earendil-works/pi-ai";
    export default function(pi) {
      const fake = fauxProvider({ models: [{ id: "optchat-package-test", contextWindow: 272000, maxTokens: 16384 }] });
      let step = 0;
      const respond = (context) => {
          fake.appendResponses([respond]);
          if (getCurrentSystemPrompt(context.messages).includes("You maintain the memory index")) return fauxAssistantMessage("user: package verification; echo: memory status available.");
          const first = context.messages.find(m => m.role === "user");
          if (!JSON.stringify(first).includes("<chat>")) throw new Error("Normal Pi input did not use OptChat memory");
          if (step++ === 0) return fauxAssistantMessage(fauxToolCall("optchat_memory", { action: "status" }), { stopReason: "toolUse" });
          const result = context.messages.find(m => m.role === "toolResult");
          if (!result || result.isError || !JSON.stringify(result).includes('started')) throw new Error("OptChat tool did not execute");
          return fauxAssistantMessage("PI_INSTALL_OK");
      };
      fake.setResponses([respond]);
      pi.registerProvider(fake.provider);
    }
  `);
  const output = run(process.execPath, [cli, "--no-session", "--no-skills", "--no-prompt-templates", "--no-themes",
    "--tools", "optchat_memory", "--model", "faux/optchat-package-test", "-e", provider, "--print", "Check OptChat memory"], host, env);
  assert.match(output, /PI_INSTALL_OK/);
  run(process.execPath, [cli, "remove", source], host, env);
  assert.ok(!run(process.execPath, [cli, "list"], host, env).includes(source));
  console.log("PASS: pi install/list/remove, source-only runtime dependencies, bundled Pi 1.1.0 loader, ordinary prompts with a memory view and real retrieval tool dispatch.");
} finally {
  // Only this test's freshly-created fixtures and fake provider state.
  rmSync(temporary, { recursive: true, force: true });
}
