import readline from "readline"
import fs from "fs/promises"
import path from "path"
import chalk from "chalk"
import { Agent } from "./agent.js"
import { OllamaClient, MODEL_RECOMMENDATIONS, type ModelInfo, isThinkingCapable, filterThinkingBlocks } from "./ollama-client.js"
import { MCPClientManager } from "./mcp-client.js"
import { loadConfig, type Config, type MCPServerConfig } from "./config.js"

// ─────────────────────────────────────────────────────────────────────────────
// Advanced Input Handler with Raw Mode
// ─────────────────────────────────────────────────────────────────────────────

const LINE_WIDTH = 56

interface InputState {
  buffer: string
  cursorPos: number
  history: string[]
  historyIndex: number
  thinkingEnabled: boolean
  modelSupportsThinking: boolean
  panelVisible: "shortcuts" | "commands" | null
  waiting: boolean
}

// Clear current line and move cursor to start
function clearLine(): void {
  process.stdout.write("\r\x1b[K")
}

// Move cursor up N lines and clear
function clearLines(n: number): void {
  for (let i = 0; i < n; i++) {
    process.stdout.write("\x1b[1A\x1b[K")
  }
}

// Render the input prompt with visual framing
function renderPrompt(state: InputState): void {
  const line = "─".repeat(LINE_WIDTH)
  
  // Clear previous prompt (3 lines: top border, input, bottom hints)
  clearLines(3)
  
  // Top border
  console.log(chalk.gray(`  ${line}`))
  
  // Input line
  process.stdout.write(chalk.cyan("  > ") + state.buffer)
  
  // Move to next line for hints
  console.log("")
  
  // Bottom hints
  const hints: string[] = []
  hints.push(chalk.gray("? shortcuts"))
  hints.push(chalk.gray("/ commands"))
  if (state.modelSupportsThinking) {
    const thinkingStatus = state.thinkingEnabled 
      ? chalk.cyan("✓") + chalk.green(" Thinking visible") 
      : chalk.gray("✗ Thinking hidden")
    hints.push(thinkingStatus + chalk.gray(" (tab)"))
  }
  console.log("  " + hints.join("    "))
  
  // Move cursor back to input position
  process.stdout.write(`\x1b[2A\r\x1b[${4 + state.buffer.length}C`)
}

// Initial render of prompt (without clearing previous lines)
function renderPromptInitial(state: InputState): void {
  const line = "─".repeat(LINE_WIDTH)
  
  // Top border (cyan)
  console.log(chalk.cyan(`  ${line}`))
  
  // Input line
  process.stdout.write(chalk.cyan("  > "))
  
  // Move to next line for bottom border
  console.log("")
  
  // Bottom border (cyan)
  console.log(chalk.cyan(`  ${line}`))
  
  // Hints line
  const hints: string[] = []
  hints.push(chalk.gray("? shortcuts"))
  hints.push(chalk.gray("/ commands"))
  if (state.modelSupportsThinking) {
    const thinkingStatus = state.thinkingEnabled 
      ? chalk.cyan("✓") + chalk.green(" Thinking visible") 
      : chalk.gray("✗ Thinking hidden")
    hints.push(thinkingStatus + chalk.gray(" (tab)"))
  }
  console.log("  " + hints.join("    "))
  
  // Move cursor back to input position (now 3 lines up)
  process.stdout.write(`\x1b[3A\r\x1b[4C`)
}

// Render shortcuts panel (temporary overlay - below input)
function renderShortcutsPanel(state: InputState): void {
  // Save cursor position, move down past bottom border and hints, print panel
  process.stdout.write("\x1b[s") // Save cursor
  process.stdout.write("\n\n\n") // Move past bottom border and hints line
  
  const line = "─".repeat(LINE_WIDTH)
  console.log(chalk.gray(`  ${line}`))
  console.log(chalk.cyan("  Shortcuts:"))
  console.log(chalk.gray("    Tab       ") + "Toggle thinking visibility")
  console.log(chalk.gray("    ↑/↓       ") + "Navigate command history")
  console.log(chalk.gray("    Ctrl+C    ") + "Exit")
  console.log(chalk.gray(`  ${line}`))
  process.stdout.write(chalk.gray("  (backspace to dismiss)"))
  
  // Restore cursor to input line
  process.stdout.write("\x1b[u")
}

// Render commands panel (temporary overlay - below input)
function renderCommandsPanel(state: InputState): void {
  // Save cursor position, move down past bottom border and hints, print panel
  process.stdout.write("\x1b[s") // Save cursor
  process.stdout.write("\n\n\n") // Move past bottom border and hints line
  
  const line = "─".repeat(LINE_WIDTH)
  console.log(chalk.gray(`  ${line}`))
  console.log(chalk.cyan("  Commands:"))
  console.log(chalk.gray("    /servers       ") + "List connected MCP servers")
  console.log(chalk.gray("    /tools         ") + "List available tools")
  console.log(chalk.gray("    /vault <path>  ") + "Switch to different vault")
  console.log(chalk.gray("    /models        ") + "List models")
  console.log(chalk.gray("    /model <name>  ") + "Switch model")
  console.log(chalk.gray("    /export [file] ") + "Export chat to markdown")
  console.log(chalk.gray("    /clear         ") + "Clear history")
  console.log(chalk.gray("    /help          ") + "Show help")
  console.log(chalk.gray("    /quit          ") + "Exit " + chalk.gray("(or /exit, /bye)"))
  console.log(chalk.gray(`  ${line}`))
  process.stdout.write(chalk.gray("  (type command or backspace to dismiss)"))
  
  // Restore cursor to input line
  process.stdout.write("\x1b[u")
}

