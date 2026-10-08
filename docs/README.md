# Documentation

OptChat Durable has three entry points with different execution owners. Start with the guide for the one you use. The [project README](../README.md) gives the capability and compatibility overview; [Portuguese overview](../README.pt-BR.md) covers the same entry points.

Pi Durable is installed automatically with OptChat. The `pi` command belongs to the Pi coding
agent: [existing Pi users](../README.md#already-using-pi) install the extension and reload;
[new users](../README.md#starting-from-zero) install Pi first. The standalone app needs neither
an existing Pi CLI nor a separate runtime installation. Existing Pi Durable applications use
the SDK integration, which requires registering and attaching OptChat in application code.

## Use the package

| Task                                                             | Guide                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------- |
| Add memory to ordinary Pi coding-agent conversations             | [Pi package](./guides/pi.md)                            |
| Run the local web chat or CLI                                    | [Standalone application](./guides/standalone.md)        |
| Integrate a Pi Durable harness in your application               | [SDK integration](./guides/sdk.md)                      |
| Choose models, budgets and storage paths                         | [Configuration reference](./reference/configuration.md) |
| Understand the local web interface's endpoints                   | [Local HTTP API](./reference/http-api.md)               |
| Inspect or export a stopped archive, including an orphan journal | [Recovery procedure](./guides/recovery.md)              |

## Understand the implementation

- [Architecture](./reference/architecture.md): memory records, summaries, durable phases and ownership boundaries.
- [OptChat conformance](./reference/conformance.md): requirements, adaptations and remaining qualification work.
- [Credits and provenance](../CREDITS.md): original authors, reviewed upstream revisions and license boundaries.
- [Security](../SECURITY.md): data exposure, local-only hosting and reporting vulnerabilities.

## Contribute and release

- [OptChat roadmap](./development/roadmap.md): priority milestones, acceptance gates and the path from candidate to consolidated release.
- [Companion agent roadmap](./development/agent-roadmap.md): a separate application that consumes OptChat; implementation follows memory consolidation.
- [Repository map and conventions](./development/repository.md): where files belong and how changes are maintained.
- [Contributing](../CONTRIBUTING.md): development setup and review expectations.
- [Validation](./development/validation.md): reproducible commands, evidence and limitations.
- [Integrity coverage](./development/integrity.md): requirement-to-test map and commit-window recovery checks.
- [Storage compatibility and upgrades](./guides/upgrades.md): preparation, legacy adoption, complete backup restoration and explicit version limits.
- [Release process](./development/releases.md): versioning, package checks, tags, artifacts and verification.
- [Changelog](../CHANGELOG.md): user-visible changes by version.

Detailed technical documentation is maintained in English. `README.pt-BR.md` is a Portuguese entry point, not a separate specification. Update both READMEs when an installation path, capability or limitation changes. Older validation notes are kept as [historical evidence](./development/validation-history.md), not as a statement about an arbitrary current checkout.
