# Security

This is a local, single-user application. Keep the server on loopback. It has no multi-user authentication and must not be exposed through a public reverse proxy. Conversation data is stored unencrypted; real model providers receive context and summarization inputs.

Do not include API keys, real transcripts, or private `.env` files in issue reports. Use a minimal synthetic conversation and record Node/Pi versions. For security-sensitive reports, use GitHub's **Report a vulnerability** option on this repository's Security tab when available; otherwise open an issue asking for a private reporting channel without including exploit details or secrets.

Only the latest 0.1.x release is currently maintained. Recovery tests do not establish safety on network filesystems or guarantee exactly-once execution of external APIs.