// Clear panel (which was rendered below the prompt) and restore hints
function clearPanelAndRestorePrompt(state: InputState, panelLines: number): void {
  // Save cursor, go to where panel starts (3 lines below input: bottom border, hints, then panel)
  process.stdout.write("\x1b[s") // Save cursor
  process.stdout.write("\n\n\n") // Move past bottom border and hints to panel area
  
  // Clear all the panel lines
  for (let i = 0; i < panelLines + 1; i++) { // +1 for the dismiss hint line
    process.stdout.write("\x1b[K\n") // Clear line and move down
  }
  
  // Move back up to hints line (below bottom border) and restore it
  process.stdout.write("\x1b[u") // Go back to input line
  process.stdout.write("\x1b[s") // Save again
  process.stdout.write("\n\n") // Move to hints line (past bottom border)
  process.stdout.write("\x1b[K") // Clear line
  
  // Restore hints
  const hints: string[] = []
  hints.push(chalk.gray("? shortcuts"))
  hints.push(chalk.gray("/ commands"))
  if (state.modelSupportsThinking) {
    const thinkingStatus = state.thinkingEnabled 
      ? chalk.cyan("✓") + chalk.green(" Thinking visible") 
      : chalk.gray("✗ Thinking hidden")
    hints.push(thinkingStatus + chalk.gray(" (tab)"))
  }
  process.stdout.write("  " + hints.join("    "))
  
  // Restore cursor to input line
  process.stdout.write("\x1b[u")
}

// Raw mode input handler
class RawInputHandler {
  private state: InputState
  private onSubmit: (input: string) => Promise<void>
  private onExit: () => void
  
  constructor(
    modelSupportsThinking: boolean,
    onSubmit: (input: string) => Promise<void>,
    onExit: () => void
  ) {
    this.state = {
      buffer: "",
      cursorPos: 0,
      history: [],
      historyIndex: -1,
      thinkingEnabled: true, // Default on for thinking models
      modelSupportsThinking,
      panelVisible: null,
      waiting: false,
    }
    this.onSubmit = onSubmit
    this.onExit = onExit
  }
  
  get thinkingEnabled(): boolean {
    return this.state.thinkingEnabled
  }
  
  setWaiting(waiting: boolean): void {
    this.state.waiting = waiting
  }
  
  updateModel(modelName: string): void {
    this.state.modelSupportsThinking = isThinkingCapable(modelName)
    if (!this.state.modelSupportsThinking) {
      this.state.thinkingEnabled = false
    }
  }
  
