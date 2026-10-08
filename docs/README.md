# Documentation

OptChat Durable has three entry points with different execution owners. Start with the guide for the one you use. The [project README](../README.md) gives the capability and compatibility overview; [Portuguese overview](../README.pt-BR.md) covers the same entry points.

## Use the package

| Task                                                 | Guide                                                   |
| ---------------------------------------------------- | ------------------------------------------------------- |
| Add memory to ordinary Pi coding-agent conversations | [Pi package](./guides/pi.md)                            |
| Run the local web chat or CLI                        | [Standalone application](./guides/standalone.md)        |
| Integrate a Pi Durable harness in your application   | [SDK integration](./guides/sdk.md)                      |
| Choose models, budgets and storage paths             | [Configuration reference](./reference/configuration.md) |
| Understand the local web interface's endpoints       | [Local HTTP API](./reference/http-api.md)               |

## Understand the implementation

- [Architecture](./reference/architecture.md): memory records, summaries, durable phases and ownership boundaries.
- [OptChat conformance](./reference/conformance.md): requirements, adaptations and remaining qualification work.
- [Credits and provenance](../CREDITS.md): original authors, reviewed upstream revisions and license boundaries.
- [Security](../SECURITY.md): data exposure, local-only hosting and reporting vulnerabilities.

## Contribute and release

- [Repository map and conventions](./development/repository.md): where files belong and how changes are maintained.
- [Contributing](../CONTRIBUTING.md): development setup and review expectations.
- [Validation](./development/validation.md): reproducible commands, evidence and limitations.
- [Release process](./development/releases.md): versioning, package checks, tags, artifacts and verification.
- [Changelog](../CHANGELOG.md): user-visible changes by version.

Detailed technical documentation is maintained in English. `README.pt-BR.md` is a Portuguese entry point, not a separate specification. Update both READMEs when an installation path, capability or limitation changes. Older validation notes are kept as [historical evidence](./development/validation-history.md), not as a statement about an arbitrary current checkout.
