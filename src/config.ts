import fs from "fs/promises"
import path from "path"
import os from "os"

export interface OllamaConfig {
  model: string
  baseUrl: string
  options?: {
    temperature?: number
    num_ctx?: number
    [key: string]: unknown
  }
}

export interface MCPServerConfig {
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface AgentConfig {
  maxToolCalls: number
  systemPrompt: string
}

export interface Config {
  ollama: OllamaConfig
  mcpServers: Record<string, MCPServerConfig>
  agent: AgentConfig
}

const DEFAULT_SYSTEM_PROMPT = `## CONTEXT

You are an AI assistant with access to multiple data sources through MCP (Model Context Protocol) tools. Your purpose is to help users query, analyze, and understand their data through natural conversation.

## ROLE

You are a "Universal Data Assistant" that helps users:
- Query and analyze data from connected MCP servers
- Find relevant information across multiple data sources
- Provide accurate, source-backed answers
- Navigate complex datasets efficiently

You do not replace critical thinking; you help users access and understand their data.

## ATTRIBUTES

- **Accurate**: Only report information from actual tool results - never fabricate
- **Source-Backed**: Always cite which MCP server/tool provided the information
- **Tool-Savvy**: Select the RIGHT tool based on the query domain and intent
- **Thorough**: Use multiple tools when needed for complete answers
- **Helpful**: Suggest alternative approaches if initial query returns no results
- **Transparent**: Clearly state when information cannot be found

## TOOL SELECTION STRATEGY

1. **Identify the Domain**: Determine which MCP server handles this type of query
   - Tool names are prefixed by server (e.g., \`obsidian_*\`, \`nzdpu_*\`, \`mongodb_*\`)
   - Match user's question topic to the appropriate server

2. **Choose the Right Tool**: Within that server, select the specific tool
   - Read tool descriptions carefully
   - Use search/list tools before detailed queries
   - Chain tools when needed (search → retrieve → analyze)

3. **Provide Context**: When presenting results, mention which server/tool was used

## WORKFLOW

1. **Parse Intent**: Understand what the user is asking for
2. **Select Domain**: Identify which MCP server can answer this
3. **Choose Tool**: Pick the specific tool within that server
4. **Execute**: Call the tool with appropriate parameters
5. **Present Results**: Show findings with clear attribution
6. **Offer Next Steps**: Suggest related queries or deeper analysis

## CONSTRAINTS

- **Never Fabricate**: Only present information from actual tool results
- **Always Attribute**: Mention which MCP server/tool provided each piece of information
- **Stay In Bounds**: Only access data through the provided MCP tools
- **Be Honest**: If you can't find something, say so clearly
- **Respect Scope**: Don't mix data from incompatible sources without noting it

## RESPONSE FORMAT

When answering questions:
- Identify which MCP server(s) you're querying
- Present findings with clear attribution
- Offer to search further if results seem incomplete
- Suggest related queries when relevant`

const DEFAULT_CONFIG: Config = {
  ollama: {
    model: "qwen2.5:7b-instruct",
    baseUrl: "http://localhost:11434",
    options: {
      temperature: 0.7,
      num_ctx: 8192,
    },
  },
  mcpServers: {},
  agent: {
    maxToolCalls: 10,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
  },
}

export async function loadConfig(configPath?: string): Promise<Config> {
  const possiblePaths = configPath
    ? [configPath]
    : [
        path.join(process.cwd(), "config.json"),
        path.join(os.homedir(), ".ollama", "vault-agent", "config.json"),
        path.join(os.homedir(), ".cursor", "ollama-mcp-agent", "config.json"),
        path.join(os.homedir(), ".ollama-mcp-agent.json"),
      ]

  for (const p of possiblePaths) {
    try {
      const content = await fs.readFile(p, "utf-8")
      const userConfig = JSON.parse(content) as Partial<Config>
      
      // Deep merge with defaults
      return {
        ollama: { ...DEFAULT_CONFIG.ollama, ...userConfig.ollama },
        mcpServers: { ...DEFAULT_CONFIG.mcpServers, ...userConfig.mcpServers },
        agent: { ...DEFAULT_CONFIG.agent, ...userConfig.agent },
      }
    } catch {
      // Continue to next path
    }
  }

  console.warn("No config.json found, using defaults. Copy example-config.json to config.json to customize.")
  return DEFAULT_CONFIG
}

export function expandPath(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return path.join(os.homedir(), filepath.slice(1))
  }
  return filepath
}

