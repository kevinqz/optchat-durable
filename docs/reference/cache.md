# Cache behavior and the upstream correction

[Architecture](./architecture.md) · [Conformance](./conformance.md) · [Evaluation](../development/evaluation.md)

These changes are **Unreleased**. The published rc.1 used the earlier merge rule. They improve
prefix stability and cache placement; they do not establish a measured savings percentage.

## What changed upstream

Victor Taelin's [revision `3c190e0`](https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449/3c190e06f34aba0c69f49042c526093269604935),
committed on October 8, 2026 at 01:58:24 UTC and now titled **UniiChat**, corrects the sibling
merge priority and describes batched compaction, smaller compactor context and cache placement.
The recipe reports a **cache-model replay**, with 98.6% prefix reads for turns and 96.2% for
compactions. The author's social post also reports 98%+ by tokens. Neither is a measurement
of this integration, a request success rate, a recall score, or a guaranteed bill reduction.

## Main and compactor views

The old rule in our rc.1 scored a pair using its first message. The corrected rule uses its
last message: for a sibling starting at `start`, each child covering `count` records, that is
`last = start + 2 * count - 1`, with priority `(total - last) / count`. Equal scores choose the
oldest eligible pair. At ten records, `0+4, 4+4, 8+1, 9+1` must merge `8+1` with `9+1`, leaving
the older prefix intact. The old formula selected `0+4` with `4+4` instead.

The main partition grows by appending complete leaves. Only crossing its high-water budget
starts a batch, targeting half that budget: normally 128,000 down to 64,000 UTF-8 bytes,
including the wrapper and addresses. Only completed parents can replace siblings. The
`optchat.view-policy` document retains the target when a batch cannot finish yet, so restart
or another preparation does not abandon it. Existing frozen-turn receipts never change.

Summary jobs share a separately persisted partition, normally targeting 16,000–32,000 bytes.
It starts from the main partition, appends completed leaves and resets after main-view merges.
A job receives only the relevant earlier prefix; a temporary crossing-node split does not
rewind either persisted partition. When required parents are missing, complete summarized
context may temporarily exceed the preferred size, up to the main hard ceiling. This avoids
blocking the very jobs needed to shrink it; no raw fallback or partial-message clipping occurs.
An ASCII dash ruler communicates the configured node limit without introducing sample facts.

## Native Pi integration

The original text of the view is divided into stable blocks of four lines. The closing tag
and any remaining lines are separate from the final complete block; the full new message
follows. This preserves both view text and the complete live tool loop.

For `anthropic-messages`, the native extension uses Pi's public `before_provider_request` hook.
The standalone model factory and Pi summary bridge use the public `onPayload` callback through
`cacheProvider`. SDK hosts supplying their own providers can opt in:

```js
import { cacheProvider } from "optchat-durable/extension";

models.setProvider(cacheProvider(yourAnthropicProvider));
```

The adapter adds one marker on the last complete view block only when the wire payload still
matches our generated blocks. It preserves existing host marks and retention, including
`cacheRetention: none`. With no enabled cache policy, fewer than four lines, four occupied
marker slots, mixed TTLs, or a transformed view, it leaves the payload unchanged. In particular,
some OAuth or custom-provider layouts already use all four slots. Those layouts do not receive
the additional view marker. No authentication, header, host instruction or tool policy changes.

Within one provider wrapper, requests about to write an identical marked prefix wait for the
leader's stream start (or termination). Waiting is cancellable and bounded. This coordination
is ephemeral: there is no cross-process lock, remote cache database, restart guarantee or
keep-alive traffic. Failed starts can still lead to uncached retries and billing.

Summary conversations remain isolated from the host persona and tools, and use the configured
compactor model. They therefore do **not** share the main role's system/tool cache prefix as
the reference recipe proposes. This preserves Pi ownership and the existing tool-free summary
contract. Other APIs retain their provider's own cache behavior; we do not add Anthropic fields.

Anthropic's [prompt-caching documentation](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
explains why a stable prefix needs a previously written breakpoint, why the closing/request
suffix cannot be the only marker, and why concurrent readers wait for the first response.
Cache expiry, minimum input length, model/account changes and changes to host instructions,
tools or thinking settings can still produce misses. The provider remains authoritative.

## What is verified

- Merge order against an independent rollback counter for 20,001 pushes, including the
  ten-record counterexample.
- Persistent batch recovery and stable appends, separate compactor state and bounded prefixes.
- Byte-for-byte block reconstruction, host-payload preservation, opt-out, TTL and marker limits.
- Concurrent-prefix waiting and cancellation; the real Pi Anthropic adapter's outgoing payload
  against a synthetic loopback server. This server performs no inference or cache accounting.
- The native extension runner's public payload hook and existing integrity/branch/tool tests.

The report metric is `sum(cacheRead) / sum(input + cacheRead + cacheWrite)` using Pi's normalized
Anthropic token counters. Output tokens are excluded. Main and compactor calls are separated;
per-request hits and percentiles are also shown. Unknown usage prevents a complete measured
rate, and simulated runs cannot report one. The existing quality protocol disables caching;
a separately frozen, funded live study is still required to qualify cache savings.

Upgrade using the [complete backup and compatibility procedure](../guides/upgrades.md).
The new document is additive; old summaries and partitions are retained. A downgrade over
new state is not a rollback procedure, even when the previous release predates version checks.
