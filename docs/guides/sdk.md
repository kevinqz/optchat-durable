# SDK integration

[Documentation index](../README.md) · [Configuration](../reference/configuration.md)

This guide is for JavaScript/TypeScript applications. Installing the OptChat release with npm
also installs its Pi Durable and Chord dependencies. If you already own a Pi Durable harness,
register the OptChat extension before opening it and attach the controller as described
below; installation alone does not add memory to an existing application. Keep host packages
on the qualified Pi 1.1.0 versions. For the terminal coding agent, use the
[Pi package guide](./pi.md) and `pi install` instead.

[Run the complete example](../../examples/native-host.mjs) with `node examples/native-host.mjs` after `npm ci && npm run build` in this repository. In another project, install a tarball built from the same revision and copy the example there. It uses a simulated provider and ephemeral `MemoryStorage`, so it requires no credentials and is not a persistence example. Use rc.2 or later for this example; rc.1 lacks storage preparation. See the [upgrade and compatibility guide](./upgrades.md).

`createOptChat({ main, compactor, ...optionalBudgets })` returns a normal Pi `Extension`, recommended harness settings, the frozen resolved `config`, `prepare(storage, options?, context?)`, and `attach(harness, conversation, context)`. Call `prepare` before `Harness.open` to validate versions and bind the configuration. `attach` returns the conversation's queue and memory controller; it does not own the harness. There is no second model loop or custom Pi distribution.

## Integration contract

