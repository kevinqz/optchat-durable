# Changelog

## 0.4.1 — 2026-10-10

- Make individual SDK request inspection agree with list status when a native Pi task faults outside the request-document transaction. Keep inspection read-only and preserve all stored task/document formats.
- Centralize that projection in OptChat so the companion can remove its duplicate interpretation of Pi task outcomes.
- Document the two-repository upstream composition decisions; correct stale companion-release and native Anthropic cache-policy descriptions. Pi dependencies, memory algorithms and native tool execution are unchanged.

## Unreleased

## 0.4.0 — 2026-10-09

Consolidated functional release for Pi 1.1.0, Node 22.19+, macOS and Linux. It includes the
memory/recovery/SDK work in rc.1–rc.3 and the native retrieval guidance below. Runtime APIs,
dependencies and stored schemas are unchanged from rc.3. Settle pending work and preserve a
complete backup before updating. Comparative recall, cache savings and cost advantages remain
unmeasured; extensive benchmarks are an optional research track, not a delivery prerequisite.

- Add an authentication-only Pi check that observes native OAuth renewal and reuse from a new runtime without inference or credential export. Subscription studies record sanitized refresh/completion counters; a valid login or completed refresh exchange alone does not qualify real-model behavior.

- Add independent ChatGPT subscription quality/cache studies through Pi's public model runtime, with isolated trial profiles and durable shared token/call limits. Keep native OAuth refresh in Pi, prohibit API-key fallback, stop on provider/quota failures, require terminal completion and usage, and distinguish idle observations from cache expiry. API-price estimates are not subscription charges; the original Anthropic protocols remain frozen.
- Clarify that provider support determines output-token enforcement: Pi's ChatGPT subscription route omits `max_output_tokens`. The evaluator reserves the full pinned catalog ceiling instead of claiming a client-enforced cap.

- Clarify that native memory retrieval uses the current Pi session, while `scope=chat` selects only the separate `/optchat chat` history. Describe the scope in the tool schema and return an explicit recovery hint when that separate history has not started; preserve strict history isolation.

## 0.4.0-rc.3 — 2026-10-08

Corrective engineering candidate. This packages the native footer correction, continuous-cache
evaluation tooling and offline local checks. Runtime dependencies, public APIs and stored
task/document versions are unchanged from rc.2. Settle pending work and preserve a complete
backup before updating. Real-provider O2 and consolidated O4 qualification remain pending.

- Add `check:local` to run the engineering and distribution gates without GitHub Actions. Upgrade verification accepts a checksum-pinned local rc.1 tarball; npm offline mode refuses a missing local baseline instead of downloading it.

- Distinguish prior records in the frozen request context from records committed after a native Pi turn. Refresh the footer after settlement and cancellation, clear stale session status and preserve failure notices.

- Add a separate frozen continuous-cache evaluation with paired ordinary-Pi/native sessions, batch growth, runtime resume, TTL observation and all-call accounting. Reuse one durable spending cap across quality and cache studies; retain legacy ledger charges. Synthetic rehearsals do not qualify real-provider performance.

## 0.4.0-rc.2 — 2026-10-08

Corrective engineering candidate. Real-model quality, measured cache savings and consolidated
roadmap qualification remain pending. Settle pending rc.1 work and preserve a complete backup
before upgrading; SDK hosts now call `prepare(storage)` before `Harness.open`.

- Correct the merge-order bug identified in Taelin's updated OptChat/UniiChat recipe. Measure age from a sibling pair's last message and batch main-view merges from the high-water budget toward half; persist unfinished batches and a smaller compactor view across restarts.
- Add stable four-line view blocks and Anthropic markers through Pi's public payload hooks, with explicit SDK `cacheProvider` support. Preserve host cache opt-out, TTL and marker limits; coordinate identical concurrent prefixes until the first response starts.
- Replace the compactor's content-bearing example with a byte-length dash ruler. Report token-weighted cache reads separately from per-request hits and simulated results; actual provider cache savings remain unmeasured.

