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
- [Cache behavior](./reference/cache.md): upstream correction, native Pi hooks, cache opt-out and honest measurement.
- [OptChat conformance](./reference/conformance.md): requirements, adaptations and remaining qualification work.
- [Credits and provenance](../CREDITS.md): original authors, reviewed upstream revisions and license boundaries.
- [Security](../SECURITY.md): data exposure, local-only hosting and reporting vulnerabilities.

## Contribute and release

- [OptChat roadmap](./development/roadmap.md): priority milestones, acceptance gates and the path from candidate to consolidated release.
- [Companion agent roadmap](./development/agent-roadmap.md): the separate operational Pi Durable Agent application consumes a published OptChat package; its qualification and canonical roadmap live in its own repository.
- [Upstream composition review](./development/upstream-composition.md): native responsibilities, intentional memory policy and coordinated simplification across both repositories.
- [Repository map and conventions](./development/repository.md): where files belong and how changes are maintained.
- [Contributing](../CONTRIBUTING.md): development setup and review expectations.
- [Validation](./development/validation.md): reproducible commands, evidence and limitations.
- [Local validation record](./development/local-validation.md): the macOS/Linux matrix, offline distribution checks, synthetic runs and browser restart verification performed on one development machine.
- [Memory evaluation](./development/evaluation.md): frozen corpus/protocol, ordinary-Pi comparison, spending limits and separate storage workloads.
- [Continuous cache evaluation](./development/cache-evaluation.md): a separate frozen workload for warm prefixes, batches, resume and expiry; no measured provider results yet.
- [Evaluation through Pi login](./development/pi-subscription-evaluation.md): separate ChatGPT subscription protocols, native OAuth, isolated histories and shared token/call limits; no API-price or cache-expiry claim.
- [Integrity coverage](./development/integrity.md): requirement-to-test map and commit-window recovery checks.
- [Storage compatibility and upgrades](./guides/upgrades.md): preparation, legacy adoption, complete backup restoration and explicit version limits.
- [Interactive onboarding validation](./development/onboarding-validation.md): isolated-profile installation, reload, resume and removal evidence, with pending visual/release checks.
- [Release process](./development/releases.md): versioning, package checks, tags, artifacts and verification.
- [Changelog](../CHANGELOG.md): user-visible changes by version.

Detailed technical documentation is maintained in English. `README.pt-BR.md` is a Portuguese entry point, not a separate specification. Update both READMEs when an installation path, capability or limitation changes. Older validation notes are kept as [historical evidence](./development/validation-history.md), not as a statement about an arbitrary current checkout.
