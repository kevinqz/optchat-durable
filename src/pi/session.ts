import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { openApp, type OptChatApp } from "../app.js";
import { MemoryStorage } from "@earendil-works/pi-durable";
import { resolveOptChatConfig, type OptChatConfig } from "../config.js";
import { modelsFromPi, requirePiModels } from "./models.js";

export type PiSessionContext = Pick<ExtensionContext, "cwd" | "sessionManager" | "modelRegistry" | "model">;

export function piDataDirectory(ctx: PiSessionContext, channel = "default"): string {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(channel)) throw new Error("--optchat-channel must contain 1..64 letters, digits, underscores or hyphens.");
  // A Pi session containing only extension entries may never be flushed to disk.
  // A stable workspace/channel key keeps its durable chat reachable even then.
  const identity = createHash("sha256").update(`${ctx.cwd}\0${channel}`).digest("hex");
  return join(ctx.sessionManager.getSessionDir(), "optchat-durable", identity);
}

export function piNativeDirectory(ctx: PiSessionContext, channel = "default"): string {
  const session = createHash("sha256").update(ctx.sessionManager.getSessionId()).digest("hex");
  return join(piDataDirectory(ctx, channel), "sessions", session);
}

function initialConfig(ctx: PiSessionContext, compactorFlag: string | undefined): OptChatConfig {
  const main = ctx.model;
  if (!main) throw new Error("Choose a model with Pi's /model before starting OptChat.");
  const slash = compactorFlag?.indexOf("/") ?? -1;
  if (compactorFlag && slash < 1) throw new Error("--optchat-compactor must be provider/model-id.");
  const compactor = compactorFlag ? ctx.modelRegistry.find(compactorFlag.slice(0, slash), compactorFlag.slice(slash + 1)) : main;
  if (!compactor) throw new Error(`Compactor ${compactorFlag} is unavailable in Pi.`);
  const window = Math.min(main.contextWindow, compactor.contextWindow);
  const maxOutputTokens = Math.min(8192, main.maxTokens, compactor.maxTokens, Math.floor(window / 8));
  const available = window - maxOutputTokens - 24_000;
  const maxInputBytes = Math.min(32_000, Math.floor(available / 4));
  const viewBytes = Math.min(128_000, available - maxInputBytes);
  if (maxOutputTokens < 512 || maxInputBytes < 512 || viewBytes < 4096) {
    throw new Error("Choose models with a larger context window for OptChat (at least 40k recommended).");
  }
  return resolveOptChatConfig({ main: { provider: main.provider, modelId: main.id },
    compactor: { provider: compactor.provider, modelId: compactor.id }, maxOutputTokens, maxInputBytes, viewBytes });
}

/** Lazy durable storage, isolated by native session or legacy channel; no work at extension load. */
export class PiOptChatSession {
  private opening: Promise<void> = Promise.resolve();
  private app: OptChatApp | undefined;
  private directory: string | undefined;
  private closed = false;

  constructor(private readonly options: { compactor?: string; channel?: string; native?: boolean; onReport?: (error: unknown) => void } = {}) {}

  open(ctx: PiSessionContext, create = false): Promise<OptChatApp | undefined> {
    // Serialize even an absent read followed by simultaneous creators. Every
    // caller observes the same app; a failed open does not poison later retries.
    const opening = this.opening.then(async () => {
      if (this.closed) throw new Error("OptChat session is closed.");
      const directory = this.options.native ? piNativeDirectory(ctx, this.options.channel) : piDataDirectory(ctx, this.options.channel);
      if (this.directory && this.directory !== directory) throw new Error("Pi session changed; reload the OptChat extension.");
      this.directory = directory;
      this.app ??= await this.openDirectory(ctx, directory, create);
      return this.app;
    });
    this.opening = opening.then(() => {}, () => {});
    return opening;
  }

  private async openDirectory(ctx: PiSessionContext, directory: string, create: boolean): Promise<OptChatApp | undefined> {
    if (this.options.native && !ctx.sessionManager.getSessionFile()) {
      if (!create) return undefined;
      const config = initialConfig(ctx, this.options.compactor);
      requirePiModels(ctx.modelRegistry, { ...config, main: config.compactor });
      return openApp({ ...config, directory: ":memory:", demo: false }, {
        storage: new MemoryStorage(), models: modelsFromPi(ctx.modelRegistry, config), resume: false, onReport: this.options.onReport,
      });
    }
    const path = join(directory, "config.json");
    let config: OptChatConfig | undefined;
    try {
      const saved = JSON.parse(await readFile(path, "utf8")) as { version: number; config: OptChatConfig };
      if (saved.version !== 1 || !saved.config) throw new Error("Unsupported OptChat session configuration.");
      config = resolveOptChatConfig(saved.config);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (existsSync(join(directory, "pi"))) throw new Error("OptChat storage exists without its configuration; restore config.json from your backup.");
    }
    if (!config && !create) return undefined;
    const isNew = !config;
    config ??= initialConfig(ctx, this.options.compactor);
    if (create) requirePiModels(ctx.modelRegistry, this.options.native ? { ...config, main: config.compactor } : config);
    const app = await openApp({ ...config, directory, demo: false }, {
      models: modelsFromPi(ctx.modelRegistry, config), resume: false, onReport: this.options.onReport,
    });
    try {
      // Written only while holding the same writer lock as Pi's data. No tokens or
      // provider headers enter this file. An incomplete file fails closed on reopen.
      if (isNew) await writeFile(path, JSON.stringify({ version: 1, config,
        ...(this.options.native ? { host: { sessionId: ctx.sessionManager.getSessionId(), sessionFile: ctx.sessionManager.getSessionFile(), cwd: ctx.cwd } } : {}),
      }, null, 2) + "\n", { flag: "wx", mode: 0o600, flush: true });
      return app;
    } catch (error) { await app.close(); throw error; }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.opening;
    await this.app?.close(); // preserves pending tasks; never cancels on reload or quit
  }
}
