# Security

## Report a vulnerability

Use this repository's **[private vulnerability report](https://github.com/kevinqz/optchat-durable/security/advisories/new)**. Private reporting is enabled. Include the affected version, entry point, a minimal synthetic reproduction and observed impact. Do not post exploit details, API keys, private `.env` files or real transcripts in public issues.

Security fixes target the latest published release line. Native coding-agent integration is currently a 0.4 release candidate; older tags are preserved for reproducibility, not maintained as separate supported branches. No response-time guarantee or upstream endorsement is implied.

## Data and execution boundaries

Conversation data is local, unencrypted and append-only. Real providers receive model context and summary inputs. OptChat does not erase originals or backups when a context edit hides content from future views/retrieval. Thinking blocks are excluded from memory projection, but Pi's own transcript may retain provider reasoning metadata.

In native Pi mode, host tools and permissions remain in Pi. Completed messages are journaled without thinking, including messages not yet flushed by Pi. `--no-session` keeps that native archive in RAM; an explicitly requested separate durable chat is still persistent. A memory checkpoint does not establish whether an external tool action completed or whether retrying it is safe. The adapter does not automatically replay host actions.

The standalone model has only memory retrieval tools. Its web server binds to loopback, validates Host/Origin and requires a mutation header. It has no multi-user authentication and must not be exposed as a public service. See the [HTTP contract](./docs/reference/http-api.md) for its actual controls.

## Storage and dependencies

Use a local filesystem and one writer per archive. Stop the host and back up its full data directory before upgrading; native mode also needs the Pi session file. Recovery on network filesystems, concurrent cloud synchronization and cross-version migration of in-flight tasks are not qualified. A remote model request can be retried and billed again after a crash.

Runtime dependencies and development tools are fixed in the lockfile; CI and package checks do not make third-party code risk-free. Dependency audits report known advisories at a point in time. Changes to providers, host versions or durable schemas need the [validation gates](./docs/development/validation.md) and an explicit compatibility review.
