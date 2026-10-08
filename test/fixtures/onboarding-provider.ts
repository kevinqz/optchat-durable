import {
  fauxProvider,
  fauxAssistantMessage,
  getCurrentSystemPrompt,
  type FauxResponseFactory,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Manual TUI fixture only. Never answers a real question or makes an external API call. */
export default function onboardingProvider(pi: ExtensionAPI) {
  const fake = fauxProvider({
    models: [{ id: "optchat-onboarding-test", contextWindow: 272_000, maxTokens: 16_384 }],
  });
  const respond: FauxResponseFactory = (context) => {
    fake.appendResponses([respond]);
    if (getCurrentSystemPrompt(context.messages).includes("You maintain the memory index"))
      return fauxAssistantMessage(
        "Synthetic onboarding history; source code TUI-107 remains in original records.",
      );
    const current = context.messages.findLast((message) => message.role === "user");
    const native = JSON.stringify(current).includes("<chat>");
    return fauxAssistantMessage(
      `SIMULATED PROVIDER: message recorded. Current input has OptChat memory: ${native ? "yes" : "no"}. No external API call.`,
    );
  };
  fake.setResponses([respond]);
  pi.registerProvider(fake.provider);
}