  start(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true)
    }
    process.stdin.resume()
    process.stdin.setEncoding("utf8")
    
    renderPromptInitial(this.state)
    
    process.stdin.on("data", (key: string) => this.handleKey(key))
  }
  
  private async handleKey(key: string): Promise<void> {
    const code = key.charCodeAt(0)
    
    // Ctrl+C - exit (always works)
    if (code === 3) {
      this.onExit()
      return
    }
    
    // When waiting for response, ignore all input (escape is handled separately)
    if (this.state.waiting) {
      return
    }
    
    // If shortcuts panel is visible (from ?), any key dismisses it
    if (this.state.panelVisible === "shortcuts") {
      clearPanelAndRestorePrompt(this.state, 7) // 7 lines in shortcuts panel
      this.state.panelVisible = null
      if (code === 127 || code === 8 || code === 27) {
        return // Just dismiss, don't process backspace/escape further
      }
      // Continue to process the key
    }
    
    // If commands panel is visible (from /), handle specially
    if (this.state.panelVisible === "commands") {
      if (code === 27) { // Escape - dismiss and clear buffer
        clearPanelAndRestorePrompt(this.state, 12) // 12 lines in commands panel
        this.state.panelVisible = null
        // Clear all characters in buffer visually
        for (let i = 0; i < this.state.buffer.length; i++) {
          process.stdout.write("\b \b")
        }
        this.state.buffer = ""
        this.state.cursorPos = 0
        return
      }
      if (code === 127 || code === 8) { // Backspace
        if (this.state.buffer.length <= 1) {
          // Backspace at "/" - dismiss panel and clear the slash
          clearPanelAndRestorePrompt(this.state, 12)
          this.state.panelVisible = null
          this.state.buffer = ""
          this.state.cursorPos = 0
          // Just clear the "/" character visually (backspace, space, backspace)
          process.stdout.write("\b \b")
          return
        }
        // Otherwise normal backspace, keep panel open
        this.state.buffer = this.state.buffer.slice(0, -1)
        this.state.cursorPos = this.state.buffer.length
        // Just update the input line, not the whole prompt
        process.stdout.write("\b \b")
        return
      }
      if (code === 13) { // Enter - submit command, dismiss panel first
        clearPanelAndRestorePrompt(this.state, 12)
        this.state.panelVisible = null
        // Continue to Enter handling below
      } else if (code >= 32 && code < 127) {
        // Regular character - add to buffer, keep panel
        this.state.buffer += key
        this.state.cursorPos = this.state.buffer.length
        process.stdout.write(key)
        return
      } else {
        return // Ignore other keys while panel is open
      }
    }
    
    // Tab - toggle thinking
    if (code === 9 && this.state.modelSupportsThinking) {
      this.state.thinkingEnabled = !this.state.thinkingEnabled
      // Update just the hints line (below bottom border)
      process.stdout.write("\x1b[s") // Save cursor
      process.stdout.write("\n\n") // Move past bottom border to hints line
      process.stdout.write("\x1b[K") // Clear line
      const hints: string[] = []
      hints.push(chalk.gray("? shortcuts"))
      hints.push(chalk.gray("/ commands"))
      const thinkingStatus = this.state.thinkingEnabled 
        ? chalk.green("Thinking visible") 
        : chalk.gray("Thinking hidden")
      hints.push(thinkingStatus + chalk.gray(" (tab)"))
      process.stdout.write("  " + hints.join("    "))
      process.stdout.write("\x1b[u") // Restore cursor
      return
    }
    
    // Enter - submit
    if (code === 13) {
      const input = this.state.buffer.trim()
      
      // Clear the prompt area
      console.log("")
      console.log("")
      
      if (input) {
        // Add to history
        this.state.history.push(input)
        this.state.historyIndex = this.state.history.length
      }
      
      this.state.buffer = ""
      this.state.cursorPos = 0
      
      if (input) {
        await this.onSubmit(input)
      }
      
      renderPromptInitial(this.state)
      return
    }
    
    // Backspace (when no panel)
    if (code === 127 || code === 8) {
      if (this.state.buffer.length > 0) {
        this.state.buffer = this.state.buffer.slice(0, -1)
        this.state.cursorPos = this.state.buffer.length
        // Just erase one character in place
        process.stdout.write("\b \b")
      }
      return
    }
    
    // Escape sequences (arrows)
    if (key === "\x1b[A") { // Up arrow
      if (this.state.historyIndex > 0) {
        const oldLen = this.state.buffer.length
        this.state.historyIndex--
        this.state.buffer = this.state.history[this.state.historyIndex] || ""
        this.state.cursorPos = this.state.buffer.length
        // Clear current input and redraw in place
        process.stdout.write("\r\x1b[K") // Go to start of line, clear line
        process.stdout.write(chalk.cyan("  > ") + this.state.buffer)
      }
      return
    }
    
    if (key === "\x1b[B") { // Down arrow
      const oldLen = this.state.buffer.length
      if (this.state.historyIndex < this.state.history.length - 1) {
        this.state.historyIndex++
        this.state.buffer = this.state.history[this.state.historyIndex] || ""
      } else {
        this.state.historyIndex = this.state.history.length
        this.state.buffer = ""
      }
      this.state.cursorPos = this.state.buffer.length
      // Clear current input and redraw in place
      process.stdout.write("\r\x1b[K") // Go to start of line, clear line
      process.stdout.write(chalk.cyan("  > ") + this.state.buffer)
      return
    }
    
    // ? - show shortcuts (only when buffer is empty)
    if (key === "?" && this.state.buffer.length === 0) {
      this.state.panelVisible = "shortcuts"
      renderShortcutsPanel(this.state)
      return
    }
    
    // / - show commands AND add to buffer (only when buffer is empty)
    if (key === "/" && this.state.buffer.length === 0) {
      this.state.buffer = "/"
      this.state.cursorPos = 1
      process.stdout.write("/") // Show the slash in input
      this.state.panelVisible = "commands"
      renderCommandsPanel(this.state)
      return
    }
    
    // Regular character
    if (code >= 32 && code < 127) {
      this.state.buffer += key
      this.state.cursorPos = this.state.buffer.length
      process.stdout.write(key)
    }
  }
  
  stop(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false)
    }
    process.stdin.pause()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy prompt for model selection (before raw mode starts)
// ─────────────────────────────────────────────────────────────────────────────

function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

