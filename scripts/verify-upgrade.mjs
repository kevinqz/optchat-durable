import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = mkdtempSync(join(tmpdir(), "optchat-upgrade-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const baseline = {
  url: "https://github.com/kevinqz/optchat-durable/releases/download/v0.4.0-rc.1/optchat-durable-0.4.0-rc.1.tgz",
  sha256: "6f0e8bc5e3d74e97193773d8ea69ce7693ef01145149ae4d19498637d43cb33f",
};
const baselineFile = process.env.OPTCHAT_UPGRADE_BASELINE;
const offline = (process.env.npm_config_offline ?? process.env.NPM_CONFIG_OFFLINE) === "true";
function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 5_000_000,
  });
  if (result.error || result.status !== 0)
    throw new Error(`${command} failed\n${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
function consumer(name, tarball) {
  const directory = join(temporary, name);
  mkdirSync(directory);
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ name, private: true, type: "module" }),
  );
  run(
    npm,
    ["install", "--ignore-scripts", "--prefer-offline", "--no-audit", "--no-fund", tarball],
    directory,
  );
  copyFileSync(join(root, "test/fixtures/upgrade-consumer.mjs"), join(directory, "consumer.mjs"));
  writeFileSync(join(directory, "public-api.mjs"), 'export { openApp } from "optchat-durable";\n');
  return directory;
}
function hashes(directory) {
  const result = {};
  const walk = (path) => {
    for (const entry of readdirSync(join(directory, path), { withFileTypes: true })) {
      if (entry.name.startsWith(".writer-lock.sqlite")) continue;
      const relative = join(path, entry.name);
      if (entry.isDirectory()) walk(relative);
      else
        result[relative] = createHash("sha256")
          .update(readFileSync(join(directory, relative)))
          .digest("hex");
    }
  };
  walk("");
  return result;
}

try {
  if (offline && !baselineFile)
    throw new Error(
      "Offline upgrade checks require OPTCHAT_UPGRADE_BASELINE=/path/to/optchat-durable-0.4.0-rc.1.tgz. Use the original checksum-pinned release artifact; no download was attempted.",
    );
  let body;
  if (baselineFile) body = readFileSync(resolve(baselineFile));
  else {
    const response = await fetch(baseline.url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Baseline download failed: HTTP ${response.status}`);
    body = Buffer.from(await response.arrayBuffer());
  }
  assert.equal(
    createHash("sha256").update(body).digest("hex"),
    baseline.sha256,
    "The rc.1 baseline does not match the published candidate checksum",
  );
  console.log(`Verified rc.1 baseline from ${baselineFile ? "local file" : "public download"}.`);
  const oldTarball = join(temporary, "published.tgz");
  writeFileSync(oldTarball, body);
  run(npm, ["run", "build"], root);
  const [pack] = JSON.parse(
    run(npm, ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary], root),
  );
  const old = consumer("old-consumer", oldTarball);
  const current = consumer("current-consumer", join(temporary, pack.filename));
  const data = join(temporary, "data");
  const backup = join(temporary, "backup");
  const restored = join(temporary, "restored");
  run(process.execPath, ["consumer.mjs", "seed", data], old);
  const before = hashes(data);
  cpSync(data, backup, { recursive: true, errorOnExist: true, force: false });
  assert.deepEqual(hashes(backup), before);
  run(process.execPath, ["consumer.mjs", "upgrade", data], current);
  assert.deepEqual(hashes(backup), before, "The original backup must stay unchanged");
  cpSync(backup, restored, { recursive: true, errorOnExist: true, force: false });
  assert.deepEqual(hashes(restored), before);
  run(process.execPath, ["consumer.mjs", "verify", restored], old);
  // Upgrade the independently restored branch archive too; no code downgrade over new state.
  run(process.execPath, ["consumer.mjs", "upgrade", restored], current);

  const pending = join(temporary, "pending");
  run(process.execPath, ["consumer.mjs", "pending", pending], old);
  const pendingBefore = hashes(pending);
  run(process.execPath, ["consumer.mjs", "reject-pending", pending], current);
  assert.deepEqual(
    hashes(pending),
    pendingBefore,
    "Unsupported in-flight upgrade changed original bytes",
  );
  run(process.execPath, ["consumer.mjs", "settle", pending], old);
  const native = join(temporary, "native");
  const nativeWorker = join(root, "test/fixtures/native-upgrade-worker.ts");
  run(process.execPath, ["--import", "tsx", nativeWorker, "seed", native, old], root);
  const nativeBackup = join(temporary, "native-backup");
  const nativeBefore = hashes(native);
  cpSync(native, nativeBackup, { recursive: true, errorOnExist: true, force: false });
  assert.deepEqual(hashes(nativeBackup), nativeBefore);
  run(process.execPath, ["--import", "tsx", nativeWorker, "verify", native, current], root);
  assert.deepEqual(hashes(nativeBackup), nativeBefore);
  console.log(
    `PASS: published rc.1 checksum ${baseline.sha256}; settled SDK branch and native Pi upgrades, exact originals, isolated backup restoration, and unchanged in-flight rejection followed by original-version recovery.`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
