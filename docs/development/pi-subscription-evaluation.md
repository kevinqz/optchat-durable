# Evaluate through native Pi login

[Documentation index](../README.md) · [Quality methodology](./evaluation.md) · [Cache methodology](./cache-evaluation.md)

**Optional research:** extensive studies are deferred under the [delivery roadmap](./roadmap.md).
They do not block the functional release or companion implementation. Frozen study rules
remain unchanged; unrun quality, cache and cost comparisons are unmeasured.

Use this route to evaluate OptChat with **Pi 1.1.0 and Sign in with ChatGPT**, without an
Anthropic API key. These are separate, versioned studies for `openai/gpt-5.5`; the original
Anthropic protocols remain unchanged. A successful login or a dry rehearsal does not complete
either real-model study.

The evaluator uses Pi's public `ModelRuntime` for authentication, request-time refresh and
streaming. It reads credential metadata, not exported tokens. Each trial has its own new
profile, workspace, session and archive; only model requests go through the selected login
profile. Credentials are never copied into trial profiles or result files. Pi may update the
original credential file when refreshing the login. Account model access can change; the
runner does not substitute another model if the frozen one is unavailable.

## Verify login renewal without inference

From a clean, committed source checkout with the pinned dependencies:

```sh
npm run check:pi-auth -- \
  --profile /absolute/path/to/pi-profile \
  --output /tmp/optchat-pi-auth-01
```

This calls public Pi authentication, then opens a second `ModelRuntime` against the same
original credential store. Pi renews the login only when its normal expiry policy requires
it. The check does not alter expiry, implement a token exchange, copy credentials, start a
model request or consume inference allowance. It can contact the provider's authentication
endpoint and update the original login, so it is separate from `check:local`.

`auth-check.json` records only source/runtime metadata, booleans and operation counters.
`authenticated` and `reopened` must both be true for a successful check. `refreshObserved`
means the native refresh exchange completed. `refreshedLoginReused` additionally requires
successful auth resolution and a second runtime that loads the login without another
refresh. A still-valid login returns `refreshObserved: false`; this is not refresh evidence.
A completed exchange followed by a storage error cannot pass reuse. Refresh failures retain
only sanitized counters and the last completed stage.

