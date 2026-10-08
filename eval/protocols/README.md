# Frozen protocols

`native-haiku-5.5-v1.json` freezes the machine-readable protocol and SHA-256 of the canonical
`JSON.stringify(corpus)` value. The runner verifies both hashes before any run.

The definition must be committed before a paid run, and live runs reject a dirty checkout.
Changing the model, corpus, numerical thresholds or scoring after observing paid results
requires a new protocol ID and fresh runs. Keep failures under their original protocol.

The corresponding [human-readable protocol](../../docs/development/evaluation.md) explains
the comparison and its limits. The existence of this file is not a completed experiment.
