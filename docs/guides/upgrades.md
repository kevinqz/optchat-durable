# Storage compatibility and upgrades

[SDK guide](./sdk.md) · [Offline recovery](./recovery.md) · [Release process](../development/releases.md)

These checks are **Unreleased**. The published `v0.4.0-rc.1` has no storage contract or
`optchat.prepare()` method. Use this guide when upgrading to a build containing the O3 changes;
do not apply a new example to an older package without checking its API.

## Compatibility matrix

| Source and requested change                                                                             | Supported route                                                                             |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| New store                                                                                               | Prepare and record the resolved configuration before opening the Harness                    |
| Current contract, same configuration and supported task/document versions                               | Reopen; same-implementation interrupted work can resume                                     |
| Settled `v0.4.0-rc.1` SDK/standalone store                                                              | Complete backup, explicit original `legacyConfig`, then one-time preparation                |
| Settled `v0.4.0-rc.1` native Pi archive                                                                 | Complete backup; the adapter uses the existing saved `config.json` for one-time preparation |
| Legacy archive with pending work                                                                        | Refused before adoption; settle using its original version/configuration first              |
| Changed model, compactor, memory/input/output budget, worker or retry settings                          | Refused; reopen with the stored configuration or use a new archive                          |
| Unknown `optchat.*` task/document kind or version, or unsupported storage implementation/runtime marker | Refused; recover with the original compatible implementation or a verified backup           |
| Run older code against a store changed by newer code                                                    | Not a qualified rollback; restore the pre-upgrade backup into a separate directory          |

Native Pi's `/model` remains available: it selects the **host's main model**. The saved memory
configuration continues to select the archive's compactor and budgets. The SDK/standalone main
model, in contrast, belongs to its durable request configuration and is covered by the contract.

All existing OptChat tasks and documents remain version 1. The additive session document family
`optchat.storage-contract`, member `runtime`, records implementation revision `1`, the qualified
Pi runtime `1.1.0`, and the complete resolved OptChat settings. It contains no credentials,
storage paths or host execution instructions. Changing a task/document schema or recovery
semantics requires an explicit compatibility decision; a package version alone is not a migration.

The cache correction adds the conversation document `optchat.view-policy` (version 1) for unfinished batch targets and the compactor partition. Existing summaries, main partitions and frozen receipts are preserved; the new state is initialized lazily, without rebuilding the log. The earlier O3 checker rejects this unknown kind after it is written. rc.1 predates that checker, so never rely on it to enforce a downgrade: restore a complete backup. In-flight prompts already checkpointed retain their original bytes; changed cache layout applies to newly prepared prompts.

## Prepare an SDK host

Hold exclusive ownership of storage and call `prepare` **before `Harness.open`**, on every open:

```js
const optchat = createOptChat({ main, compactor });
registry.install(optchat.extension);
await optchat.prepare(storage);
const harness = await Harness.open(
  storage,
  { registry, models, settings: optchat.settings },
  context,
);
```

`prepare(storage, options?, context?)` validates known OptChat task/document versions and the
stored configuration. On a new or explicitly adopted legacy store it writes the contract through
a public Pi Session transaction. On an already compatible store it makes no commit. It returns
`{ mode: "new" | "current" | "legacy", pendingTasks }` and never closes host-owned storage.
The host remains responsible for opening its backend safely, holding one writer, and shutdown.

The controller rejects operations that admit/resume work or update indexes until storage has
been prepared with its configuration. Passive receipt/history/status reads remain available.
Do not start a Harness scheduler before preflight, mutate the factory's frozen configuration,
or bypass the controller to submit/reset a managed conversation.

`openApp` performs preparation automatically. For its Node JSONL layout, preflight first reads
a writer-locked temporary copy: unsupported state is rejected before the original store is
opened for tail recovery. Hosts supplying their own backend own the corresponding snapshot/open
procedure. OptChat does not migrate another extension's documents or validate every Pi backend.

## Upgrade a legacy archive

1. With the **old version**, finish pending requests and background memory work. For SDK hosts,
   wait for each managed request and `settleMemory()`. Close the writer. Offline inspection can
   report remaining tasks without resuming them.
2. Preserve the complete archive and, for native Pi, the host session file. Keep the backup
   unchanged. Verify a copy in an isolated destination, including original retrieval and branch
   selection, before relying on it for rollback.
3. Use the original model and budget settings. Older SDK/standalone stores did not record every
   setting, so an explicit assertion is necessary; the package cannot reconstruct missing options.
4. Prepare the upgraded SDK/standalone store once, then verify originals before continuing work.

For an SDK host:

```js
const optchat = createOptChat(originalOptions);
await optchat.prepare(storage, { legacyConfig: originalOptions });
// Now open the Harness, attach the controller, and verify originals/branches.
```

For `openApp`:

```js
const app = await openApp(originalConfig, {
  legacyConfig: originalConfig,
  resume: false,
});
try {
  console.log(await app.zoom(0, 1));
} finally {
  await app.close();
}
```

For the CLI, with the original environment settings and a verified backup:

```sh
OPTCHAT_DATA_DIR="/path/to/upgraded-copy" optchat-durable status --adopt-legacy
```

Add `--demo` only if the original archive used the demo models. `--adopt-legacy` asserts the
supplied original settings; it does not bypass version or pending-work checks. Omit it on later
opens. Native Pi supplies this assertion from its existing `config.json`; a missing configuration
is not guessed. Its one-time adoption still rejects pending legacy work.

## Evidence and limits

`npm run check:upgrade` downloads the published rc.1 tarball and verifies SHA-256
`6f0e8bc5e3d74e97193773d8ea69ce7693ef01145149ae4d19498637d43cb33f` before installing it.
Separate consumers create old state, upgrade it, and verify exact original text, entry identity
and isolated SDK branches. A complete pre-upgrade backup is restored into another directory and
opened by the old implementation before being upgraded separately. The check also verifies
pending legacy work is rejected without changing source-file hashes, then completes it using
the old version. A native Pi session created with the actual candidate extension is reopened
with the current package and its original Pi entry identity is checked.

[Compatibility regressions](../../test/core/compatibility.test.ts) cover unknown versions,
unprepared admission, configuration mismatches, pending legacy work and source-byte preservation
before JSONL tail repair. The [public lifecycle example](../../examples/host-owned-lifecycle.mjs)
checks host models/tools, detached observation, durable cancellation and shutdown in a fresh
package consumer. The existing process-kill suite covers current-implementation recovery.

These are synthetic-provider checks, qualified on the CI matrix of the implementation revision.
They do not qualify in-flight migration from rc.1, code downgrade over changed state, Windows,
network filesystems, a Cloudflare backend or model/provider changes inside an existing archive.
