# Local validation record

[Validation commands](./validation.md) · [Reviewed evidence](../../eval/results/local-validation-20261008.json)

The engineering gates were run on the development machine on 2026-10-08, before submission
to GitHub. The tested source is `e3f01500c96648a85b0dcbed2dc391a41fe66e29` (tree
`849531041e437ba255395f0a9698d9ee98da91b5`). The JSON record contains environment details,
artifact checksums, retained-log hashes, synthetic evaluation results and known limits.

## Engineering matrix

| Local environment                   | Node    | Result                                                                      |
| ----------------------------------- | ------- | --------------------------------------------------------------------------- |
| macOS 27.2, Apple Silicon           | 22.19.0 | 93 tests plus package, native Pi installation and rc.1 upgrade gates passed |
| macOS 27.2, Apple Silicon           | 24.21.0 | Same complete gates passed                                                  |
| Ubuntu 24.04, ARM64, Docker Desktop | 22.19.0 | Same complete gates passed with container network disabled                  |
| Ubuntu 24.04, ARM64, Docker Desktop | 24.21.0 | Same complete gates passed with container network disabled                  |

Each environment ran `npm run check:local` with `npm_config_offline=true` and a local
`OPTCHAT_UPGRADE_BASELINE` pointing to the original checksum-pinned rc.1 artifact. This includes
formatting, documentation links, types, integrity/recovery tests, a freshly packed CLI/SDK/UI,
source-only Pi installation, tool dispatch, removal, upgrade and backup restoration.

Setup downloaded official Node archives and the Ubuntu base image and populated the npm
cache. The final runs required no GitHub or registry downloads. macOS used npm's offline
policy; Linux additionally used `docker run --network none`. Loopback HTTP still worked.
Local Git metadata supports documentation enumeration; no GitHub API or CI result was needed.
The Linux containers used 16 virtual CPUs and 8,320,671,744 bytes of assigned memory. This is
a local ARM64 container qualification, not an x86 runner, Windows or a deployed cloud test.

The first Linux fixture omitted the Git index needed by the documentation checker and stopped
there. Adding a local index to the unchanged source archive fixed the fixture; the successful
runs then exercised all gates. That failed attempt is retained. A preliminary documentation
formatting failure was corrected before the tested revision. Neither failed attempt is
counted as a successful matrix run.

Separate negative checks proved that a missing offline baseline, an unreadable baseline and
an altered tarball fail before fetch/build/install. A valid local baseline with an empty npm
cache fails with `ENOTCACHED`; it does not silently download dependencies.

## Synthetic evaluations

The complete quality rehearsal ran all 16 cases in both arms with zero runtime failures and
all 1,264 native original records checked exactly. The separate cache rehearsal ran 180 turns
in each arm, crossed a native compaction batch, reopened the public runtime and recovered all
681 native originals. Both used Pi 1.1.0 with synthetic providers, kept measured cache rates
null and reported real-provider qualification as false. The cache dry run skipped the TTL
pause. No API key, paid inference or model-generated quality score was used.

The separate 1k, 10k and 100k fsynced storage workloads retain their own results in the JSON
record. Each result states preparation, sampled original checks, fresh-process reopening and
resource use. These are runs on a shared development machine, with some checks overlapping;
do not interpret their durations as a controlled speed comparison with earlier measurements.
They do not establish general capacity for arbitrary long conversations.

## Browser interaction and restart

The standalone demo used an isolated synthetic archive and loopback server. Browser controls
and screenshots verified sending a message, searching, opening its original, page reload,
the Command+Enter shortcut, literal HTML-shaped text and Unicode, and four stored records.
After graceful server shutdown and reopening the same archive in a new process, both turns
and the original `0+1` remained visible. The source was still Pi record `15`, with displayed
timestamp `08/10/2026, 13:54:16` in the browser's local timezone. The preview server and temporary
tab were then closed; the synthetic archive was retained.

This was a desktop browser inspection of the demo, not a mobile viewport test or a visual
inspection of the native Pi terminal. Process-crash behavior is covered separately by the
SIGKILL tests in the engineering matrix. Existing real-provider and consolidated-release
requirements in the [roadmap](./roadmap.md) remain pending.
