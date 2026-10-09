# Memory evaluation

[Documentation index](../README.md) · [Roadmap](./roadmap.md) · [Evaluation source](../../eval/README.md)

**Optional research:** extensive studies are deferred under the [delivery roadmap](./roadmap.md).
They do not block the functional release or companion implementation. Frozen study rules
remain unchanged; unrun quality, cache and cost comparisons are unmeasured.

**Status: evaluation infrastructure, not real-model qualification.** O1 verifies integrity and
O3 verifies compatibility. O2 separately measures the model's ability to answer after memory
preparation. Neither synthetic responses nor exact source retrieval establish answer quality.

For **Sign in with ChatGPT**, use the separate [native Pi subscription studies](./pi-subscription-evaluation.md).
They reuse this corpus, scoring and source checks with different frozen model/resource settings.
This page continues to describe the original Anthropic API-price study; its gates are unchanged.

## Frozen initial protocol

The [machine-readable protocol](../../eval/protocols/native-haiku-5.5-v1.json) and
[synthetic corpus](../../eval/corpus.ts) are versioned together as `native-haiku-5.5-v1`.
The runner checks their hashes and refuses a dirty checkout for paid runs.

- **Runtime:** Pi coding-agent, Pi AI and Pi Durable 1.1.0 on the declared Node/platform matrix.
- **Provider/model:** direct Anthropic API key, `claude-haiku-5-5` for both main and compactor.
  Anthropic defines this dateless ID as a pinned snapshot. Model availability and the pricing
  schedule were checked on 2026-10-08 against the [official model overview](https://platform.claude.com/docs/en/models/haiku-5-5/overview)
  and [versioning contract](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions).
- **Sampling/accounting:** medium thinking, at most 8,192 output tokens, no prompt caching,
  no hidden provider-SDK retries, 60-second provider timeout. A trial allows 512 calls and ten
  minutes including archive preparation and post-answer summaries. OptChat retains its own
  ordinary bounded summary retries; each attempt is metered. No non-default temperature is set.
- **Cases:** 16, two each for decisions, corrections, identifiers, numeric facts, distant
  evidence, instruction-shaped tool output, selected branches and history above the native
  128,000-byte view budget. One original tool result requires multiple retrieval pages.
- **Repetitions:** three per case and arm, 96 trials in total. Paired arm order alternates by
  case/repetition. Every trial starts from an isolated profile and a fixed synthetic history.
- **Arms:** ordinary Pi with no OptChat loaded, and the same Pi runtime with native OptChat.
  Both use identical source history, final question, model, output cap, host instruction,
  retry policy and disabled filesystem/shell tools. OptChat additionally exposes its memory
  retrieval tool and guidance. There is no second baseline memory implementation.

This is a **cold history-adoption benchmark with one question per trial**. Importing fixture
history does not invoke a model. Ordinary Pi retains its own default compaction policy; these
histories exceed OptChat's view budget but fit the selected model's context window. This is
not a measurement of provider-context overflow, long-running interactive workflows or a
guarantee against arbitrary prompt injection. No history is silently truncated by the runner.
Historical tool call/result pairs are structurally valid; they are not re-executed.

The comparison is with ordinary Pi. There is no measured parity, superiority or cost claim
against Taelin's reference implementation. Such a claim requires an additional versioned
reference-protocol arm with the same tasks and accounting; see [conformance](../reference/conformance.md).

## Predeclared acceptance gates

All gates must pass, including completeness. Failed/missing attempts remain failures; no
rerolling, answer repair or selectively dropping trials is allowed.

| Metric                                  | Gate                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Final answer                            | At least 90% overall and 80% in each category                                                    |
| Paired accuracy vs ordinary Pi          | At most 5 percentage points lower                                                                |
| Original retrieval                      | 100% exact text, source identity and timestamp across every native fixture record and every page |
| Selected-branch and adversarial answers | Zero occurrences of the specified forbidden markers                                              |
| Runtime/provider failures               | Zero failed trials in either arm; complete usage for every call                                  |
| Native preparation / complete trial     | p95 at most 300 / 600 seconds                                                                    |
| Native mean API cost                    | At most US$0.25 per trial, including summaries and retries                                       |
| Native aggregate cost vs ordinary Pi    | At most 100×; the absolute cost gate also applies                                                |
| Experiment spending cap                 | Explicitly authorized value, at most US$25 for this protocol                                     |

The cost ratio is a ceiling for cold adoption, not a promised saving. A lower spend cap can
stop an experiment before the complete gate is reached. That result remains incomplete.

Scoring accepts exactly one JSON object with only an `answer` field. It compares the exact
string (including case, leading zeros, signs and Unicode) or explicit `null` with the answer
key. Answer keys are not supplied to models. There is no judge model, fuzzy matching or
post-hoc repair. Abstentions are reported separately; the two explicit absent-fact cases
require `null`. Other abstentions fail their case.

Reports contain each category, failures, abstentions, all call counts/tokens/cache usage,
measured API cost, archive growth, and nearest-rank p50/p95 preparation/total time. Preparation
ends at the first main-provider dispatch; total time includes completion of post-answer
summary tasks. Source checks are local and do not make model calls. Descriptive 95% intervals
use a deterministic 2,000-resample case-cluster bootstrap, retaining repeated runs together.
Two cases per category provide limited uncertainty estimates; the corpus does not establish
population-level reliability. Report every repeat and the raw sanitized evidence.

## Run without credentials or charges

From a source checkout after `npm ci`:

```bash
npm run eval:dry -- --output /tmp/optchat-dry-01
npm run eval:dry -- --output /tmp/optchat-smoke-01 --cases decision-retention,branch-absent,oversized-page
```

Output directories must be new. Dry runs use a constant fake response with no answer-key
access, make no network-model calls, set `scoring: null`, and can never pass quality gates.
They still exercise the actual Pi runtime, native summary tasks, paged originals and branches.
CI covers this mechanism and injected timeout, rate-limit and connection-reset errors.
Injected errors are not observations of real provider incidents.

## Run the paid protocol

First configure `ANTHROPIC_API_KEY` privately and authorize the total spend. Never paste a key
in an issue, command example or result artifact. The runner uses an isolated Pi profile and
does not modify the user's login, settings or sessions. This initial protocol qualifies API
keys only; OAuth refresh and other providers remain unqualified.

```bash
# Example only: use this cap only after explicitly authorizing it.
npm run eval:live -- --output /tmp/optchat-live-01 --ledger /tmp/optchat-evaluation-budget --budget-usd 25
```

The ledger uses an exclusive writer lock and fsynced reservations before dispatch. It reserves
the full model context at the highest applicable published input/cache rate plus bounded
output, then settles successful calls from actual token usage. Interrupted or failed calls
keep their full reservation because billing may be uncertain. Never reset or replace the
ledger to bypass a cap; any separately authorized retry must account for previous spending.
The gate rejects unknown usage. Prices are estimates under the frozen published API schedule,
excluding taxes; account billing remains authoritative. Recheck pricing before a later run
and create a new protocol if it changes.

The live manifest, `calls.jsonl`, `trials.jsonl` and `report.json` are the reviewable evidence.
Calls contain only hashes, sizes, timing, status, usage and reservation IDs. Raw provider errors,
headers, credentials and reasoning are excluded. Preserve failed/incomplete runs. Review
artifacts before publishing; runtime profile/session/archive directories stay private.

## Storage scale is a separate experiment

```bash
npm run eval:storage -- /tmp/optchat-storage-1k 1000
npm run eval:storage -- /tmp/optchat-storage-10k 10000
npm run eval:storage -- /tmp/optchat-storage-100k 100000
```

Each workload uses real Pi Durable Node JSONL with `fsync: true`, default 512-byte nodes,
128,000-byte view and eight summary jobs. A fake provider generates parent summaries without
network calls. Each source is a short synthetic numeric/Unicode record. The run measures
admission, complete preparation, archive bytes, peak process RSS, sampled original retrieval
and reopening through the normal compatibility preflight. It verifies the first/selected/last
records and exact last-record retrieval after restart. Samples are not an exhaustive integrity
proof; O1 supplies the separate failure-window tests.

Reopening runs in a separate child process with a 4 GiB V8 heap limit. The parent writes phase
progress before reopening and preserves a failed result if its child cannot complete. This
avoids retaining the previous runtime in the process used to measure cold startup.

These workloads can take minutes and significant disk/RAM. Publish the actual environment,
largest completed size, failures and per-size results; do not extrapolate capacity or model
quality from a smaller completed test. One storage run per size is a measurement, not a
latency distribution. Quality-trial repetitions supply the separate p50/p95 distribution.

## Recorded synthetic evidence

The [reviewed result files](../../eval/results/README.md) contain the measurements. On Node
22.23.1/macOS/Apple M4 Max, the complete dry run exercised 16 cases in each arm and checked
1,264 original native records without failures. Its quality result is deliberately **not passed**.

| Records | Preparation                      | Fresh-process reopen | Logical archive size | Reopen peak RSS |
| ------- | -------------------------------- | -------------------- | -------------------- | --------------- |
| 1,000   | 6.33 s                           | 1.77 s               | 4.18 MiB             | 195 MiB         |
| 10,000  | 82.09 s                          | 21.94 s              | 90.82 MiB            | 620 MiB         |
| 100,000 | Completed; duration not captured | 247.21 s             | 969.37 MiB           | 3.80 GiB        |

The first 100k attempt exhausted a 4 GiB heap during **same-process reopening**, while its
previous closed runtime remained referenced. The committed build had completed all 100,000
records. A fresh process then reopened that same archive and retrieved the exact last original
and timestamp. Both observations are retained. The revised runner isolates reopening and
records intermediate progress; no missing preparation duration is reconstructed.

The largest exercised archive is therefore 100k short synthetic records, with substantial
recovery cost and 333,333 JSONL files. This is not a general 100k-message capacity guarantee,
an isolated speed comparison, or evidence for Cloudflare SQLite. The machine also ran other
development checks. JSONL startup and metadata/file growth are measured optimization targets;
do not patch Pi private internals or promise the same result for long real conversations.

## Cache measurement after the upstream correction

The existing `native-haiku-5.5-v1` protocol deliberately sets `cacheRetention: none`;
its frozen JSON and hash remain unchanged. Its accuracy experiment must not be described as
a warm-cache benchmark. Reports now include token-weighted reads and per-request distributions,
separately for main and summary calls. Missing or simulated usage produces no measured rate.

The separate [continuous cache protocol](./cache-evaluation.md) now freezes a paired trajectory
with cold/warm use, batch growth, runtime resume and a measured TTL pause. Its runner shares
this study's spending ledger and accounts for every main and summary call. Both protocols are
prepared for real-provider execution; paid qualification remains pending. Neither injected
payloads, synthetic usage nor the 20,001-step merge-order regression measures provider hits.
See [implementation and upstream provenance](../reference/cache.md).
