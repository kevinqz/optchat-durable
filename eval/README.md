# Evaluation assets

This directory belongs to development, not the installed Pi extension. All corpus content is
synthetic and covered by the repository's MIT license. It contains no customer conversations.

Read the [evaluation protocol and interpretation guide](../docs/development/evaluation.md)
before running or comparing results. A dry run **cannot** qualify memory quality.

| File                                       | Responsibility                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `corpus.ts`                                | Versioned synthetic cases, answer keys and exact scoring                                     |
| `protocol.ts`                              | Models, repetitions, prices and numerical acceptance gates                                   |
| `protocols/native-haiku-5.5-v1.json`       | Frozen protocol and corpus hashes, checked by the runner                                     |
| `host.ts`                                  | Actual Pi coding-agent runtime, selected branches and independent original checks            |
| `session.ts`                               | Shared public Pi runtime setup and isolated profile policy                                   |
| `environment.ts`                           | Runtime/version checks, clean checkout and shared budget acquisition                         |
| `cache/`                                   | Frozen continuous-cache trajectory, lifecycle runner, sanitized report and synthetic fixture |
| `pi/`                                      | Native Pi OAuth bridge, separate subscription protocols, token ledger and study commands     |
| `spec.ts`, `cache/spec.ts`                 | Shared execution contracts and explicit mapping of frozen study settings                     |
| `protocols/native-cache-haiku-5.5-v1.json` | Independent cache protocol, scenario and shared billing-policy hashes                        |
| `provider.ts`                              | Public provider-boundary accounting, output/time/call limits and sanitized events            |
| `budget.ts`                                | Durable spending reservations; incomplete calls retain their reservation                     |
| `report.ts`                                | Complete-pair validation, category scores, distributions and uncertainty                     |
| `run.ts`                                   | Sequential paired runs, isolated profiles, artifacts and acceptance result                   |
| `storage.ts`, `reopen.ts`                  | Fsynced JSONL scale workload and fresh-process recovery verification                         |
| `results/`                                 | Reviewed evidence only; private runtime archives do not belong here                          |

Generated archives and full run outputs must go outside the repository. Publish only reviewed
manifests, sanitized calls/trials/reports and storage result JSON. Never publish `auth.json`,
provider headers, raw provider error payloads or reasoning blocks.

The [continuous cache study](../docs/development/cache-evaluation.md) has its own protocol.
Use the same spending ledger for both studies; a synthetic rehearsal never establishes cache savings.

For **Sign in with ChatGPT**, use the separate [Pi subscription guide](../docs/development/pi-subscription-evaluation.md)
and `npm run eval:pi -- --study quality|cache --output NEW_DIRECTORY`. Its native Pi OAuth
bridge and shared token/call ledger do not reuse the Anthropic dollar ledger or rewrite its
protocols. Neither family has completed real-provider qualification.

`npm run check:pi-auth -- --profile PI_PROFILE --output NEW_DIRECTORY` separately observes
native login renewal and reuse without inference. It may update the original login through
Pi and is not part of the credential-free local test suite. See the subscription guide for
the difference between successful authentication, observed refresh and completed inference.