// Display models and let user select one with arrow keys
// Shows all models but marks ineligible ones
async function selectModel(models: ModelInfo[]): Promise<string> {
  // Find eligible models (those with tool support)
  const eligibleModels = models.filter(m => m.supportsTools === true)
  
  if (eligibleModels.length === 0) {
    console.log(chalk.yellow("\n  No tool-capable models found."))
    console.log("")
    console.log(chalk.gray("  To use this tool, you need a model with tool/function calling support."))
    console.log(chalk.gray("  Browse models at: ") + chalk.cyan("https://ollama.com/search?c=tools"))
    console.log("")
    console.log(chalk.gray("  Quick start:"))
    console.log(chalk.white("    ollama pull qwen2.5:7b-instruct") + chalk.gray("  (4.5GB, recommended)"))
    console.log(chalk.white("    ollama pull qwen3:8b") + chalk.gray("             (5GB, thinking + tools)"))
    console.log("")
    process.exit(1)
  }
  
  // Build list with eligible models first, then ineligible
  const displayList: { model: ModelInfo; eligibleIndex: number | null }[] = []
  let eligibleIdx = 0
  
  // First add all eligible models (sorted by size, largest first - already sorted from input)
  for (const m of models) {
    if (m.supportsTools) {
      displayList.push({ model: m, eligibleIndex: eligibleIdx })
      eligibleIdx++
    }
  }
  
  // Then add ineligible models at the bottom
  for (const m of models) {
    if (!m.supportsTools) {
      displayList.push({ model: m, eligibleIndex: null })
    }
  }
  
  let selectedEligibleIndex = 0
  // Total lines: 1 (header) + 1 (blank) + models.length + 1 (blank) + 1 (helper)
  const totalLines = 1 + 1 + displayList.length + 1 + 1
  
  function renderModelLine(item: { model: ModelInfo; eligibleIndex: number | null }): string {
    const m = item.model
    if (item.eligibleIndex !== null) {
      // Tool-capable model
      const isSelected = item.eligibleIndex === selectedEligibleIndex
      const prefix = isSelected ? chalk.green("  ▸ ") : "    "
      const name = isSelected ? chalk.green(m.name) : chalk.white(m.name)
      const size = chalk.gray(` (${m.size})`)
      const tools = chalk.cyan(" ✓") + chalk.gray(" tools")
      const thinking = m.supportsThinking 
        ? chalk.cyan(" ✓") + chalk.gray(" thinking") 
        : chalk.gray(" ✗") + chalk.gray(" thinking")
      return prefix + name + size + tools + thinking
    } else {
      // No tool support
      return chalk.gray(`    ${m.name} (${m.size})`) + chalk.red(" ✗") + chalk.gray(" ineligible - no tool support")
    }
  }
  
  function renderList(isInitial: boolean) {
    if (!isInitial) {
      // Move cursor up to start of list (totalLines includes current line)
      process.stdout.write(`\x1b[${totalLines}A`)
    }
    
    // Clear line and print header
    process.stdout.write("\x1b[2K")
    console.log(chalk.cyan(`  Select a model (choose from ${eligibleModels.length} available below):`))
    
    // Blank line
    process.stdout.write("\x1b[2K")
    console.log("")
    
    // Print each model
    for (const item of displayList) {
      process.stdout.write("\x1b[2K") // Clear line
      console.log(renderModelLine(item))
    }
    
    // Blank line
    process.stdout.write("\x1b[2K")
    console.log("")
    
    // Helper text
    process.stdout.write("\x1b[2K")
    console.log(chalk.gray("  ↑↓ to select, Enter to confirm"))
  }
  
  // Initial render
  console.log("") // Extra line for spacing after "Checking model capabilities..."
  renderList(true)
  
  return new Promise((resolve) => {
    const stdin = process.stdin
    stdin.setRawMode?.(true)
    stdin.resume()
    stdin.setEncoding("utf8")
    
    const handleKey = (key: string) => {
      // Ctrl+C
      if (key === "\x03") {
        stdin.setRawMode?.(false)
        process.exit(0)
      }
      
      // Enter
      if (key === "\r" || key === "\n") {
        stdin.setRawMode?.(false)
        stdin.removeListener("data", handleKey)
        stdin.pause()
        console.log("") // New line after selection
        resolve(eligibleModels[selectedEligibleIndex].name)
        return
      }
      
      // Arrow keys (escape sequences)
      if (key === "\x1b[A") { // Up arrow
        if (selectedEligibleIndex > 0) {
          selectedEligibleIndex--
          renderList(false)
        }
      } else if (key === "\x1b[B") { // Down arrow
        if (selectedEligibleIndex < eligibleModels.length - 1) {
          selectedEligibleIndex++
          renderList(false)
        }
      }
    }
    
    stdin.on("data", handleKey)
  })
}

// Store last session for export command
let lastAgent: Agent | null = null
let lastConfig: Config | null = null

// Extract vault path from MCP server config
function extractVaultPath(mcpServers: Record<string, MCPServerConfig>): string | null {
  const obsidian = mcpServers.obsidian
  if (obsidian && obsidian.args && obsidian.args.length > 1) {
    return obsidian.args[obsidian.args.length - 1]
  }
  return null
}

// Create new MCP config with different vault path
function createMCPConfigWithPath(
  originalServers: Record<string, MCPServerConfig>,
  newPath: string
): Record<string, MCPServerConfig> {
  const newServers = { ...originalServers }
  if (newServers.obsidian) {
    newServers.obsidian = {
      ...newServers.obsidian,
      args: [...newServers.obsidian.args.slice(0, -1), newPath]
    }
  }
  return newServers
}

