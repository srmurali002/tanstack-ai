# @tanstack/ai

A powerful, open-source AI SDK with a unified interface across multiple providers. No vendor lock-in, no proprietary formats, just clean TypeScript and honest open source.

## Features

- **Multi-Provider Support** - OpenAI, Anthropic, Ollama, Google Gemini
- **Unified API** - Same interface across all providers
- **Structured Streaming** - JSON chunks with token deltas, tool calls, and usage stats
- **Tool/Function Calling** - First-class support for AI function calling
- **TypeScript First** - Full type safety throughout
- **Zero Lock-in** - Switch providers at runtime without code changes

## Installation

```bash
# Core library
npm install @tanstack/ai

# Provider adapters (install what you need)
npm install @tanstack/ai-openai
npm install @tanstack/ai-anthropic
npm install @tanstack/ai-ollama
npm install @tanstack/ai-gemini
```

## Architecture

### Core Concepts

**1. Provider-Agnostic Design**

All providers implement the same `AIAdapter` interface:

```typescript
interface AIAdapter {
  // Chat
  chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult>;
  chatStream(options: ChatCompletionOptions): AsyncIterable<StreamChunk>;

  // Text generation
  generateText(options: TextGenerationOptions): Promise<TextGenerationResult>;

  // Summarization
  summarize(options: SummarizationOptions): Promise<SummarizationResult>;

  // Embeddings
  createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult>;
}
```

**2. Structured Streaming**

Streams return typed JSON chunks instead of raw strings:

```typescript
type StreamChunk =
  | ContentStreamChunk // Text tokens with delta + accumulated content
  | ToolCallStreamChunk // Function call information
  | DoneStreamChunk // Completion signal with token usage
  | ErrorStreamChunk; // Error information
```

**3. Adapter Pattern**

The `AI` class wraps any adapter and provides a consistent API:

```typescript
const ai = new AI(adapter); // Initialize with adapter
await ai.chat(options); // Standard chat
ai.streamChat(options); // Structured streaming
ai.setAdapter(newAdapter); // Switch providers
```

## API Reference

### AI Class

#### Constructor

```typescript
constructor(adapter: AIAdapter)
```

Create an AI instance with a specific provider adapter.

#### Methods

##### `chat(options): Promise<ChatCompletionResult>`

Non-streaming chat completion.

```typescript
const result = await ai.chat({
  model: "gpt-3.5-turbo",
  messages: [
    { role: "system", content: "You are helpful" },
    { role: "user", content: "Hello!" },
  ],
  temperature: 0.7,
  maxTokens: 1000,
});

console.log(result.content);
console.log(result.usage.totalTokens);
```

##### `streamChat(options): AsyncIterable<StreamChunk>`

Structured streaming with JSON chunks.

```typescript
for await (const chunk of ai.streamChat({
  model: "gpt-3.5-turbo",
  messages: [{ role: "user", content: "Hello" }],
  tools: [...],           // Optional
  toolChoice: "auto"      // Optional: "auto" | "none" | { type, function }
})) {
  switch (chunk.type) {
    case "content":
      console.log("Delta:", chunk.delta);
      console.log("Full:", chunk.content);
      break;
    case "tool_call":
      console.log("Tool:", chunk.toolCall.function.name);
      console.log("Args:", chunk.toolCall.function.arguments);
      break;
    case "done":
      console.log("Finish:", chunk.finishReason);
      console.log("Usage:", chunk.usage);
      break;
    case "error":
      console.error("Error:", chunk.error.message);
      break;
  }
}
```

##### `generateText(options): Promise<TextGenerationResult>`

Generate text from a prompt.

```typescript
const result = await ai.generateText({
  model: "gpt-3.5-turbo-instruct",
  prompt: "Once upon a time",
  maxTokens: 100,
});

console.log(result.text);
```

##### `summarize(options): Promise<SummarizationResult>`

Summarize text.

```typescript
const result = await ai.summarize({
  model: "gpt-3.5-turbo",
  text: "Long text to summarize...",
  style: "bullet-points", // "bullet-points" | "paragraph" | "concise"
  maxLength: 200,
});

console.log(result.summary);
```

##### `embed(options): Promise<EmbeddingResult>`

Generate embeddings.

