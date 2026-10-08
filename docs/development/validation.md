# Validation

[Documentation index](../README.md) · [Contribution workflow](../../CONTRIBUTING.md)

Engineering checks establish reproducible behavior under specified conditions. They do not establish recall quality, lower model bills, cache-hit rates or community endorsement.

The [evaluation protocol](./evaluation.md) defines real-provider quality qualification separately from deterministic integrity and distribution checks. `eval:dry` uses synthetic responses and cannot pass its quality gates; `eval:storage` measures fsynced storage with no model network calls.

## Reproduce checks

Use the checked-out revision's lockfile and Node 22.19+:

```sh
npm ci
npm run check
npm run build
npm run check:package
npm run check:pi
npm run check:upgrade
```

| Check           | Evidence                                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check:format`  | Source, documentation and configuration parse and follow the pinned formatter                                                                                                           |
| `check:docs`    | Relative Markdown link paths and local heading anchors exist; remote URLs are not fetched                                                                                               |
| `typecheck`     | Application and test TypeScript compile under strict settings                                                                                                                           |
| `test`          | Pure memory rules, SDK/host behavior, HTTP boundaries and process-crash contracts                                                                                                       |
| `check:package` | A freshly packed artifact installs without build scripts; CLI, persistence, SDK example, UI assets and typed consumer work; attribution is present and private paths/files are excluded |
| `check:pi`      | Source-only package works without `dist`, compiler or package-local coding-agent/TUI; distributed Pi CLI installs, lists, runs ordinary input plus retrieval and removes it             |
| `check:upgrade` | Downloads the checksum-pinned rc.1 artifact; verifies settled SDK branch adoption, exact originals, complete backup restoration and unchanged rejection of pending legacy work          |

`check` runs the first four gates. No gate uses real model credentials or personal Pi settings. Tests create temporary or in-memory stores and deterministic providers. HTTP tests need loopback permission. Distribution checks need access to the npm registry or a populated cache; they do not prove a live provider account works.

For a focused regression run:

```sh
node --import tsx --test test/pi/native.test.ts
node --import tsx --test test/core/recovery.test.ts
```

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

The [manual PTY rehearsal](./onboarding-validation.md) covers install, reload, resume and removal. Pixel-level visual qualification of the interactive Pi terminal remains pending. Runtime bindings and CLI/protocol execution are different evidence from an inspected TUI. The [conformance review](../reference/conformance.md#qualification-needed-before-stronger-claims) specifies the evaluations needed for stronger claims.
