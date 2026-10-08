import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fauxProvider, type FauxResponseFactory } from "@earendil-works/pi-ai";
import {
  createAgentSessionServices,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type CustomEntry,
  type ToolDefinition,
  type ExtensionFactory,
} from "@earendil-works/pi-coding-agent";

type View = CustomEntry<{ content: string; requestId?: string; complete?: boolean }>;
type HostOptions = {
  native?: boolean;
  session?: SessionManager;
  tools?: ToolDefinition[];
  mode?: "tui" | "rpc" | "print" | "json";
  extensions?: ExtensionFactory[];
};

/** Real Pi runtime, including the same replacement lifecycle used by /new, /fork and /resume. */
export async function host(
  directory: string,
  respond: FauxResponseFactory,
  channel = "default",
  options: HostOptions = {},
) {
  const cwd = join(directory, "workspace");
  const agentDir = join(directory, "pi-agent");
  await mkdir(cwd, { recursive: true });
  const models = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: null,
    modelsStorePath: join(agentDir, "models-cache.json"),
    refreshOnCreate: false,
  });
  const faux = fauxProvider({
    models: [
      { id: "test", contextWindow: 272_000, maxTokens: 16_384 },
      { id: "small", contextWindow: 64_000, maxTokens: 4096 },
    ],
  });
  const repeat: FauxResponseFactory = (...args) => {
    faux.appendResponses([repeat]);
    return respond(...args);
  };
  faux.setResponses([repeat]);
  models.registerNativeProvider(faux.provider);
  await models.refresh({ allowNetwork: false });
  const runtime = await createAgentSessionRuntime(
    async (target) => {
      const services = await createAgentSessionServices({
        cwd: target.cwd,
        agentDir: target.agentDir,
        settingsManager: SettingsManager.inMemory({ retry: { enabled: false } }),
        modelRuntime: models,
        extensionFlagValues: new Map([
          ["optchat-channel", channel],
          ["optchat-mode", options.native ? "native" : "chat"],
        ]),
        resourceLoaderOptions: {
          additionalExtensionPaths: [resolve("pi/index.ts")],
          noSkills: true,
          noThemes: true,
          noContextFiles: true,
          extensionFactories: options.extensions,
          systemPrompt: "Host persona and rules remain authoritative.",
        },
      });
      assert.deepEqual(services.resourceLoader.getExtensions().errors, []);
      return {
        ...(await createAgentSessionFromServices({
          services,
          sessionManager: target.sessionManager,
          sessionStartEvent: target.sessionStartEvent,
          customTools: options.tools,
          model: models.getModel("faux", "test")!,
          noTools: "builtin",
        })),
        services,
        diagnostics: services.diagnostics,
      };
    },
    {
      cwd,
      agentDir,
      sessionManager: options.session ?? SessionManager.create(cwd, join(agentDir, "sessions")),
    },
  );
  const notifications: string[] = [];
  const views: View[] = [];
  const listeners = new Set<() => void>();
  const bind = async (session: AgentSession) => {
    session.subscribe((event) => {
      if (
        event.type === "entry_appended" &&
        event.entry.type === "custom" &&
        event.entry.customType === "optchat-durable"
      ) {
        views.push(event.entry as View);
        for (const listener of listeners) listener();
      }
    });
    await session.bindExtensions({
      mode: options.mode ?? "tui",
      onError: (failure) => notifications.push(`Hook error: ${failure.event}: ${failure.error}`),
      uiContext: {
        ...session.extensionRunner.getUIContext(),
        notify: (message) => {
          notifications.push(message);
        },
        setStatus: () => {},
      },
      commandContextActions: {
        waitForIdle: () => runtime.session.waitForIdle(),
        newSession: (opts) => runtime.newSession(opts),
        fork: (id, opts) => runtime.fork(id, opts),
        navigateTree: (id, opts) => runtime.session.navigateTree(id, opts),
        switchSession: (path, opts) => runtime.switchSession(path, opts),
        reload: () => runtime.session.reload(),
      },
    });
  };
  runtime.setRebindSession(bind);
  await bind(runtime.session);
  const wait = async (predicate: (views: View[]) => boolean) => {
    if (predicate(views)) return;
    await new Promise<void>((done, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(check);
        reject(new Error(`Timed out: ${JSON.stringify({ views, notifications })}`));
      }, 10_000);
      const check = () => {
        if (predicate(views)) {
          clearTimeout(timer);
          listeners.delete(check);
          done();
        }
      };
      listeners.add(check);
      check();
    });
  };
  return {
    runtime,
    get session() {
      return runtime.session;
    },
    get runner() {
      return runtime.session.extensionRunner;
    },
    ctx: () => runtime.session.extensionRunner.createCommandContext(),
    models,
    notifications,
    views,
    wait,
    command: (args: string) => runtime.session.prompt(`/optchat ${args}`),
    close: () => runtime.dispose(),
  };
}
