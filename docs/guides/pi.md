# Use OptChat inside Pi

The package supplies hierarchical memory to **ordinary Pi coding-agent conversations** through
Pi's public extension APIs. Pi Durable owns the archive, summaries and frozen views; the coding
agent keeps its tools, permissions, streaming, steering and selected model. No custom Pi build
or additional CLI process is required.

Release candidate **0.4.0-rc.1** targets **Pi 1.1.0**, Node **22.19+**, macOS and Linux. Other
Pi versions and Windows have not been qualified. Read the [integration review](../reference/conformance.md)
for the exact conformance matrix and remaining evaluation work.

## Install and talk normally

**Already using Pi 1.1.0?** Install only the OptChat package below. Pi Durable and Chord are
installed automatically as its dependencies; keep your existing Pi login and model.
**Starting without Pi?** Follow the [complete first installation](../../README.md#starting-from-zero),
then return here. The `pi` command belongs to the coding agent; the Pi Durable SDK alone does not
provide it. Applications that already use that SDK follow the [SDK integration guide](./sdk.md).

```sh
pi install git:github.com/kevinqz/optchat-durable@v0.4.0-rc.1
pi
```

Use `/reload` in an already-running Pi session. If necessary, sign in with Pi's `/login` and
choose a model with `/model`. Then send ordinary messages:

```text
My project is Aurora. Please inspect its README.
What did we learn about Aurora?
/optchat status
/optchat search Aurora
/optchat zoom 0 1
/optchat date 0
```

When adding OptChat to an existing Pi session, wait for the current turn to finish, install the
package, use `/reload`, and continue normally. The next turn imports the available textual history
on the selected branch. A long history can require additional preparation time and summary calls;
unrelated sessions are not imported. To continue a closed session, open it with `/resume`.

The first request creates the archive. Subsequent turns wait for complete summaries of prior
history, then receive a frozen memory view followed by your full new message. Pi's live tool
loop remains intact. Escape cancels preparation; failed preparation stops the main request
instead of substituting partial history. Long current tool loops can still fill a model's
context; in that case start a new turn or choose a larger model. No tool is automatically replayed.

The `optchat_memory` tool provides `status`, `search`, `zoom` and `date`. Original retrieval
includes the native Pi entry ID and timestamp. Continue searches with `from=next`, and original
text pages with `offset=next`, until `next` is null. These reads do not call a model. Slash
commands are interactive-terminal commands; ordinary prompts and the tool also work in Pi's
SDK, print and RPC modes.

If you use an explicit `--tools` allowlist, include `optchat_memory`. The adapter will not
silently override your tool policy. The status footer indicates preparation, retained memory
records or a blocked request. `/compact` is managed by OptChat while native mode is active;
Pi's settings file is not rewritten. Cache-renewal pings are disabled in this mode.

Project-local installation is supported:

```sh
pi install -l git:github.com/kevinqz/optchat-durable@v0.4.0-rc.1
```

Pi applies its usual project-trust rules. For development, run `npm ci` in the checkout and
`pi -e /absolute/path/to/optchat-durable`; the source loader needs no build or prepare script.

## Sessions, models and data

- `/new` starts an isolated memory. `/resume` uses that session's existing archive.
- `/tree` follows the selected ancestry, excludes discarded siblings and reuses summaries
  belonging entirely to the common prefix. Returning to an old branch reuses its archive.
- `/fork` starts another session from the selected ancestry. Its new archive imports originals
  and rebuilds summaries; cross-session summary-cache sharing is not implemented.
- `--no-session` keeps native memory and its journal in RAM. Closing it discards that memory.
- `/model` selects the main model normally. The compactor is selected when the archive is first
  created: the same model by default, or `--optchat-compactor provider/model-id`.

```sh
pi --optchat-compactor provider/model-id
```

The compactor and budgets are saved with the archive. Changing a saved compactor or migrating
pending tasks across model/schema versions is not supported. A smaller main model can require
more coarsening on its next turn. The complete new message and live tool results are never
silently truncated. Summary calls use your provider's normal billing; selecting an expensive
main model also selects it for summaries unless you set the compactor flag. `/optchat status`
reports summary usage separately from Pi's main-session usage.

Requests delegate to the live `ctx.modelRegistry.streamSimple()`, including request-time
authentication and routing. No credentials are copied into OptChat's configuration. Real
external OAuth refresh has not been qualified by this project's deterministic tests.
Use a concrete model with a context window of at least 40k. Virtual model routers have not
been qualified; request guards currently use the selected model's declared limits.

`/optchat status` reports the exact data directory, under Pi's session directory and scoped
by workspace, channel and Pi session ID. It contains credential-free `config.json`, native
Pi JSONL storage and an OS-backed writer lock. Independent Pi sessions have separate writers.
A second process opening the same archive is rejected. `--optchat-channel name` provides an
additional namespace; names contain 1–64 letters, digits, underscores or hyphens.

Data is local, unencrypted and append-only. Back up both Pi's session file and the complete
OptChat directory with Pi closed. Removing the package does not delete data. Context redactions
are honored by future memory views and normal retrieval; they do not erase originals from
archives or backups. Images remain in originals and the live turn, but visual recall is not
implemented by the textual summary tree.

## Recovery boundaries

Opening Pi, viewing status and retrieving originals do not resume summary calls. A new normal
prompt resumes the memory work it needs. Completed turns schedule background summaries. Close
and reload preserve pending tasks. Recovery tests kill real processes during durable summary
requests and compare the resumed request's complete context.

Completed messages are journaled before Pi's message-end handler returns, without reasoning
blocks. If a crash happens before Pi writes its first session file, the durable directory can
contain the only copy; `config.json` records its original session ID/path. Inspect that material
explicitly. This package does not fabricate a Pi execution transcript from the journal.
The [offline recovery guide](./recovery.md) explains how to identify, inspect and export that
archive without resuming models or modifying its source files.

The native coding agent's **external actions are not durable tasks in this adapter**. A crash
after an action but before its result is recorded leaves uncertainty; confirm the external
state before retrying. An interrupted summary API call can be repeated and billed again.
Partial streaming output before message completion is not treated as a committed message.

Other extensions that replace historical context, remove the current input or rewrite request
payloads may conflict. OptChat detects a changed input/history and stops its request. Its abort
contract requires providers to honor Pi's abort signal; arbitrary later extension rewrites or
non-cooperative custom providers are outside the guarantee. See the review for details.

## Existing v0.3 users: the separate durable chat

Existing workspace/channel data is preserved and is not silently mixed into native sessions:

```text
/optchat chat ask Remember a shared project fact.
/optchat chat status
/optchat chat search project
/optchat chat zoom 0 1
/optchat chat cancel
/optchat chat resume
```

The previous `/optchat ask`, `/optchat cancel` and `/optchat resume` aliases still address that
separate chat. Its responses appear as custom entries outside the coding agent's context;
`optchat_memory` with `scope: "chat"` explicitly retrieves them. That chat uses memory tools
only, with its own durable request queue. Its history is shared by workspace/channel, and
`/tree` does not rewind it. `resume` displays receipts from the most recent 50 requests;
originals remain searchable beyond that window.

To retain the previous default behavior entirely:

```sh
pi --optchat-mode chat
```

In this mode, `status/search/zoom` and the tool's default scope address the separate chat.
`scope: "session"` or `scope: "chat"` explicitly selects which history a tool call reads.
`--no-session` does not make an explicitly requested separate durable chat ephemeral.

## Update, remove and verify

```sh
pi list
pi config
pi install git:github.com/kevinqz/optchat-durable@v0.4.0-rc.1
pi remove git:github.com/kevinqz/optchat-durable@v0.4.0-rc.1
```

Use a newer tag when updating; pinned references do not float. Settle pending work, close Pi
and back up before upgrading. A cross-version update while a provider call is in flight is
not qualified. No npm-registry publication is claimed.

The Unreleased implementation adds [storage compatibility checks](./upgrades.md). It adopts a
settled rc.1 native archive using its saved configuration and refuses pending legacy work or
unknown schemas before changing source history. New `/optchat status` output includes
`pendingTasks`; zero means no durable tasks remain in that archive at inspection time.

`npm run check:pi` tests a source-only package without a compiler or `dist`, real Pi
install/list/remove, ordinary main prompts and retrieval through the **distributed bundled
Pi CLI**, using a deterministic provider and a temporary profile. `npm test` exercises real
SDK/runtime lifecycle, branches, cancellation, failures, permissions and crash recovery.
No tests depend on personal Pi settings or real credentials.

Sources: Pi's [package contract](https://pi.dev/docs/latest/packages) and
[extension API](https://pi.dev/docs/latest/extensions), checked against the official 1.1.0
implementation. [Credits](../../CREDITS.md) identify Victor Taelin, Mario Zechner, Earendil Works
and the Pi contributors without implying endorsement.
