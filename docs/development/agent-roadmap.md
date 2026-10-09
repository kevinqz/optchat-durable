# Companion agent roadmap

[Documentation index](../README.md) · [OptChat roadmap](./roadmap.md)

The companion application now has its own public repository:

**[Pi Durable Agent](https://github.com/kevinqz/pi-durable-agent)**

Its [canonical A1–A5 roadmap](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/roadmap.md), [architecture](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/architecture.md), [local onboarding](https://github.com/kevinqz/pi-durable-agent#try-it-locally) and [qualification evidence](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/validation.md) are maintained there.

The initial development preview consumes the published **OptChat Durable 0.4.0** artifact through its public extension API. It composes official Cloudflare PiHarness/Lifecycle, Code Mode, a synthetic notes connector, authenticated approvals and a browser interface. Focused local checks cover durable admission, memory, object resets and result delivery. Cloudflare staging, coordinated backup/restore and cross-release qualification remain open; this is not a production-complete agent.

OptChat retains ownership of memory, source retrieval, frozen views, the durable request controller and generic integration APIs. Cloudflare routing, action identities, approvals, connectors and application operations belong to the companion. A generic memory defect found there returns here for a focused fix and published dependency update. Installing OptChat in Pi does not install the companion or its Cloudflare dependencies.
