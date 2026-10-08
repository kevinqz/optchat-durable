import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Models } from "@earendil-works/pi-ai";
import {
  Harness,
  createRegistry,
  type Conversation,
  type Storage,
} from "@earendil-works/pi-durable";
import { openNodeJsonlStorage } from "@earendil-works/pi-durable/storage/jsonl/node";
import type { AppConfig } from "./config.js";
import { createOptChat, type OptChatController } from "./extension.js";
import { APP_INSTRUCTIONS } from "./prompts.js";
import { acquireWriterLock } from "./writer-lock.js";
import { checkStorage, type StoragePreparationOptions } from "./storage-contract.js";
import { withStorageSnapshot } from "./storage-snapshot.js";

export type OpenAppOptions = StoragePreparationOptions & {
  models?: Models;
  storage?: Storage;
  resume?: boolean;
  onReport?: (error: unknown) => void;
};

/** Open the standalone Node application. close() also closes an injected storage. */
export async function openApp(config: AppConfig, injected?: OpenAppOptions): Promise<OptChatApp> {
  const context = BACKGROUND_CONTEXT;
  const registry = createRegistry();
  const optchat = createOptChat(config);
  config = Object.freeze({ ...config, ...optchat.config });
  registry.install(optchat.extension);
  const models =
    injected?.models ??
    (await (await import("./models.js")).makeModels(config, injected?.resume !== false));
  let unlock = () => {};
  let storage: Storage;
  if (injected?.storage) storage = injected.storage;
  else {
    await mkdir(config.directory, { recursive: true, mode: 0o700 });
    unlock = acquireWriterLock(config.directory);
    try {
      if (existsSync(join(config.directory, "pi")))
        await withStorageSnapshot(
          config.directory,
          async (snapshot) => {
            const copy = await openNodeJsonlStorage(join(snapshot.directory, "pi"), context);
            try {
              await checkStorage(copy, optchat.config, injected, context);
            } finally {
              await copy.close(context);
            }
          },
          { writerLockHeld: true },
        );
      storage = await openNodeJsonlStorage(join(config.directory, "pi"), context, { fsync: true });
    } catch (error) {
      unlock();
      throw error;
    }
  }
  let harness: Harness;
  try {
    await optchat.prepare(storage, injected, context);
    harness = await Harness.open(
      storage,
      {
        models,
        registry,
        settings: optchat.settings,
        onReport:
          injected?.onReport ??
          ((error) => console.error("Pi:", error instanceof Error ? error.message : String(error))),
      },
      context,
    );
  } catch (error) {
    try {
      await storage.close(context);
    } finally {
      unlock();
    }
    throw error;
  }
  let root: Conversation;
  try {
    root = await harness.root(context, {
      agent: {
        model: config.main,
        extensions: [optchat.extension],
        instructions: APP_INSTRUCTIONS,
        thinkingLevel: "medium",
      },
    });
    if (injected?.resume !== false) harness.resume();
  } catch (error) {
    try {
      await harness.close(context);
    } finally {
      unlock();
    }
    throw error;
  }
  let closed = false;
  const controller = optchat.attach(harness, root, context);
  return {
    ...controller,
    config,
    forConversation: (conversation: Conversation) => optchat.attach(harness, conversation, context),
    async status() {
      return { ...(await controller.status()), demo: config.demo };
    },
    async close() {
      if (closed) return;
      closed = true;
      try {
        await harness.close(context);
      } finally {
        unlock();
      }
    },
  };
}
export type OptChatApp = Omit<OptChatController, "status"> & {
  config: AppConfig;
  forConversation(conversation: Conversation): OptChatController;
  status(): Promise<Awaited<ReturnType<OptChatController["status"]>> & { demo: boolean }>;
  close(): Promise<void>;
};