```typescript
const result = await ai.embed({
  model: "text-embedding-ada-002",
  input: ["Text 1", "Text 2"],
});

console.log(result.embeddings); // number[][]
```

##### `setAdapter(adapter): void`

Switch providers at runtime.

```typescript
ai.setAdapter(new AnthropicAdapter({ apiKey: "..." }));
```

### Types

#### Message

```typescript
interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  toolCalls?: ToolCall[]; // For assistant messages with tool calls
  toolCallId?: string; // For tool response messages
}
```

#### Tool

```typescript
interface Tool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>; // JSON Schema
  };
}
```

#### StreamChunk Variants

**ContentStreamChunk**

```typescript
{
  type: "content"
  id: string
  model: string
  timestamp: number
  delta: string           // New token(s)
  content: string         // Full accumulated content
  role?: "assistant"
}
```

**ToolCallStreamChunk**

```typescript
{
  type: "tool_call"
  id: string
  model: string
  timestamp: number
  toolCall: {
    id: string
    type: "function"
    function: {
      name: string
      arguments: string   // Incremental JSON arguments
    }
  }
  index: number
}
```

**DoneStreamChunk**

```typescript
{
  type: "done"
  id: string
  model: string
  timestamp: number
  finishReason: "stop" | "length" | "content_filter" | "tool_calls" | null
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}
```

**ErrorStreamChunk**

```typescript
{
  type: "error"
  id: string
  model: string
  timestamp: number
  error: {
    message: string
    code?: string
  }
}
```

## Advanced Usage

### Tool Calling with Multi-Turn Conversations

```typescript
import type { Tool, ToolCall } from "@tanstack/ai";

const tools: Tool[] = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "City name" },
        },
        required: ["location"],
      },
    },
  },
];

const messages = [{ role: "user", content: "What's the weather in Paris?" }];

let continueLoop = true;

while (continueLoop) {
  const toolCalls: ToolCall[] = [];
  const toolCallsMap = new Map();

  for await (const chunk of ai.streamChat({
    model: "gpt-3.5-turbo",
    messages,
    tools,
  })) {
    if (chunk.type === "tool_call") {
      // Accumulate tool call chunks
      const existing = toolCallsMap.get(chunk.index) || {
        id: chunk.toolCall.id,
        name: "",
        args: "",
      };
      if (chunk.toolCall.function.name) {
        existing.name = chunk.toolCall.function.name;
      }
      existing.args += chunk.toolCall.function.arguments;
      toolCallsMap.set(chunk.index, existing);
    } else if (chunk.type === "content") {
      process.stdout.write(chunk.delta);
    } else if (chunk.type === "done") {
      if (chunk.finishReason === "tool_calls") {
        // Convert map to tool calls array
        toolCallsMap.forEach((call) => {
          toolCalls.push({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: call.args },
          });
        });
      } else {
        continueLoop = false;
      }
    }
  }

  if (toolCalls.length > 0) {
    // Add assistant message with tool calls
    messages.push({
      role: "assistant",
      content: null,
      toolCalls,
    });

    // Execute tools and add results
    for (const call of toolCalls) {
      const result = await executeYourTool(call);
      messages.push({
        role: "tool",
        content: result,
        toolCallId: call.id,
        name: call.function.name,
      });
    }
    // Continue loop to get final response
  }
}
```

### Provider-Specific Configuration

Each adapter accepts its own configuration:

```typescript
// OpenAI
new OpenAIAdapter({
  apiKey: string,
  organization: string,
  baseURL: string,
  timeout: number,
  maxRetries: number,
});

// Anthropic
new AnthropicAdapter({
  apiKey: string,
  baseUrl: string,
  timeout: number,
  maxRetries: number,
});

// Ollama (local)
new OllamaAdapter({
  host: string, // Default: "http://localhost:11434"
});

// Gemini
new GeminiAdapter({
  apiKey: string,
});
```

## Examples

### Basic Chat

```typescript
import { AI } from "@tanstack/ai";
import { OpenAIAdapter } from "@tanstack/ai-openai";

const ai = new AI(new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY }));

const response = await ai.chat({
  model: "gpt-3.5-turbo",
  messages: [{ role: "user", content: "Explain quantum computing" }],
});

console.log(response.content);
```

### Streaming

