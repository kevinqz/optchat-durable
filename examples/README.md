# Native Pi Durable integration

[Run this example](./native-host.mjs) with `node examples/native-host.mjs` after `npm ci` in this repository. In another project, install the release tarball and copy the example there. It uses a simulated provider and ephemeral `MemoryStorage`, so it requires no credentials and is not a persistence example.

`createOptChat(config)` returns a normal Pi `Extension`, recommended harness settings, and `attach(harness, conversation, context)`. `attach` returns the conversation's queue and memory controller; it does not own the harness. There is no second model loop or custom Pi distribution.

## Integration contract

- Install the extension **before opening storage with `Harness.open`**, including on every restart. Persisted `optchat.*` tasks must resolve to their definitions before scheduling resumes. Create one factory per registry; its model and memory settings apply to all conversations managed by that factory.
- Use `optchat.settings` when opening the harness. Automatic compaction must remain disabled. These settings are harness-wide, so use a separate harness if other agents require different policies. The factory also disables provider and native generation retries; the compactor owns its bounded retry policy.
- Use a **dedicated conversation** and explicitly select `[optchat.extension]`. Other conversations can explicitly select different extensions. The managed conversation's model, medium thinking level, instructions, and extension selection are set by OptChat for each request. Custom tools and system instructions are not composed into that conversation in version 0.1.
- Submit every managed message through `chat.enqueue(text, requestId)`. Do not call `conversation.submit()`, `reset()`, `compact()`, or `configure()` independently while OptChat owns it. The controller is necessary for the durable queue and atomic context preparation; the hook only shapes cache-friendly text blocks.
- Reuse `requestId` with exactly the same text to recover the existing request. IDs are scoped to the conversation. `chat.wait(taskId)` waits for its answer; `chat.settleMemory()` waits for resulting memory work. `chat.request`, `status`, `history`, `zoom`, `search`, and `cancel` expose the other operations.
- The host chooses storage, authenticates model providers, enforces one writer, and calls `harness.resume()` after reopening if it wants to resume pending work immediately. `enqueue()` and `wait()` also enable native scheduling. Call `harness.close(context)` when the host shuts down. `attach()` has no close method.
- `makeModels(config)` supplies the standalone app's OpenAI/Anthropic provider setup and conservative payload guards. If you supply your own `Models`, you must ensure both configured models exist, are authenticated, and fit the memory/input/output budgets. `boundedProvider` is available to apply the same transport guard. No API credentials or environment files are loaded by merely importing the library.
- Peer versions are pinned to the tested upstream release. Do not use `--force` or `--legacy-peer-deps` to combine incompatible runtimes. Reopen using the same configuration; migration across task schema or provider changes is not automatic.

For a persistent application that does not already manage a harness, prefer `openApp(config)`. It sets up native JSONL persistence, a single-writer lock, providers, extension registration, and shutdown. `openApp` owns and closes even injected storage; use the factory/attach route to retain host ownership.
