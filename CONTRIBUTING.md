# Contributing

Start with the [repository map and conventions](./docs/development/repository.md). This is one independent integration with three entry points: Pi coding-agent package, standalone application and Pi Durable SDK. A change to their shared core must preserve the contracts of all three.

The [roadmap](./docs/development/roadmap.md) defines the current priority: consolidate memory, recovery, real-provider evidence and upgrade contracts. The [companion agent plan](./docs/development/agent-roadmap.md) has a separate scope and depends on a qualified OptChat release.

## Set up and check

Use Node 22.19+ and the repository lockfile. macOS and Linux are qualified; another platform needs evidence before being advertised.

```sh
npm ci
npm run format
npm run check:local
```

`format` applies Prettier; `check:local` runs `check`, `check:package`, `check:pi` and `check:upgrade` sequentially on your machine. It needs no push, GitHub Actions run or model credentials. `check` validates formatting, local documentation links/anchors, strict TypeScript and deterministic tests. Distribution checks build and use temporary consumers/profiles to verify compiled and source-only installation separately.

For an offline run, keep the original rc.1 release tarball locally and populate npm's cache beforehand, including dependencies used by fresh consumers. Then run:

```sh
OPTCHAT_UPGRADE_BASELINE=/absolute/path/to/optchat-durable-0.4.0-rc.1.tgz \
  npm_config_offline=true npm run check:local
```

The baseline must match the published SHA-256; a current source pack cannot replace it. Offline mode refuses a missing baseline and npm fails if a required cached package is absent, without falling back to downloads. Loopback remains necessary for local HTTP tests. This runs the same engineering gates as one CI environment; it does not emulate another operating system or Node version. See [local validation](./docs/development/validation.md#run-without-github-or-registry-downloads) for prerequisites, synthetic evaluations and limits.

## Make a focused change

- Explain the concrete problem and resulting behavior. Keep unrelated features out of a refactor or documentation change.
- Put code and documentation in their owning layer. Reuse the shared memory engine and Pi's public APIs. Prefer a small direct implementation over a generic framework or private runtime patch.
- Add a focused regression when behavior changes. Test recovery when editing durable phases, checkpoints or transaction boundaries. Cosmetic changes need existing checks, not tests that restate formatting.
- Update the relevant guide/reference and both READMEs when public behavior changes. Add user-visible changes to the Unreleased changelog section. Keep old validation records explicitly historical.
- Keep examples runnable using public exports and synthetic data. Never commit credentials, private environment files, real histories or machine-specific paths.

## Preserve integration contracts

Source provenance remains authoritative. Never silently drop original text to fit a budget. Task/document identifiers and versions are recovery contracts: changes require a compatibility and migration decision.

Native Pi mode must preserve the host's tools, permission pipeline, live turn, steering and session/branch boundaries. Context edits and `--no-session` must remain meaningful. Ordinary hook exceptions are fail-open in Pi 1.1.0; preparation failures must explicitly stop the request. Memory persistence does not authorize replaying an uncertain external action.

The SDK controller owns its dedicated conversation's input path; the host owns the harness and custom tool policies. Keep compactors isolated from host tools/persona. A source-loaded Pi install must work without a compiler, `dist/` or `prepare` build script. Updating dependencies or exports requires both installation gates and crash tests.

Read the [architecture](./docs/reference/architecture.md) and [conformance review](./docs/reference/conformance.md) when changing these boundaries. Real-provider quality/cache claims require separately reported experiments, not simulated usage values.

## Open an issue or pull request

Use the issue templates to state the entry point, installed version, Node/Pi versions, synthetic reproduction and expected/observed behavior. For security-sensitive reports, follow [SECURITY.md](./SECURITY.md) instead of posting details publicly.

A PR should explain the final implementation, relevant validation and any compatibility or qualification limits. Use a descriptive title and concrete commit messages. CI checks the supported matrix; a passing run is evidence for that revision, not a substitute for review. Keep discussion constructive and credit upstream work accurately.

Releases use the [documented release process](./docs/development/releases.md). Preserve [credits](./CREDITS.md), citations and license notices in source and packaged distributions. Do not rewrite published tags or artifacts.
