# Use OptChat inside Pi

This package includes an adapter for the **Pi coding-agent terminal**, using Pi's documented extension API. The adapter opens the same Pi Durable engine used by the standalone app and SDK. It adds a durable chat, commands and retrieval inside your existing Pi installation.

Qualified with **Pi 1.1.0**, Node **22.19+**, macOS and Linux. It needs no custom Pi distribution, separate API-key configuration, compiler, or global OptChat CLI installation. Other Pi versions and Windows have not been qualified.

## Install

```sh
pi install git:github.com/kevinqz/optchat-durable@v0.3.0
pi
```

If Pi is already running, use `/reload`. If needed, sign in with Pi's `/login` and select a model with `/model` before starting the chat. The adapter delegates requests to `ctx.modelRegistry.streamSimple()`, including Pi's request-time authentication, OAuth refresh, custom model configuration and provider routing. It never copies tokens to an OptChat configuration file.

Project-local installation is also supported:

```sh
pi install -l git:github.com/kevinqz/optchat-durable@v0.3.0
```

Pi applies its normal project-trust rules. To test a development checkout, run `npm ci` there and then `pi -e /absolute/path/to/optchat-durable`. Pi loads the TypeScript entry directly; changes need `/reload`, not a build step.

## Talk and retrieve

In Pi's interactive terminal:

```text
/optchat
/optchat ask Remember that my project is Aurora.
/optchat ask What is my project called?
/optchat status
/optchat search Aurora
/optchat zoom 0 1
```

`ask` queues the message durably and returns control to the terminal. The footer shows pending work. Replies appear when complete, using Pi's Markdown rendering. You can queue more prompts or run `/optchat cancel [request-id]`; omitting the ID selects the oldest pending request in the recent queue. Cancellation preserves original history. Requests run in order; there is no mid-response steering or token-by-token rendering in this adapter yet.

The coding agent also receives a read-only `optchat_memory` tool with `search`, `zoom` and `status` actions. It can retrieve the chat's original messages when you ask it to use them. Follow `next` with `from` for search pages, and `next` with `offset` for original-text pages. Search and retrieval do not call a model or resume pending work. The index may catch up with newly committed entries during a read.

The slash commands use the interactive TUI. The retrieval tool also works through Pi's normal SDK/print/RPC tool loop. For scripted OptChat prompts, use the existing OptChat CLI or typed SDK.

## History, models and recovery

History belongs to the **working directory and channel**, shared across Pi sessions and `/tree` branches. It does not depend on Pi saving a chat transcript first. The default channel is `default`; choose another to isolate history or start with a different model configuration:

```sh
pi --optchat-channel research
pi --optchat-channel research-fast --optchat-compactor openai/gpt-6-luna
```

Channel names contain 1–64 letters, digits, underscores or hyphens. On first use, the chat adopts Pi's selected model. The summary model defaults to that same model; `--optchat-compactor provider/model-id` selects a different available model **for a new channel**. The adapter derives conservative memory/input/output budgets from both context windows. Models too small for the minimum budgets are rejected.

Model references and budgets are saved with the channel and kept on recovery. Later `/model` changes affect the coding agent; they do not rewrite an existing durable chat's configuration or pending tasks. Start a new channel to use new model settings. Model calls and summarization use your provider's normal billing; a large/expensive selected model is also the default compactor. Usage is recorded by Pi Durable and shown by `/optchat status`, separately from the coding agent's session totals.

`/optchat status` shows the exact data location: an `optchat-durable/<workspace-channel-hash>` subdirectory under Pi's session directory. It includes a credential-free `config.json`, a writer lock and the native Pi JSONL store. Files are local and unencrypted. Keep the entire directory for backups, with Pi closed. Removing the package does not delete this data.

Only one process can open a workspace/channel at a time. Use different channels for simultaneous terminals. Quit, reload and session replacement close the harness and release the lock, preserving unfinished tasks. Opening Pi or inspecting status does **not** automatically resume billable work. Use:

```text
/optchat resume
```

This resumes the harness and displays pending/recovered answers from the most recent 50 requests. The full original history remains available through search and zoom. Sending a new `ask` also resumes the durable queue. An interrupted external model call can be retried and billed again; durable execution cannot make a provider's API exactly-once.

## What this integration manages

The OptChat chat retains its own hierarchical memory, queue, frozen contexts, documents, checkpoints and cancellation, all through Pi Durable. Its models have the existing memory tools only. The adapter does not forward coding tools into a separately persisted runtime.

**Ordinary Pi coding-agent messages are not automatically imported or compacted by OptChat.** Their prompts, tools, context and execution remain managed by the coding agent. OptChat replies are rendered as native custom entries excluded from its model context; explicit calls to `optchat_memory` bring retrieved material into a coding turn. Pi's `/tree` does not rewind the independent OptChat history.

Replacing the coding agent's own memory or execution would require a different integration and separate recovery/branching guarantees. A `context` or compaction hook by itself cannot provide Pi Durable's task durability. This adapter therefore provides a native installation and UI while keeping the durable engine authoritative for OptChat requests.

## Update, remove and verify

```sh
pi list
pi config
pi install git:github.com/kevinqz/optchat-durable@v0.3.0
pi remove git:github.com/kevinqz/optchat-durable@v0.3.0
```

Use the appropriate newer tag when updating; a pinned Git reference does not float to a newer release. Drain pending work and summaries, close Pi, and back up the data before an upgrade. Migration while an external call is in flight is not qualified. Reinstalling the package does not migrate the standalone app's separate data directories.

`npm run check:pi` installs runtime dependencies without development dependencies, removes compiled output in the fixture, runs real `pi install/list/remove` in a temporary profile and exercises retrieval through the **distributed bundled Pi CLI**, using a fake provider. `npm test` also exercises commands, reload/shutdown, cancellation, recovery and the source loader through Pi's real SDK. No tests use personal settings or real model credentials.

Sources: Pi's [package contract](https://pi.dev/docs/latest/packages) and [extension API](https://pi.dev/docs/latest/extensions), checked against the published 1.1.0 types. The installation is public through GitHub; there is no npm-registry release. See [credits](./CREDITS.md) for Victor Taelin, Mario Zechner, Earendil Works and the Pi contributors.