export async function runCLI(configPath?: string, modelOverride?: string): Promise<void> {
  // Banner
  console.log("")
  console.log(chalk.cyan.bold("  ╭────────────────────────────────────────────────────────╮"))
  console.log(chalk.cyan.bold("  │") + chalk.white.bold("          Ollama MCP Agent v2.0.0                       ") + chalk.cyan.bold("│"))
  console.log(chalk.cyan.bold("  │") + chalk.gray(" Universal local AI - connect any MCP tool.             ") + chalk.cyan.bold("│"))
  console.log(chalk.cyan.bold("  │") + chalk.gray(" 100% offline, 100% sovereign.                          ") + chalk.cyan.bold("│"))
  console.log(chalk.cyan.bold("  ╰────────────────────────────────────────────────────────╯"))
  console.log("")

  // Load configuration
  const config = await loadConfig(configPath)
  lastConfig = config
  
  if (modelOverride) {
    config.ollama.model = modelOverride
  }

  // Initialize Ollama client
  const ollamaClient = new OllamaClient(config.ollama)
  
  // Check Ollama connection
  process.stdout.write(chalk.gray("  Connecting to Ollama... "))
  const connected = await ollamaClient.checkConnection()
  if (!connected) {
    console.log(chalk.red("✗"))
    console.error(chalk.red("\n  Error: Cannot connect to Ollama. Is it running?"))
    console.log(chalk.gray("  Start with: ollama serve\n"))
    process.exit(1)
  }
  console.log(chalk.green("✓"))

  // Interactive model selection (unless model was overridden via CLI flag)
  if (!modelOverride) {
    try {
      process.stdout.write(chalk.gray("  Checking model capabilities... "))
      const models = await ollamaClient.listModelsWithToolSupport()
      console.log(chalk.green("✓"))
      
      if (models.length > 0) {
        const selectedModel = await selectModel(models)
        config.ollama.model = selectedModel
        ollamaClient.setModel(selectedModel)
      } else {
        console.log(chalk.yellow("\n  No models installed."))
        console.log("")
        console.log(chalk.gray("  Browse models at: ") + chalk.cyan("https://ollama.com/search?c=tools"))
        console.log("")
        console.log(chalk.gray("  Quick start:"))
        console.log(chalk.white("    ollama pull qwen2.5:7b-instruct") + chalk.gray("  (4.5GB, recommended)"))
        console.log(chalk.white("    ollama pull qwen3:8b") + chalk.gray("             (5GB, thinking + tools)"))
        console.log("")
        process.exit(1)
      }
    } catch (error) {
      console.log(chalk.yellow("  Could not list models, using config default"))
    }
  }

  // Check model size for tool calling performance
  const sizeCheck = await ollamaClient.checkModelSize()
  if (sizeCheck.warning) {
    console.log(chalk.yellow(`\n  ⚠ ${sizeCheck.warning}`))
  }

  // Initialize MCP client (quiet mode to suppress connection logs)
  let mcpClient = new MCPClientManager(config.mcpServers, true)
  let currentVaultPath = extractVaultPath(config.mcpServers)
  
  if (Object.keys(config.mcpServers).length === 0) {
    console.log(chalk.yellow("  ⚠ No MCP servers configured"))
    console.log(chalk.gray("    Add servers to config.json\n"))
  } else {
    // Note: The MCP server may output startup messages to stderr
    // We print our status after connection completes
    await mcpClient.connect()
    console.log(chalk.gray("  Connecting to MCP servers... ") + chalk.green("✓"))
    console.log("")
    
    // Show connected MCP servers with tool counts
    console.log(chalk.cyan("  Connected MCP Servers:"))
    const serverNames = Object.keys(config.mcpServers)
    for (const serverName of serverNames) {
      const serverTools = mcpClient.getTools().filter(t => t.name.startsWith(`${serverName}_`))
      const toolCount = serverTools.length
      
      // Special display for obsidian (show vault path)
      if (serverName === "obsidian" && currentVaultPath) {
        console.log(chalk.gray("    • ") + chalk.white(serverName) + chalk.gray(` (${toolCount} tools) - ${currentVaultPath}`))
      } else if (serverName === "nzdpu") {
        console.log(chalk.gray("    • ") + chalk.white(serverName) + chalk.gray(` (${toolCount} tools) - 12,497 companies`))
      } else {
        console.log(chalk.gray("    • ") + chalk.white(serverName) + chalk.gray(` (${toolCount} tools)`))
      }
    }
  }

  const tools = mcpClient.getTools()
  
  // Status line
  console.log("")
  console.log(chalk.gray("  Model: ") + chalk.white(config.ollama.model))
  console.log(chalk.gray("  Total Tools: ") + chalk.white(tools.length + " available"))
  
  // Show thinking capability status
  const modelSupportsThinking = isThinkingCapable(config.ollama.model)
  if (modelSupportsThinking) {
    console.log(chalk.gray("  Thinking: ") + chalk.green("supported"))
  }
  console.log("")

  // Initialize agent
  let agent = new Agent(ollamaClient, mcpClient, config.agent)
  await agent.initialize()
  lastAgent = agent

  // Session state for vault switching
  const session: Session = {
    config,
    mcpClient,
    currentVaultPath,
    agent,
    ollamaClient,
    inputHandler: null as unknown as RawInputHandler,
  }

  // Create input handler
  const inputHandler = new RawInputHandler(
    modelSupportsThinking,
    async (input: string) => {
      // Handle commands
      if (input.startsWith("/")) {
        await handleCommand(input, session)
        return
      }

      // Chat with agent
      try {
        // Mark as waiting to disable input handler
        session.inputHandler.setWaiting(true)
        
        // Start progress indicator with cancel support
        const startTime = Date.now()
        let elapsed = 0
        let cancelled = false
        let cancelHintShown = false
        const showThinkingTimer = session.inputHandler.thinkingEnabled
        
        // Show different progress based on thinking mode
        if (showThinkingTimer) {
          process.stdout.write(chalk.gray("\n  Thinking... 0s"))
        } else {
          process.stdout.write(chalk.gray("\n  Processing..."))
        }
        
        // Set up escape key listener for cancellation
        const abortController = new AbortController()
        let timer: NodeJS.Timeout  // Declare before handler so it can be cleared on escape
        
        // Escape handler - stdin is in UTF-8 mode so we get strings
        // Pure escape is "\x1b" (single char), arrow keys are "\x1b[A" etc
        const escapeHandler = (key: string) => {
          if (key === "\x1b") { // Pure escape key (not an escape sequence)
            cancelled = true
            abortController.abort()
            clearInterval(timer)  // Stop timer immediately to prevent display glitches
          }
        }
        process.stdin.on("data", escapeHandler)
        
        // Timer only updates display when thinking is enabled
        timer = setInterval(() => {
          elapsed = Math.floor((Date.now() - startTime) / 1000)
          const timeStr = elapsed >= 60 
            ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
            : `${elapsed}s`
          
          if (showThinkingTimer) {
            if (elapsed >= 60 && !cancelHintShown) {
              cancelHintShown = true
              process.stdout.write("\r" + chalk.gray(`  Thinking... ${timeStr}`) + chalk.yellow("  (press Esc to cancel)"))
            } else if (cancelHintShown) {
              process.stdout.write("\r" + chalk.gray(`  Thinking... ${timeStr}`) + chalk.yellow("  (press Esc to cancel)"))
            } else {
              process.stdout.write("\r" + chalk.gray(`  Thinking... ${timeStr}`))
            }
          } else {
            // When thinking hidden, show cancel hint after 60s but no timer
            if (elapsed >= 60 && !cancelHintShown) {
              cancelHintShown = true
              process.stdout.write("\r" + chalk.gray("  Processing...") + chalk.yellow("  (press Esc to cancel)"))
            }
          }
        }, 1000)
        
        // Race between chat completion and cancellation
        const chatPromise = session.agent.chat(input, abortController.signal)
        
        // Poll for cancellation
        const checkCancelled = async (): Promise<null> => {
          while (!cancelled) {
            await new Promise(r => setTimeout(r, 100))
          }
          return null
        }
        
        const result = await Promise.race([
          chatPromise.then(r => ({ type: "response" as const, response: r })),
          checkCancelled().then(() => ({ type: "cancelled" as const }))
        ])
        
        // Cleanup
        clearInterval(timer)
        process.stdin.removeListener("data", escapeHandler)
        session.inputHandler.setWaiting(false)
        
        if (result.type === "cancelled") {
          elapsed = Math.floor((Date.now() - startTime) / 1000)
          const timeStr = elapsed >= 60 
            ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
            : `${elapsed}s`
          const label = showThinkingTimer ? "Thinking" : "Request"
          console.log("\r" + chalk.yellow(`  ${label}... cancelled after ${timeStr}`) + "                    ")
          console.log("")
          return // Return to prompt without processing response
        }
        
        const response = result.response
        
        // Stop timer and show completion
        elapsed = Math.floor((Date.now() - startTime) / 1000)
        const timeStr = elapsed >= 60 
          ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
          : `${elapsed}s`
        const completedLabel = showThinkingTimer ? "Thinking" : "Completed"
        console.log("\r" + chalk.gray(`  ${completedLabel}... completed in ${timeStr}`) + "                    ")
        console.log("")
        
        // Filter thinking blocks if thinking display is off
        let content = response.content
        if (!session.inputHandler.thinkingEnabled) {
          content = filterThinkingBlocks(content)
        }
        
        console.log(chalk.green("  Assistant:\n"))
        // Indent response
        const lines = content.split("\n")
        for (const line of lines) {
          console.log("  " + line)
        }
        
        if (response.toolsUsed.length > 0) {
          console.log(chalk.gray(`\n  [Tools: ${response.toolsUsed.join(", ")}]`))
        }
        console.log("")
      } catch (error) {
        // Always restore waiting state
        session.inputHandler.setWaiting(false)
        
        // Handle abort errors gracefully
        if (error instanceof DOMException && error.name === "AbortError") {
          console.log("\r" + chalk.yellow("  Request cancelled") + "                    ")
          console.log("")
          return
        }
        const msg = error instanceof Error ? error.message : String(error)
        console.error(chalk.red(`\n  Error: ${msg}\n`))
      }
    },
    async () => {
      // Exit handler
      inputHandler.stop()
      console.log(chalk.gray("\n\n  Disconnecting..."))
      await session.mcpClient.disconnect()
      console.log(chalk.gray("  Goodbye!\n"))
      process.exit(0)
    }
  )
  
  session.inputHandler = inputHandler
  inputHandler.start()
}

