# Reviewed evaluation evidence

No real-provider quality result has been published yet. The Anthropic studies require an
API key and authorized spending cap. The separate [Pi subscription studies](../../docs/development/pi-subscription-evaluation.md)
use a native ChatGPT login and authorized shared token/call limits. A login smoke test does not
qualify either complete study.

Synthetic dry-run and storage results demonstrate orchestration and storage behavior only.
They must remain labelled separately from real-provider quality, latency and cost results.
The [evaluation guide](../../docs/development/evaluation.md) defines acceptable evidence.

| Evidence                                                   | Observed scope                                                                                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [Full dry-run report](./dry-native-v1-macos-20261008.json) | 16 cases in both arms; 1,264 native originals checked; no failed trials; no quality score                                                    |
| [1k storage](./storage-1000-macos-20261008.json)           | Complete preparation, sampled source checks and fresh-process reopening                                                                      |
| [10k storage](./storage-10000-macos-20261008.json)         | Complete preparation, sampled source checks and fresh-process reopening                                                                      |
| [100k storage](./storage-100000-macos-20261008.json)       | Committed complete preparation and successful separate-process reopening; initial in-process reopen failed; preparation duration unavailable |

The original quality/storage runs above used the O1/O3 memory implementation at `8d085ee6836bd77483b00cfcfb63c75511a07450`
on a shared Apple M4 Max development machine. These are dated observations, not resource SLAs.
The initial 100k harness retained a closed runtime during reopening; the revised runner uses
a separate process and writes phase progress before recovery so failures retain useful evidence.

## Continuous cache rehearsal

[Reviewed cache rehearsal](./cache-dry-v1-macos-20261008.json), source
`f14e0be16280ae95ae41ce7960d2f9f07ccaab9f`, completed 180 turns in each arm. Native OptChat made
180 main and 497 synthetic summary calls, crossed one main-view batch, reopened its public
runtime and retrieved all 681 originals exactly. The same revision repeated the complete
16-case quality dry run in both arms with 1,264 exact native originals and no failed trials.

Measured cache fractions remain null and qualification remains false. The dry runner skipped
the TTL pause and performed one pair, while paid qualification requires three. These are
orchestration observations, not model recall, cache savings, provider latency or billing results.
The file includes source/protocol hashes and hashes of retained local raw artifacts; it is a
reviewed summary rather than a publication of private profiles or all raw artifacts.

## Local validation after the cache correction

The [2026-10-08 local evidence](./local-validation-20261008.json) records source
`e3f01500c96648a85b0dcbed2dc391a41fe66e29`: four local Node/macOS/Ubuntu engineering runs,
both full synthetic rehearsals, storage workloads and a browser restart inspection. See the
[scope and reproduction notes](../../docs/development/local-validation.md). The earlier
result files above remain unchanged; local engineering success does not complete O2's
real-provider gates or O4's consolidated release.

## Native Pi subscription rehearsal

The [2026-10-09 reviewed evidence](./pi-subscription-dry-macos-20261009.json) is tied to clean
source `7bf114bad28d51db95594a93442c4bf3799c01f8`. All **104 local deterministic tests** and
format, documentation, type, fresh-package, Pi-installation and isolated-upgrade/restore checks
passed with npm offline. The 16-case quality pair verified all 1,264 native originals. The
180-turn cache pair verified all 681 native originals, two native batch transitions and
matching status across runtime reopen.

Both rehearsals used synthetic responses, completed one repetition and remain `passed: false`.
Measured cache fractions and account costs remain null; the idle wait was skipped. The file
includes protocol/source hashes and hashes of the local evidence files. Source paths, login
credentials, headers, raw provider errors and private trial archives are not included.

The [native ChatGPT login smoke](./openai-oauth-smoke-20261009.json) is a separate real-provider
observation. It does not turn the synthetic quality/cache rehearsals or injected refresh tests
into live qualification.
