# OptChat Durable roadmap

[Documentation index](../README.md) · [Conformance](../reference/conformance.md) · [Companion agent roadmap](./agent-roadmap.md)

Consolidate OptChat Durable as an independently usable memory package before implementing
the companion agent. The companion will consume a published OptChat version through its public
SDK. Memory fixes belong here; hosting, external-action policies and the complete agent experience
belong in the companion repository.

## Baseline and scope

The published baseline is **v0.4.0-rc.1**. The memory tree, original-text retrieval, native Pi
integration, frozen views and durable SDK request queue are implemented. The candidate has
[40 deterministic tests and distribution/recovery evidence](./validation.md#published-candidate-evidence).
This establishes specific engineering behavior, not real-model recall, production cost or
compatibility with arbitrary hosts. Documentation and organization changes after the candidate
remain listed under [Unreleased](../../CHANGELOG.md#unreleased).

The consolidation target covers textual memory through the existing Pi package, standalone app
and SDK, initially on the already qualified Pi/Node/macOS/Linux matrix. A stable release must
state its tested boundaries. It does not require perfect recall, every provider, Windows,
visual-memory understanding or a Cloudflare deployment.

## Priority and dependencies

**O1 is in progress:** queue/receipt race fixes, offline recovery and commit-window regressions
are implemented in the working revision. The [integrity map](./integrity.md) lists the evidence;
the full supported CI matrix must pass before O1 is complete. O2–O4 remain planned.
Until O4 is complete, implementation effort stays on OptChat; companion work is limited to its
scope and integration design. If real-provider experiments await credentials or a spending
limit, continue the independent O3/O4 preparation rather than expanding the companion.

| Order | Priority | Milestone                            | Depends on                             | Completion evidence                                                    |
| ----- | -------- | ------------------------------------ | -------------------------------------- | ---------------------------------------------------------------------- |
| O1    | P0       | Close integrity and recovery gaps    | Existing candidate                     | Requirement-to-test map and missing failure-window regressions         |
| O2    | P0       | Measure memory and provider behavior | O1; evaluation setup can start earlier | Reproducible real-provider report with predeclared acceptance criteria |
| O3    | P1       | Qualify SDK and upgrades             | O1                                     | Public-consumer, compatibility and backup/restore evidence             |
| O4    | P1       | Publish the consolidated release     | O1, O2 and O3                          | Verified public package, onboarding and release dossier                |

P0 work takes precedence over enhancements. O3 can advance while O2 experiments run; O4
preparation can advance, but publication requires all preceding evidence. Set dates after O1
sizes the remaining defects and O2 fixes the experiment budget. These are acceptance gates,
not delivery-date promises.

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

## O2 — Memory quality and real providers

**Deliverables**

- Add a versioned evaluation corpus, runner and result format. Cover decisions, corrections,
  identifiers, numeric facts, long-distance retrieval and instruction-shaped tool output.
  Include branches and records above the view budget. Use synthetic or explicitly licensed
  public material, not personal histories.
- Before paid runs, commit the protocol: exact model/provider versions, corpus hashes,
  budgets, repeated-run count, scoring rules, numerical quality thresholds, acceptable
  baseline regression and cost/latency limits. Real runs require configured credentials and an
  explicit spending cap; keep secrets outside source control. A milestone cannot pass while
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

**Exit gate:** all predeclared criteria pass for the advertised configuration, raw sanitized
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
- Run the full [release process](./releases.md) on the final revision: CI matrix, build, Pi
  source installation, compiled tarball, attribution, public download and checksum verification.
- Publish the O1–O3 evidence, known limits and compatibility matrix with the release. Select
  the version from the actual API/schema changes; do not promise `1.0` solely from finishing
  this list. Publishing to npm is an optional distribution decision, not a prerequisite.

**Exit gate:** the exact published artifact passes its checks, the documented installation
paths work, and the release accurately states its evaluated support. The companion can then
pin this release and begin A1. Independent feedback is welcome; it is not implied endorsement.

## Later work

Optimize only against the O2 measurements. Candidates include summary cost/latency, cache
behavior, cross-session reuse and larger archives. Windows, virtual model routers, visual
memory and arbitrary context-rewriting extensions need their own evidence before support is
expanded. The gist's exact cache markers are an upstream API capability question, not a reason
to patch private provider payloads. Cloudflare, Code Mode and self-deployment stay outside this
package's completion criteria.

## Tracking and handoff

Each milestone update should link its implementation PRs, acceptance results and remaining
failures. Passing checks for a planning change do not complete a milestone. Keep completed
evidence in [validation](./validation.md) and user-visible behavior in the changelog.

The immediate sequence is **O1 coverage map → missing regression fixtures → fixes → O2 corpus
and frozen evaluation protocol**, followed by O2 execution and O3 compatibility work. The
[companion roadmap](./agent-roadmap.md) defines the separate integration milestones and the
dependency on O4.
