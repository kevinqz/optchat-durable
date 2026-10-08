# Contributing

Start with the [repository map and conventions](./docs/development/repository.md). This is one independent integration with three entry points: Pi coding-agent package, standalone application and Pi Durable SDK. A change to their shared core must preserve the contracts of all three.

## Set up and check

Use Node 22.19+ and the repository lockfile. macOS and Linux are qualified; another platform needs evidence before being advertised.

```sh
npm ci
npm run format
npm run check
npm run build
npm run check:package
npm run check:pi
```

`format` applies Prettier; `check` validates formatting, local documentation links/anchors, strict TypeScript and deterministic tests. No model credentials are required. The distribution checks use temporary consumers/profiles, need npm access and loopback, and verify compiled and source-only installation separately. See [validation](./docs/development/validation.md) for focused checks and their limitations.

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
