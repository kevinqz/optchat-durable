# Credits and provenance

OptChat Durable exists because of two upstream projects. Their authors deserve credit for the memory design and the runtime this integration builds on.

| Upstream work | People and project | Contribution used here |
| --- | --- | --- |
| [OptChat](https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449) | **[Victor Taelin](https://github.com/VictorTaelin)** | The hierarchical conversation-memory design: binary summaries, a bounded chronological view, and zoomable access to original messages. |
| [Pi / Pi Durable](https://github.com/earendil-works/pi/tree/v1.0.4/packages/durable) | **[Mario Zechner](https://github.com/badlogic)**, **[Earendil Works](https://github.com/earendil-works)**, and **[Pi contributors](https://github.com/earendil-works/pi/graphs/contributors)** | The durable runtime, native tasks and documents, model providers, extension registry, tools, recovery, and usage accounting. This package uses Pi Durable, Pi AI, and Chord. |

Mario Zechner is named in the upstream copyright notice and authored the [commit introducing the dedicated Pi Durable package](https://github.com/earendil-works/pi/commit/080160162164b6668f6c55b8bc1f335749f74eb3). The official npm package metadata identifies Earendil Works as its author/publisher organization. The contributors link acknowledges the wider project without maintaining an incomplete copied roster.

**This repository's contribution**, maintained by [Kevin Saltarelli](https://github.com/kevinqz), is the independent TypeScript implementation connecting those ideas: memory projection over Pi entries, durable request coordination, native integration API, local UI/CLI, tests, packaging, and documentation. We do not claim authorship of OptChat's original design or Pi's runtime. Upstream authors are not represented as contributors to this repository, nor as endorsing this integration.

## Reproducible source references

| Reference | Reviewed version | Licensing boundary |
| --- | --- | --- |
| OptChat specification | [Gist revision `f51fe5c`](https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449/f51fe5c910427fd6f384d22823140b1693c76207) | No explicit license appears in the reviewed `optchat.md`. We link and credit the design; the original gist and OptMem code are not bundled or relicensed. |
| Pi runtime dependencies | Official npm packages **1.0.4**; upstream [tag `v1.0.4`](https://github.com/earendil-works/pi/tree/v1.0.4), commit [`7c10bd4`](https://github.com/earendil-works/pi/commit/7c10bd4337495ee613f2224843ecdf349b80d1df) | [Upstream MIT license](https://github.com/earendil-works/pi/blob/7c10bd4337495ee613f2224843ecdf349b80d1df/LICENSE), including Mario Zechner's copyright notice, reproduced in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). Dependencies retain their own licenses. |
| This integration | Its own source history and release tags | [MIT](./LICENSE), applying to this repository's original code and documentation. |

Verified on 2026-10-07 against the original repositories, package metadata, and release reference. The moving upstream `main` branch is not the version compatibility contract; the exact package versions and their lockfile remain authoritative for installed code.

## How to credit this work

When describing this integration, a concise attribution is:

> OptChat Durable implements Victor Taelin's OptChat memory design using Pi Durable, from Mario Zechner, Earendil Works, and the Pi contributors. The independent integration is maintained by Kevin Saltarelli.

[CITATION.cff](./CITATION.cff) provides machine-readable citation metadata for this integration and references to both upstream works. It does not assign a license to the OptChat gist. GitHub can expose it through **Cite this repository**.

The distribution includes this page, `CITATION.cff`, [NOTICE](./NOTICE), [LICENSE](./LICENSE), and the upstream license notice. The package verification gate requires these attribution files, so a release cannot silently omit them. Please preserve source attribution and applicable license notices in redistributions.
