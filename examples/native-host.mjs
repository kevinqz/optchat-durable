import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createRegistry, Harness, MemoryStorage } from "@earendil-works/pi-durable";
import { configFromEnv, makeModels } from "optchat-durable";
import { createOptChat } from "optchat-durable/extension";

// A complete, credential-free native host example. MemoryStorage is ephemeral;
// production hosts should supply their normal Pi storage and writer exclusion.
const context = BACKGROUND_CONTEXT;
const config = configFromEnv({ OPTCHAT_DEMO: "1" });
const optchat = createOptChat(config);
const registry = createRegistry();
registry.install(optchat.extension);
const harness = await Harness.open(new MemoryStorage(), {
  registry,
  models: await makeModels(config),
  settings: optchat.settings,
}, context);

try {
  const conversation = await harness.root(context, {
    agent: { model: config.main, extensions: [optchat.extension] },
  });
  const chat = optchat.attach(harness, conversation, context);
  const job = await chat.enqueue("Remember project Aurora.", "example-1");
  console.log((await chat.wait(job.taskId)).answer);
  await chat.settleMemory();
  console.log(await chat.search("Aurora"));
} finally {
  // The host owns shutdown. attach() neither opens nor closes storage.
  await harness.close(context);
}
