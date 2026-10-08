# Security

This is a local, single-user application. Keep the server on loopback. It has no multi-user authentication and must not be exposed through a public reverse proxy. Conversation data is stored unencrypted; real model providers receive context and summarization inputs.

Do not include API keys, real transcripts, or private `.env` files in issue reports. Use a minimal synthetic conversation and record Node/Pi versions. For security-sensitive reports, use GitHub's **Report a vulnerability** option on this repository's Security tab when available; otherwise open an issue asking for a private reporting channel without including exploit details or secrets.

Security fixes target the latest published release line; the native integration is currently a 0.4 release candidate. Recovery tests do not establish safety on network filesystems or guarantee exactly-once execution of external APIs.

In native Pi mode, selected-branch context edits are respected by model context and ordinary memory retrieval. They do not erase the append-only archive or backups. The completed-message journal preserves copies without reasoning, including messages Pi may not yet have flushed. `--no-session` keeps native memory in RAM. A crash around an external tool action may leave an uncertain result; never infer that replay is safe from a memory checkpoint.