interface Session {
  config: Config
  mcpClient: MCPClientManager
  currentVaultPath: string | null
  agent: Agent
  ollamaClient: OllamaClient
  inputHandler: RawInputHandler
}

async function handleCommand(input: string, session: Session): Promise<void> {
  const [cmd, ...args] = input.slice(1).split(/\s+/)
  
  switch (cmd.toLowerCase()) {
    case "quit":
    case "exit":
    case "bye":
      console.log(chalk.gray("\n  Goodbye!\n"))
      // Restore terminal state and exit
      process.stdin.setRawMode?.(false)
      process.exit(0)

    case "clear":
      session.agent.clearHistory()
      console.log(chalk.gray("\n  Conversation cleared.\n"))
      break

    case "vault":
    case "cd":
      if (args.length === 0) {
        console.log(chalk.gray(`\n  Current vault: ${session.currentVaultPath || "not set"}\n`))
      } else {
        const newPath = args.join(" ").replace(/^["']|["']$/g, "") // Remove quotes if present
        await switchVault(session, newPath)
      }
      break

    case "model":
      if (args.length === 0) {
        console.log(chalk.gray(`\n  Current model: ${session.agent.getModel()}\n`))
      } else {
        const newModel = args.join(" ")
        session.agent.setModel(newModel)
        session.inputHandler.updateModel(newModel)
        console.log(chalk.green(`\n  Model switched to: ${newModel}`))
        if (isThinkingCapable(newModel)) {
          console.log(chalk.gray("  Thinking: supported\n"))
        } else {
          console.log("")
        }
      }
      break

    case "models":
      console.log(chalk.cyan("\n  Installed Models:\n"))
      try {
        const models = await session.ollamaClient.listModelsSorted()
        for (const m of models) {
          const current = m.name === session.agent.getModel() ? chalk.green(" (current)") : ""
          console.log(`    ${m.name}${current}`)
          console.log(chalk.gray(`      ${m.size}, ${m.parameterSize}`))
        }
      } catch (error) {
        console.error(chalk.red("  Failed to list models"))
      }
      
      console.log(chalk.cyan("\n  Models for Tool Calling (7B+ baseline):\n"))
      for (const rec of MODEL_RECOMMENDATIONS.slice(0, 4)) {
        console.log(`    ${rec.name}`)
        console.log(chalk.gray(`      ${rec.size} | RAM: ${rec.ram} | ${rec.notes}`))
      }
      console.log("")
      break

    case "servers":
      const serverNames = Object.keys(session.config.mcpServers)
      if (serverNames.length === 0) {
        console.log(chalk.yellow("\n  No MCP servers configured.\n"))
      } else {
        console.log(chalk.cyan("\n  Connected MCP Servers:\n"))
        let serverIndex = 1
        for (const serverName of serverNames) {
          const serverTools = session.mcpClient.getTools().filter(t => t.name.startsWith(`${serverName}_`))
          console.log(chalk.white(`  ${serverIndex}. ${serverName}`))
          
          // Show server-specific info
          if (serverName === "obsidian" && session.currentVaultPath) {
            console.log(chalk.gray(`     Path: ${session.currentVaultPath}`))
          } else if (serverName === "nzdpu") {
            console.log(chalk.gray(`     Dataset: 12,497 companies`))
          }
          
          console.log(chalk.gray(`     Tools: ${serverTools.length}`))
          console.log(chalk.gray(`     Status: `) + chalk.green("Connected ✓"))
          console.log("")
          serverIndex++
        }
      }
      break

    case "tools":
      const tools = session.mcpClient.getTools()
      if (tools.length === 0) {
        console.log(chalk.yellow("\n  No tools available.\n"))
      } else {
        console.log(chalk.cyan(`\n  Available Tools (${tools.length} total):\n`))
        
        // Group tools by MCP server (based on prefix)
        const toolsByServer: Record<string, typeof tools> = {}
        const serverNames2 = Object.keys(session.config.mcpServers)
        
        for (const serverName of serverNames2) {
          toolsByServer[serverName] = tools.filter(t => t.name.startsWith(`${serverName}_`))
        }
        
        // Display tools grouped by server
        for (const serverName of serverNames2) {
          const serverTools = toolsByServer[serverName]
          if (serverTools.length > 0) {
            console.log(chalk.white(`  ${serverName.toUpperCase()} (${serverTools.length} tools):`))
            for (const tool of serverTools) {
              console.log(`    ${chalk.green("• " + tool.name)}`)
            }
            console.log("") // Empty line between servers
          }
        }
      }
      break

    case "export":
      const filename = args[0] || `vault-chat-${Date.now()}.md`
      await exportChatToFile(session.agent, filename)
      break

    case "help":
    case "?":
      console.log(chalk.cyan("\n  Commands:\n"))
      console.log("    /servers         List connected MCP servers")
      console.log("    /tools           List available MCP tools")
      console.log("    /vault <path>    Switch to a different vault directory")
      console.log("    /model <name>    Switch to a different Ollama model")
      console.log("    /models          List available and recommended models")
      console.log("    /export [file]   Export chat history to markdown")
      console.log("    /clear           Clear conversation history")
      console.log("    /help            Show this help")
      console.log("    /quit            Exit the agent (or /exit, /bye)")
      console.log("")
      break

    default:
      console.log(chalk.yellow(`\n  Unknown command: ${cmd}\n`))
      break
  }
}

async function switchVault(session: Session, newPath: string): Promise<void> {
  // Resolve the path
  const resolvedPath = path.resolve(newPath.replace(/^~/, process.env.HOME || ""))
  
  // Check if path exists
  try {
    const stats = await fs.stat(resolvedPath)
    if (!stats.isDirectory()) {
      console.log(chalk.red(`\n  Error: ${resolvedPath} is not a directory\n`))
      return
    }
  } catch (error) {
    console.log(chalk.red(`\n  Error: Path does not exist: ${resolvedPath}\n`))
    return
  }

  console.log(chalk.gray(`\n  Switching vault to: ${resolvedPath}`))
  
  // Disconnect current MCP client
  process.stdout.write(chalk.gray("  Disconnecting from current vault... "))
  await session.mcpClient.disconnect()
  console.log(chalk.green("✓"))

  // Create new MCP config with new path
  const newMcpServers = createMCPConfigWithPath(session.config.mcpServers, resolvedPath)
  
  // Create and connect new MCP client (quiet mode)
  const newMcpClient = new MCPClientManager(newMcpServers, true)
  await newMcpClient.connect()
  console.log(chalk.gray("  Connecting to new vault... ") + chalk.green("✓"))

  // Update session
  session.mcpClient = newMcpClient
  session.currentVaultPath = resolvedPath
  session.config.mcpServers = newMcpServers
  
  // Recreate agent with new MCP client
  session.agent = new Agent(session.ollamaClient, newMcpClient, session.config.agent)
  await session.agent.initialize()
  lastAgent = session.agent

  const tools = newMcpClient.getTools()
  console.log(chalk.gray("  Vault: ") + chalk.white(resolvedPath))
  console.log(chalk.gray(`  Tools: ${tools.length} available\n`))
}

async function exportChatToFile(agent: Agent, filename: string): Promise<void> {
  const history = agent.getChatHistory()
  
  if (history.length === 0) {
    console.log(chalk.yellow("\n  No chat history to export.\n"))
    return
  }

  const markdown = agent.exportToMarkdown()
  const filepath = path.resolve(filename)
  
  try {
    await fs.writeFile(filepath, markdown, "utf-8")
    console.log(chalk.green(`\n  Chat exported to: ${filepath}\n`))
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(chalk.red(`\n  Failed to export: ${msg}\n`))
  }
}

export async function listModels(configPath?: string): Promise<void> {
  const config = await loadConfig(configPath)
  const ollamaClient = new OllamaClient(config.ollama)

  console.log(chalk.cyan("\n  Ollama Models\n"))

  try {
    const models = await ollamaClient.listModels()
    
    console.log(chalk.white("  Installed:\n"))
    for (const m of models) {
      console.log(`    ${m.name}`)
      console.log(chalk.gray(`      Size: ${m.size} | Params: ${m.parameterSize} | Quant: ${m.quantization}`))
    }
  } catch (error) {
    console.error(chalk.red("  Failed to connect to Ollama. Is it running?"))
    return
  }

  console.log(chalk.white("\n  Models for Tool Calling (7B+ baseline):\n"))
  
  for (const rec of MODEL_RECOMMENDATIONS) {
    console.log(`    ${rec.name}`)
    console.log(chalk.gray(`      ${rec.size} | RAM: ${rec.ram} | Tools: ${rec.toolCalling} | ${rec.notes}`))
  }

  console.log(chalk.gray("\n  Install: ollama pull <model-name>\n"))
}

export async function exportChat(filename?: string, configPath?: string): Promise<void> {
  if (!lastAgent) {
    console.log(chalk.yellow("\n  No active session. Start a chat first with: vault-agent\n"))
    return
  }

  const history = lastAgent.getChatHistory()
  
  if (history.length === 0) {
    console.log(chalk.yellow("\n  No chat history to export.\n"))
    return
  }

  const outputFile = filename || `vault-chat-${Date.now()}.md`
  const markdown = lastAgent.exportToMarkdown()
  const filepath = path.resolve(outputFile)
  
  try {
    await fs.writeFile(filepath, markdown, "utf-8")
    console.log(chalk.green(`\n  Chat exported to: ${filepath}\n`))
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(chalk.red(`\n  Failed to export: ${msg}\n`))
  }
}
