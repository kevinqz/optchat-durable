# OptChat Durable

[Português](./README.pt-BR.md) · [Credits](./CREDITS.md) · [Install in Pi](./PI.md) · [SDK integration](./examples/README.md) · [Architecture (PT)](./ARCHITECTURE.md) · [Validation (PT)](./VALIDATION.md)

Persistent chat with hierarchical, searchable memory, implemented as a **native Pi Durable extension**. Includes a **Pi coding-agent package**, a local browser interface, a terminal client, and a typed JavaScript/TypeScript API.

An independent implementation inspired by [Victor Taelin's OptChat design](https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449). It uses the **official, unmodified** [Pi Durable](https://github.com/earendil-works/pi/tree/main/packages/durable), Pi AI, and Chord packages. No fork, custom Pi distribution, or separate OptMem installation is required. This is not an official OptChat or Pi project.

## Built on OptChat and Pi

| Foundation | Authors and maintainers | Their contribution |
| --- | --- | --- |
| **[OptChat](https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449)** | **[Victor Taelin](https://github.com/VictorTaelin)** | The hierarchical memory design. |
| **[Pi / Pi Durable](https://github.com/earendil-works/pi/tree/v1.1.0/packages/durable)** | **[Mario Zechner](https://github.com/badlogic)**, **[Earendil Works](https://github.com/earendil-works)**, and **[Pi contributors](https://github.com/earendil-works/pi/graphs/contributors)** | The runtime, providers, extension system, and durable execution. |

This repository contributes an independent integration maintained by Kevin Saltarelli. [Credits and provenance](./CREDITS.md) identify each role, the exact upstream references, and licensing boundaries. [CITATION.cff](./CITATION.cff) records both upstream works as references; [NOTICE](./NOTICE) travels with the installed package. Run `optchat-durable credits` to view attribution locally.

**Early release:** deterministic tests cover persistence, recovery, isolation, and packaging. Real-provider summary quality, latency, and cache savings have not been measured. The demo generates simulated responses and summaries.

## Install and run

Requires Node.js **22.19.0 or later** and npm. macOS and Linux are the qualified platforms; Windows is not yet qualified.

### Already using Pi?

With Pi 1.1.0:

```sh
pi install git:github.com/kevinqz/optchat-durable@v0.3.0
pi
```

Then type `/optchat ask Remember project Aurora.` in Pi. Use `/reload` in an already-running Pi session. The adapter uses your Pi model and login, adds native commands and an `optchat_memory` retrieval tool, and keeps the same durable engine. History is shared by workspace/channel, so it survives new Pi sessions. Use `pi --optchat-channel research` for a separate chat.

**Ordinary coding-agent messages are not automatically indexed by OptChat.** `/optchat` owns a separate durable chat; the coding agent can explicitly search its originals. [Pi guide](./PI.md): commands, model selection, channels, recovery, project-local installation, updates and limitations.

### Standalone app

Install the compiled GitHub release (no repository checkout or compiler required):

```sh
npm install -g https://github.com/kevinqz/optchat-durable/releases/download/v0.3.0/optchat-durable-0.3.0.tgz
optchat-durable --demo
```

Open **http://127.0.0.1:4317**. The demo uses Pi's real runtime and storage with a fake provider, so it requires no API key. If you prefer a project-local installation, omit `-g` and run `npx optchat-durable --demo`.

Stop the demo with `Ctrl+C`. Set `OPENAI_API_KEY` in your environment or a private `.env` file in the current working directory, then run:

```sh
optchat-durable
```

Copy [`.env.example`](./.env.example) to `.env` for configuration. Existing environment variables take precedence. The application never sends API keys to the browser. Using real models sends conversation content to your chosen provider and incurs its normal API charges.

Defaults: `openai/gpt-6-sol` for chat and `openai/gpt-6-luna` for summaries. Set `OPTCHAT_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` for Anthropic, with defaults `claude-opus-4-8` / `claude-haiku-4-5`. Override `OPTCHAT_MODEL` and `OPTCHAT_COMPACTOR_MODEL` as needed; `optchat-durable models` lists the installed Pi catalog. Actual availability depends on your provider account.

```sh
optchat-durable chat                    # interactive terminal
optchat-durable ask "My project is Aurora"
optchat-durable status
optchat-durable zoom 0 1                # original message 0
optchat-durable zoom 0 8                # children covering messages 0..7
optchat-durable search "Aurora"         # follow next for further pages
optchat-durable --help
```

Run from the same working directory to continue the same chat. History defaults to `.optchat/live` or `.optchat/demo`, **relative to the working directory**, not the package's installation directory. Set `OPTCHAT_DATA_DIR` for a fixed location. When overriding it, choose different directories for demo and real sessions. Only one process may open a directory at a time; stop the server before using another CLI command against the same history. `status`, `zoom`, and `search` do not resume pending model calls.

This release is distributed through GitHub; **it is not published to the npm registry**. Use the full release URL above, not an unqualified package name from a registry.

## Use in another application

The same release can be installed as a dependency:

```sh
npm install https://github.com/kevinqz/optchat-durable/releases/download/v0.3.0/optchat-durable-0.3.0.tgz
```

For a complete application lifecycle:

```js
import { configFromEnv, openApp } from "optchat-durable";

const app = await openApp(configFromEnv());
try {
  console.log((await app.prompt("Remember my project: Aurora", "first-request")).answer);
  await app.settleMemory();
} finally {
  await app.close();
}
```

For an existing Pi Durable host, only the two model references are required. Memory budgets and retry limits have defaults:

```js
import { createOptChat } from "optchat-durable/extension";

const memory = createOptChat({
  main: { provider: "openai", modelId: "gpt-6-sol" },
  compactor: { provider: "openai", modelId: "gpt-6-luna" },
});
registry.install(memory.extension); // before Harness.open()
// Open the host's harness with settings: memory.settings, then:
const chat = memory.attach(harness, conversation, context);
const { answer } = await chat.prompt("Remember project Aurora", "request-1");
```

`registry`, `harness`, `conversation`, and `context` above belong to the host. The [complete runnable example](./examples/native-host.mjs) shows their initialization without credentials. OptChat contributes a native **prompt section**, and adds its extension without replacing the host's selected extensions, instructions, thinking level, or working directory. Custom host tools can coexist; compactors remain isolated and tool-free. The standalone application still exposes only memory tools.

See the [integration contract](./examples/README.md) for tool-name reservations, harness-wide compaction settings, native event subscriptions, and recovery. `prompt()` is a convenience over the same durable `enqueue()` / `wait()` path, not another execution loop.

The SDK extension and the [coding-agent adapter](./PI.md) are two entry points to the same durable controller. Installing the SDK extension alone does not intercept arbitrary `conversation.submit()` calls. All managed input must use the controller's `prompt()` or `enqueue()` method.

## How memory works

1. Pi's original entries remain the canonical history. Memory records reference their entry IDs and message ordinals.
2. A binary tree summarizes each message and then pairs of summaries, targeting 512 UTF-8 bytes per node. Short content can be retained without a model call.
3. A persisted chronological partition retains more detail for recent messages and merges older siblings. Its default 128,000-byte budget includes markup and addresses.
4. Each queued request waits for memory preparation, atomically freezes its view and starts a fresh context, then uses Pi's native generation and tools.
5. Native `zoom`, `date`, and `search` tools retrieve original text and timestamps. Original text is paginated without silently dropping the remainder; search does not depend on summaries.

Leaves are summarized in order; independent parents can run concurrently, up to eight by default. Compactors use isolated child conversations without tools. The standalone main agent only has memory tools; SDK hosts may explicitly supply their own tools. The standalone app provides no shell, filesystem, browser, or email tools. Mid-response steering is not supported in this release. Inputs arriving during a response enter a durable queue.

The runtime uses native tasks, documents, checkpoints, cancellation, model providers, and usage accounting. Automatic Pi compaction is disabled so it does not compete with the OptChat tree. Summary execution retries and size attempts are bounded; failed preparation blocks the next answer instead of silently supplying incomplete context.

## Persistence and privacy

The standalone app uses native JSONL storage with `fsync: true`, plus a process lock released by the OS after a crash. `Ctrl+C` preserves unfinished work for reopening. Canceling a request is a separate action. Idempotent IDs prevent duplicated input admission; reusing an ID for different text is rejected.

**External model requests may be retried after a crash and billed again.** Durable checkpoints cannot make an external API exactly-once. Memory summaries are lossy; retrieval preserves access to the original, not a guarantee of perfect recall.

Data is local and unencrypted. Stop the app before copying the entire data directory for backup. Use a local filesystem, not a shared/network drive. The UI binds only to `127.0.0.1`, validates Host/Origin, and is not designed for public hosting or multiple users. Model reasoning blocks are excluded from the memory projection, but Pi's original log may retain provider reasoning metadata.

## Develop and verify

```sh
git clone https://github.com/kevinqz/optchat-durable.git
cd optchat-durable
npm ci
npm run check
npm run build
npm run check:package
npm run check:pi
npm run demo
```

`check:package` builds a tarball, validates its contents, installs it in a fresh temporary project, checks JavaScript and TypeScript imports, runs the CLI and native-host example, and serves its packaged UI. It needs npm network access and permission to listen on loopback. No model credentials are needed.

The runtime and native-host SDK are qualified with **Pi 1.1.0**. Pi Durable and Chord are exact runtime dependencies, since Pi's installer omits automatic peer installation. Host-supplied Pi AI, coding-agent and TUI follow Pi's `"*"` peer convention; the latter two are optional for standalone/SDK users. The lockfile pins development and tests. Other versions require qualification. The adapter delegates inference to the host registry and never installs a second coding-agent or TUI as a runtime dependency.

`check:pi` tests a source-only package without a compiler or `dist/`, real `pi install/list/remove`, and retrieval through the distributed bundled Pi CLI in a temporary profile. Git installation does not run a repository build; the native Pi loader consumes `pi/index.ts` directly.

Tests include `SIGKILL` during generation and summarization, recovery without duplicated input/tool results, UTF-8 budgets and pagination, isolated host conversations, queueing, cancellation, and HTTP boundaries. See [validation evidence](./VALIDATION.md) and [contributing](./CONTRIBUTING.md).

## License and attribution

[MIT](./LICENSE). You can use, modify, and redistribute this implementation, subject to that license. OptChat's concept is credited to Victor Taelin; Pi's runtime is credited to Mario Zechner, Earendil Works, and the Pi contributors. The original gist is linked, not bundled or relicensed. Dependency licenses remain their own; see [third-party notices](./THIRD_PARTY_NOTICES.md).
