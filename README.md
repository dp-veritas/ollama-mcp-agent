# Ollama MCP Agent

Universal local AI agent for querying any MCP-enabled data source using Ollama. **100% offline, 100% sovereign.**

```
  ╭────────────────────────────────────────────────────────╮
  │          Ollama MCP Agent v2.0.0                       │
  │ Universal local AI - connect any MCP tool.             │
  │ 100% offline, 100% sovereign.                          │
  ╰────────────────────────────────────────────────────────╯
```

## What is This?

A CLI agent that connects Ollama (local LLMs) to any MCP (Model Context Protocol) server. Query Obsidian vaults, emissions databases, MongoDB, or any MCP-enabled data source through natural language - all running locally on your machine.

## Features

- **Universal**: Connect to any MCP server - not just Obsidian
- **Multi-Domain**: Query vaults, databases, emissions data in one session
- **Private**: Your data never leaves your machine - 100% local inference
- **Sovereign**: No API keys, no cloud, no data collection
- **Extensible**: Add new MCP servers to your config anytime
- **Flexible**: Switch between data sources without leaving the CLI
- **Export**: Save chat sessions as markdown files

## Supported MCP Servers

This agent works with any MCP server. Popular examples:

| MCP Server | Purpose | Tools |
|------------|---------|-------|
| [mcp-obsidian-tools](https://github.com/dp-veritas/mcp-obsidian-tools) | Query Obsidian vaults | 9 tools for search, tags, backlinks |
| [nzdpu-mcp-server](https://github.com/dp-veritas/nzdpu-mcp-server) | GHG emissions data (12K+ companies) | 7 tools for emissions analysis |
| [mongodb-mcp-server](https://github.com/dp-veritas/mongodb-mcp-server) | MongoDB database queries | 24 tools for database operations |
| Your custom MCP | Any data source | Any tools you build |

## Quick Start

### 1. Prerequisites

```bash
# Node.js 18+ required
node --version   # Should show v18.x.x or higher

# Ollama must be installed and running
ollama serve     # Start Ollama if not already running
```

### 2. Install a Model

Install a 7B+ model with tool-calling support:

```bash
ollama pull qwen2.5:7b-instruct  # 4.5GB, recommended
# Or for thinking capability:
ollama pull qwen3:8b             # 5GB, thinking + tools
```

### 3. Install MCP Servers

Install the MCP servers you want to use. Example with Obsidian:

```bash
# Clone the MCP tools repository
git clone https://github.com/dp-veritas/mcp-obsidian-tools.git
cd mcp-obsidian-tools

# Install dependencies and build
npm install
npm run build

# Note the full path to dist/index.js - you'll need this for config
pwd  # Shows your current directory
```

Repeat for any other MCP servers you want (NZDPU, MongoDB, etc.).

### 4. Install Ollama MCP Agent

```bash
# Clone this repository
git clone https://github.com/dp-veritas/ollama-mcp-agent.git
cd ollama-mcp-agent

# Install dependencies and build
npm install
npm run build

# Optional: Install globally to use 'vault' command from anywhere
npm install -g .
```

### 5. Configure

Create your config file:

```bash
cp example-config.json config.json
```

Edit `config.json` to add your MCP servers:

```json
{
  "ollama": {
    "model": "qwen2.5:7b-instruct"
  },
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": [
        "/full/path/to/mcp-obsidian-tools/dist/index.js",
        "/full/path/to/your/obsidian/vault"
      ]
    },
    "nzdpu": {
      "command": "node",
      "args": ["/full/path/to/nzdpu-mcp-server/dist/index.js"]
    }
  }
}
```

**Replace paths with your actual paths:**
- For Obsidian: Path to `mcp-obsidian-tools/dist/index.js` and your vault directory
- For NZDPU: Path to `nzdpu-mcp-server/dist/index.js`
- Add as many MCP servers as you want

### 6. Run

```bash
# If installed globally:
vault

# Or run directly:
npm run local-agent

# Or with explicit command:
vault local
```

## Usage

### Commands

```bash
vault              # Start local agent session (default)
vault local        # Same as above
vault models       # List available Ollama models
vault export       # Export last chat to markdown
vault --help       # Show help
```

### In-Session Commands

While chatting, use these commands:

| Command | Description |
|---------|-------------|
| `/servers` | List connected MCP servers |
| `/tools` | List available tools (grouped by server) |
| `/vault <path>` | Switch to a different vault directory (Obsidian only) |
| `/models` | List installed models |
| `/model <name>` | Switch to a different model |
| `/export [file]` | Export chat to markdown |
| `/clear` | Clear conversation history |
| `/help` | Show help |
| `/quit` | Exit |

### Example Session

```
  ╭────────────────────────────────────────────────────────╮
  │          Ollama MCP Agent v2.0.0                       │
  │ Universal local AI - connect any MCP tool.             │
  │ 100% offline, 100% sovereign.                          │
  ╰────────────────────────────────────────────────────────╯

  Connecting to Ollama... ✓
  Connecting to MCP servers... ✓

  Connected MCP Servers:
    • obsidian (9 tools) - /path/to/vault
    • nzdpu (7 tools) - 12,497 companies

  Model: qwen2.5:7b-instruct
  Total Tools: 16 available

  > How many companies are in the NZDPU database?

  Thinking...

    [Tool] nzdpu_analyze({"analysis":"overview"})
    [Result] Total companies: 12,497...

  Assistant:

  The NZDPU database contains 12,497 unique companies with 33,630
  emissions records across multiple years.

  [Tools: nzdpu_analyze]

  > What are the most common topics in my vault?

  Thinking...

    [Tool] obsidian_list_tags({})
    [Result] projects: 42, research: 28, meetings: 15...

  Assistant:

  Based on your vault tags, the most common topics are:
  1. projects (42 notes)
  2. research (28 notes)
  3. meetings (15 notes)
  ...

  [Tools: obsidian_list_tags]

  > /servers

  Connected MCP Servers:

  1. obsidian
     Path: /Users/you/Documents/Vault
     Tools: 9
     Status: Connected ✓

  2. nzdpu
     Dataset: 12,497 companies
     Tools: 7
     Status: Connected ✓
```

## Use Cases

### 1. Private Data Analysis
Query sensitive data (financial, proprietary, personal) without cloud exposure. Join emissions data with private financial data for ESG analysis - all offline.

### 2. Multi-Domain Research
Switch between your notes, emissions databases, and other data sources in one conversation. Cross-reference information across domains.

### 3. Knowledge Management
Query your Obsidian vault with natural language. Find connections, explore tags, trace backlinks - all through conversation.

### 4. Database Queries
Connect to MongoDB or other databases through MCP. Query with natural language instead of writing queries manually.

### 5. Custom Workflows
Build your own MCP servers for proprietary data sources. Connect them to this agent for unified access.

## Choosing a Model

### Model Size by Task Complexity

| Task Type | Examples | Minimum Model | Recommended |
|-----------|----------|---------------|-------------|
| **Simple queries** | Find files, count records, list items | 7B | `qwen2.5:7b-instruct` |
| **Basic search** | Search content, read notes, filter data | 7B-8B | `qwen3:8b` |
| **Analysis** | Summarize content, explain data | 14B+ | `qwen2.5:14b-instruct` |
| **Deep analysis** | Detailed breakdown, extract insights | 14B-30B | `qwen3:14b`, `qwen3:30b` |
| **Cross-referencing** | Find connections, trace themes | 14B+ | `qwen3:14b` or larger |
| **Complex reasoning** | Multi-hop queries, synthesis | 30B+ | `qwen3:30b`, `deepseek-r1:32b` |

> **Key insight**: 7-8B models handle tool calling well but struggle with deep analysis and multi-step reasoning. For comprehensive data exploration, use 14B+ models.

### What to Look For

**Size (7B+ minimum, 14B+ for analysis)**  
Models under 7B misinterpret tool schemas. For detailed analysis, 14B+ is strongly recommended.

**Tool/Function Calling Support**  
Look for models with the "tools" tag on [Ollama](https://ollama.com/search?c=tools). Qwen2.5, Qwen3, Llama3.1, and Mistral have native tool support.

**Thinking Models (Recommended for complex tasks)**  
Models like `qwen3` and `deepseek-r1` include reasoning/thinking capabilities that improve multi-step analysis.

**Context Length**  
Larger context (8K-128K) helps when reading multiple notes or analyzing large datasets.

### Recommended Models

| Model | Size | RAM | Best For | Notes |
|-------|------|-----|----------|-------|
| `qwen2.5:7b-instruct` | 4.5GB | 8GB | Simple queries | Fast, reliable tool selection |
| `qwen3:8b` | 5GB | 8GB | Basic analysis | Thinking + tools |
| `llama3.1:8b` | 4.5GB | 8GB | Simple queries | Meta's workhorse |
| `mistral-nemo:12b` | 7GB | 12GB | Medium tasks | 128k context |
| `qwen2.5:14b-instruct` | 9GB | 16GB | Deep analysis | Best mid-range quality |
| `qwen3:14b` | 9GB | 16GB | Cross-referencing | Thinking + larger context |
| `qwen3:30b` | 18GB | 32GB | Complex reasoning | Best local quality |
| `deepseek-r1:32b` | 20GB | 32GB | Complex reasoning | Strong reasoning model |

```bash
# Install any 7B+ model from the table above
ollama pull qwen2.5:7b-instruct
```

## Configuration

Full `config.json` options:

```json
{
  "ollama": {
    "model": "qwen2.5:7b-instruct",
    "baseUrl": "http://localhost:11434",
    "options": {
      "temperature": 0.7,
      "num_ctx": 8192
    }
  },
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["/path/to/mcp-obsidian-tools/dist/index.js", "/path/to/vault"]
    },
    "nzdpu": {
      "command": "node",
      "args": ["/path/to/nzdpu-mcp-server/dist/index.js"]
    },
    "mongodb": {
      "command": "node",
      "args": ["/path/to/mongodb-mcp-server/dist/index.js"],
      "env": {
        "MONGODB_URI": "mongodb://localhost:27017"
      }
    }
  },
  "agent": {
    "maxToolCalls": 15,
    "systemPrompt": "..."
  }
}
```

## Chat Export

Export your conversation to markdown:

```bash
# In-session
/export my-analysis.md

# Or from command line
vault export my-analysis.md
```

Output format:

```markdown
# Ollama MCP Agent Chat Export

**Date**: 12/27/2024 10:30:00 AM
**Model**: qwen2.5:7b-instruct
**Turns**: 5

---

## User

How many companies are in the NZDPU database?

## Assistant

*Tools used: nzdpu_analyze*

The NZDPU database contains 12,497 unique companies...
```

## Performance

| Operation | Time |
|-----------|------|
| Tool call | < 250ms |
| Simple query | ~15s |
| Multi-tool query | ~60-90s |

The bottleneck is LLM inference, not tools.

## Expectations & Limitations

### Local LLMs vs. Cloud Models

This agent prioritizes **privacy over performance**. Running models locally means:

| Aspect | Local (7-8B) | Cloud (Sonnet/GPT-4) |
|--------|--------------|---------------------|
| **Response time** | 30s - 4min | 2-10s |
| **Tool selection** | May need multiple attempts | Usually optimal path |
| **Response quality** | Good for simple queries | Consistently excellent |
| **Privacy** | 100% local, no data leaves | Data sent to cloud |
| **Cost** | Free after setup | Pay per token |
| **Offline** | Works completely offline | Requires internet |

### What Local Models Do Well

- Simple queries: "How many files in my vault?"
- Data lookups: "Find companies in France"
- Basic searches: "What tags do I have?"
- Straightforward analysis: "Top 10 emitters"

### What Requires Larger Models (14B+)

- Deep analysis: "Analyze themes across these notes"
- Complex reasoning: "How does X connect to Y?"
- Synthesis: "Summarize everything about topic Z"
- Multi-step queries requiring nuanced judgment

### Tips for Best Results

1. **Be specific**: "What's the title of my dissertation?" works better than "Tell me about my dissertation"
2. **Use simple queries**: Break complex questions into smaller steps
3. **Try larger models**: If 7-8B struggles, try 14B+ for that task
4. **Use commands**: `/tools` shows what's available; `/servers` shows connected data sources

### Realistic Expectations

A local 7-8B model will **not** match Claude Sonnet or GPT-4 in reasoning quality. The tradeoff is:
- **Choose local** for: privacy, offline access, free usage, simple queries
- **Choose cloud** for: complex reasoning, cross-referencing, time-sensitive tasks

## Troubleshooting

### "Cannot connect to Ollama"

```bash
# Check if running
curl http://localhost:11434/api/tags

# Start Ollama
ollama serve
```

### "Model not available"

```bash
ollama pull qwen2.5:7b-instruct
```

### "No tools available"

Check your `config.json` paths and ensure MCP servers are built:

```bash
cd /path/to/mcp-server
npm run build
```

### Poor tool selection

Use a larger model (7B+). Small models often choose wrong tools.

## Development

```bash
npm run dev          # Run with tsx
npm run build        # Compile TypeScript
npm run local-agent  # Start local agent
npm run models       # List models
npm run export       # Export last chat
```

## Related Projects

- [mcp-obsidian-tools](https://github.com/dp-veritas/mcp-obsidian-tools) - MCP server for Obsidian
- [nzdpu-mcp-server](https://github.com/dp-veritas/nzdpu-mcp-server) - GHG emissions intelligence
- [mongodb-mcp-server](https://github.com/dp-veritas/mongodb-mcp-server) - MongoDB analytics
- [Ollama](https://ollama.ai) - Run LLMs locally
- [Model Context Protocol](https://modelcontextprotocol.io) - The protocol spec

## License

MIT
