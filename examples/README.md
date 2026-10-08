# Examples

| Example                              | Purpose                                                                                           | Persistence and credentials                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [native-host.mjs](./native-host.mjs) | Register OptChat in a host-owned Pi Durable harness; send a request and retrieve an original fact | Ephemeral `MemoryStorage` and a simulated provider; no credentials |

From a checkout of this revision:

```sh
npm ci
npm run build
node examples/native-host.mjs
```

In another project, install the compiled release tarball from the [SDK guide](../docs/guides/sdk.md), then copy the example. It imports the public package exports; it does not depend on private `src/` imports. `npm run check:package` also runs it in a fresh installed consumer.

See the [SDK integration contract](../docs/guides/sdk.md) before adapting it to persistent data or real tools. To use normal Pi coding-agent sessions instead, follow the [Pi package guide](../docs/guides/pi.md).
