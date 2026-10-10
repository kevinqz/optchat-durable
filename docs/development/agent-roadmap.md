# Companion agent roadmap

[Documentation index](../README.md) · [OptChat roadmap](./roadmap.md) · [Upstream composition review](./upstream-composition.md)

The companion is maintained in **[Pi Durable Agent](https://github.com/kevinqz/pi-durable-agent)**. Its [0.1.0 release](https://github.com/kevinqz/pi-durable-agent/releases/tag/v0.1.0) is the first operational delivery, consuming published OptChat 0.4.0. It combines the official PiHarness/Lifecycle and Code Mode with application authentication, exact approvals, result delivery and coordinated checkpoints.

The qualified workflow uses GPT-OSS-120B and session-local notes. Its evidence covers structured tool admission, approval, retained completion and follow-up, original retrieval, same-build restoration, specific interruption boundaries, separate authenticated identities, independent installation and the exact dev.4 → 0.1.0 local update. These observations do not establish arbitrary-failure recovery, generic exactly-once effects, cross-build checkpoint migration or support for every provider. See the companion's [validation](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/validation.md) and [canonical roadmap](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/roadmap.md).

The next coordinated track is [upstream composition](./upstream-composition.md): put generic request-outcome inspection in OptChat first, publish it, then simplify the companion consumer. The companion owns the separate audit of facet scheduling, application admission and action delivery. Each repository keeps one canonical plan for its own implementation instead of copying the other's historical status.

OptChat owns memory, source retrieval, frozen views and the preparation controller. The companion owns Cloudflare routing, authenticated approvals, connectors, application records and deployment. Installing the OptChat Pi extension does not install the companion or its Cloudflare dependencies.

[Local onboarding](https://github.com/kevinqz/pi-durable-agent#try-it-locally) needs no cloud account or model credentials. [Hosted deployment](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/deployment.md) has separate account and model requirements. [Session exports](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/session-export.md) are readable archives, not execution backups; the [checkpoint guide](https://github.com/kevinqz/pi-durable-agent/blob/main/docs/coordinated-recovery.md) defines restoration scope.
