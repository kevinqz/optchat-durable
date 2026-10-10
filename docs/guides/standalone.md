# Standalone application

[Documentation index](../README.md) · [Configuration](../reference/configuration.md) · [Local HTTP API](../reference/http-api.md)

The standalone application is a local conversation with a durable queue, a browser interface and a CLI. It shares the memory engine with the Pi package, but does not operate a Pi coding-agent session. Its model tools only retrieve memory: no shell, project filesystem, browser or email tools are provided. The browser UI and interactive CLI prompts currently use Portuguese.

## Install and try without credentials

Use Node 22.19+ and npm on macOS or Linux. npm installs Pi Durable and the other runtime
dependencies automatically. No prior Pi/Pi Durable installation, repository checkout or build
is needed; this application has its own history and does not attach to an existing Pi session:

```sh
npm install -g https://github.com/kevinqz/optchat-durable/releases/download/v0.5.0/optchat-durable-0.5.0.tgz
optchat-durable --demo
```

Open <http://127.0.0.1:4317>. The demo runs real Pi Durable tasks, storage, queueing and memory operations. Responses and summaries are simulated; it does not test model intelligence or cache savings. Stop with `Ctrl+C`.

For a project-local installation, omit `-g` and use `npx optchat-durable`. There is no npm-registry release under the bare package name; use the complete GitHub artifact URL. The compiled artifact needs no TypeScript compiler or install-time build.

## Use a real provider

The built-in provider setup supports OpenAI and Anthropic. Set the chosen provider's key in your environment, or copy [`.env.example`](../../.env.example) to a private `.env` in the directory where you run the command. Existing environment variables take precedence over that file.

```sh
optchat-durable models
optchat-durable
```

`models` lists the pinned Pi AI catalog; presence in that catalog is not a guarantee that your provider account can access a model. See [configuration](../reference/configuration.md) for defaults and budget constraints. Real providers receive your request context and the content being summarized. The standalone app does not read or modify the coding-agent's login/settings files.

## Commands

| Command                      | Behavior                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `optchat-durable` or `serve` | Start the local browser interface; resume unfinished work                           |
| `chat`                       | Interactive terminal; resume unfinished work                                        |
| `ask "message"`              | Enqueue a new request, print its answer, then wait for memory preparation           |
| `status`                     | Show model references, memory, recent requests, task state and usage                |
| `zoom 0 1 [offset]`          | Retrieve original text at memory index 0; use returned byte offsets for later pages |
| `zoom 0 8`                   | Retrieve the two child summaries covering records 0 through 7                       |
| `search "text" [from]`       | Case-insensitive literal search; use returned `next` as `from` to continue          |
| `models`                     | List model IDs from the installed catalog                                           |
| `credits`                    | Print original authors and upstream attribution                                     |
| `--help`                     | Print the command summary                                                           |

Add `--demo` to any data command to use the demo configuration. `status`, `zoom` and `search` do not enable pending model work or require a model API key. They still open storage exclusively; retrieval can update its source index. Only one process may open a given data directory at a time, so stop the server before inspecting the same history through another CLI process.

In interactive `chat`, `/status` shows memory and usage, and `/sair` exits. Ordinary input is submitted as a request. In the browser, messages sent while an answer is running enter the durable queue. Neither standalone interface supports mid-response steering. The native [Pi package](./pi.md) retains Pi's steering.

The browser displays the most recent **50 requests**, a compact memory view, original-text pages, search and usage reported by Pi. Older indexed originals remain searchable. The browser shows committed state and partial text when available; it is not a second source of truth. Cancel stops a request without deleting its record. “Tentar como nova mensagem” copies a failed/cancelled request into the composer; submitting it creates a new request ID.

## Storage, backup and recovery

Defaults are relative to the command's **working directory**, not the installation directory:

```text
.optchat/live/             real-provider history
.optchat/demo/             simulated history
  .writer-lock.sqlite     process lock, not conversation storage
  pi/                     Pi Durable JSONL entries, documents and tasks
```

`OPTCHAT_DATA_DIR` overrides the directory. If you set it, keep real and simulated histories separate yourself. Standalone configuration is supplied again on each open; reopen with the same models and budgets. The coding-agent adapter separately persists its own configuration.

`Ctrl+C` closes the process while retaining unfinished durable work. Opening `serve`, `chat` or `ask` enables scheduling again. A waiting model call may be retried and billed again after a crash; durable input IDs do not make remote calls exactly-once. A summary failure blocks the next answer and remains visible. Fix its cause and submit a new request; do not edit JSONL files to reset the queue.

Stop the process and copy the **entire data directory** for a consistent backup. Restore into a separate local directory and explicitly choose it with `OPTCHAT_DATA_DIR`; inspect with `status` before enabling execution. Files are unencrypted and append-only. Network filesystems and concurrent cloud synchronization are not qualified. See [security](../../SECURITY.md).

The HTTP server listens only on `127.0.0.1`, validates Host/Origin and requires a custom header for mutations. It has no multi-user authentication and is not designed for public hosting.

## Run from a checkout

```sh
npm ci
npm run demo
npm run dev -- models
npm run dev -- ask "Remember project Aurora" --demo
npm run build
npm start -- --demo
```

Stop the earlier server before starting another command against its history. `npm ci` does not build compiled exports; the source commands use the development TypeScript loader. Run development commands from a checkout of the revision whose documentation you are reading.
