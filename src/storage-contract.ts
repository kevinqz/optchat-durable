import type { Context } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  createSession,
  defineDocFamily,
  type Cursor,
  type DocumentRecord,
  type Storage,
} from "@earendil-works/pi-durable";
import { resolveOptChatConfig, type OptChatConfig, type OptChatOptions } from "./config.js";

const IMPLEMENTATION = 1;
const PI_RUNTIME = "1.1.0";
const CONTRACT_KIND = "optchat.storage-contract";
const CONFIG_KEYS = [
  "main",
  "compactor",
  "nodeBytes",
  "viewBytes",
  "jobs",
  "sizeTries",
  "retryMs",
  "failureTries",
  "maxInputBytes",
  "maxOutputTokens",
] as const;
const DOCUMENTS = new Set([
  CONTRACT_KIND,
  "optchat.memory",
  "optchat.raw-reference",
  "optchat.node",
  "optchat.queue",
  "optchat.request",
  "optchat.pi.branches",
  "optchat.pi.sources",
  "optchat.pi.journal-index",
  "optchat.pi.view",
]);
const TASKS = new Set(["optchat.request", "optchat.summarize", "optchat.build-memory"]);
type Contract = { implementation: number; piRuntime: string; config: OptChatConfig };
export const StorageContract = defineDocFamily<Contract, Contract>({
  kind: CONTRACT_KIND,
  version: 1,
  scope: "session",
  family: true,
  initial: (value) => ({ ...value }),
});
export type StoragePreparationOptions = {
  /** Explicit assertion of the original pre-contract configuration, after a complete backup. */
  legacyConfig?: OptChatOptions;
};
export type StorageCompatibility = { mode: "new" | "current" | "legacy"; pendingTasks: number };

function canonical(config: OptChatConfig) {
  return Object.fromEntries(
    CONFIG_KEYS.map((key) => [
      key,
      key === "main" || key === "compactor"
        ? { provider: config[key].provider, modelId: config[key].modelId }
        : config[key],
    ]),
  ) as OptChatConfig;
}
function sameConfig(a: OptChatConfig, b: OptChatConfig) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

export function assertStorageContract(
  contract: Readonly<Contract> | undefined,
  config: OptChatConfig,
) {
  if (!contract)
    throw new Error(
      "OptChat storage is not prepared. Call await optchat.prepare(storage) before Harness.open().",
    );
  if (contract.implementation !== IMPLEMENTATION || contract.piRuntime !== PI_RUNTIME)
    throw new Error(
      "Unsupported OptChat storage implementation/runtime. Reopen with its original version or restore a complete backup into a separate directory.",
    );
  let saved: OptChatConfig;
  try {
    saved = resolveOptChatConfig(contract.config);
  } catch {
    throw new Error(
      "Invalid stored OptChat configuration. Restore a verified backup or inspect the archive before changing it.",
    );
  }
  if (!sameConfig(saved, config))
    throw new Error(
      "OptChat models or budgets differ from the stored configuration. Reopen with the original configuration; use a new archive for changed settings.",
    );
}

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

/** Definition-free preflight. The caller must hold exclusive ownership; this makes no writes. */
export async function checkStorage(
  storage: Storage,
  config: OptChatConfig,
  options: StoragePreparationOptions = {},
  context: Context = BACKGROUND_CONTEXT,
): Promise<StorageCompatibility> {
  let hasOptChat = false;
  let contract: Contract | undefined;
  let pendingTasks = 0;
  const scanScope = async (scope: DocumentRecord["scope"]) => {
    for await (const doc of pages((cursor) =>
      storage.scanDocuments({ scope, at: "current" }, 100, cursor, context),
    )) {
      if (!doc.kind.startsWith("optchat.")) continue;
      const stored = await storage.document(doc.id, "current", context);
      if (!DOCUMENTS.has(doc.kind) || stored?.version !== 1)
        throw new Error(
          `Unsupported OptChat document ${doc.kind} version ${stored?.version}. Reopen with its original version before changing this archive.`,
        );
      hasOptChat = true;
      if (doc.kind === CONTRACT_KIND) {
        if (scope.kind !== "session" || doc.key !== "runtime" || contract)
          throw new Error("Invalid OptChat storage contract address");
        contract = stored.value as Contract;
      }
    }
  };
  await scanScope({ kind: "session" });
  for await (const conversation of pages((cursor) =>
    storage.scanConversations({}, 100, cursor, context),
  ))
    await scanScope({ kind: "conversation", conversationId: conversation.id });
  for await (const task of pages((cursor) => storage.scanTasks({}, 100, cursor, context))) {
    if (task.state.status !== "terminal") pendingTasks++;
    if (task.kind.startsWith("optchat.")) {
      hasOptChat = true;
      if (!TASKS.has(task.kind) || task.version !== 1)
        throw new Error(
          `Unsupported OptChat task ${task.kind} version ${task.version}. Reopen with its original version before changing this archive.`,
        );
    }
    await scanScope({ kind: "task", taskId: task.id });
  }
  if (contract) {
    assertStorageContract(contract, config);
    return { mode: "current", pendingTasks };
  }
  if (!hasOptChat) return { mode: "new", pendingTasks };
  if (pendingTasks)
    throw new Error(
      "Legacy OptChat archive has pending work. Settle it with the original package version and configuration, close it, and back it up before upgrading.",
    );
  if (!options.legacyConfig || !sameConfig(resolveOptChatConfig(options.legacyConfig), config))
    throw new Error(
      "Legacy OptChat archive has no stored configuration contract. Back it up and supply its original legacyConfig (CLI: --adopt-legacy with the original model/budget settings).",
    );
  return { mode: "legacy", pendingTasks };
}

/** Call once before Harness.open, while no other Session owns this storage. Never closes it. */
export async function prepareStorage(
  storage: Storage,
  config: OptChatConfig,
  options: StoragePreparationOptions = {},
  context: Context = BACKGROUND_CONTEXT,
): Promise<StorageCompatibility> {
  const compatibility = await checkStorage(storage, config, options, context);
  if (compatibility.mode !== "current") {
    const session = createSession(storage);
    await session.commit(async (tx) => {
      const contract = await tx.doc(StorageContract, "runtime", {
        implementation: IMPLEMENTATION,
        piRuntime: PI_RUNTIME,
        config: canonical(config),
      });
      assertStorageContract(contract, config);
    }, context);
    // This short-lived Session has no scheduler/listeners. close() would close the host's storage.
  }
  return compatibility;
}
