# Ollama Vault Agent

Private local AI for querying your Obsidian vault using Ollama and MCP. **100% offline, 100% sovereign.**

```
  ╭────────────────────────────────────────────────────────╮
  │            Ollama Vault Agent v1.2.0                   │
  │ Private intelligence for Obsidian - query locally,     │
  │ keep control. Built on MCP for secure, sovereign AI.   │
  ╰────────────────────────────────────────────────────────╯
```

## Features

- **Private**: Your data never leaves your machine - 100% local inference
- **Sovereign**: No API keys, no cloud, no data collection
- **Powerful**: 8 specialized tools for searching, reading, and exploring your vault
- **Flexible**: Switch vaults on the fly without leaving the CLI
- **Export**: Save chat sessions as markdown files

## Quick Start

### 1. Prerequisites

```bash
# Node.js 18+
node --version

# Ollama running locally
ollama serve
```

### 2. Install a Model

```bash
# Example: install a 7B+ model with tool support
ollama pull qwen2.5:7b-instruct
# Or: ollama pull qwen3:8b
```

### 3. Install Vault Agent

```bash
git clone https://github.com/YOUR_USERNAME/vault-agent.git
cd vault-agent
npm install
npm run build
npm install -g .   # Install globally - enables 'vault' command from anywhere
```

### 4. Configure

```bash
cp example-config.json config.json
```

Edit `config.json` with your paths:

```json
{
  "ollama": {
    "model": "qwen2.5:7b-instruct"
  },
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": [
        "/path/to/mcp-obsidian-tools/dist/index.js",
        "/path/to/your/obsidian/vault"
      ]
    }
  }
}
```

### 5. Run

```bash
# After global install, just run:
vault

# Or with explicit command:
vault local

# For development (without global install):
npm run local-agent
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
| `/vault <path>` | Switch to a different vault directory |
| `/tools` | List available vault tools |
| `/models` | List installed models |
| `/model <name>` | Switch to a different model |
| `/export [file]` | Export chat to markdown |
| `/clear` | Clear conversation history |
| `/help` | Show help |
| `/quit` | Exit |

### Example Session

```
  ╭────────────────────────────────────────────────────────╮
  │            Ollama Vault Agent v1.2.0                   │
  │ Private intelligence for Obsidian - query locally,     │
  │ keep control. Built on MCP for secure, sovereign AI.   │
  ╰────────────────────────────────────────────────────────╯

  Connecting to Ollama... ✓
  Connecting to vault... ✓
  Vault: /path/to/your/vault

  Model: qwen2.5:7b-instruct
  Tools: 8 available

  > What are the most common topics in my vault?

  Thinking...

    [Tool] obsidian_list_tags({})
    [Result] Horizon-1: 36, Data-Ecosystems: 25...

  Assistant:

  Based on your vault tags, the most common topics are:
  1. Horizon-1 (36 notes)
  2. Data-Ecosystems (25 notes)
  3. UC-Berkeley (22 notes)
  ...

  [Tools: obsidian_list_tags]

  > /vault ~/Documents/SecondVault

  Switching vault to: /Users/you/Documents/SecondVault
  Disconnecting from current vault... ✓
  Connecting to new vault... ✓
  Vault: /Users/you/Documents/SecondVault
  Tools: 8 available

  > /export my-chat.md

  Chat exported to: /path/to/my-chat.md
```

## Available Tools

The agent connects to [mcp-obsidian-tools](https://github.com/dp-veritas/mcp-obsidian-tools) which provides:

| Tool | Description |
|------|-------------|
| `obsidian_search_content` | Search inside note contents |
| `obsidian_search_notes` | Search by filename |
| `obsidian_list_tags` | List all tags with counts |
| `obsidian_notes_by_tag` | Find notes with specific tags |
| `obsidian_read_notes` | Read full note content |
| `obsidian_query` | Natural language search with date filtering |
| `obsidian_backlinks` | Find notes linking to a target |
| `obsidian_get_frontmatter` | Get note metadata |

## Choosing a Model

### Model Size by Task Complexity

Different tasks require different model capabilities. Match your model to your use case:

| Task Type | Examples | Minimum Model | Recommended |
|-----------|----------|---------------|-------------|
| **Simple queries** | Find files, count notes, list tags | 7B | `qwen2.5:7b-instruct` |
| **Basic search** | Search content, read notes, backlinks | 7B-8B | `qwen3:8b` |
| **Analysis** | Summarize content, explain notes | 14B+ | `qwen2.5:14b-instruct` |
| **Deep analysis** | Detailed breakdown, extract insights | 14B-30B | `qwen3:14b`, `qwen3:30b` |
| **Cross-referencing** | Find connections, trace themes | 14B+ | `qwen3:14b` or larger |
| **Complex reasoning** | Multi-hop queries, synthesis | 30B+ | `qwen3:30b`, `deepseek-r1:32b` |

> **Key insight**: 7-8B models handle tool calling well but struggle with deep content analysis and multi-step reasoning. For comprehensive vault exploration, use 14B+ models.

### What to Look For

**Size (7B+ minimum, 14B+ for analysis)**  
Models under 7B misinterpret tool schemas. For detailed analysis and cross-referencing, 14B+ is strongly recommended.

**Tool/Function Calling Support**  
Look for models with the "tools" tag on [Ollama](https://ollama.com/search?c=tools). Qwen2.5, Qwen3, Llama3.1, and Mistral have native tool support.

**Thinking Models (Recommended for complex tasks)**  
Models like `qwen3` and `deepseek-r1` include reasoning/thinking capabilities that improve multi-step analysis.

**Instruction Tuning**  
Prefer `-instruct` variants over base models. Example: `qwen2.5:7b-instruct` over `qwen2.5:7b`.

**Context Length**  
Larger context (8K-128K) helps when reading multiple notes. Critical for analyzing folders with many files.

**Quantization**  
Q4_K_M or Q5 balances size and quality. Avoid Q2/Q3 for complex tasks.

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

> **For simple queries**: 7-8B models are fast and effective.  
> **For detailed analysis**: Use 14B+ for quality comparable to cloud models.  
> **Not recommended**: Models under 7B for any task.

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
/export my-notes-chat.md

# Or from command line
vault export my-notes-chat.md
```

Output format:

```markdown
# Vault Agent Chat Export

**Date**: 12/14/2024 10:30:00 AM
**Model**: qwen2.5:7b-instruct
**Turns**: 5

---

## User

What tags are in my vault?

## Assistant

*Tools used: obsidian_list_tags*

Based on your vault, the top tags are:
- Horizon-1: 36 notes
- Data-Ecosystems: 25 notes
...
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
- File searches: "Find notes about project X"
- Tag exploration: "What tags do I have?"
- Basic reading: "What's in this note?"

### What Requires Larger Models (14B+)

- Deep analysis: "Analyze the themes across these notes"
- Complex reasoning: "How does X connect to Y?"
- Synthesis: "Summarize everything about topic Z"
- Multi-step queries requiring nuanced judgment

### Tips for Best Results

1. **Be specific**: "What's the title of my dissertation?" works better than "Tell me about my dissertation"
2. **Use simple queries**: Break complex questions into smaller steps
3. **Try larger models**: If 7-8B struggles, try 14B+ for that task
4. **Use commands**: `/tools` shows what's available; sometimes manual tool guidance helps

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

Check your `config.json` paths and ensure mcp-obsidian-tools is built:

```bash
cd /path/to/mcp-obsidian-tools
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
- [Ollama](https://ollama.ai) - Run LLMs locally
- [Model Context Protocol](https://modelcontextprotocol.io) - The protocol spec

## License

MIT
