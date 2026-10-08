# Integrity and recovery qualification

[OptChat roadmap](./roadmap.md#o1--integrity-and-recovery) · [Validation](./validation.md) · [Recovery procedure](../guides/recovery.md)

This is the O1 requirement-to-test map. All fixtures are synthetic, with deterministic providers.
The map establishes observable storage and integration behavior; it does not establish summary
quality, real provider reliability, exactly-once external effects or community endorsement.
These engineering changes ship in the corrective rc.2 candidate. O2 real-provider qualification
and the consolidated O4 release remain pending.

## Conformance coverage

| Requirement                                      | Evidence or explicit adaptation                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete original text and source identity       | [Boundaries](../../test/core/boundaries.test.ts), [native archive](../../test/pi/archive.test.ts), [commit windows](../../test/core/commit-windows.test.ts); UTF-8 originals compared exactly after restart                                                                                                               |
| Journal before the first host flush              | [Orphan recovery](../../test/pi/orphan.test.ts) kills the real Pi runtime after the extension's journal commit and before host message persistence; exported parent/entry IDs remain available                                                                                                                            |
| Binary summaries and contextual compactor        | [Tree](../../test/core/tree.test.ts), [boundaries](../../test/core/boundaries.test.ts): binary coverage, detailed prior view, isolated context and target blocks, five size attempts, bounded parallel parents                                                                                                            |
| Bounded rendered view and incremental coarsening | [Tree](../../test/core/tree.test.ts), [boundaries](../../test/core/boundaries.test.ts), [archive](../../test/pi/archive.test.ts): UTF-8 markup budget, chronological coverage and no changes to an already frozen receipt                                                                                                 |
| Fresh complete user input                        | [Boundaries](../../test/core/boundaries.test.ts), [failure limits](../../test/core/failures.test.ts), [native Pi](../../test/pi/native.test.ts): earlier context projected, new input retained, invalid/oversized input rejected before SDK admission                                                                     |
| Stable current-turn view                         | [Archive](../../test/pi/archive.test.ts), [native Pi](../../test/pi/native.test.ts), [commit windows](../../test/core/commit-windows.test.ts): reopen, coarsening, concurrent receipt IDs, steering, tools and persisted freeze                                                                                           |
| No incomplete/raw-history fallback               | [Failure limits](../../test/core/failures.test.ts), [boundaries](../../test/core/boundaries.test.ts), [native Pi](../../test/pi/native.test.ts): failed summaries block inference; context-hook failure explicitly aborts                                                                                                 |
| Queue order and duplicate admission              | [Runtime](../../test/core/runtime.test.ts), [queue cancellation](../../test/core/queue.test.ts), [commit windows](../../test/core/commit-windows.test.ts): stable request ID, text mismatch rejection, active predecessor remains a barrier after middle cancellation                                                     |
| Zoom, date and original search                   | [Tree](../../test/core/tree.test.ts), [runtime](../../test/core/runtime.test.ts), [native Pi](../../test/pi/native.test.ts), [Pi extension](../../test/pi/extension.test.ts): paging and original references; native host exposes one namespaced tool                                                                     |
| Reasoning exclusion and source attribution       | [Boundaries](../../test/core/boundaries.test.ts), [native Pi](../../test/pi/native.test.ts): reasoning omitted from memory, live signatures preserved, context edits and tool permissions honored                                                                                                                         |
| Session/branch isolation                         | [SDK extension](../../test/core/extension.test.ts), [archive](../../test/pi/archive.test.ts), [native Pi](../../test/pi/native.test.ts): separate conversations, selected ancestry, common-prefix reuse, `/new`, `/fork`, `/resume` and reload                                                                            |
| Single endless conversation                      | SDK/standalone and legacy channel are linear; native Pi deliberately follows its own session/tree boundaries, covered above                                                                                                                                                                                               |
| Cache-friendly layout                            | [Boundaries](../../test/core/boundaries.test.ts), [native Pi](../../test/pi/native.test.ts): separate view/new-input blocks and unchanged live suffix; provider cache savings are an O2 measurement                                                                                                                       |
| Exact gist cache markers                         | Corrected merge order, batched persisted views and four-line blocks; public Anthropic payload hooks preserve host cache policies. Loopback wire tests verify placement; real cache parity remains unqualified. See [cache behavior](../reference/cache.md)                                                                |
| No cache-renewal pings                           | [Native Pi](../../test/pi/native.test.ts): `cache_warming_decision` stops renewal without changing user settings                                                                                                                                                                                                          |
| Finite failure/size retries and cancellation     | [Failure limits](../../test/core/failures.test.ts), [boundaries](../../test/core/boundaries.test.ts), [queue](../../test/core/queue.test.ts), [native Pi](../../test/pi/native.test.ts): configured limits, retained originals, Escape and durable cancellation; bounded failures deliberately replace indefinite retries |
| Persistence, one writer and exact recovery       | [Core recovery](../../test/core/recovery.test.ts), [commit windows](../../test/core/commit-windows.test.ts), [Pi recovery](../../test/pi/recovery.test.ts), [orphan recovery](../../test/pi/orphan.test.ts): SIGKILL, fsync, writer exclusion, exact resumed provider context, read-only source snapshots                 |
| No-session and host-owned permissions            | [Native Pi](../../test/pi/native.test.ts), [SDK extension](../../test/core/extension.test.ts): ephemeral native archive, unchanged permissions/persona, tool allowlist refusal and compactor isolation                                                                                                                    |
| Subagents/remote execution                       | Explicit scope boundary: the host may supply them. OptChat does not implement another worker system or qualify external-action replay                                                                                                                                                                                     |

## Commit-window matrix

[The worker](../../test/fixtures/commit-window-worker.ts) wraps Pi Durable's **public Storage
commit boundary**, without production hooks. For each row, a real child process is killed
immediately before the commit or after storage has persisted it but before the caller adopts
the result. The same directory is reopened by a new process owner.

| Window                           | Assertions after recovery                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| SDK request admission            | Retrying the same request ID produces one durable request; different text is rejected                  |
| User source entry                | Exactly one complete user message; exact Unicode original remains retrievable                          |
| Summary publication              | The persisted compactor answer is adopted without another provider call, on either side of publication |
| View freeze + request checkpoint | Exactly one view for each request; already committed frozen bytes are reused                           |
| Main answer entry                | Before commit a provider call may repeat; after commit its answer is reused without another call       |
| Request result receipt           | Committed answer/delivery state is reused; duplicate enqueue attaches to the same task                 |

Separate existing SIGKILL tests compare the **entire provider context** for an interrupted
summary and an SDK answer containing a memory-tool loop. The native recovery test verifies
memory work can resume without replaying the preceding host prompt/tool work. These are
storage/process failures, not an experiment with live provider billing or external effects.

## Defects closed by O1

- A cancelled queued request can become terminal before its own predecessor. Previously the
  following request could prepare early and fault on an active Pi run. Preparation now follows
  cancelled/failed predecessor links and waits for the remaining active task. Existing v1
  checkpoints retain their shape; the recheck happens before writing preparation state.
- Two native freezes could both observe a missing receipt and publish different histories to
  one request ID. Receipt identity is now checked inside the publishing transaction as well as
  at initial lookup; callers always receive the winning receipt's conversation identity.
- Orphan journals had no supported offline inspection/export command. The recovery API and CLI
  read an isolated copy through public Pi storage, retain provenance and refuse overwrites.

## Reproduce and interpret

```sh
node --import tsx --test test/core/queue.test.ts test/core/failures.test.ts
node --import tsx --test test/core/commit-windows.test.ts test/pi/archive.test.ts test/pi/orphan.test.ts
npm run check
npm run check:package
npm run check:pi
```

O1 was completed by [PR #2](https://github.com/kevinqz/optchat-durable/pull/2): **59 tests** and
both distribution gates passed on macOS/Ubuntu × Node 22.19/24 for commit
`24213c30c54e792511fd757fe95c765c3cc6f9d3` in
[CI run 37722483271](https://github.com/kevinqz/optchat-durable/actions/runs/37722483271).
Real-provider and upgrade qualification remain separate O2/O3 gates; later revisions must run
their own checks.
