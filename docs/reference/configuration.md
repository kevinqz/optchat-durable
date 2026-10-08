# Configuration reference

[Documentation index](../README.md)

Configuration belongs to the entry point you use. The Pi package does not load the standalone CLI's `.env`; importing the SDK also does not load environment files.

## Pi package

| Setting                                 | Default                        | Scope                                                                                                             |
| --------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `--optchat-mode native`                 | `native`                       | Normal Pi messages use memory; `chat` disables that integration and selects the separate chat for default queries |
| `--optchat-compactor provider/model-id` | Selected Pi model at first use | Compactor saved with each new archive; does not change existing archives                                          |
| `--optchat-channel name`                | `default`                      | Extra namespace within a workspace; 1–64 letters, digits, `_` or `-`                                              |
| Pi `/model`                             | Host selection                 | Main model for ordinary Pi conversations; a separate chat saves its own main model at creation                    |
| Pi `/login`                             | Host authentication            | Requests delegate to the host registry; no tokens are copied into OptChat configuration                           |
| Pi `--no-session`                       | Host default persistence       | Native archive and journal stay in RAM; an explicitly requested separate chat remains durable                     |

Native paths are under Pi's session directory, scoped by workspace/channel and session ID. Separate chats use the workspace/channel scope. `/optchat status` and `/optchat chat status` report their respective paths.

On archive creation, budgets are derived from the smaller main/compactor context window:

- Output cap: minimum of 8,192, both models' output limits and one eighth of that window.
- Available allowance: window minus output cap minus 24,000.
- Input allowance: minimum of 32,000 and one quarter of the available allowance.
- Maximum memory view: minimum of 128,000 and the available allowance minus input allowance.

The native main view is further capped at one third of the currently selected model's window. The saved input/output limits primarily configure durable work; they do not replace the coding-agent's own generation options. A conservative projected-request check reserves output and overhead before dispatch. These checks compare text bytes against token-window limits as a conservative heuristic; they are not tokenizers. Large tool schemas, images or long live tool loops can still exceed provider limits.

Use a concrete model with at least a 40k window. Virtual routers, changes to a saved compactor and cross-version migration of pending work are not qualified. `/model` can change the main native model; a new turn may coarsen memory further for a smaller window. Memory is not split again merely because a larger model is selected.

## Standalone environment

The CLI loads `.env` in its working directory. Existing environment values take precedence. `configFromEnv(env)` reads the object passed to it, defaulting to `process.env`; it does not open `.env` itself.

| Variable                     | Default                                                    | Meaning                                                         |
| ---------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| `OPTCHAT_PROVIDER`           | `openai`; `anthropic` when only `ANTHROPIC_API_KEY` is set | Built-in main provider; accepts `openai` or `anthropic`         |
| `OPENAI_API_KEY`             | Unset                                                      | OpenAI authentication when selected                             |
| `ANTHROPIC_API_KEY`          | Unset                                                      | Anthropic authentication when selected                          |
| `OPTCHAT_MODEL`              | `gpt-6-sol` / `claude-opus-4-8`                            | Main model for the chosen provider                              |
| `OPTCHAT_COMPACTOR_PROVIDER` | Main provider                                              | Built-in summary provider                                       |
| `OPTCHAT_COMPACTOR_MODEL`    | `gpt-6-luna` / `claude-haiku-4-5`                          | Summary model for its provider                                  |
| `OPTCHAT_DEMO`               | Off; enabled only by `1` or CLI `--demo`                   | Simulated responses and summaries using `faux/optchat-demo`     |
| `OPTCHAT_DATA_DIR`           | `.optchat/live` or `.optchat/demo`                         | Data directory resolved against the working directory           |
| `OPTCHAT_PORT`               | `4317`                                                     | CLI server port, integer 0–65,535; 0 requests an available port |
| `OPTCHAT_VIEW_BYTES`         | `128000`                                                   | Maximum rendered view, 4,096–256,000 UTF-8 bytes                |
| `OPTCHAT_COMPACTOR_JOBS`     | `8`                                                        | Maximum concurrently scheduled summary jobs, 1–8                |
| `OPTCHAT_MAX_INPUT_BYTES`    | `32000`                                                    | Maximum new SDK/standalone message, 512–128,000 bytes           |
| `OPTCHAT_MAX_OUTPUT_TOKENS`  | `8192`                                                     | Durable provider output cap, 512–32,768 tokens                  |

These model names describe the configured defaults, not recommendations or account-access guarantees. `optchat-durable models` lists IDs in the installed Pi AI catalog. Both models must satisfy the conservative view + input + 24,000 overhead + output allowance. Smaller models may require smaller budgets. The app reports incompatible budgets before starting execution.

## SDK options

`createOptChat({ main, compactor, ...options })` requires two `{ provider, modelId }` references. All numeric options below must be safe integers. `openApp` additionally takes `directory` and `demo`; `configFromEnv` constructs those application options.

| Option            | Default | Range / interpretation                                                            |
| ----------------- | ------- | --------------------------------------------------------------------------------- |
| `nodeBytes`       | 512     | 64–16,000; summary target, not a guaranteed maximum after exhausted size attempts |
| `viewBytes`       | 128,000 | 4,096–256,000; hard limit on the complete rendered view before a request starts   |
| `jobs`            | 8       | 1–8; includes the next long leaf and ready parents                                |
| `sizeTries`       | 5       | 1–5 completed outputs; keeps the shortest nonempty summary                        |
| `retryMs`         | 10,000  | 0–300,000 milliseconds between failed summary executions                          |
| `failureTries`    | 3       | 1–10 failures before the summary task stops                                       |
| `maxInputBytes`   | 32,000  | 512–128,000; validates new controller input                                       |
| `maxOutputTokens` | 8,192   | 512–32,768; used by supplied provider guards                                      |

The SDK factory returns harness settings with automatic compaction and native/provider retries disabled, parallel tool execution, short cache retention, and a 120-second stream timeout. These settings are harness-wide. A custom `Models` implementation must enforce its own authentication and context/output limits, or use the exported `boundedProvider` helper. The factory does not wrap arbitrary host providers automatically.

See the [SDK lifecycle contract](../guides/sdk.md) before attaching an existing harness. Treat model references, task definitions and saved configuration as part of your recovery contract.
