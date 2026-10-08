import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

/** Byte identity of stored history/config, excluding the separate OS lock database. */
export async function archiveHashes(directory: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const walk = async (relative: string) => {
    for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
      if (entry.name.startsWith(".writer-lock.sqlite")) continue;
      const path = join(relative, entry.name);
      if (entry.isDirectory()) await walk(path);
      else
        files[path] = createHash("sha256")
          .update(await readFile(join(directory, path)))
          .digest("hex");
    }
  };
  await walk("");
  return files;
}
