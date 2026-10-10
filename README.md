# OptChat Durable

[Português](./README.pt-BR.md) · [Documentation](./docs/README.md) · [Credits](./CREDITS.md) · [Contributing](./CONTRIBUTING.md)

[![CI](https://github.com/kevinqz/optchat-durable/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kevinqz/optchat-durable/actions/workflows/ci.yml)

**Hierarchical conversation memory for Pi.** OptChat Durable keeps original conversation records, builds a searchable tree of summaries, and supplies a bounded memory view to each new turn. The model can retrieve original text when a summary is insufficient.

This independent implementation combines **[Victor Taelin's OptChat design](https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449)** with **[Pi Durable](https://github.com/earendil-works/pi/tree/v1.1.0/packages/durable)** from **Mario Zechner, Earendil Works and the Pi contributors**. It uses official, unmodified Pi packages. No custom Pi distribution or separate OptMem installation is required. See [credits, source revisions and licensing boundaries](./CREDITS.md); upstream endorsement is not implied.

## Choose how to use it

| I want to…                                            | Start here                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Add memory to my normal Pi coding-agent conversations | **[Install in Pi](#install-in-pi)** — the recommended path for Pi users; keep Pi's tools, permissions and streaming |
| Try it without a model account or API charges         | **[Run the standalone demo](#try-the-standalone-demo)** — local browser chat with simulated responses               |
| Add memory and queued requests to my own application  | **[Use the TypeScript SDK](./docs/guides/sdk.md)** — bring your Pi Durable harness, providers and tools             |
| Contribute or run the source                          | **[Develop locally](#develop)** — clone, run the demo, then validate changes                                        |

The Pi package also retains the separate `/optchat chat` conversation from v0.3. It has its own history and queue; it is not the ordinary coding-agent conversation.

## Install in Pi

**Pi Durable is installed automatically as an OptChat dependency.** Pi is the terminal coding agent that provides the `pi` command; Pi Durable is the JavaScript/TypeScript runtime used by this integration. You do not need to install or configure that runtime separately. If you already build an application with the Pi Durable library, follow the [SDK integration guide](./docs/guides/sdk.md); adding OptChat to your own harness requires the documented code integration.

The release is **[0.4.1](https://github.com/kevinqz/optchat-durable/releases/tag/v0.4.1)**, qualified against **Pi 1.1.0** on **macOS and Linux** with **Node 22.19+**. Have Node, npm and Git available in your terminal. Other Pi versions and Windows are not qualified. The commands below pin the release; `main` can contain later changes listed under [Unreleased](./CHANGELOG.md#unreleased).

This release includes the fix for the cache-prefix bug in Taelin's October 8 Gist revision. Comparative answer quality and cache savings remain unmeasured; benchmarks are optional. See [cache behavior, native integration and measurement limits](./docs/reference/cache.md).

Upgrading from an earlier candidate? Finish pending work, close Pi and preserve a complete backup before installing 0.4.1. Follow the [upgrade procedure](./docs/guides/upgrades.md).

### Already using Pi

With Pi 1.1.0 installed (`pi --version`), run this in your project's directory:

```sh
pi install git:github.com/kevinqz/optchat-durable@v0.4.1
```

Then use `/reload` in your running Pi session, or start `pi`. Keep your existing login and selected model, and continue sending normal messages. OptChat imports the available text history on the selected session branch when preparing the next turn; it does not replay earlier tools. The first preparation of a long history can take additional time and summary calls. Use `/resume` if you want to reopen an older session.

### Starting from zero

With Node 22.19+, npm and Git available, run this in your project's directory:

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@1.1.0
pi install git:github.com/kevinqz/optchat-durable@v0.4.1
pi
```

The first command uses Pi's [official npm installation method](https://github.com/earendil-works/pi/blob/v1.1.0/packages/coding-agent/README.md#getting-started), pinned to the qualified version. The second installs OptChat and its runtime dependencies. There is no separate Pi Durable setup, repository clone or build step.

Inside Pi, use `/login` to connect your provider and `/model` to select a concrete model with a context window of at least 40k. OptChat uses those credentials; no additional credentials file is needed. For a credential-free trial, use the [standalone demo](#try-the-standalone-demo) instead.

### Verify either installation

Send these one at a time, waiting for each answer:

```text
My project is Aurora.
What is my project's name?
/optchat status
/optchat search Aurora
```

After the first completed turn, status should show `"started": true`, `"mode": "native"` and the archive directory. Search should return the original message containing `Aurora`. That verifies recording and retrieval independently of what the model answers. In a fresh session, `/optchat zoom 0 1` retrieves the first original record.

When asking the model to retrieve memory, specify the current Pi session if needed. The separate `/optchat chat` conversation has its own history; the [Pi guide](./docs/guides/pi.md) explains the tool's history selection.

Continue using Pi normally. Use `/resume` to reopen that session; `/new` starts a separate memory. The [Pi guide](./docs/guides/pi.md) also covers project-local installation and updates/removal.

Summary calls use your provider's normal billing. The compactor initially uses the selected model unless you set `--optchat-compactor provider/model-id`. Its configuration is saved with the archive. The [Pi guide](./docs/guides/pi.md) covers budgets, commands, sessions, updates and recovery.

## Try the standalone demo

Use Node 22.19+ on macOS or Linux. This path does not require a Pi CLI installation, a separate Pi Durable installation or a provider account; npm installs the required runtime dependencies:

```sh
npm install -g https://github.com/kevinqz/optchat-durable/releases/download/v0.4.1/optchat-durable-0.4.1.tgz
optchat-durable --demo
```

Open <http://127.0.0.1:4317> and send a message. The demo uses real local persistence and **simulated responses and summaries**; it makes no model API calls. By default, history is saved under `.optchat/demo/` in the directory where you ran the command. Stop with `Ctrl+C`; running it again in the same directory reopens that history. The demo's model tools only retrieve memory; it cannot run shell commands or edit project files.

The [standalone guide](./docs/guides/standalone.md) explains real providers, CLI commands and storage. Distribution is through GitHub releases; **no npm-registry publication is claimed**. Use the complete release URL.

## If your first run gets stuck

| Symptom                                    | Next step                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Pi does not recognize `/optchat`           | Check `pi list`, use `/reload`, and confirm the extension is enabled in `pi config`                                                         |
| Status shows `"started": false`            | Send a normal Pi message first; installation and status inspection alone do not create the archive                                          |
| Authentication or model error              | Check `/login` and `/model`; use a concrete model with at least 40k context. Read the displayed error before retrying                       |
| Archive is already open in another process | Close the process using that history before reopening it; each archive allows one writer                                                    |
| Demo port 4317 is occupied                 | If another application uses the port, run `OPTCHAT_PORT=4318 optchat-durable --demo`. Stop an earlier demo that uses the same history first |

See the [Pi recovery guide](./docs/guides/pi.md#recovery-boundaries) or [standalone storage guide](./docs/guides/standalone.md#storage-backup-and-recovery) for interrupted work. If the problem persists, [open a bug report](https://github.com/kevinqz/optchat-durable/issues/new?template=bug_report.yml) with versions and a synthetic reproduction. Report sensitive findings through [Security](./SECURITY.md).

The release also provides [offline archive inspection and export](./docs/guides/recovery.md), including journals left before Pi saved its first transcript. These commands do not start models or replay host actions.

SDK hosts built from current source must call `await optchat.prepare(storage)` before `Harness.open()`. The Pi adapter and `openApp` handle this automatically. See [compatibility and upgrades](./docs/guides/upgrades.md) before updating an existing archive.

## What the memory does

1. Indexes conversation text with references to its original records. Thinking blocks are excluded from memory.
2. Builds binary summaries, targeting 512 UTF-8 bytes per node by default. Short text can remain verbatim without a model call.
3. Maintains a bounded chronological view, retaining more detail for recent records. Budgets count bytes and markup, not exact tokens.
4. Freezes that view for a turn. The live input and tool loop remain complete; incomplete preparation stops the request.
5. Provides paginated original-text retrieval, literal case-insensitive search and timestamps. Summaries are an index, not proof of exact wording.

The [architecture](./docs/reference/architecture.md) distinguishes native Pi memory from SDK request execution. The [conformance review](./docs/reference/conformance.md) records adaptations to Taelin's design.

## Guarantees and limits

- **Memory is recoverable; perfect recall is not guaranteed.** A model can omit facts or fail to retrieve them. Quality, cache savings, cost and latency need real-provider evaluation.
- **Native Pi tool execution stays in Pi.** The adapter does not automatically replay external actions after a crash. Durable summary requests may be repeated and billed again.
- **Data is local and unencrypted.** Real providers receive model context and summary inputs. Context edits affect future views and retrieval; they do not erase append-only archives or backups.
- **Native `--no-session` is ephemeral.** Explicitly opening the separate durable chat still creates persistent data.
- **The web UI is single-user and loopback-only.** It is not a hosted service, semantic/vector search engine, or automatic memory of every file in a project. Its current interface language is Portuguese.

The **0.4.0** release consolidates native Pi memory, recovery and SDK integration. Its unchanged runtime passed **106 deterministic tests** and package/installation/upgrade checks on the [macOS/Ubuntu × Node 22.19/24 matrix](https://github.com/kevinqz/optchat-durable/actions/runs/37942322629). Real ChatGPT login, memory retrieval and native login renewal were also observed. The [release validation record](./docs/development/validation.md#functional-release-040) distinguishes those checks from unmeasured performance.

The repository includes frozen protocols and runners for [answer quality](./docs/development/evaluation.md) and [continuous cache use](./docs/development/cache-evaluation.md), both compared with ordinary Pi. Developers can also [evaluate through native Pi login with ChatGPT](./docs/development/pi-subscription-evaluation.md), using isolated histories and shared token/call limits without an API-key fallback. These extensive studies are optional and have not been run; they do not block installation or the companion project. Synthetic storage observations through 100k short records are tied to their recorded source revisions; they do not establish real-model quality or general large-archive performance.

The [roadmap](./docs/development/roadmap.md) separates the functional release from optional comparative research. The separate [Pi Durable Agent application](https://github.com/kevinqz/pi-durable-agent) has published its first operational 0.1.0 release with Cloudflare hosting, approved Code Mode session-note actions and coordinated checkpoints. Its [roadmap and qualification limits](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/roadmap.md) live in that repository. These application features are not dependencies or capabilities added to the OptChat memory package.

The [upstream composition review](./docs/development/upstream-composition.md) records what Pi already provides, why OptChat retains its preparation protocol, and the coordinated simplification work across both repositories.

## Develop

Clone the repository and start the source demo without model credentials:

```sh
git clone https://github.com/kevinqz/optchat-durable.git
cd optchat-durable
npm ci
npm run demo
```

Open <http://127.0.0.1:4317>. Stop the demo with `Ctrl+C` before another command opens the same history. Then validate your changes and try the SDK example:

```sh
npm run check:local
node examples/native-host.mjs
```

`npm run format` applies the repository style. To try the checkout as a Pi extension, run `pi -e .` from the repository root after `npm ci`; it uses TypeScript source and needs no build. Enable only one copy of OptChat in that profile. The SDK example uses a simulated provider and temporary in-memory storage.

These commands run from a checkout of this revision. `check:local` runs all engineering and distribution gates locally, without a push or GitHub Actions. Checks and the demo need no real model credentials; distribution checks need local loopback plus npm access or a populated cache. A [documented offline route](./docs/development/validation.md#run-without-github-or-registry-downloads) also uses a local, checksum-verified upgrade baseline. Ordinary Pi conversations use your selected provider. Start with the [repository map and conventions](./docs/development/repository.md), [contribution workflow](./CONTRIBUTING.md) and [release process](./docs/development/releases.md).

## License

[MIT](./LICENSE) for this repository's original code and documentation. The original OptChat gist is linked, not bundled or relicensed. Dependency licenses remain their own. [CITATION.cff](./CITATION.cff), [NOTICE](./NOTICE) and [third-party notices](./THIRD_PARTY_NOTICES.md) preserve attribution in the distribution. Run `optchat-durable credits` to read it locally.
