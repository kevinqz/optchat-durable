#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { configFromEnv } from "./config.js";
import { openApp } from "./app.js";
import { availableModels } from "./models.js";
import { serve } from "./server.js";
import { exportArchive, inspectArchive } from "./recovery.js";

if (existsSync(".env")) process.loadEnvFile(".env");
const args = process.argv.slice(2);
if (args.includes("--demo")) {
  process.env.OPTCHAT_DEMO = "1";
  args.splice(args.indexOf("--demo"), 1);
}
const command = args.shift() ?? "serve";

async function main() {
  if (command === "credits") {
    console.log(readFileSync(new URL("../NOTICE", import.meta.url), "utf8"));
    return;
  }
  if (command === "models") {
    console.table(availableModels());
    return;
  }
  if (command === "archive") {
    const [action, directory, destination] = args;
    if (action === "inspect" && directory && args.length === 2)
      console.log(JSON.stringify(await inspectArchive(directory), null, 2));
    else if (action === "export" && directory && destination && args.length === 3)
      console.log(JSON.stringify(await exportArchive(directory, destination), null, 2));
    else
      throw new Error(
        "Usage: optchat-durable archive inspect DIRECTORY | archive export DIRECTORY OUTPUT.jsonl",
      );
    return;
  }
  if (["help", "--help", "-h"].includes(command)) {
    console.log(
      `OptChat Durable\n\n  optchat-durable serve [--demo]          Local browser interface (default)\n  optchat-durable chat [--demo]           Interactive terminal\n  optchat-durable ask "message" [--demo]  Send one message\n  optchat-durable status                 Inspect state and usage\n  optchat-durable zoom 0 1 [offset]       Retrieve original message\n  optchat-durable search "text" [from]    Search original history\n  optchat-durable models                 List Pi model IDs\n  optchat-durable credits                Authors and upstream credits\n  optchat-durable archive inspect DIR    Inspect a stopped archive without running tasks\n  optchat-durable archive export DIR OUT Export committed evidence to a new JSONL file\n\nNode.js >=22.19.0. Set OPENAI_API_KEY or ANTHROPIC_API_KEY for real models.\nThe current directory's .env is loaded; existing environment values take precedence.\nHistory: .optchat/live or .optchat/demo, relative to the current directory.\nSet OPTCHAT_DATA_DIR to choose another location; OPTCHAT_PORT defaults to 4317.\nDocs: https://github.com/kevinqz/optchat-durable`,
    );
    return;
  }
  if (!["serve", "chat", "ask", "status", "zoom", "search"].includes(command))
    throw new Error(`Unknown command: ${command}`);
  const config = configFromEnv();
  const app = await openApp(config, { resume: !["status", "zoom", "search"].includes(command) });
  let server: Awaited<ReturnType<typeof serve>> | undefined;
  let stopping = false;
  const close = async () => {
    if (stopping) return;
    stopping = true;
    await server?.close();
    await app.close();
  };
  const shutdown = () => {
    void close().then(
      () => process.exit(0),
      (error) => {
        console.error(error);
        process.exit(1);
      },
    );
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  try {
    if (command === "serve") {
      const port = Number(process.env.OPTCHAT_PORT ?? 4317);
      if (!Number.isInteger(port) || port < 0 || port > 65535)
        throw new Error("Invalid OPTCHAT_PORT");
      server = await serve(app, port);
      console.log(
        `OptChat + Pi Durable: ${server.url}\n${config.demo ? "DEMONSTRAÇÃO — respostas simuladas, sem custo de API." : `Modelo: ${config.main.provider}/${config.main.modelId}`}\nDados: ${config.directory}\nCtrl+C encerra preservando as tarefas para a próxima abertura.`,
      );
      await new Promise<void>(() => {});
    } else if (command === "ask") {
      const job = await app.enqueue(args.join(" "));
      console.log((await app.wait(job.taskId)).answer);
      await app.settleMemory();
    } else if (command === "status") console.log(JSON.stringify(await app.status(), null, 2));
    else if (command === "zoom")
      console.log(
        JSON.stringify(
          await app.zoom(Number(args[0]), Number(args[1]), Number(args[2] ?? 0)),
          null,
          2,
        ),
      );
    else if (command === "search")
      console.log(JSON.stringify(await app.search(args[0] ?? "", Number(args[1] ?? 0)), null, 2));
    else {
      const input = createInterface({ input: stdin, output: stdout });
      console.log(
        `OptChat${config.demo ? " · DEMONSTRAÇÃO" : ""}. /sair encerra; /status mostra a memória.`,
      );
      try {
        while (!stopping) {
          const text = await input.question("\nVocê > ");
          if (text === "/sair") break;
          if (text === "/status") {
            const state = await app.status();
            console.log(state.memory, state.usage);
            continue;
          }
          if (!text.trim()) continue;
          try {
            const job = await app.enqueue(text);
            console.log(`\nOptChat > ${(await app.wait(job.taskId)).answer}`);
          } catch (error) {
            console.error(error instanceof Error ? error.message : error);
          }
        }
      } finally {
        input.close();
      }
    }
  } finally {
    await close();
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
