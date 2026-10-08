# Inspect and export a stopped archive

[Documentation index](../README.md) · [Pi guide](./pi.md) · [Integrity evidence](../development/integrity.md)

These commands are new under **Unreleased**; the published `v0.4.0-rc.1` executable does not
contain them. From a current checkout, run `npm ci` and `npm run build`, then use
`node dist/cli.js` in place of `optchat-durable` below.

Use this procedure to inspect an archive without resuming tasks, including a crash before Pi
saved its first session file. It reads committed evidence and exports it for review. An export
is **not** an executable Pi transcript or a complete backup of the task/document database.

## Choose the correct directory

Close the Pi session or standalone process that owns the archive. If it is still running,
inspection fails with `Another OptChat process owns ...`; do not remove its lock file.

- Native Pi: `/optchat status` reports the data directory. Each Pi session has a separate
  directory below `<Pi session directory>/optchat-durable/<workspace-channel-hash>/sessions/`.
  Its `config.json` identifies the original host session ID, file path and working directory.
- Separate `/optchat chat`: use `/optchat chat status`; its directory is scoped by workspace
  and channel, not by the current native session.
- Standalone: use the configured `OPTCHAT_DATA_DIR`, normally `.optchat/live` or `.optchat/demo`.

Pass the directory **containing** `pi/`, not the Pi transcript file or the `pi/` directory itself.
When the host transcript is absent, inspect candidate session directories and match the
reported host metadata. A missing `config.json` is reported, not replaced with guessed values.

## Inspect without starting work

```sh
optchat-durable archive inspect "/path/to/optchat-data"
```

The JSON result reports host metadata, conversation and entry counts, counts by entry kind,
pending-task count, and SHA-256/byte size for each copied storage/configuration file. Inspection
does not load model credentials, construct a Harness, resume tasks or create a host transcript.
Paths and session identifiers can still be private; review before sharing the report.

The command acquires OptChat's OS-backed writer lock, copies the storage and optional
configuration into a private temporary directory, releases the lock, and reads the copy using
Pi Durable's public storage API. Pi can repair an incomplete JSONL tail on open, so repair is
limited to this disposable copy. Source history and configuration bytes are untouched. The
separate `.writer-lock.sqlite` coordination file may be created/opened. Temporary files are
removed on normal success or failure; an OS kill can leave a private temporary copy.

Incomplete, uncommitted tails are not exported as completed evidence. Complete corrupt records
cause an error. Symbolic links inside the copied storage are rejected. Filesystem/network-share
semantics outside the supported local macOS/Linux matrix are not qualified.

## Export committed evidence

```sh
optchat-durable archive export "/path/to/optchat-data" "/path/to/recovered-evidence.jsonl"
```

The output must be a **new file outside the source data directory**. Existing files are never
overwritten; the new file is created with mode `0600`. Export streams records instead of building
one large in-memory JSON object. The report printed after success has the same shape as inspection.

The versioned JSONL format is `optchat-archive`, version `1`:

| Record type    | Contents                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `manifest`     | Format version, capture time, source path, source-file hashes and host metadata                        |
| `conversation` | Pi Durable conversation identity and ancestry/ownership                                                |
| `entry`        | Exact committed entry plus its commit sequence; each entry is emitted once, at its owning conversation |
| `pending-task` | Task identity, kind/version, conversation and status; no replay instruction                            |
| `summary`      | Final inspection counts and source-file manifest, marking a completed export                           |

Entries include native `optchat.pi.journal` messages and their parent reference, selected
`optchat.source` records, and any standalone/summary conversation entries stored in that archive.
Native journal/source capture excludes reasoning; other stored entries are exported unchanged.
The export can contain originals, tool arguments/results, context-redacted historical content
and provider data already in the archive. Keep it private unless reviewed and sanitized.

A journal preserves what was committed before the host finished saving its transcript. It does
not establish whether an interrupted external action happened, and it does not establish that
the host received a response. Inspect the external destination before deciding to retry an
uncertain action. Recover relevant text into a new conversation deliberately; this command
does not import or execute it automatically.

## Backups and SDK use

For a restorable backup, with the writer stopped, preserve the **complete** OptChat directory
and the corresponding Pi session file. Keep the original backup unchanged and verify restoration
in a different directory with the same supported versions. The evidence export omits durable
document bodies and submission records and cannot substitute for this backup.

Node applications can use the same public functions without opening an app:

```js
import { inspectArchive, exportArchive } from "optchat-durable";

const inspection = await inspectArchive("/path/to/optchat-data");
console.log(inspection.pendingTasks);
await exportArchive("/path/to/optchat-data", "/path/to/new-evidence.jsonl");
```

These functions operate on OptChat's Node JSONL directory layout. A host that supplies another
storage backend owns its snapshot/export procedure. No Cloudflare or SQLite-host recovery is
implied by this interface.