- Install the extension **before opening storage with `Harness.open`**, including on every restart. Persisted `optchat.*` tasks must resolve to their definitions before scheduling resumes. Create one factory per registry; its model and memory settings apply to all conversations managed by that factory.
- With exclusive storage ownership, `await optchat.prepare(storage)` before `Harness.open`. It leaves storage open for the host; a prepared store cannot silently change models, budgets or retry settings. [Legacy adoption](./upgrades.md#upgrade-a-legacy-archive) requires settled work and the original configuration.
- Use `optchat.settings` when opening the harness. Automatic compaction must remain disabled. These settings are harness-wide, so use a separate harness if other agents require different policies. The factory also disables provider and native generation retries; the compactor owns its bounded retry policy.
- Use a **dedicated conversation** and select the extensions you want there. OptChat uses native additive extension selection and contributes the `optchat_memory` prompt section. It preserves existing host instructions, extensions, thinking level, and working directory. Its configured `main` model is still applied to each request. The standalone app initializes medium thinking; SDK hosts select their own level.
- Host tools run through Pi's normal execution and replay policy. Only explicitly include capabilities appropriate for your application. Reserve the tool names `zoom`, `date`, and `search` for OptChat; do not replace them in other extensions. If the agent has an explicit tool allowlist, include these three; an explicit exclusion fails before the main model is called. Compactor children clear tools, extension selection, and host instructions, retaining only their summarization instructions.
- Submit every managed message through `chat.prompt(text, requestId)` or `chat.enqueue(text, requestId)`. `prompt()` enqueues and awaits the durable result, including its `requestId` and `answer`. Do not call `conversation.submit()`, `reset()`, `compact()`, or `configure()` independently while OptChat owns it. The controller is necessary for the durable queue and atomic context preparation; the hook only shapes cache-friendly text blocks.
- Reuse `requestId` with exactly the same text to recover the existing request. IDs are scoped to the conversation. `chat.wait(taskId, optionalWaitContext)` waits for its answer; cancelling the wait context only detaches that observer. `chat.cancel(requestId)` aborts the durable request. `chat.settleMemory()` waits for resulting memory work. `chat.request`, `status`, `history`, `zoom`, `date`, and `search` expose the other operations.
- The host chooses storage, authenticates model providers, enforces one writer, and calls `harness.resume()` after reopening if it wants to resume pending work immediately. `enqueue()` enables scheduling explicitly; `wait()` enables it through Pi Durable’s `waitForTask()`. It is not a passive inspection operation. Cancelling a wait detaches the observer without aborting durable work. Call `harness.close(context)` when the host shuts down. `attach()` has no close method.
- `makeModels(config)` supplies the standalone app's OpenAI/Anthropic provider setup and conservative payload guards. If you supply your own `Models`, you must ensure both configured models exist, are authenticated, and fit the memory/input/output budgets. `boundedProvider` is available to apply the same transport guard. For Anthropic view markers and concurrent-prefix coordination, register `cacheProvider(yourProvider)` from `optchat-durable/extension` in your host Models registry; this is automatic in `makeModels` and the Pi adapter. The helper chains existing public `onPayload` callbacks and retains host authentication. See [cache behavior](../reference/cache.md). No API credentials or environment files are loaded by merely importing the library.
- Use the qualified Pi 1.1.0 runtime in SDK hosts. Pi Durable and Chord are exact runtime dependencies; host-supplied Pi packages follow the coding-agent's peer convention. Reopen using the same configuration; migration across task schema or provider changes is not automatic.

For a persistent application that does not already manage a harness, prefer `openApp(config)`. It sets up native JSONL persistence, a single-writer lock, providers, extension registration, and shutdown. `openApp` owns and closes even injected storage; use the factory/attach route to retain host ownership.

## Install and use application-owned storage

```sh
npm install https://github.com/kevinqz/optchat-durable/releases/download/v0.4.0-rc.3/optchat-durable-0.4.0-rc.3.tgz
```

This complete example uses the simulated provider and persistent `.optchat/demo` storage relative to the working directory:

```js
import { configFromEnv, openApp } from "optchat-durable";

const app = await openApp(configFromEnv({ OPTCHAT_DEMO: "1" }));
try {
  const result = await app.prompt("Remember project Aurora.", "example-1");
  console.log(result.answer);
  await app.settleMemory();
  console.log(await app.search("Aurora"));
} finally {
  await app.close();
}
```

Re-running with the same ID and text returns the existing request. Use a new ID for a new request. To supply real credentials through the environment, use `configFromEnv()` and configure the [standalone provider variables](../reference/configuration.md#standalone-environment). Merely importing the library does not load `.env`.

## Controller API

The public package exports declarations for the application, configuration, factory and controller. The factory is also available from `optchat-durable/extension`. Internal paths under `src/` and `dist/` are not supported imports.

| Operation                     | Contract                                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `prompt(text, requestId?)`    | Enqueue and wait; resolves to `{ requestId, answer }`                                                                                   |
| `enqueue(text, requestId?)`   | Durably admit or deduplicate input; returns `{ requestId, taskId }` and enables scheduling                                              |
| `wait(taskId, waitContext?)`  | Enable scheduling and observe completion; rejects on unsuccessful completion or cancelled observation                                   |
| `cancel(requestId)`           | Abort the durable request; does not delete input/history or necessarily cancel shared background summaries                              |
| `request(requestId)`          | Inspect its persisted request record                                                                                                    |
| `settleMemory(waitContext?)`  | Enable scheduling and wait for complete memory preparation; cancelling the observer does not itself abort its task                      |
| `buildMemory()`               | Ensure a build task and enable scheduling; return its task ID without waiting                                                           |
| `cancelMemory()`              | Abort the currently recorded memory build task                                                                                          |
| `status()`                    | Return memory state and up to 50 recent request receipts; usage and live task counts are harness-wide                                   |
| `history(cursor?)`            | Scan up to 100 Pi entries per page and return their normalized memory records; each page is chronological, `next` selects an older page |
| `zoom(start, count, offset?)` | Expand an aligned binary interval; `count=1` retrieves original normalized text with byte pagination                                    |
| `search(query, from?)`        | Literal case-insensitive search; continue with `next` until null                                                                        |
| `date(index)`                 | Read an original memory record's timestamp as an ISO string                                                                             |
| `root`, `harness`, `context`  | The original Pi objects for native observation and lifecycle                                                                            |

Reads do not enable scheduling. `zoom`, `search` and `date` can update the source index in a transaction, so “read” does not mean “no disk writes.” Work already enabled on the harness can continue while reads run. `openApp` defaults to resuming work; pass `{ resume: false }` to inspect before enabling it.

The application wrapper additionally exposes `config`, `close()` and `forConversation(conversation)`. The latter attaches the same controller definition to another conversation in its harness; it does not import a coding-agent session automatically. Follow the same dedicated-conversation and input-ownership rules.

## Why this integration uses native tasks as well as an extension

Pi's official [extension and system-prompt APIs](https://github.com/earendil-works/pi/blob/v1.1.0/packages/durable/README.md#extensions) already supply the right composition points. An OptChat prompt section describes retrieval; host sections and agent instructions keep their normal Pi semantics. Native tasks and transactions enforce memory readiness and context freezing before admitting the next input. Installing an extension alone does not wrap `conversation.submit()`.

A `GenerationTask.beforeRequest` hook operates on one provider attempt, including recovery, and its hooks are not a substitute for persisted request coordination. `CompactionTask.beforeCompact` acts after Pi has selected a compaction range; it does not implement OptChat's fresh frozen view for every queued user request. Moving the queue into either hook would change those guarantees. Our cache-shaping hook remains pure and correctness does not rely on it.

For live UX, use the host's normal Pi conversation watch or the native [agent events](https://github.com/earendil-works/pi/blob/v1.1.0/packages/durable/README.md#agent-events-experimental) on `chat.root`. Agent events are marked experimental upstream. The controller exposes the original `root`, `harness`, and `context`, so integrations can use these APIs directly without a second event protocol. The included web UI renders state committed by Pi.

The [Pi coding-agent adapter](./pi.md) is installed with `pi install`. Its default mode supplies OptChat memory to ordinary coding-agent messages while keeping tools and execution in the host. Summary calls use the host registry and Pi Durable. The legacy `/optchat chat` mode still calls the full durable request controller. These persistence protocols are intentionally distinct; a memory checkpoint cannot guarantee replay of external host tools.

## Updating an existing host

rc.2 adds a storage-contract document and a required SDK preparation step. Existing task/document schemas stay version 1. Follow the [compatibility matrix and verified upgrade procedure](./upgrades.md); the qualification baseline is the published rc.1, and pending legacy work must be settled with its original version first. The exact built-in 0.1 prompt is still recognized without changing custom instructions, but that narrow regression is not a full upgrade qualification for every old release.
