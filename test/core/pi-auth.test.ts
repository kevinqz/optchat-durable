import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { oauthOnly } from "../../eval/pi/auth.js";
import {
  checkSubscriptionAuth,
  SubscriptionAuthObservation,
} from "../../eval/pi/auth-observation.js";

test("auth check observes Pi refresh and reuse from a new file-backed runtime without inference", async () => {
  const directory = await mkdtemp(join(tmpdir(), "optchat-auth-observation-"));
  try {
    const authPath = join(directory, "auth.json");
    const expired = JSON.stringify({
      openai: {
        type: "oauth",
        access: "synthetic-expired",
        refresh: "synthetic-refresh",
        expires: 0,
      },
    });
    await writeFile(authPath, expired, { mode: 0o600 });
    let refreshes = 0;
    let calls = 0;
    let opens = 0;
    let failRefresh = false;
    const open = async (observation: SubscriptionAuthObservation) => {
      opens++;
      const native = oauthOnly(openaiProvider());
      const host = await ModelRuntime.create({
        authPath,
        modelsPath: null,
        modelsStorePath: join(directory, "models.json"),
        refreshOnCreate: false,
      });
      host.registerNativeProvider(
        observation.provider({
          ...native,
          auth: {
            oauth: {
              ...native.auth.oauth!,
              refresh: async (previous) => {
                refreshes++;
                if (failRefresh) throw new Error("synthetic-private-provider-response");
                return {
                  ...previous,
                  access: "synthetic-renewed",
                  expires: Date.now() + 3_600_000,
                };
              },
              toAuth: async (credential) => ({ apiKey: credential.access }),
            },
          },
          streamSimple: () => {
            calls++;
            throw new Error("inference must not run");
          },
        }),
      );
      await host.refresh({ allowNetwork: false });
      return host;
    };
    const first = await checkSubscriptionAuth(open);
    assert.equal(first.authenticated, true);
    assert.equal(first.reopened, true);
    assert.equal(first.refreshObserved, true);
    assert.equal(first.refreshedLoginReused, true);
    assert.equal(first.beforeReopen.refreshCompletions, 1);
    assert.equal(first.afterReopen.refreshAttempts, 0);
    assert.equal(opens, 2);
    assert.equal(refreshes, 1);
    assert.equal(calls, 0);
    assert.equal(first.inferencePerformed, false);
    assert.ok(!JSON.stringify(first).includes("synthetic-"));
    const second = await checkSubscriptionAuth(open);
    assert.equal(second.authenticated, true);
    assert.equal(second.refreshObserved, false, "a valid login is not proof of refresh");
    assert.equal(second.refreshedLoginReused, false);
    assert.equal(refreshes, 1);
    failRefresh = true;
    await writeFile(authPath, expired);
    const failed = await checkSubscriptionAuth(open);
    assert.equal(failed.authenticated, false);
    assert.equal(failed.reopened, false);
    assert.equal(failed.refreshObserved, false);
    assert.equal(failed.refreshedLoginReused, false);
    assert.equal(failed.beforeReopen.refreshFailures, 1);
    assert.ok(!JSON.stringify(failed).includes("synthetic-"));
    assert.equal(calls, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("refresh exchange alone cannot qualify persistence or a successful response", async () => {
  let opens = 0;
  const result = await checkSubscriptionAuth(async (observation) => {
    opens++;
    const native = oauthOnly(openaiProvider());
    const provider = observation.provider({
      ...native,
      auth: { oauth: { ...native.auth.oauth!, refresh: async (value) => value } },
    });
    return {
      getAuth: async () => {
        await provider.auth.oauth!.refresh(
          {
            type: "oauth",
            access: "synthetic-token",
            refresh: "synthetic-refresh",
            expires: 0,
          },
          new AbortController().signal,
        );
        throw new Error("synthetic-private-storage-error");
      },
    };
  });
  assert.equal(result.refreshObserved, true);
  assert.equal(result.refreshedLoginReused, false);
  assert.equal(result.authenticated, false);
  assert.equal(result.beforeReopen.completedResponses, 0);
  assert.equal(opens, 1);
  assert.ok(!JSON.stringify(result).includes("synthetic-"));
});
