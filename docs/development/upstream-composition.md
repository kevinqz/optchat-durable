# Upstream composition review

[Roadmap](./roadmap.md) · [Architecture](../reference/architecture.md) · [Companion review](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/upstream-composition.md)

Reviewed on 2026-10-10 against Pi 1.1.0, OptChat 0.4.0 and the companion's Agents 0.28.0 / Code Mode 0.5.3. The goal is to maintain the smallest application-specific layer consistent with the existing memory and recovery contracts. Passing tests establishes behavior, not minimal architecture or superiority over another harness.

## Responsibility decisions

| Concern                                           | Existing upstream capability                                           | Decision and reason                                                                                                                                                                                                                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent loop, transcript, tools and task recovery   | Pi Durable `Harness`, `Conversation.submit`, native tasks and storage  | Reuse. OptChat does not implement an LLM/tool loop or its own scheduler.                                                                                                                                                                                                        |
| Compacting old conversation context               | Pi `CompactionTask`, background compaction and hooks                   | Keep OptChat's distinct hierarchical strategy as an explicit opt-in. Native compaction remains a valid baseline, not a missing Pi feature.                                                                                                                                      |
| Hierarchical summaries, originals, frozen views   | Taelin's OptChat design                                                | Keep the implementation and its attribution. The memory tree and bounded chronological view are the package's purpose; measured superiority is still unestablished.                                                                                                             |
| Input preparation and ordering                    | Pi's native inbox and idempotent submission                            | Retain the OptChat request task. It waits for earlier preparation, builds memory and atomically records the frozen context before native submission. Direct `PiHarness.submit()` bypasses that preparation. Cancellation of a middle request must preserve the earlier barrier. |
| Request execution status                          | Pi's committed task outcome                                            | Interpret it once in the controller. `request(id)` and `status().requests` must agree, including faults that occur outside a request-document transaction. Consumers must not recreate that projection.                                                                         |
| Normal Pi tools, permissions, login and streaming | Pi coding-agent extension APIs                                         | Reuse. The native adapter changes historical context and records originals, while the host continues executing its live turn and tools.                                                                                                                                         |
| Storage and locking                               | Pi JSONL/SQLite storage and OS-backed writer exclusion                 | Retain the writer boundary for local multi-process safety; do not introduce another database for the transcript.                                                                                                                                                                |
| Hosted chat UI, routing, approvals and backups    | PiHarness, Cloudflare Code Mode, Lifecycle, Access and platform facets | Belong to the companion. Keep Cloudflare dependencies out of this package.                                                                                                                                                                                                      |
| An alternative complete hosted harness            | Cloudflare Think                                                       | Treat as a comparator, not an extra runtime to stack on Pi. It has its own memory, compaction, submissions and recovery. Adopting it would be a separate product choice requiring equivalent behavior and migration evidence.                                                   |

The controller calls Pi's native `conversation.submit()` with a stable request identity; its request task is a memory preparation protocol running on Pi, not a replacement task engine. Task/document identifiers, frozen-context receipts and branch ancestry are compatibility contracts.

## Coordinated delivery order

1. **OptChat first:** centralize request outcome inspection, cover a real native task fault without calling a provider, update SDK guidance and correct stale companion/cache descriptions. Preserve schemas, task definitions, dependency versions and the three entry points.
2. **Publish the package:** qualify the exact 0.4.1 artifact and its source install; retain prior release artifacts. The patch changes a read-only status projection and public documentation, not stored formats or memory algorithms.
3. **Companion second:** consume the published artifact; remove its duplicate task-outcome interpretation and repeated snapshot reads. It must not import our source checkout or patch Pi internals.
4. **Qualify the dependency update:** the companion must run the old source with the old dependencies, the new source with the new dependencies, and verify preservation in an isolated copy. A shared `node_modules` is insufficient when the lockfile graph changes.
5. **Review the other overlap candidates:** retain or replace the facet wake bridge, request admission ledger and action outbox only after comparing exact failure boundaries. Their detailed decisions belong in the companion review; no speculative deletion or new generic framework is part of this work.

Completion means a published memory patch, a companion consuming it, a verified exact upgrade route and accurate public ownership documentation. Broader model-quality/cache benchmarks, a Think migration, cross-build hosted checkpoint migration and new connectors remain separate work.

## Evidence and future simplification

The request-projection regression uses the public Pi tool allowlist to fault a preparation transaction. It checks that individual and list status agree, the stored request remains unchanged, a missing request stays absent and no provider call starts. Existing queue checks cover cancellation ordering. Package and upgrade checks cover public consumers.

Before removing a component, demonstrate its replacement through public upstream APIs and retain the boundary it currently protects. For memory, that includes complete originals, immutable current-turn views, branch semantics and no main inference after incomplete preparation. A smaller diff alone is not evidence of equivalent behavior.

## Primary references

- [Pi Durable 1.1.0: submissions, compaction, hooks and storage](https://github.com/earendil-works/pi/blob/v1.1.0/packages/durable/README.md)
- [Cloudflare's official Pi integration](https://developers.cloudflare.com/agents/harnesses/pi/)
- [Cloudflare Think and its existing memory/context facilities](https://developers.cloudflare.com/agents/harnesses/think/)
- [Taelin's reviewed design and the attribution boundary](../../CREDITS.md)