```typescript
for await (const chunk of ai.streamChat({
  model: "gpt-3.5-turbo",
  messages: [{ role: "user", content: "Tell me a story" }],
})) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.delta);
  }
  if (chunk.type === "done") {
    console.log(`\nTokens: ${chunk.usage?.totalTokens}`);
  }
}
```

### Switching Providers

```typescript
// Start with OpenAI
const ai = new AI(new OpenAIAdapter({ apiKey: "..." }));

// Switch to Anthropic - same code works!
ai.setAdapter(new AnthropicAdapter({ apiKey: "..." }));
const response = await ai.chat({ model: "claude-3-sonnet-20240229", messages });

// Switch to local Ollama
ai.setAdapter(new OllamaAdapter());
const response2 = await ai.chat({ model: "llama2", messages });
```

### Text Generation

```typescript
const result = await ai.generateText({
  model: "gpt-3.5-turbo-instruct",
  prompt: "Write a haiku about TypeScript",
  maxTokens: 50,
});

console.log(result.text);
```

### Summarization

```typescript
const longText = `...`; // Your long text

const summary = await ai.summarize({
  model: "gpt-3.5-turbo",
  text: longText,
  style: "bullet-points",
  maxLength: 300,
});

console.log(summary.summary);
```

### Embeddings

```typescript
const result = await ai.embed({
  model: "text-embedding-ada-002",
  input: "Semantic search query",
});

const vector = result.embeddings[0]; // number[]
console.log(`Dimensions: ${vector.length}`);
```

## Examples

### Standalone Scripts

```bash
# Install and build
pnpm install && pnpm build

# Run examples (set API keys first)
cd examples

# See basic usage of all providers
pnpm quick-start

# See streaming in action
pnpm streaming-demo

# See tool calling with both OpenAI & Anthropic (same code!)
pnpm tool-calling
```

**Note:** Set `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` environment variables to see the examples work with real API calls.

### Interactive CLI

We provide a full-featured CLI for testing and demos:

```bash
# Interactive chat
pnpm cli chat --provider openai

# Tool calling demo (OpenAI & Anthropic)
pnpm cli tools --provider openai
pnpm cli tools --provider anthropic

# See JSON stream chunks
pnpm cli chat --provider openai --debug

# Other commands
pnpm cli generate --provider anthropic --prompt "..."
pnpm cli summarize --provider gemini --text "..." --style concise
pnpm cli embed --provider openai --text "..."
```

See `examples/cli/README.md` for full CLI documentation.

## Package Structure

```
@tanstack/ai/
├── packages/
│   ├── ai/                  # Core library
│   │   ├── types.ts         # Type definitions
│   │   ├── ai.ts            # Main AI class
│   │   ├── base-adapter.ts  # Adapter base class
│   │   └── stream-utils.ts  # Streaming utilities
│   ├── ai-openai/           # OpenAI adapter
│   ├── ai-anthropic/        # Anthropic adapter
│   ├── ai-ollama/           # Ollama adapter
│   └── ai-gemini/           # Google Gemini adapter
└── examples/
    └── cli/                 # Interactive CLI demo
```

## Provider Support Matrix

| Feature         | OpenAI | Anthropic | Ollama | Gemini |
| --------------- | ------ | --------- | ------ | ------ |
| Chat            | ✅     | ✅        | ✅     | ✅     |
| Streaming       | ✅     | ✅        | ✅     | ✅     |
| Tool Calling    | ✅     | ✅        | ⏳     | ⏳     |
| Text Generation | ✅     | ✅        | ✅     | ✅     |
| Summarization   | ✅     | ✅        | ✅     | ✅     |
| Embeddings      | ✅     | ❌        | ✅     | ✅     |

✅ = Fully supported | ⏳ = Planned | ❌ = Not supported by provider

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run in dev mode
pnpm dev

# Type checking
pnpm typecheck

# Clean build artifacts
pnpm clean
```

## Contributing

We welcome contributions! This is a community-driven project providing a truly open alternative to proprietary AI SDKs.

## License

MIT - Use freely, modify, share. No strings attached.

## Philosophy

Unlike certain companies that use open source as marketing only to lock you into paid services, @tanstack/ai is committed to remaining truly open source. No enshittification, no bait-and-switch, just honest software that respects developers.

---

Built with ❤️ by the open-source community.
