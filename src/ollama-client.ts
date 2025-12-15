import { Ollama, type Tool, type Message, type ChatResponse } from "ollama"
import type { OllamaConfig } from "./config.js"

export interface ModelInfo {
  name: string
  size: string
  sizeBytes: number
  parameterSize: string
  quantization: string
  modified: Date
  supportsTools?: boolean
  supportsThinking?: boolean
}

export interface ToolCall {
  name: string
  arguments: Record<string, unknown>
}

export type StreamCallback = (chunk: string) => void

export class OllamaClient {
  private client: Ollama
  private _model: string
  private options: Record<string, unknown>

  constructor(config: OllamaConfig) {
    this.client = new Ollama({ host: config.baseUrl })
    this._model = config.model
    this.options = config.options || {}
  }

  get model(): string {
    return this._model
  }

  setModel(model: string): void {
    this._model = model
  }

  async listModels(): Promise<ModelInfo[]> {
    const response = await this.client.list()
    return response.models.map((m) => ({
      name: m.name,
      size: formatBytes(m.size),
      sizeBytes: m.size,
      parameterSize: m.details?.parameter_size || "unknown",
      quantization: m.details?.quantization_level || "unknown",
      modified: new Date(m.modified_at),
    }))
  }

  // Get models sorted by size (largest first)
  async listModelsSorted(): Promise<ModelInfo[]> {
    const models = await this.listModels()
    return models.sort((a, b) => b.sizeBytes - a.sizeBytes)
  }

  // Check if a specific model supports tool calling by inspecting its template
  async checkToolSupport(modelName: string): Promise<boolean> {
    try {
      const response = await this.client.show({ model: modelName })
      const template = response.template || ""
      // Models with tool support have .Tools in their template
      return template.includes(".Tools") || template.includes("{{.Tools}}")
    } catch {
      return false // Assume no support if we can't check
    }
  }

  // Get models with tool support and thinking capability info
  async listModelsWithToolSupport(): Promise<ModelInfo[]> {
    const models = await this.listModelsSorted()
    
    // Check tool support for each model in parallel
    const toolChecks = await Promise.all(
      models.map(m => this.checkToolSupport(m.name))
    )
    
    return models.map((m, i) => ({
      ...m,
      supportsTools: toolChecks[i],
      supportsThinking: isThinkingCapable(m.name),
    }))
  }

  async chat(
    messages: Message[],
    tools?: Tool[],
    onStream?: StreamCallback
  ): Promise<{ message: Message; toolCalls?: ToolCall[] }> {
    // Use streaming if callback provided and no tools (tool calls don't stream well)
    if (onStream && !tools) {
      return this.chatStreaming(messages, onStream)
    }

    const response: ChatResponse = await this.client.chat({
      model: this._model,
      messages,
      tools,
      options: this.options,
    })

    const toolCalls = response.message.tool_calls?.map((tc) => ({
      name: tc.function.name,
      arguments: tc.function.arguments as Record<string, unknown>,
    }))

    return {
      message: response.message,
      toolCalls,
    }
  }

  private async chatStreaming(
    messages: Message[],
    onStream: StreamCallback
  ): Promise<{ message: Message; toolCalls?: ToolCall[] }> {
    const response = await this.client.chat({
      model: this._model,
      messages,
      stream: true,
      options: this.options,
    })

    let fullContent = ""
    for await (const chunk of response) {
      if (chunk.message?.content) {
        fullContent += chunk.message.content
        onStream(chunk.message.content)
      }
    }

    return {
      message: { role: "assistant", content: fullContent },
      toolCalls: undefined,
    }
  }

  async checkConnection(): Promise<boolean> {
    try {
      await this.client.list()
      return true
    } catch {
      return false
    }
  }

  async checkModelAvailable(): Promise<boolean> {
    try {
      const models = await this.listModels()
      return models.some((m) => m.name === this._model || m.name.startsWith(this._model.split(":")[0]))
    } catch {
      return false
    }
  }

  // Check if model is large enough for good tool calling
  async checkModelSize(): Promise<{ ok: boolean; warning?: string }> {
    try {
      const models = await this.listModels()
      const model = models.find((m) => m.name === this._model)
      if (!model) {
        return { ok: true } // Can't check, assume ok
      }
      
      const paramStr = model.parameterSize.toLowerCase()
      const params = parseFloat(paramStr.replace(/[^0-9.]/g, ""))
      const unit = paramStr.includes("b") ? "b" : "m"
      const paramsInB = unit === "m" ? params / 1000 : params
      
      if (paramsInB < 3) {
        return {
          ok: false,
          warning: `Model ${this._model} (${model.parameterSize}) may be too small for reliable tool calling. Recommend 7B+ models.`
        }
      } else if (paramsInB < 7) {
        return {
          ok: true,
          warning: `Model ${this._model} (${model.parameterSize}) works but 7B+ models perform better for tool calling.`
        }
      }
      return { ok: true }
    } catch {
      return { ok: true }
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

// Models that support thinking/reasoning mode
const THINKING_CAPABLE_PREFIXES = [
  "qwen3",
  "deepseek-r1",
  "magistral",
  "qwq",
  "cogito",
]


// Check if a model supports thinking mode
export function isThinkingCapable(modelName: string): boolean {
  const lowerName = modelName.toLowerCase()
  return THINKING_CAPABLE_PREFIXES.some(prefix => lowerName.startsWith(prefix))
}

// Filter thinking blocks from response content
export function filterThinkingBlocks(content: string): string {
  // Remove <think>...</think> blocks (including newlines)
  return content.replace(/<think>[\s\S]*?<\/think>\s*/gi, "").trim()
}

// Model recommendations for the README and CLI help
// Baseline: 7B+ parameters with tool-calling support for reliable vault queries
export const MODEL_RECOMMENDATIONS = [
  {
    name: "qwen2.5:7b-instruct",
    size: "~4.5GB",
    ram: "8GB",
    toolCalling: "Excellent",
    notes: "Strong tool selection",
  },
  {
    name: "qwen3:8b",
    size: "~5GB",
    ram: "8GB",
    toolCalling: "Excellent",
    notes: "Thinking + tools",
  },
  {
    name: "llama3.1:8b",
    size: "~4.5GB",
    ram: "8GB",
    toolCalling: "Good",
    notes: "Meta's reliable workhorse",
  },
  {
    name: "mistral-nemo:12b",
    size: "~7GB",
    ram: "12GB",
    toolCalling: "Good",
    notes: "128k context",
  },
  {
    name: "deepseek-r1:8b",
    size: "~5GB",
    ram: "8GB",
    toolCalling: "Good",
    notes: "Reasoning model",
  },
  {
    name: "qwen2.5:14b-instruct",
    size: "~9GB",
    ram: "16GB",
    toolCalling: "Excellent",
    notes: "Best mid-range quality",
  },
]

