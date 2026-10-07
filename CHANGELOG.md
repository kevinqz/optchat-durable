# Changelog

## 0.2.0 — 2026-10-07

- Credit Victor Taelin for OptChat and Mario Zechner, Earendil Works, and the Pi contributors for the runtime, prominently in both READMEs.
- Add versioned provenance, a CFF 1.2.0 citation file, and portable attribution notices required by the package verification gate. Add `optchat-durable credits`.
- Compose the memory protocol through a native Pi prompt section. Preserve the host's instructions, selected extensions, tools, thinking level, and working directory; keep compactors isolated.
- Require only the main and compactor model references in the SDK factory, with validated defaults. Add `prompt()` over the existing durable queue and idempotency path.
- Recognize the exact legacy standalone prompt without overwriting custom host instructions. Reject explicit policies excluding required memory tools before main-agent model execution.
- Document the SDK/CLI boundary, native event subscriptions, and upgrade limitations. Task/document schemas and Pi peer versions remain unchanged.

## 0.1.0 — 2026-10-07

Initial independent public release: native Pi Durable integration, binary memory tree, local web UI/CLI, typed SDK, crash recovery tests, and verified GitHub release tarball.
