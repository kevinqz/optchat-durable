# Validation

[Documentation index](../README.md) · [Contribution workflow](../../CONTRIBUTING.md)

Engineering checks establish reproducible behavior under specified conditions. They do not establish recall quality, lower model bills, cache-hit rates or community endorsement.

The [evaluation protocol](./evaluation.md) defines real-provider quality qualification separately from deterministic integrity and distribution checks. `eval:dry` uses synthetic responses and cannot pass its quality gates; `eval:storage` measures fsynced storage with no model network calls.

## Reproduce checks

Use the checked-out revision's lockfile and Node 22.19+:

```sh
npm ci
npm run check:local
```

| Check           | Evidence                                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check:format`  | Source, documentation and configuration parse and follow the pinned formatter                                                                                                           |
| `check:docs`    | Relative Markdown link paths and local heading anchors exist; remote URLs are not fetched                                                                                               |
| `typecheck`     | Application and test TypeScript compile under strict settings                                                                                                                           |
| `test`          | Pure memory rules, SDK/host behavior, HTTP boundaries and process-crash contracts                                                                                                       |
| `check:package` | A freshly packed artifact installs without build scripts; CLI, persistence, SDK example, UI assets and typed consumer work; attribution is present and private paths/files are excluded |
| `check:pi`      | Source-only package works without `dist`, compiler or package-local coding-agent/TUI; distributed Pi CLI installs, lists, runs ordinary input plus retrieval and removes it             |
| `check:upgrade` | Uses the checksum-pinned rc.1 artifact; verifies settled SDK branch adoption, exact originals, complete backup restoration and unchanged rejection of pending legacy work               |

`check` runs the first four gates; `check:local` runs all of them sequentially and stops at the first failure. No gate uses real model credentials or personal Pi settings. Tests create temporary or in-memory stores and deterministic providers. HTTP tests need loopback permission. Distribution checks need access to the npm registry or a populated cache; they do not prove a live provider account works.

For a focused regression run:

```sh
node --import tsx --test test/pi/native.test.ts
node --import tsx --test test/core/recovery.test.ts
```

## Run without GitHub or registry downloads

No engineering gate needs GitHub Actions. `check:upgrade` normally downloads the published
rc.1 baseline; set `OPTCHAT_UPGRADE_BASELINE` to use a saved copy instead. Both routes verify
SHA-256 `6f0e8bc5e3d74e97193773d8ea69ce7693ef01145149ae4d19498637d43cb33f` before building
or installing consumers. An absent, unreadable or altered local baseline fails the check;
it is never replaced by a download or by the current source.

After installing the checkout dependencies and populating npm's cache for distribution
consumers, run:

```sh
OPTCHAT_UPGRADE_BASELINE=/absolute/path/to/optchat-durable-0.4.0-rc.1.tgz \
  npm_config_offline=true npm run check:local
