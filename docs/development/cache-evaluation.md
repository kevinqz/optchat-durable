# Continuous cache evaluation

[Documentation index](../README.md) · [Quality evaluation](./evaluation.md) · [Cache implementation](../reference/cache.md)

**Status: frozen protocol and synthetic rehearsal; real-provider results are pending.**
`native-cache-haiku-5.5-v1` is separate from the cache-disabled quality study. An acknowledgement
workload measures cache behavior, orchestration and source integrity; it does not measure recall,
answer quality or superiority over another memory system.

## Workload and controls

The [frozen protocol](../../eval/protocols/native-cache-haiku-5.5-v1.json) pins Pi 1.1.0,
Anthropic `claude-haiku-5-5`, medium thinking, 8,192 output tokens and the same published prices
as the quality study. It uses API-key authentication, five-minute caching, no provider-SDK
retries, a 60-second request timeout, 2,048 calls and one hour per trial. Ordinary bounded
OptChat summary retries are included in those counts and charges.

Each trial starts with 320 synthetic, 440-byte user records and one import acknowledgement.
It then sends 180 ordinary Pi prompts, each 480 ASCII bytes, asking for an exact JSON
acknowledgement. Each paired arm receives identical content. Both disable built-in tools and
cache warming; native OptChat retains its memory tool and instructions. The trial fails if
the model invokes a tool. This deliberately narrow workload keeps output and external actions
from obscuring cache observations.

| Phase               | Main turns | Purpose                                                               |
| ------------------- | ---------: | --------------------------------------------------------------------- |
| Cold adoption       |          1 | Includes importing and summarizing the seed history                   |
| Warm use            |         12 | Consecutive requests on the same session                              |
| Growth              |        160 | Cross the native 128,000-byte view budget and observe a batch rebuild |
| Runtime resume      |      1 + 3 | Close Pi's public runtime, reopen its saved session, then continue    |
| TTL pause and probe |          1 | Drain all work, wait at least 330 seconds, then request again         |
| Rewarming           |          2 | Observe subsequent requests after the pause                           |

Three repetitions run both arms, with paired order alternating by repetition: six trials,
1,080 main requests, plus every summary call and retry. Each turn drains background summaries
before the next; summary jobs can overlap within a turn. This is a back-to-back workload with
fully drained boundaries, not a simulation of typing or simultaneous user requests.

Native defaults are frozen and checked against the saved configuration: 512-byte nodes,
128,000-byte main view, eight jobs, five size attempts, three failure attempts and 10-second
retry delay. The runner does not shrink the memory budget to manufacture a batch. At least
one non-append main-view transition must actually occur during the 180 requests. Prefix
comparison excludes the closing envelope; immutable lines can otherwise only grow by append.

A fresh run nonce appears in every seed record and prompt and is saved in the manifest.
Per-trial workspace paths also separate system context. These controls reduce accidental
reuse of another trial's message prefixes. They cannot flush provider-side caches or prevent
reuse of static system/tool prefixes by other clients on the same account. Run on a quiet
account, disclose other activity, and call the first phase _locally cold_, not guaranteed
server-cache empty.

