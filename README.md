# OptChat Durable

[Português](./README.pt-BR.md) · [Documentation](./docs/README.md) · [Credits](./CREDITS.md) · [Contributing](./CONTRIBUTING.md)

**Hierarchical conversation memory for Pi.** OptChat Durable keeps original conversation records, builds a searchable tree of summaries, and supplies a bounded memory view to each new turn. The model can retrieve original text when a summary is insufficient.

This independent implementation combines **[Victor Taelin's OptChat design](https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449)** with **[Pi Durable](https://github.com/earendil-works/pi/tree/v1.1.0/packages/durable)** from **Mario Zechner, Earendil Works and the Pi contributors**. It uses official, unmodified Pi packages. No custom Pi distribution or separate OptMem installation is required. See [credits, source revisions and licensing boundaries](./CREDITS.md); upstream endorsement is not implied.

## Choose how to use it

| Entry point                                       | What it provides                                                                             | Who executes tools and model requests                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **[Pi package](./docs/guides/pi.md)**             | Memory for ordinary Pi coding-agent conversations, following the selected session and branch | Pi keeps its existing execution, permissions, streaming and steering; Durable runs summary tasks |
| **[Standalone app](./docs/guides/standalone.md)** | Local browser chat and CLI with a durable request queue                                      | Pi Durable; the model has only memory retrieval tools                                            |
| **[TypeScript SDK](./docs/guides/sdk.md)**        | Memory and queued requests in your own Pi Durable host                                       | Your harness, providers and explicitly selected tools                                            |

The Pi package also retains the separate `/optchat chat` conversation from v0.3. It has its own history and queue; it is not the ordinary coding-agent conversation.

## Install in Pi

The published candidate is **[0.4.0-rc.1](https://github.com/kevinqz/optchat-durable/releases/tag/v0.4.0-rc.1)**, qualified against **Pi 1.1.0** on **macOS and Linux** with **Node 22.19+**. Other Pi versions and Windows are not qualified.

```sh
pi install git:github.com/kevinqz/optchat-durable@v0.4.0-rc.1
pi
```

In an already-running Pi session, use `/reload`. Sign in through Pi's `/login`, select a concrete model with `/model`, and **send normal messages**. No build step or additional credentials file is needed for this integration.

```text
My project is Aurora.
What is my project's name?
/optchat status
/optchat search Aurora
/optchat zoom 0 1
```

Summary calls use your provider's normal billing. The compactor initially uses the selected model unless you set `--optchat-compactor provider/model-id`. Its configuration is saved with the archive. The [Pi guide](./docs/guides/pi.md) covers budgets, commands, sessions, updates and recovery.

## Try the standalone demo

```sh
npm install -g https://github.com/kevinqz/optchat-durable/releases/download/v0.4.0-rc.1/optchat-durable-0.4.0-rc.1.tgz
optchat-durable --demo
```

Open <http://127.0.0.1:4317>. The demo uses real local persistence and **simulated responses and summaries**; it makes no model API calls. The [standalone guide](./docs/guides/standalone.md) explains real providers, CLI commands and storage. Distribution is through GitHub releases; **no npm-registry publication is claimed**. Use the complete release URL.

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

The published candidate passed **40 deterministic tests**, macOS/Ubuntu × Node 22.19/24 CI, package installation and process-crash recovery checks. [Validation](./docs/development/validation.md) separates that evidence from unqualified provider, multimodal and performance behavior.

## Develop

```sh
npm ci
npm run check
npm run build
npm run check:package
npm run check:pi
```

These commands run from a checkout of this revision. They need no real model credentials; the distribution checks need npm access and local loopback. Start with the [repository map and conventions](./docs/development/repository.md), [contribution workflow](./CONTRIBUTING.md) and [release process](./docs/development/releases.md).

## License

[MIT](./LICENSE) for this repository's original code and documentation. The original OptChat gist is linked, not bundled or relicensed. Dependency licenses remain their own. [CITATION.cff](./CITATION.cff), [NOTICE](./NOTICE) and [third-party notices](./THIRD_PARTY_NOTICES.md) preserve attribution in the distribution. Run `optchat-durable credits` to read it locally.
