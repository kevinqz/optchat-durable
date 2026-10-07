# Contributing

Use Node.js 22.19.0 or later. Run `npm ci`, `npm run check`, `npm run build`, and `npm run check:package` before submitting a change. No provider key is required for these tests. macOS and Linux are tested; changes claiming another platform must include real validation there.

Keep Pi's source entries authoritative. Memory indexing, summary nodes, queueing, and context freezes must use native transactions and tasks. Never silently drop original content to make a budget pass. Test recovery when changing durable phases or checkpoints. Changing task/document names or schema versions requires an explicit migration plan for existing storage.

Add focused regression tests for behavior changes. Avoid tests that make paid model calls in CI. Provider quality and cache benchmarks must be labeled separately from deterministic runtime tests. Do not commit credentials, `.env` files, conversation directories, or real transcripts.

The SDK factory and standalone app are separate public entry points. Validate both when changing exports or peer dependencies. Updating Pi requires re-running the crash-recovery and package-install tests before widening compatibility.

To prepare a release, run the checks, use `npm pack`, inspect the file list, and install that tarball in a fresh project. Publish the exact verified tarball and its SHA-256 checksum on a matching GitHub tag. This repository does not automatically publish to npm or upload local files on pushes.