- Add a frozen synthetic evaluation corpus and protocol, paired ordinary-Pi/native runner, independent original checks, sanitized usage reports and durable spending reservations. Dry runs cannot qualify answer quality; real-provider evaluation remains pending.
- Add separate fsynced storage workloads at 1k, 10k and 100k records and injected provider-failure/accounting tests.
- Add a stored configuration contract and SDK `prepare(storage)` step before `Harness.open`. Reject unsupported OptChat versions, model/budget changes and pending legacy upgrades before mutation; the Node app preflights an isolated snapshot before JSONL recovery.
- Verify upgrades from the checksum-pinned rc.1 package, complete backup restoration, SDK branch/source identity, native Pi adoption and recovery of pending work with its original version. Add a fresh public SDK consumer for host tools, cancellation and shutdown.
- Freeze resolved factory/application settings and report native archive pending tasks. Native legacy adoption uses saved configuration; CLI/SDK legacy adoption requires an explicit original-settings assertion.
- Preserve SDK queue order after a middle request is cancelled; reject concurrent native freezes that reuse a request ID with different historical sources.
- Add offline `archive inspect` / `archive export` commands and public Node `inspectArchive` / `exportArchive` APIs. Read committed evidence on a disposable snapshot without changing original history, starting models or replaying host actions.
- Add before/after-commit SIGKILL regressions, first-transcript orphan-journal recovery, bounded failure/input checks and an integrity requirement-to-test map.
- Add separate OptChat and companion-agent roadmaps, prioritizing memory/recovery, real-provider evaluation, SDK upgrades and a qualified release before cloud/tool integration.
- Distinguish existing Pi users, first-time installation and Pi Durable SDK hosts; document automatic runtime dependency installation and adoption of the selected Pi session's available history.
- Complete first-run onboarding in both READMEs: pinned Pi prerequisites, observable memory checks, demo persistence and shutdown, troubleshooting, and runnable source/SDK development steps.
- Organize documentation into guides, technical references and development procedures; align English and Portuguese overviews and clarify execution, storage, configuration and recovery boundaries for every entry point.
- Add repository conventions, contribution templates, an explicit release workflow, pinned formatting and automated local documentation link/anchor checks.
- Group core and Pi integration tests with shared fixtures, and move source-reference lookup into the storage layer so retrieval no longer depends on summary-task definitions.
- Clarify native versus separate-chat model/history behavior in the Pi command help. Existing entry points and task/document versions are retained; the additions are described above.

## 0.4.0-rc.1 — native session memory

- Make ordinary Pi messages use OptChat by default through public extension hooks. Preserve the host persona, tools, permissions, steering, current-turn reasoning signatures and model selection.
- Add a completed-message journal, provenance-bearing source references, selected-branch memory, common-prefix summary reuse and persisted frozen-view receipts. Respect context edits and `--no-session`.
- Cancel native compaction and cache-renewal pings in native mode. Abort unprepared requests explicitly, block tools after archive errors, and cancel durable preparation on Escape.
- Keep the v0.3 separate chat under `/optchat chat`; `--optchat-mode chat` preserves that behavior. `optchat_memory` defaults to the current mode, with explicit `scope` available.
- Add actual Pi runtime lifecycle tests and SIGKILL recovery of native summary work. Publish the conformance review and unresolved real-provider/performance qualification instead of claiming state-of-the-art results.
- Existing SDK request/task schemas remain compatible. Native archives are new, separate stores. Update with pending work settled; cross-version in-flight migration remains unqualified.

## 0.3.0 — 2026-10-07

- Add an installable Pi coding-agent package: `pi install git:github.com/kevinqz/optchat-durable@v0.3.0`, using the native TypeScript loader without compilation or another CLI process.
- Add `/optchat` commands, Markdown transcript entries, pending status, cancellation, explicit recovery and the `optchat_memory` retrieval tool. The separate durable chat shares the existing core; normal coding-agent messages are not automatically indexed.
- Delegate model calls and request-time authentication to the host's public model registry. Save model references and conservative budgets per workspace/channel without copying credentials. Keep history reachable even before Pi saves a normal transcript.
- Close resources on shutdown/reload without aborting persisted requests. Add an optional cancellation context for SDK waiters, distinct from request cancellation.
- Make source retrieval index newly committed entries before reading, without waiting for summaries or starting model calls.
- Qualify against official Pi 1.1.0, including the new installer/SDK tests, existing process-crash tests and standalone package checks. Keep attribution and versioned upstream references current.
- Move Pi Durable/Chord to runtime dependencies and use Pi's host-peer convention. Remove the prepare build because Pi Git installs omit development dependencies. Add source-only installation and bundled CLI verification to CI.

## 0.2.0 — 2026-10-07

- Credit Victor Taelin for OptChat and Mario Zechner, Earendil Works, and the Pi contributors for the runtime, prominently in both READMEs.
- Add versioned provenance, a CFF 1.2.0 citation file, and portable attribution notices required by the package verification gate. Add `optchat-durable credits`.
- Compose the memory protocol through a native Pi prompt section. Preserve the host's instructions, selected extensions, tools, thinking level, and working directory; keep compactors isolated.
- Require only the main and compactor model references in the SDK factory, with validated defaults. Add `prompt()` over the existing durable queue and idempotency path.
- Recognize the exact legacy standalone prompt without overwriting custom host instructions. Reject explicit policies excluding required memory tools before main-agent model execution.
- Document the SDK/CLI boundary, native event subscriptions, and upgrade limitations. Task/document schemas and Pi peer versions remain unchanged.

## 0.1.0 — 2026-10-07

Initial independent public release: native Pi Durable integration, binary memory tree, local web UI/CLI, typed SDK, crash recovery tests, and verified GitHub release tarball.
