# Repository map and conventions

[Documentation index](../README.md) · [Contributing](../../CONTRIBUTING.md)

The repository is one npm/Pi package. Modules are grouped by responsibility; public entry points stay stable. Avoid adding another package, framework or abstraction unless an actual ownership boundary requires it.

## Directory map

```text
.
├── README.md / README.pt-BR.md    product overview and installation entry points
├── docs/
│   ├── guides/                   Pi, standalone and SDK usage
│   ├── reference/                architecture, configuration, HTTP and conformance
│   └── development/              repository, validation, history and release process
├── src/
│   ├── index.ts                  public application/SDK exports
│   ├── extension.ts              public Pi Durable factory
│   ├── cli.ts                    standalone executable
│   ├── memory/                   shared tree, documents, tasks and retrieval
│   └── pi/                       coding-agent lifecycle and source projection
├── pi/index.ts                   source-loaded Pi package entry point
├── web/                          static standalone interface
├── examples/                     runnable consumers of public exports
├── eval/                         versioned corpus, protocols, runners and reviewed evidence
├── test/
│   ├── core/                     memory, SDK, persistence and HTTP contracts
│   ├── pi/                       coding-agent integration and lifecycle
│   ├── helpers/                  reusable synthetic providers and host fixtures
│   └── fixtures/                 disposable process-crash workers
├── scripts/                      repository and distribution verification
└── .github/                      CI and contribution templates
```

Generated `dist/`, installed `node_modules/`, conversation data and credentials are not source files. They are ignored and excluded from publication except for the intentionally compiled `dist/` in release tarballs. Do not add real transcripts, credentials, screenshots containing them, or machine-specific paths.

## Source ownership

| Files                                                            | Responsibility                                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/config.ts`, `prompts.ts`                                    | Explicit configuration and stable model instructions; imports have no environment-file side effects |
| `src/extension.ts`, `controller.ts`, `request-task.ts`           | SDK composition, per-conversation operations and durable queued request phases                      |
| `src/app.ts`, `models.ts`, `provider-guard.ts`, `writer-lock.ts` | Node application lifecycle, supplied providers, transport guard and writer exclusion                |
| `src/cli.ts`, `server.ts`, `web/`                                | Standalone input and presentation; observe durable state rather than reconstructing another history |
| `src/recovery.ts`, `storage-snapshot.ts`                         | Offline evidence inspection/export and isolated copies; no Harness or model execution               |
| `src/memory/tree.ts`                                             | Pure address, partition, byte budget and pagination rules                                           |
| `src/memory/documents.ts`, `transcript.ts`, `store.ts`           | Durable data shapes, source normalization and storage/index operations                              |
| `src/memory/tasks.ts`, `tools.ts`                                | Summary scheduling versus retrieval; retrieval depends on storage, not task definitions             |
| `src/pi/sources.ts`, `archive.ts`, `projection.ts`               | Selected Pi ancestry, durable branch memory and provider-context projection                         |
| `src/pi/native.ts`, `session.ts`, `models.ts`, `extension.ts`    | Public host hooks, archive lifecycle, model bridge, commands and tool registration                  |

`src/storage-contract.ts` owns the version/configuration preflight and one-time storage preparation; it uses public Pi storage and Session APIs without owning a scheduler.

The small application/SDK modules remain at `src/` because they compose the shared core. Do not move them into `src/pi/` or introduce a second memory engine. `pi/index.ts`, package exports and the CLI bin are distribution contracts; internal `src/`/`dist/` paths are not public APIs.

Evaluation code stays under `eval/`: shared Pi lifecycle, source checks and scoring at its root;
continuous trajectories in `eval/cache/`; subscription authentication, protocols and accounting
in `eval/pi/`. Frozen JSON protocols belong in `eval/protocols/`. A provider-specific study
reuses the shared lifecycle rather than adding a memory implementation or changing an older
protocol's meaning. `eval/results/` contains only reviewed evidence, never live profiles.

## Coding conventions

- TypeScript ESM with `.js` relative import specifiers, strict types and no unused locals/parameters. Use `import type` for type-only imports.
- File names use lowercase kebab-case; test files use `.test.ts`. Name modules for their domain, not `utils`, `helpers` or a speculative abstraction. Test-only helpers belong in `test/helpers/`.
- Prettier is the formatting authority: two spaces, LF, final newline, 100-column code target. `.editorconfig` and `.gitattributes` align editors and Git. Do not hand-format against the tool.
- Keep pure tree rules independent of I/O. Keep source lookup in storage. Keep transport, permissions and lifecycle at their respective boundaries.
- Use public Pi APIs. Preserve host tool permissions and current-turn content. Never turn memory recovery into an automatic replay of an uncertain external action.
- Persist related state in one Pi transaction. Task/document names, versions, checkpoints and entry kinds are recovery contracts; changes need a compatibility/migration decision.
- Keep errors actionable and visible. Do not silently truncate originals, claim a completed action from partial state or turn a failed preparation into an unbounded raw-history fallback.

## Documentation conventions

English technical guides are canonical. Keep the Portuguese README aligned on installation, supported entry points and limitations. Existing Portuguese UI text and historical validation records remain explicitly labeled.

Use the README for the concise product explanation. Put procedures in `docs/guides/`, contracts in `docs/reference/`, and contributor/release information in `docs/development/`. Add each new document to the appropriate navigation page. Keep attribution and standard community entry points at the root so GitHub and package consumers can find them.

State which entry point a claim applies to. Distinguish simulation from real inference, memory persistence from tool execution, byte targets from hard view limits, and tested behavior from proposed work. Include a source or reproducible check for consequential claims. Use relative Markdown links and heading anchors; `npm run check:docs` verifies their local destinations without depending on remote availability.

Keep examples complete or label omitted host objects explicitly. Prefer public exports and synthetic data. Documentation changes that move files must update links and the distribution allowlist together.

## Changes and verification

Make commits about the concrete problem and resulting behavior. Keep unrelated features out of a maintenance change. Update `CHANGELOG.md` under Unreleased for user-visible changes; never rewrite an already-published tag or artifact.

`npm run check` enforces formatting, documentation links, strict types and deterministic tests. Distribution changes also require `check:package` and `check:pi`. See [validation](./validation.md) for what each gate proves and [releases](./releases.md) for publishing the exact tested artifact.
