# Evaluation assets

This directory belongs to development, not the installed Pi extension. All corpus content is
synthetic and covered by the repository's MIT license. It contains no customer conversations.

Read the [evaluation protocol and interpretation guide](../docs/development/evaluation.md)
before running or comparing results. A dry run **cannot** qualify memory quality.

| File                                 | Responsibility                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| `corpus.ts`                          | Versioned synthetic cases, answer keys and exact scoring                          |
| `protocol.ts`                        | Models, repetitions, prices and numerical acceptance gates                        |
| `protocols/native-haiku-5.5-v1.json` | Frozen protocol and corpus hashes, checked by the runner                          |
| `host.ts`                            | Actual Pi coding-agent runtime, selected branches and independent original checks |
| `provider.ts`                        | Public provider-boundary accounting, output/time/call limits and sanitized events |
| `budget.ts`                          | Durable spending reservations; incomplete calls retain their reservation          |
| `report.ts`                          | Complete-pair validation, category scores, distributions and uncertainty          |
| `run.ts`                             | Sequential paired runs, isolated profiles, artifacts and acceptance result        |
| `storage.ts`, `reopen.ts`            | Fsynced JSONL scale workload and fresh-process recovery verification              |
| `results/`                           | Reviewed evidence only; private runtime archives do not belong here               |

Generated archives and full run outputs must go outside the repository. Publish only reviewed
manifests, sanitized calls/trials/reports and storage result JSON. Never publish `auth.json`,
provider headers, raw provider error payloads or reasoning blocks.
