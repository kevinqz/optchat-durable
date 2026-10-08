# Reviewed evaluation evidence

No real-provider quality result has been published yet. Paid qualification requires configured
Anthropic API-key credentials and an explicitly authorized spending cap.

Synthetic dry-run and storage results demonstrate orchestration and storage behavior only.
They must remain labelled separately from real-provider quality, latency and cost results.
The [evaluation guide](../../docs/development/evaluation.md) defines acceptable evidence.

| Evidence                                                   | Observed scope                                                                                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [Full dry-run report](./dry-native-v1-macos-20261008.json) | 16 cases in both arms; 1,264 native originals checked; no failed trials; no quality score                                                    |
| [1k storage](./storage-1000-macos-20261008.json)           | Complete preparation, sampled source checks and fresh-process reopening                                                                      |
| [10k storage](./storage-10000-macos-20261008.json)         | Complete preparation, sampled source checks and fresh-process reopening                                                                      |
| [100k storage](./storage-100000-macos-20261008.json)       | Committed complete preparation and successful separate-process reopening; initial in-process reopen failed; preparation duration unavailable |

All runs used the O1/O3 memory implementation at `8d085ee6836bd77483b00cfcfb63c75511a07450`
on a shared Apple M4 Max development machine. These are dated observations, not resource SLAs.
The initial 100k harness retained a closed runtime during reopening; the revised runner uses
a separate process and writes phase progress before recovery so failures retain useful evidence.
