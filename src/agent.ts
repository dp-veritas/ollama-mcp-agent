import type { Message } from "ollama"
import { OllamaClient, type ToolCall } from "./ollama-client.js"
import { MCPClientManager } from "./mcp-client.js"
import type { AgentConfig } from "./config.js"

export interface AgentResponse {
  content: string
  toolsUsed: string[]
}

export interface ChatTurn {
  role: "user" | "assistant"
  content: string
  toolsUsed?: string[]
  timestamp: Date
}

export class Agent {
  private ollamaClient: OllamaClient
  private mcpClient: MCPClientManager
  private config: AgentConfig
  private conversationHistory: Message[] = []
  private chatHistory: ChatTurn[] = []
  private sessionStart: Date = new Date()

  constructor(
    ollamaClient: OllamaClient,
    mcpClient: MCPClientManager,
    config: AgentConfig
  ) {
    this.ollamaClient = ollamaClient
    this.mcpClient = mcpClient
    this.config = config
  }

  async initialize(): Promise<void> {
    // Add system prompt to conversation
    this.conversationHistory = [
      {
        role: "system",
        content: this.config.systemPrompt,
      },
    ]
  }

  async chat(userMessage: string): Promise<AgentResponse> {
    const toolsUsed: string[] = []

    // Track user message for export
    this.chatHistory.push({
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    })

    // Add user message to history
    this.conversationHistory.push({
      role: "user",
      content: userMessage,
    })

    const tools = this.mcpClient.getOllamaTools()
    let toolCallCount = 0

    while (toolCallCount < this.config.maxToolCalls) {
      // Get response from Ollama
      const response = await this.ollamaClient.chat(
        this.conversationHistory,
        tools.length > 0 ? tools : undefined
      )

      // Add assistant response to history
      this.conversationHistory.push(response.message)

      // If no tool calls, we're done
      if (!response.toolCalls || response.toolCalls.length === 0) {
        const content = response.message.content || ""
        
        // Track assistant response for export
        this.chatHistory.push({
          role: "assistant",
          content,
          toolsUsed: toolsUsed.length > 0 ? [...toolsUsed] : undefined,
          timestamp: new Date(),
        })
        
        return { content, toolsUsed }
      }

      // Process tool calls
      for (const toolCall of response.toolCalls) {
        toolCallCount++
        toolsUsed.push(toolCall.name)

        try {
          console.log(`  [Tool] ${toolCall.name}(${JSON.stringify(toolCall.arguments)})`)
          
          const result = await this.mcpClient.callTool(
            toolCall.name,
            toolCall.arguments
          )

          // Add tool result to conversation
          this.conversationHistory.push({
            role: "tool",
            content: result,
          })

          console.log(`  [Result] ${result.slice(0, 200)}${result.length > 200 ? "..." : ""}`)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          console.error(`  [Error] Tool ${toolCall.name} failed: ${errorMsg}`)
          
          this.conversationHistory.push({
            role: "tool",
            content: `Error: ${errorMsg}`,
          })
        }
      }
    }

    // If we hit max tool calls, get final response without tools
    const finalResponse = await this.ollamaClient.chat(this.conversationHistory)
    this.conversationHistory.push(finalResponse.message)

    const content = finalResponse.message.content || "(No response)"
    
    // Track assistant response for export
    this.chatHistory.push({
      role: "assistant",
      content,
      toolsUsed: toolsUsed.length > 0 ? [...toolsUsed] : undefined,
      timestamp: new Date(),
    })

    return { content, toolsUsed }
  }

  clearHistory(): void {
    this.conversationHistory = [
      {
        role: "system",
        content: this.config.systemPrompt,
      },
    ]
    this.chatHistory = []
    this.sessionStart = new Date()
  }

  getModel(): string {
    return this.ollamaClient.model
  }

  setModel(model: string): void {
    this.ollamaClient.setModel(model)
  }

  getOllamaClient(): OllamaClient {
    return this.ollamaClient
  }

  getMCPClient(): MCPClientManager {
    return this.mcpClient
  }

  getChatHistory(): ChatTurn[] {
    return this.chatHistory
  }

  getSessionStart(): Date {
    return this.sessionStart
  }

  exportToMarkdown(): string {
    const lines: string[] = []
    
    lines.push("# Vault Agent Chat Export")
    lines.push("")
    lines.push(`**Date**: ${this.sessionStart.toLocaleDateString()} ${this.sessionStart.toLocaleTimeString()}`)
    lines.push(`**Model**: ${this.ollamaClient.model}`)
    lines.push(`**Turns**: ${this.chatHistory.filter(t => t.role === "user").length}`)
    lines.push("")
    lines.push("---")
    lines.push("")

    for (const turn of this.chatHistory) {
      if (turn.role === "user") {
        lines.push("## User")
        lines.push("")
        lines.push(turn.content)
        lines.push("")
      } else {
        lines.push("## Assistant")
        if (turn.toolsUsed && turn.toolsUsed.length > 0) {
          lines.push("")
          lines.push(`*Tools used: ${turn.toolsUsed.join(", ")}*`)
        }
        lines.push("")
        lines.push(turn.content)
        lines.push("")
        lines.push("---")
        lines.push("")
      }
    }

    return lines.join("\n")
  }
}

