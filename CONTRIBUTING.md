# Contributing

Use Node.js 22.19.0 or later. Run `npm ci`, `npm run check`, `npm run build`, and `npm run check:package` before submitting a change. No provider key is required for these tests. macOS and Linux are tested; changes claiming another platform must include real validation there.

Keep source provenance authoritative. Native coding-agent entries are copied into the durable archive with their original IDs; memory indexing, summary nodes, queueing, and context freezes use native transactions and tasks. Never silently drop original content to make a budget pass. Test recovery when changing durable phases or checkpoints. Changing task/document names or schema versions requires an explicit migration plan for existing storage.

Add focused regression tests for behavior changes. Avoid tests that make paid model calls in CI. Provider quality and cache benchmarks must be labeled separately from deterministic runtime tests. Do not commit credentials, `.env` files, conversation directories, or real transcripts.

Native-mode changes must preserve the host's permission pipeline and live tool loop. Use public Pi APIs; do not monkey-patch provider implementations, private session fields or shell out to another agent. Test the real `AgentSessionRuntime` lifecycle, selected-branch isolation, context redactions and `--no-session`. Ordinary hook exceptions are fail-open in Pi 1.1.0: review abort behavior explicitly. The [integration review](./INTEGRATION_REVIEW.md) is the contract for adaptations and remaining qualification.

The SDK factory, standalone app and Pi coding-agent adapter are separate public entry points to the same core. Validate all three when changing exports or dependencies: `npm run check`, `npm run check:package`, and `npm run check:pi`. Updating Pi requires re-running crash recovery and both package-install checks. `npm ci` does not build automatically; run `npm run build` before consuming compiled exports. The Pi adapter intentionally loads TypeScript directly and must work without dev dependencies or a prepare script.

To prepare a release, run the checks, then `npm run check:package -- --output /path/to/new-release-directory`. This retains the exact verified tarball and a SHA-256 checksum after the fresh consumer checks pass; it refuses to overwrite an existing tarball. Publish those files on a matching GitHub tag. This repository does not automatically publish to npm or upload local files on pushes.
