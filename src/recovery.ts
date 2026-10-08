import { open, readFile, realpath, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Cursor, Storage } from "@earendil-works/pi-durable";
import { openNodeJsonlStorage } from "@earendil-works/pi-durable/storage/jsonl/node";
import {
  withStorageSnapshot,
  type StorageSnapshot,
  type SnapshotFile,
} from "./storage-snapshot.js";

export type ArchiveInspection = {
  source: string;
  capturedAt: string;
  files: SnapshotFile[];
  host: { sessionId?: string; sessionFile?: string; cwd?: string } | null;
  configuration: "absent" | "present" | "unreadable";
  conversations: number;
  entries: number;
  entryKinds: Record<string, number>;
  pendingTasks: number;
};

async function* pages<T>(
  read: (cursor?: Cursor) => Promise<{ items: readonly T[]; next?: Cursor }>,
) {
  let cursor: Cursor | undefined;
  do {
    const page = await read(cursor);
    yield* page.items;
    cursor = page.next;
  } while (cursor);
}

async function metadata(
  snapshot: StorageSnapshot,
): Promise<Pick<ArchiveInspection, "host" | "configuration">> {
  if (!snapshot.files.some((file) => file.path === "config.json"))
    return { host: null, configuration: "absent" };
  try {
    const value = JSON.parse(await readFile(join(snapshot.directory, "config.json"), "utf8"));
    const host: NonNullable<ArchiveInspection["host"]> = {};
    for (const key of ["sessionId", "sessionFile", "cwd"] as const)
      if (typeof value?.host?.[key] === "string") host[key] = value.host[key];
    return { host: Object.keys(host).length ? host : null, configuration: "present" };
  } catch {
    return { host: null, configuration: "unreadable" };
  }
}

async function inspect(
  snapshot: StorageSnapshot,
  storage: Storage,
  emit?: (record: unknown) => Promise<void>,
): Promise<ArchiveInspection> {
  const context = BACKGROUND_CONTEXT;
  const info: ArchiveInspection = {
    source: snapshot.source,
    capturedAt: snapshot.capturedAt,
    files: snapshot.files,
    ...(await metadata(snapshot)),
    conversations: 0,
    entries: 0,
    entryKinds: Object.create(null) as Record<string, number>,
    pendingTasks: 0,
  };
  await emit?.({
    type: "manifest",
    format: "optchat-archive",
    version: 1,
    source: info.source,
    capturedAt: info.capturedAt,
    files: info.files,
    host: info.host,
  });
  for await (const conversation of pages((cursor) =>
    storage.scanConversations({}, 100, cursor, context),
  )) {
    info.conversations++;
    await emit?.({ type: "conversation", record: conversation });
    for await (const entry of pages((cursor) =>
      storage.scanEntries(
        { conversationId: conversation.id, order: "ascending" },
        100,
        cursor,
        context,
      ),
    )) {
      // Fork scans include ancestors. Emit each immutable entry exactly once, at its owner.
      if (entry.conversationId !== conversation.id) continue;
      info.entries++;
      info.entryKinds[entry.kind] = (info.entryKinds[entry.kind] ?? 0) + 1;
      if (emit) {
        const persisted = await storage.entry(entry.id, context);
        if (!persisted) throw new Error(`Missing committed archive entry ${entry.id}`);
        await emit({ type: "entry", record: entry, commitSeq: persisted.commitSeq });
      }
    }
  }
  for await (const task of pages((cursor) => storage.scanTasks({}, 100, cursor, context))) {
    if (task.state.status === "terminal") continue;
    info.pendingTasks++;
    await emit?.({
      type: "pending-task",
      id: task.id,
      conversationId: task.conversationId,
      kind: task.kind,
      version: task.version,
      status: task.state.status,
    });
  }
  await emit?.({ type: "summary", ...info });
  return info;
}

async function readSnapshot<T>(
  directory: string,
  read: (snapshot: StorageSnapshot, storage: Storage) => Promise<T>,
) {
  return withStorageSnapshot(directory, async (snapshot) => {
    // JSONL open can repair torn tails, so it must NEVER run against the source for inspection.
    const storage = await openNodeJsonlStorage(join(snapshot.directory, "pi"), BACKGROUND_CONTEXT);
    try {
      return await read(snapshot, storage);
    } finally {
      await storage.close(BACKGROUND_CONTEXT);
    }
  });
}

/** Inspect committed data without a Harness, model credentials, task resumption or source repair. */
export function inspectArchive(directory: string): Promise<ArchiveInspection> {
  return readSnapshot(directory, (snapshot, storage) => inspect(snapshot, storage));
}

/** Export evidence, not an executable Pi session. Refuses overwrites and paths inside the source. */
export async function exportArchive(
  directory: string,
  destination: string,
): Promise<ArchiveInspection> {
  return readSnapshot(directory, async (snapshot, storage) => {
    const output = join(await realpath(dirname(resolve(destination))), basename(destination));
    const child = relative(snapshot.source, output);
    if (!child || (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child)))
      throw new Error("Export to a new file outside the source data directory");
    const file = await open(output, "wx", 0o600);
    let complete = false;
    try {
      const info = await inspect(snapshot, storage, async (record) => {
        await file.writeFile(JSON.stringify(record) + "\n");
      });
      await file.sync();
      complete = true;
      return info;
    } finally {
      await file.close();
      if (!complete) await unlink(output);
    }
  });
}
