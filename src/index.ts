#!/usr/bin/env node

import { Command } from "commander"
import { runCLI, listModels, exportChat } from "./cli.js"

const program = new Command()

program
  .name("ollama-mcp-agent")
  .description("Universal local AI agent for querying any MCP-enabled data source using Ollama")
  .version("2.0.0")

// Default command - start interactive vault chat
program
  .command("local", { isDefault: true })
  .description("Start local vault agent session")
  .option("-c, --config <path>", "Path to config.json")
  .option("-m, --model <name>", "Ollama model to use")
  .action(async (options) => {
    await runCLI(options.config, options.model)
  })

program
  .command("models")
  .description("List available and recommended Ollama models")
  .option("-c, --config <path>", "Path to config.json")
  .action(async (options) => {
    await listModels(options.config)
  })

program
  .command("export [filename]")
  .description("Export last chat session to markdown file")
  .option("-c, --config <path>", "Path to config.json")
  .action(async (filename, options) => {
    await exportChat(filename, options.config)
  })

program.parse()