```

An initial connected `npm run check:local` can populate those consumer dependencies; retain
the original rc.1 tarball separately. `npm ci` alone may not cache every fresh consumer's
dependency, because those checks intentionally install the public package into an empty
project. With npm offline mode enabled, a missing cache entry fails visibly instead of
fetching it. Without a local baseline, the offline upgrade check also fails before any download.
This is npm's offline policy plus a local artifact path, not an operating-system network sandbox.
Local HTTP loopback is still used. The original individual check commands remain available.

The credential-free evaluation runners are separate, longer local checks:

```sh
npm run eval:dry -- --output /tmp/optchat-local-quality-01
npm run eval:cache:dry -- --output /tmp/optchat-local-cache-01
```

Use new output directories and keep generated profiles outside the checkout. Both run the real
Pi lifecycle with synthetic providers and cannot pass real-model quality/cache gates. The
[storage workloads](./evaluation.md#storage-scale-is-a-separate-experiment) are also local;
the 100k case consumes substantial disk, time and RAM and is intentionally a separate command.
Local success applies to the tested OS, architecture and Node version. Additional environments
need their own execution; a macOS result does not establish a Linux result.

The [2026-10-08 local validation record](./local-validation.md) covers macOS and Ubuntu on
Node 22.19.0/24.21.0, including Linux containers with networking disabled. Its recorded source
revision and limits apply; later edits need checks appropriate to the change.

## Coverage map

O1 was merged in [PR #2](https://github.com/kevinqz/optchat-durable/pull/2), with **59 tests** and
both distribution gates passing on the [four-environment matrix](https://github.com/kevinqz/optchat-durable/actions/runs/37722483271).
This is newer implementation evidence, not a replacement of the published rc.1 artifact.

The [O1 integrity map](./integrity.md) connects each conformance requirement to its test or
explicit adaptation and documents the before/after-commit fault-injection boundaries.

| Area                                                                                                          | Test sources                                                                                 |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Binary intervals, incremental coarsening, UTF-8 markup budgets and pagination                                 | [tree](../../test/core/tree.test.ts)                                                         |
| Queueing, duplicate IDs, complete sources, size retries, failure blocking and concurrent summaries            | [runtime](../../test/core/runtime.test.ts), [boundaries](../../test/core/boundaries.test.ts) |
| Host-owned SDK lifecycle, tool policy, persona and compactor isolation                                        | [extension](../../test/core/extension.test.ts)                                               |
| SIGKILL during a durable answer and summary; exact context and writer exclusion                               | [core recovery](../../test/core/recovery.test.ts)                                            |
| Loopback HTTP, admission, foreign origin/Host and private-file boundaries                                     | [server](../../test/core/server.test.ts)                                                     |
| Ordinary Pi prompts, mode bindings, tools, steering, context edits, cancellation and session/model lifecycle  | [native Pi](../../test/pi/native.test.ts)                                                    |
| Prefix-summary reuse and frozen views across coarsening/reopen                                                | [archive](../../test/pi/archive.test.ts)                                                     |
| SIGKILL during native preparation without replaying prior host work                                           | [Pi recovery](../../test/pi/recovery.test.ts)                                                |
| Separate chat, commands, authentication checks, channels and explicit recovery                                | [Pi extension](../../test/pi/extension.test.ts)                                              |
| Middle cancellation and exhausted failure/size limits                                                         | [Queue](../../test/core/queue.test.ts), [failures](../../test/core/failures.test.ts)         |
| SIGKILL before/after admission, source, summary, freeze, answer and receipt commits                           | [Commit windows](../../test/core/commit-windows.test.ts)                                     |
| Evaluation scoring, budget recovery, real provider adapter against loopback faults and native dry-run sources | [Evaluation](../../test/core/evaluation.test.ts)                                             |
| First-host-flush orphan journal, source byte preservation and export                                          | [Orphan recovery](../../test/pi/orphan.test.ts)                                              |

## Cache correction checks

The [upstream cache correction](../reference/cache.md) adds deterministic coverage for corrected
merge order (20,001 rollback-counter steps), persisted sawtooth targets, independent compactor
views, exact block reconstruction, native public payload hooks, cancellation and failed/reentrant
concurrent starts. A real Pi Anthropic adapter is exercised against a synthetic local HTTP
server to inspect cache markers and opt-out; it does not contact Anthropic or measure hits.
Token-weighted cache accounting is tested independently from per-request rates.

The full 16-case dry evaluation was repeated after the correction: both arms completed with
no orchestration failures and all 1,264 OptChat source records recovered exactly. This is
synthetic integration evidence. The earlier storage timing reports remain tied to their recorded
source revision; they are not new-algorithm performance measurements.

## Continuous cache evaluation infrastructure

The [separate frozen cache protocol](./cache-evaluation.md) has a real-Pi synthetic rehearsal
and tests for shared spending reservations, legacy ledgers, sanitized prefix evidence and
incomplete-report rejection. Locally, **93 tests** and package/Pi consumer checks passed; the
[reviewed rehearsal](../../eval/results/cache-dry-v1-macos-20261008.json) records 180 turns in
each arm and all 681 native originals. The original quality protocol hash is unchanged and
its full 16-case paired dry run passed again. Live qualification still needs credentials and
an explicitly authorized shared cap. Each local or CI result applies to its recorded source
revision and environment.

## Corrective rc.3 candidate

rc.3 packages the native footer correction, the frozen continuous-cache evaluation and the
local/offline verification route. It retains Pi 1.1.0, existing public APIs and stored schemas.
The final revision passed **93 tests** plus package, Pi installation and rc.1 upgrade checks
locally on macOS ARM64 and Ubuntu 24.04 ARM64 containers, each with Node 22.19.0 and 24.21.0.
Linux test containers had networking disabled; macOS used npm's offline mode and the local
checksum-pinned rc.1 baseline. The [release record](https://github.com/kevinqz/optchat-durable/releases/tag/v0.4.0-rc.3)
contains source/tree identity, exact tarball checksum, local log hashes and public-install results.
These local gates do not depend on GitHub Actions.

The [earlier local workload record](./local-validation.md) still identifies its own implementation
revision. Its synthetic quality/cache, storage and browser observations are not new measurements
of rc.3. The release has no real-provider quality/cache result and does not complete O2 or O4.

## Corrective rc.2 candidate

The cache implementation was merged in [PR #5](https://github.com/kevinqz/optchat-durable/pull/5),
with **87 tests** plus package, Pi installation and rc.1 upgrade gates passing in all four
[CI environments](https://github.com/kevinqz/optchat-durable/actions/runs/37732716544). rc.2 also
contains O1/O3 and the evaluation tooling. Its release metadata change requires its own matrix
and exact-artifact verification; the [release record](https://github.com/kevinqz/optchat-durable/releases/tag/v0.4.0-rc.2)
records the final source, CI and checksum. Real-provider O2 and consolidated O4 remain pending.

## Published candidate evidence

For **v0.4.0-rc.1**, commit `c99354b52ca1f214632d97d55cad2c26c2612a55`:

- **40 deterministic tests** passed. Native tests used the real `AgentSessionRuntime`, with TUI/print/RPC extension bindings.
- The [release-tag CI matrix](https://github.com/kevinqz/optchat-durable/actions/runs/37707942399) passed macOS/Ubuntu × Node 22.19/24, including both distribution gates.
- The public Git tag was installed and removed in an isolated profile. Normal print input and two turns over the real JSONL RPC subprocess completed.
- The [release artifact](https://github.com/kevinqz/optchat-durable/releases/tag/v0.4.0-rc.1) was installed as a fresh consumer and downloaded again; its SHA-256 matched the attached checksum.
- A production-dependency audit reported zero known vulnerabilities at that time. This is a dated observation, not a permanent guarantee.

That released artifact predates the repository/documentation reorganization and has 122 packaged files. Later revisions must run their own gates; file counts and an older passing check do not qualify a new artifact. [CI](https://github.com/kevinqz/optchat-durable/actions/workflows/ci.yml) records results for subsequent revisions. Detailed earlier records remain in [validation history](./validation-history.md).

## Not established by these checks

Real-model summary quality and retrieval accuracy; real OAuth refresh, provider rate limits and network failures; provider-specific cache/cost/latency distributions; visual-memory behavior; virtual model routing; arbitrary context-transforming extensions; Windows; network filesystems; million-message scalability; or exactly-once external actions.

The [manual PTY rehearsals](./onboarding-validation.md) cover install, reload, resume and removal, including the public rc.2 tag. The correction released in rc.3 distinguishes frozen prior-context counts from stored originals in the native footer. Pixel-level visual qualification of the interactive Pi terminal remains pending. Runtime bindings and CLI/protocol execution are different evidence from an inspected TUI. The [conformance review](../reference/conformance.md#qualification-needed-before-stronger-claims) specifies the evaluations needed for stronger claims.
