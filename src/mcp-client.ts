import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { spawn } from "child_process"
import type { MCPServerConfig } from "./config.js"
import type { Tool } from "ollama"

export interface MCPTool {
  serverName: string
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export class MCPClientManager {
  private clients: Map<string, Client> = new Map()
  private transports: Map<string, StdioClientTransport> = new Map()
  private tools: MCPTool[] = []
  private serverConfigs: Record<string, MCPServerConfig>
  private quiet: boolean = false

  constructor(serverConfigs: Record<string, MCPServerConfig>, quiet: boolean = false) {
    this.serverConfigs = serverConfigs
    this.quiet = quiet
  }

  async connect(): Promise<void> {
    for (const [name, config] of Object.entries(this.serverConfigs)) {
      try {
        await this.connectServer(name, config)
        if (!this.quiet) {
          console.log(`Connected to MCP server: ${name}`)
        }
      } catch (error) {
        console.error(`Failed to connect to MCP server ${name}:`, error)
      }
    }
  }

  private async connectServer(name: string, config: MCPServerConfig): Promise<void> {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
      stderr: this.quiet ? "ignore" : "inherit",
    })

    const client = new Client(
      { name: "ollama-mcp-agent", version: "1.0.0" },
      { capabilities: {} }
    )

    await client.connect(transport)
    
    this.clients.set(name, client)
    this.transports.set(name, transport)

    // Fetch tools from this server
    const toolsResponse = await client.listTools()
    for (const tool of toolsResponse.tools) {
      this.tools.push({
        serverName: name,
        name: tool.name,
        description: tool.description || "",
        inputSchema: tool.inputSchema as Record<string, unknown>,
      })
    }
  }

  async disconnect(): Promise<void> {
    for (const [name, client] of this.clients) {
      try {
        await client.close()
      } catch (error) {
        console.error(`Error disconnecting from ${name}:`, error)
      }
    }
    this.clients.clear()
    this.transports.clear()
    this.tools = []
  }

  getTools(): MCPTool[] {
    return this.tools
  }

  // Convert MCP tools to Ollama tool format
  getOllamaTools(): Tool[] {
    return this.tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }))
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<string> {
    // Find which server has this tool
    const tool = this.tools.find((t) => t.name === toolName)
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`)
    }

    const client = this.clients.get(tool.serverName)
    if (!client) {
      throw new Error(`Server not connected: ${tool.serverName}`)
    }

    const result = await client.callTool({ name: toolName, arguments: args })
    
    // Extract text content from result
    if (result.content && Array.isArray(result.content)) {
      return result.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n")
    }
    
    return JSON.stringify(result)
  }

  listConnectedServers(): string[] {
    return Array.from(this.clients.keys())
  }
}

