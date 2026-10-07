import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createRegistry, defineExtension, Harness, MemoryStorage, section } from "@earendil-works/pi-durable";
import { configFromEnv, makeModels } from "optchat-durable";
import { createOptChat } from "optchat-durable/extension";

// A complete, credential-free native host example. MemoryStorage is ephemeral;
// production hosts should supply their normal Pi storage and writer exclusion.
const context = BACKGROUND_CONTEXT;
const config = configFromEnv({ OPTCHAT_DEMO: "1" });
const optchat = createOptChat({ main: config.main, compactor: config.compactor });
const registry = createRegistry();
const projectAssistant = defineExtension({
  name: "project-assistant",
  sections: [section("project_rules", () => "Help the user keep track of their projects.")],
});
registry.install(projectAssistant);
registry.install(optchat.extension);
const harness = await Harness.open(new MemoryStorage(), {
  registry,
  models: await makeModels(config),
  settings: optchat.settings,
}, context);

try {
  const conversation = await harness.root(context, {
    agent: { model: config.main, extensions: [projectAssistant, optchat.extension],
      instructions: "Reply in the user's language.", thinkingLevel: "medium" },
  });
  const chat = optchat.attach(harness, conversation, context);
  console.log((await chat.prompt("Remember project Aurora.", "example-1")).answer);
  await chat.settleMemory();
  console.log(await chat.search("Aurora"));
} finally {
  // The host owns shutdown. attach() neither opens nor closes storage.
  await harness.close(context);
}
