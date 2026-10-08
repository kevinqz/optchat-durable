import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, copyFile, lstat, mkdir, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireWriterLock } from "./writer-lock.js";

export type SnapshotFile = { path: string; bytes: number; sha256: string };
export type StorageSnapshot = {
  source: string;
  directory: string;
  capturedAt: string;
  files: SnapshotFile[];
};

async function copyFiles(source: string, destination: string, path: string, files: SnapshotFile[]) {
  const from = join(source, path);
  const to = join(destination, path);
  const stat = await lstat(from);
  if (stat.isDirectory()) {
    await mkdir(to, { mode: 0o700 });
    for (const name of (await readdir(from)).sort())
      await copyFiles(source, destination, join(path, name), files);
  } else if (stat.isFile()) {
    await copyFile(from, to);
    await chmod(to, 0o600);
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(to)) hash.update(chunk);
    files.push({ path, bytes: stat.size, sha256: hash.digest("hex") });
  } else {
    throw new Error(`Archive snapshots require regular files and directories: ${path}`);
  }
}

/** Copy under the application's writer lock. Only the disposable copy may be opened/repaired. */
export async function withStorageSnapshot<T>(
  directory: string,
  use: (snapshot: StorageSnapshot) => Promise<T>,
): Promise<T> {
  const source = await realpath(directory);
  if (!(await lstat(join(source, "pi"))).isDirectory())
    throw new Error("Expected an OptChat data directory containing a pi directory");
  const temporary = await mkdtemp(join(tmpdir(), "optchat-snapshot-"));
  try {
    const files: SnapshotFile[] = [];
    const unlock = acquireWriterLock(source);
    let capturedAt: string;
    try {
      await copyFiles(source, temporary, "pi", files);
      // A missing native config is itself recoverable evidence; do not invent one.
      if ((await readdir(source)).includes("config.json"))
        await copyFiles(source, temporary, "config.json", files);
      capturedAt = new Date().toISOString();
    } finally {
      unlock();
    }
    return await use({ source, directory: temporary, files, capturedAt });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
