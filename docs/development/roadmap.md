# OptChat Durable roadmap

[Documentation index](../README.md) · [Conformance](../reference/conformance.md) · [Companion agent roadmap](./agent-roadmap.md)

Consolidate OptChat Durable as an independently usable memory package before implementing
the companion agent. The companion will consume a published OptChat version through its public
SDK. Memory fixes belong here; hosting, external-action policies and the complete agent experience
belong in the companion repository.

## Baseline and scope

The original qualification baseline is **v0.4.0-rc.1**. The memory tree, original-text retrieval, native Pi
integration, frozen views and durable SDK request queue are implemented. The candidate has
[40 deterministic tests and distribution/recovery evidence](./validation.md#published-candidate-evidence).
This establishes specific engineering behavior, not real-model recall, production cost or
compatibility with arbitrary hosts. The corrective **v0.4.0-rc.2** candidate includes O1/O3, evaluation infrastructure and the
[upstream cache correction](../reference/cache.md). It does not complete real-provider O2
qualification or the consolidated O4 release; see the [changelog](../../CHANGELOG.md).

The consolidation target covers textual memory through the existing Pi package, standalone app
and SDK, initially on the already qualified Pi/Node/macOS/Linux matrix. A stable release must
state its tested boundaries. It does not require perfect recall, every provider, Windows,
visual-memory understanding or a Cloudflare deployment.

## Priority and dependencies

**Scope revision, 2026-10-09:** ship the functional integration with proportional verification.
Extensive quality/cache benchmarks are an optional research track, not a release or companion
prerequisite. This changes the delivery scope; it does not mark an unrun experiment as passed,
change frozen protocols, or establish performance claims.

**O1 and O3 are complete.** [PR #2](https://github.com/kevinqz/optchat-durable/pull/2)
closed the integrity/recovery gaps; [PR #3](https://github.com/kevinqz/optchat-durable/pull/3)
qualified SDK consumers and upgrades. The **0.4.1** runtime passed 106 local tests plus package,
Pi installation and restore checks, and the [four-environment CI matrix](https://github.com/kevinqz/optchat-durable/actions/runs/38057840294).
**O2a functional verification is complete:** real login, memory retrieval, reopening,
[native OAuth renewal and a subsequent response](../../eval/results/pi-oauth-renewal-20261009.json)
were observed with Pi 1.1.0 / `openai/gpt-5.5`. Injected failures and synthetic rehearsals
remain separately labelled. **O2b benchmarks are deferred and unmeasured.**

| Order | Milestone                          | Status / dependency                                                               | Completion evidence                                                             |
| ----- | ---------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| O1    | Integrity and recovery             | Complete                                                                          | [Integrity map](./integrity.md) and regressions                                 |
| O2a   | Functional model integration       | Complete                                                                          | Local checks and scoped live authentication/retrieval evidence                  |
| O3    | SDK and upgrades                   | Complete                                                                          | Fresh consumers, compatibility and isolated restoration                         |
| O4    | Consolidated functional release    | Complete: [0.4.0](https://github.com/kevinqz/optchat-durable/releases/tag/v0.4.0) | [Public package/install/download record](../../eval/results/release-0.4.0.json) |
| O2b   | Comparative quality/cache research | Optional; deferred                                                                | Unchanged frozen protocols and complete real-provider studies                   |

O4 was completed in 0.4.0 under the revised functional scope. The current release is
[0.5.0](https://github.com/kevinqz/optchat-durable/releases/tag/v0.5.0), which exposes optional
read-only storage compatibility preflight through the SDK. The earlier 0.4.2 patch rejects
unrelated task receipts in a conversation's `wait()` operation. The companion's
[0.1.1 release](https://github.com/kevinqz/pi-durable-agent/releases/tag/v0.1.1) still pins 0.4.1;
its production input path uses `enqueue`, `request` and `status`, not the corrected `wait` helper.
Its 0.4.1 dependency already centralizes read-only request-failure inspection and validates
storage through `prepare`. The newer SDK helpers do not change memory algorithms, stored
formats or dependencies.
For new changes, run relevant regressions and
verify the final distribution artifact. Reuse existing results for unchanged runtime/dependency
code; do not repeat extensive studies or storage workloads simply to publish documentation.
A future performance claim still requires O2b evidence. There is no benchmark allowance
request pending as part of this delivery scope.

## Current coordinated work

The [upstream composition delivery](./upstream-composition.md) is complete: the memory patch is published,
the companion consumes its immutable artifact, and its exact 0.1.0 → 0.1.1 update has separate preservation evidence.
Generic memory defects still take priority here when a reproducible case appears.

The companion's main branch now explains checkpoint capacity and compatibility after server updates.
Those native Cloudflare snapshots belong to the application. Follow the
[companion's canonical roadmap](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/roadmap.md)
for its implementation and qualification. New connectors require a concrete use case, and optional O2b studies
remain deferred rather than being treated as unfinished functional delivery.

The current integration increment exposes the existing storage validator as optional SDK
`check()` preflight; the [focused validation](./validation.md#sdk-storage-preflight-050)
records rejection and no-write behavior. No broader host compatibility is implied.

## O1 — Integrity and recovery

**Deliverables**

- Map each applicable [conformance requirement](../reference/conformance.md) to existing tests,
  a missing regression or an explicit adaptation. Extend the current suite instead of
  rebuilding already verified functionality.
- Cover missing interruption windows around source commit, summary commit, view freeze,
  request admission and answer delivery. Preserve the exact frozen context, source identity,
  branch isolation and single-writer contract after restart.
- Make the recovery procedure for an archive whose first Pi transcript was never saved
  reproducible. Provide inspection and export where needed; do not synthesize a host tool run
  or automatically repeat an uncertain external action.
- Exercise exhausted summary retries, unavailable providers, oversized inputs and cancellation.
  Failures must remain visible, cancellable and recoverable without a raw-history fallback or
  an unbounded retry loop. Preserve `--no-session`, permissions and the complete live turn.

**Exit gate:** every in-scope requirement has a test or documented adaptation; all integrity,
cross-session isolation and fail-closed regressions pass on the supported matrix. There are
no known unresolved source-loss, duplicate-admission, permission-bypass or recovery blockers.
Tests use synthetic data; native memory recovery and SDK execution recovery remain distinct.

## O2 — Functional verification and optional research

### O2a — Functional verification

Verify installation, ordinary Pi input, summary preparation, exact original retrieval and
reopening. Check the documented login route, including native refresh, and retain targeted
failure/recovery regressions. These observations are recorded in [validation](./validation.md).
The release states the tested host/provider configuration and its limitations.

### O2b — Optional quality/cache research

The deliverables below remain available for future research. They are not required to use,
release or integrate the package. Their numerical gates still apply if a study is run;
no deferred or failed study becomes successful through this scope revision.

**Research deliverables**

- Add a versioned evaluation corpus, runner and result format. Cover decisions, corrections,
  identifiers, numeric facts, long-distance retrieval and instruction-shaped tool output.
  Include branches and records above the view budget. Use synthetic or explicitly licensed
  public material, not personal histories.
- Before real-provider runs, commit the protocol: exact model/provider versions, corpus hashes,
  budgets, repeated-run count, scoring rules, numerical quality thresholds, acceptable
  baseline regression and cost/latency limits. Real runs require configured credentials and an
  explicit spending cap for API billing, or authorized token/call limits for subscription studies; keep secrets outside source control. A research study cannot pass while
  its numerical criteria are unset.
- Compare with ordinary Pi using the same tasks, models and resource accounting. Add a
  documented Taelin-protocol baseline before claiming parity with that reference. Specify
  treatment of history overflow, tool-output caps and caching so comparisons are interpretable.
- Measure source-retrieval correctness separately from final-answer accuracy. Report each
  category, uncertainty across repeated runs, failed attempts and abstentions. Count all
  summary, retry and main-model calls; report tokens/cache usage, archive growth and p50/p95
  preparation time. Run synthetic storage workloads at 1k, 10k and 100k records and report
  the largest tested workload separately from paid quality experiments.
- Run live API-key/provider smoke tests for every provider combination selected for the
  release, plus OAuth refresh if OAuth is advertised as qualified. Combine those observations
  with reproducible injected timeout, rate-limit and network-failure tests. Do not present
  injected errors as observed provider incidents.

**Research exit gate:** all predeclared criteria pass for the advertised comparison, raw sanitized
results and commands are available, and failures have regressions or narrower documented
support. Threshold changes require a new protocol and new runs; they cannot retroactively
turn a failed experiment into a pass. Optional providers and unmeasured features stay explicitly
unqualified. A numerical performance comparison never substitutes for O1 integrity checks.

## O3 — SDK and upgrade contracts

**Deliverables**

- Exercise fresh consumers of `optchat-durable` and `optchat-durable/extension`, with host-owned
  models, tools, storage, cancellation and shutdown. Require the public controller input path;
  preserve all three entry points and avoid another memory engine.
- Define compatibility for stored task/document versions, provider/model changes and memory
  budgets. Add missing compatibility checks so unsupported state is rejected before mutation,
  with an actionable migration or recovery path.
- Qualify an upgrade from the published candidate with settled work and a complete backup.
  Verify restoration into an isolated destination, including original retrieval and branch
  state. Downgrading code over newly written state is not the rollback procedure.
- Test in-flight upgrades only for combinations we intend to support. Otherwise detect and
  require settling pending work, or reopening it with its original supported version. Record
  the supported route rather than claiming automatic migration.
- Keep the extension entry point independent of the Node app/server lifecycle. Generic API
  gaps exposed by the companion design can be addressed here with focused tests; actual
  Cloudflare storage, wake-up and deployment qualification belongs to companion A1.

**Exit gate:** a clean SDK consumer runs without private imports, the supported upgrade and
restore paths pass, and unsupported combinations fail before changing stored data. Publish
the compatibility matrix and procedures with the release.

## O4 — Onboarding and consolidated release

**Deliverables**

- Recheck fresh installation and adoption of an existing Pi session, including an inspected
  interactive terminal flow, `/reload`, `/resume`, removal and retained history. Keep login,
  selected model and unrelated configuration intact. Verify standalone and SDK consumers too.
- Give users visible preparation progress, useful failure/recovery instructions and clear
  explanations of provider charges, local data and supported limits. Keep both READMEs aligned.
- Follow the [release process](./releases.md): retain evidence for unchanged runtime code,
  build and verify the final package, then check the public Pi tag, download and checksum.
  Repeat broader engineering tests when runtime/dependency changes or a failure justify them.
- Publish the O1/O2a/O3 evidence, known limits and compatibility matrix with the release. Select
  the version from the actual API/schema changes; do not promise `1.0` solely from finishing
  this list. Publishing to npm is an optional distribution decision, not a prerequisite.

**Exit gate:** the exact published artifact passes its checks, the documented installation
paths work, and the release accurately states its evaluated support. The companion can then
pin this release and begin A1. Independent feedback is welcome; it is not implied endorsement.

## Later work

Use focused measurements to justify performance optimizations. Candidates include summary cost/latency, cache
behavior, cross-session reuse and larger archives. Windows, virtual model routers, visual
memory and arbitrary context-rewriting extensions need their own evidence before support is
expanded. The [upstream cache correction](../reference/cache.md) now uses public Pi payload
hooks; the warm-cache protocol is frozen, while real measurements remain part of O2 qualification.
Cloudflare, Code Mode and self-deployment stay outside this
package's completion criteria.

## Tracking and handoff

Each milestone update should link its implementation PRs, acceptance results and remaining
failures. Passing checks for a planning change do not complete a milestone. Keep completed
evidence in [validation](./validation.md) and user-visible behavior in the changelog.

The companion's first operational version is [Pi Durable Agent 0.1.0](https://github.com/kevinqz/pi-durable-agent/releases/tag/v0.1.0). Its current scope, evidence and remaining application work are maintained in [its own roadmap](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/roadmap.md); this repository does not duplicate that changing delivery log.

## Next integration gates

Broader hosts must preserve their native behavior while adopting OptChat. Before claiming
support for an additional application, qualify its public pre-open storage hook, every input
path, model selection, attachments, steering, forks and nested tool-result provenance. The
current SDK remains a text-input controller with an archive-bound model/configuration contract.
Its optional `check()` preview now complements required `prepare()`; a host still needs its own
pre-open integration point, safe storage opening and exclusive ownership.
Installing the Pi coding-agent package does not automatically integrate another application's
Pi Durable harness. Add generic capabilities here first, then qualify a concrete consumer;
do not duplicate the host's scheduler, interface or authorization layer.

The completed [two-repository composition review](./upstream-composition.md) remains the ownership
reference. Preserve stored contracts and qualify exact dependency updates. Optional O2b
quality/cache research remains unmeasured.