This check does not prove that a model request succeeds with the renewed login. Live study
reports separately include `authObservation`: refresh attempts, completions/failures, completed
responses with valid usage, and responses completed after an observed refresh. The latter
records ordering within that run, not individual token identities. Dry runs report `null`.
Review these observations alongside the authentication check and the complete study results.
The host owns serialized refresh and persistence, consistent with
[OpenAI's session guidance](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions).

## Rehearse without a login

From the source checkout after `npm ci`:

```sh
npm run eval:pi -- --study quality --output /tmp/optchat-pi-quality-dry-01
npm run eval:pi -- --study cache --output /tmp/optchat-pi-cache-dry-01
```

Quality runs all 16 cases once in both arms. Cache runs 180 turns once in both arms and skips
the idle wait. Both use synthetic responses, make no model-network requests and report
`passed: false`. For a shorter quality rehearsal, add
`--cases decision-retention,branch-absent,oversized-page`. Live runs reject subsets.

## Run with authorized subscription allowance

Use the [Pi login procedure](../guides/pi.md) in the profile selected for the experiment. Use
the checkout's pinned `./node_modules/.bin/pi` if the global Pi has another version. For
example, set `PI_CODING_AGENT_DIR=/absolute/path/to/pi-profile` when starting Pi, then select
**OpenAI → Sign in with ChatGPT** in `/login`. The evaluator's `--profile` names that same
directory. Close interactive sessions that could compete for the experiment's allowance.

Authorize the workload first: it consumes account allowance also used by other applications.
Choose explicit token and call ceilings shared by quality, cache and later attempts. There
is no default allowance. These values are examples, not estimates of remaining quota or a
guarantee that both complete studies fit:

```sh
# Only after authorizing these ceilings; use the SAME ledger and caps for both studies.
npm run eval:pi -- --study quality --live \
  --profile /absolute/path/to/pi-profile \
  --output /tmp/optchat-pi-quality-live-01 \
  --ledger /tmp/optchat-pi-evaluation-allowance \
  --max-tokens 50000000 --max-calls 5000

npm run eval:pi -- --study cache --live \
  --profile /absolute/path/to/pi-profile \
  --output /tmp/optchat-pi-cache-live-01 \
  --ledger /tmp/optchat-pi-evaluation-allowance \
  --max-tokens 50000000 --max-calls 5000
```

Commit the frozen protocol and runner first. Output directories must be new and outside the
checkout; the login profile must be separate from output. The ledger holds an exclusive OS
writer lock. Before dispatch, it fsyncs a reservation for **400,000 tokens**: the pinned Pi
catalog's 272,000-token context plus its 128,000-token output ceiling. Successful calls settle
to `input + cacheRead + cacheWrite + output`. Reasoning is included in output and is not
counted twice. Failures, interruptions and missing usage retain the whole reservation.
Concurrent reservations can stop a run before measured consumption reaches its cap.

The pinned Pi subscription adapter omits `max_output_tokens`, unsupported by this route.
The evaluator reserves the full catalog ceiling; it does **not** claim an enforced
8,192-token output cap. This is tested through the actual Pi Responses adapter with injected
HTTP responses. See the pinned upstream
[Responses adapter](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/ai/src/api/openai-responses.ts)
and [OpenAI inference contract](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).

The frozen policy allows at most 100 million provider tokens and 10,000 calls; each execution
still requires authorized explicit caps within those bounds. These are local workload limits,
**not** a conversion of subscription quota into tokens or dollars. Reports leave actual account
charge and remaining quota unknown and omit Pi's API-list-price estimates. Account usage
settings remain authoritative.

Any provider error, quota error, missing terminal completion or invalid/missing usage stops
new requests. In-flight requests may already have consumed allowance and remain accounted for.
SDK retries are disabled. There is no API-key fallback, credit purchase, automatic new login
or automatic rerun. Pi's API-key auth method and caller credential overrides are excluded.
Preserve incomplete results and the same ledger; do not reset it to bypass a limit.

## Frozen comparisons and acceptance

Both studies compare ordinary Pi and native OptChat with `gpt-5.5`, thinking off, identical
synthetic histories and a 60-second call timeout. Built-in shell/filesystem tools and cache
warming are disabled. Native OptChat keeps its memory tool and guidance. The runner checks
model ID, context/output catalog limits, protocol hashes and Pi versions.

The saved memory defaults remain 512-byte nodes, a 128,000-byte view and eight summary jobs.
The native main-context guard additionally caps that view at one third of the selected model
window: 90,666 bytes here. This is the normal Pi integration behavior for this model, not a
smaller benchmark-only setting.

| Study                                                                 | Required live workload                                                                                      | Acceptance                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Quality](../../eval/protocols/native-pi-chatgpt-gpt-5.5-v1.json)     | 16 cases × 2 arms × 3 repetitions = 96 trials; ten minutes and 512 calls per trial                          | ≥90% overall and ≥80% per category; at most 5 percentage points below ordinary Pi; every original exact; no forbidden answers, failures or unknown usage; native p95 preparation ≤300 s and total ≤600 s; native mean ≤500,000 total provider tokens/trial and aggregate token ratio ≤100× |
| [Cache](../../eval/protocols/native-cache-pi-chatgpt-gpt-5.5-v1.json) | 180 turns × 2 arms × 3 repetitions = 1,080 main requests plus summaries; one hour and 2,048 calls per trial | Every acknowledgement and original exact; no failures or unknown usage; at least one native batch per trial; identical memory status across runtime reopen; actual idle gap ≥330 s; warm main-input cache reads ≥80% in every native repetition                                            |

Token gates replace dollar-price gates **only in this new subscription study**. They bound
cold-adoption overhead and do not promise savings. The Anthropic price gates remain intact
and unqualified until those studies run. A release supported by these new studies must limit
its claims to this configuration and leave API-price comparisons and other providers unqualified.
Real OAuth refresh needs observed evidence from the checks above; injected regressions prove
host delegation, locking and report semantics only.

Caching is automatic at this OpenAI endpoint. Pi's `cacheRetention: short` is a preference,
not a guarantee of hits or a fixed TTL. For GPT-5.5, a 330-second wait is an **idle observation**,
not proof of expiry. The new trajectory labels that phase `idle`, separately from the
Anthropic `expired` phase. See [OpenAI's model-specific caching rules](https://developers.openai.com/api/docs/guides/prompt-caching),
reviewed with the pinned Pi adapter on 2026-10-09.

Reports retain every phase, main and summary calls, token-weighted cache rates, request-hit
fractions, timings and archive growth. A cache pass does not establish answer quality or
Taelin's reported 98%. A failed study stays failed; changing its rules requires a new version
and new runs. The [quality](./evaluation.md) and [cache](./cache-evaluation.md) methodology
guides explain scoring, paired order, source checks and uncertainty.

## Evidence and boundaries

Preserve `manifest.json`, `calls.jsonl`, `trials.jsonl`, `report.json`, cache `turns.jsonl`, and
any `failure.json`. Calls contain hashes, byte counts, timings, sanitized error classifications
and usage. Successful usage requires a valid `response.completed` event. The call log excludes
raw provider errors, credentials, headers and reasoning. Private session/archive directories
may contain synthetic model reasoning: do not publish them. Review and copy only intended
evidence files into `eval/results/`.

This developer runner does not change installation, add login to the standalone CLI, qualify
arbitrary Pi versions, deploy Cloudflare or complete the companion agent roadmap.