The [provider's caching contract](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
defines the default five-minute lifetime from request start, refreshed on reuse. The study
waits 330 seconds after draining every request, and records the next main request's actual
idle interval. It does not infer cache expiry merely from a phase name or require exactly zero
reads after that pause. Other account traffic and static shared prefixes can affect reads.
Prices and this contract were checked on 2026-10-08; recheck them before a later paid run.

## Predeclared acceptance

All six trials and their exact phase/turn sequence must be present. Missing, failed or stopped
runs remain incomplete; preserve them and their ledger instead of rerolling selected trials.

- Zero runtime/provider failures, unknown usage/cost or truncated responses; all acknowledgements exact.
- Every selected native original, including newly generated user and assistant records, retrieved
  with exact text, Pi entry ID and timestamp, across all pages. Reasoning is excluded as designed.
- At least one observed batch transition per native trial.
- Identical public memory status before/after each runtime reopen, with all final originals verified.
  Status compares message/summary/part counts, view byte size, budget and error state. This is
  an **in-process runtime reopen**, not a fresh-process crash or a byte-for-byte view proof.
- Actual pre-probe idle interval at least 330 seconds in every trial.
- At least **80% token-weighted main-input cache reads in each native repetition's warm phases**:
  warm use, growth, resumed turns and rewarming. Growth includes batch-rebuild requests; they
  are not removed to improve the ratio. Cold adoption, first restart and expiry probe are
  separately reported and remain included in total cost and all-call metrics.

The 80% threshold is a prospective engineering acceptance target for this specific synthetic
workload, not an observed result or a general promise. It is not Taelin's reported 98% result.
Summary-cache behavior is reported separately without a predeclared performance floor. The
ordinary-Pi arm supplies a comparison, not an assumed cost or cache improvement. Any claim of
savings must account for summaries, retries and every phase, including cold adoption.

Token-weighted rate is `sum(cacheRead) / sum(input + cacheRead + cacheWrite)`, excluding output.
Reports also show request-hit fraction, per-request p10/p50/p95 read fractions, latency p50/p95,
known cost, unknown-cost counts, per-phase/main/summary breakdowns and each repetition. Hashes,
byte/part counts and common-prefix byte lengths describe view changes without logging prompts.
Three repetitions of one synthetic trajectory do not establish population-level confidence.

## Reproduce safely

From a source checkout after `npm ci`, without credentials or model charges:

```bash
npm run eval:cache:dry -- --output /tmp/optchat-cache-dry-01
```

A dry rehearsal runs one complete pair through the real Pi runtime and native extension.
It supplies synthetic summaries and acknowledgements, skips the 330-second pause, records
actual idle time, and always reports `passed: false` with measured cache fractions `null`.
Its exit code checks orchestration, sources, batches and resume, not provider performance.

After privately configuring `ANTHROPIC_API_KEY`, explicitly authorizing a total cap and
committing the protocol and runner:

```bash
# Example only; the amount still requires explicit authorization.
npm run eval:cache:live -- --output /tmp/optchat-cache-live-01 --ledger /tmp/optchat-evaluation-budget --budget-usd 25
```

Use **the same ledger directory and cap** for quality, cache and any repeated execution.
The v2 ledger binds the shared model/pricing policy and records each reservation's experiment
hash. A failed/interrupted request keeps its full reservation. A changed cap, pricing policy,
malformed/torn ledger or concurrent writer is rejected. A cap of US$25 is a ceiling, not an
estimate or guarantee that both complete studies will fit; conservative simultaneous reservations
can stop a run before actual spending reaches the cap.

Legacy v1 ledgers remain readable for their original quality protocol without resetting any
charge. They cannot silently authorize the cache study. Reconcile existing spending before a
separately approved migration; the runner intentionally provides no automatic budget reset.

Review `manifest.json`, `calls.jsonl`, `turns.jsonl`, `trials.jsonl` and `report.json` before
publishing. Per-turn evidence survives an interrupted trial. Known cost is an estimate under
the frozen price schedule; unresolved reservations and account billing remain separate.
Private Pi profiles, raw session/archive files, credentials and reasoning must stay private.

## Recorded rehearsal

The [reviewed synthetic result](../../eval/results/cache-dry-v1-macos-20261008.json) at
`f14e0be16280ae95ae41ce7960d2f9f07ccaab9f` completed 180 turns per arm without failure. Native
OptChat made 497 additional summary calls, crossed one batch, retained its public memory
status on runtime reopen and recovered all 681 originals exactly. Cache fractions remain
null, the TTL interval is explicitly untested, and `passed` remains false. The complete
cache-disabled quality dry run also remained green, with its original protocol hash unchanged.
