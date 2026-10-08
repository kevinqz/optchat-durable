# Changelog

## Unreleased

- Complete first-run onboarding in both READMEs: pinned Pi prerequisites, observable memory checks, demo persistence and shutdown, troubleshooting, and runnable source/SDK development steps.
- Organize documentation into guides, technical references and development procedures; align English and Portuguese overviews and clarify execution, storage, configuration and recovery boundaries for every entry point.
- Add repository conventions, contribution templates, an explicit release workflow, pinned formatting and automated local documentation link/anchor checks.
- Group core and Pi integration tests with shared fixtures, and move source-reference lookup into the storage layer so retrieval no longer depends on summary-task definitions.
- Clarify native versus separate-chat model/history behavior in the Pi command help. Public exports, task/document identifiers and stored schemas are unchanged.

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
