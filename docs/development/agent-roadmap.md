# Companion agent roadmap

[Documentation index](../README.md) · [OptChat roadmap](./roadmap.md)

The companion application now has its own public repository:

**[Pi Durable Agent](https://github.com/kevinqz/pi-durable-agent)**

Its [canonical A1–A5 roadmap](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/roadmap.md), [architecture](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/architecture.md), [local onboarding](https://github.com/kevinqz/pi-durable-agent#try-it-locally) and [qualification evidence](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/validation.md) are maintained there.

The development preview consumes the published **OptChat Durable 0.4.0** artifact through its public extension API. It composes official Cloudflare PiHarness/Lifecycle, Code Mode, a synthetic notes connector, authenticated approvals and a browser interface. Focused local checks cover durable admission, memory, object resets and result delivery. Its [local backup and isolated-restore workflow](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/local-recovery.md) preserves the complete stopped Wrangler state, including memory and pending approvals. The reviewed [sequential dev.0 → dev.1 → dev.2 → dev.3 local routes](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/local-upgrades.md) additionally preserve completed actions and exact pending approvals. Each step checks the retained source and target fingerprints; there is no route that skips intermediate releases.

The [private Cloudflare staging path](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/staging.md) has passed Access login, a demo conversation, original-source retrieval and result delivery. The later [dev.2 recovery increment](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/hosted-recovery.md) preserved a pending approval across a dev.1 → dev.2 backend deployment and a forced parent-process reset through native `ctx.abort()`. The browser observed the target version and a new activation with a recovered reset receipt; the same operation completed after approval and the conversation continued. Dependencies, storage schema and the V1 notes connector stayed unchanged.

The companion's [dev.3 session data export](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/session-export.md) adds a browser download and an offline integrity verifier. It paginates the public OptChat history API and includes the current memory view, request/action records and retained executor outputs. It does not change OptChat 0.4.0 or introduce Cloudflare dependencies here. The archive is explicitly non-restorable; it does not close the coordinated backup gate.

These observations qualify the specific backend update and demo pause/reset path. Coordinated hosted backup/restore, other crash windows, second-identity isolation, changed dependencies and real models remain open. See the companion's [evidence and limits](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/validation.md). Local development needs no cloud account or payment; hosted Code Mode requires Workers Paid as explained in [deployment](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/deployment.md).

OptChat retains ownership of memory, source retrieval, frozen views, the durable request controller and generic integration APIs. Cloudflare routing, action identities, approvals, connectors and application operations belong to the companion. A generic memory defect found there returns here for a focused fix and published dependency update. Installing OptChat in Pi does not install the companion or its Cloudflare dependencies.
