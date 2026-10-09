import type { Provider } from "@earendil-works/pi-ai";

/** Observe public OAuth operations without retaining credentials or changing Pi's lock/storage. */
export class SubscriptionAuthObservation {
  private attempts = 0;
  private completed = 0;
  private failed = 0;
  private responses = 0;
  private responsesAfterRefresh = 0;

  provider(provider: Provider): Provider {
    const oauth = provider.auth.oauth;
    if (!oauth?.isSubscription) throw new Error("Expected native subscription OAuth");
    return {
      ...provider,
      auth: {
        ...provider.auth,
        oauth: {
          ...oauth,
          refresh: async (credential, signal) => {
            this.attempts++;
            try {
              const result = await oauth.refresh(credential, signal);
              this.completed++;
              return result;
            } catch (error) {
              this.failed++;
              throw error;
            }
          },
        },
      },
    };
  }

  responseCompleted() {
    this.responses++;
    if (this.completed > 0) this.responsesAfterRefresh++;
  }

  snapshot() {
    return {
      refreshAttempts: this.attempts,
      refreshCompletions: this.completed,
      refreshFailures: this.failed,
      completedResponses: this.responses,
      responsesCompletedAfterRefresh: this.responsesAfterRefresh,
    };
  }
}

type AuthHost = { getAuth(provider: string): Promise<unknown> };

/** A second runtime must load the login from the original store; no credential is transferred. */
export async function checkSubscriptionAuth(
  open: (observation: SubscriptionAuthObservation) => Promise<AuthHost>,
  provider = "openai",
) {
  const first = new SubscriptionAuthObservation();
  const second = new SubscriptionAuthObservation();
  let authenticated = false;
  let reopened = false;
  try {
    const initial = await open(first);
    authenticated = !!(await initial.getAuth(provider));
    if (authenticated) {
      const next = await open(second);
      reopened = !!(await next.getAuth(provider));
    }
  } catch {
    // Provider/storage errors can contain account data. Only retain the last completed stage.
  }
  const beforeReopen = first.snapshot();
  const afterReopen = second.snapshot();
  return {
    authenticated,
    reopened,
    beforeReopen,
    afterReopen,
    refreshObserved: beforeReopen.refreshCompletions > 0,
    refreshedLoginReused:
      authenticated &&
      reopened &&
      beforeReopen.refreshCompletions > 0 &&
      afterReopen.refreshAttempts === 0,
    inferencePerformed: false,
  };
}
