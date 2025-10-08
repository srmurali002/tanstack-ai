# TanStack AI CLI

An interactive command-line interface for the TanStack AI library, demonstrating how to use the SDK with various AI providers.

## Features

- 🔐 **Smart API Key Management**: Automatically prompts for API keys if not found
- 💾 **Save Keys to .env**: Option to save API keys for future sessions
- ✅ **Key Validation**: Validates API keys before proceeding
- 🔄 **Multi-Provider Support**: OpenAI, Anthropic, Ollama, and Google Gemini
- 💬 **Interactive Chat**: Real-time conversation with AI models (streaming for ALL providers)
- 🛠️ **Tool/Function Calling**: AI can call functions with automatic execution
- 📝 **Text Generation**: Generate text from prompts
- 📊 **Summarization**: Summarize long texts in various styles
- 🔢 **Embeddings**: Generate text embeddings for semantic search
- 🐛 **Debug Mode**: See raw JSON stream chunks

## Installation

```bash
# From the CLI directory
pnpm install

# Build the CLI
pnpm build
```

## Configuration

### Method 1: Environment Variables (Recommended)

Copy the example environment file and add your API keys:

```bash
cp env.example .env
# Edit .env and add your actual API keys
```

### Method 2: Interactive Prompt

Just run the CLI! If API keys aren't found, you'll be prompted to enter them:

```bash
pnpm dev chat --provider openai
# Will prompt: "Enter your OpenAI API key: ****"
# Option to save to .env file for future use
```

### Method 3: Command Line Flag

Pass the API key directly (not recommended for production):

```bash
pnpm dev chat --provider openai --api-key sk-...
```

## Usage

### Interactive Chat

```bash
# Using different providers
pnpm dev chat --provider openai
pnpm dev chat --provider anthropic
pnpm dev chat --provider ollama
pnpm dev chat --provider gemini

# Or use the built version
pnpm start chat --provider openai
```

### Text Generation

```bash
pnpm dev generate --provider openai --prompt "Write a haiku about coding"
```

### Summarization

```bash
pnpm dev summarize --provider anthropic --text "Your long text here..." --style bullet-points
```

### Embeddings

```bash
pnpm dev embed --provider openai --text "Text to create embeddings for"
```

### Tool/Function Calling

```bash
# Interactive tool calling demo (OpenAI & Anthropic)
pnpm dev tools --provider openai
pnpm dev tools --provider anthropic

# With debug mode to see JSON chunks
pnpm dev tools --provider openai --debug
pnpm dev tools --provider anthropic --debug

# Or quick shortcut
pnpm tools
```

Example interaction:

```
You: What's 847 * 392?
🤖
🔧 Executing 1 tool call(s)...
  → calculate({"expression": "847 * 392"})
✓ calculate completed

🤖 The result is 332,024.

[Tokens: 156]
```

## API Key Sources

- **OpenAI**: https://platform.openai.com/api-keys
- **Anthropic**: https://console.anthropic.com/settings/keys
- **Google Gemini**: https://aistudio.google.com/app/apikey
- **Ollama**: https://ollama.ai/download (local, no API key needed)

## Features in Detail

### Smart API Key Prompting

When you run a command without an API key configured:

1. **Detection**: Checks environment variables first
2. **Prompt**: If not found, prompts for the key with a masked input
3. **Validation**: Tests the key with a minimal request
4. **Save Option**: Offers to save to `.env` for future sessions
5. **Retry**: Allows 3 attempts if validation fails

### API Key Validation

The CLI validates your API key by making a minimal test request:

- ✅ Valid key: Proceeds with your command
- ❌ Invalid key: Prompts to re-enter (up to 3 attempts)
- ⚠️ Network issues: Warns but proceeds anyway

### Session Persistence

When you save an API key to `.env`:

- Automatically creates/updates the `.env` file
- Shows masked version of the key for security
- Reminds to add `.env` to `.gitignore`

## Scripts

```bash
# Development (runs TypeScript directly)
pnpm dev [command] [options]

# Production (uses built JavaScript)
pnpm start [command] [options]

# Build the CLI
pnpm build

# Watch mode for development
pnpm dev:watch

# Quick commands
pnpm chat      # Quick chat with default provider
pnpm generate  # Quick text generation
pnpm summarize # Quick summarization
pnpm embed     # Quick embeddings
pnpm tools     # Tool calling demo
```

## Security Notes

- Never commit `.env` files to version control
- API keys are masked in console output
- Keys are validated before use
- Option to save keys is opt-in only

## Troubleshooting

### "API key invalid"

- Double-check your API key from the provider's dashboard
- Ensure you're using the correct key for the provider
- Check if your API key has the necessary permissions

### "Cannot connect to Ollama"

- Ensure Ollama is running locally: `ollama serve`
- Check the host URL (default: http://localhost:11434)
- Pull a model first: `ollama pull llama2`

### "Network error"

- Check your internet connection
- Verify firewall/proxy settings
- Try again - might be a temporary issue

## Examples

### Basic Chat Session

```bash
$ pnpm dev chat --provider openai

⚠️ No API key found for OpenAI.
📝 Get your API key at: https://platform.openai.com/api-keys

? Enter your OpenAI API key: ********
? Would you like to save this API key to your .env file? Yes
✅ API key saved to .env file
✓ API key validated
✅ Connected to openai

🤖 TanStack AI Chat
Type "exit" to quit

You: Hello!
🤖 Assistant: Hello! How can I help you today?
```

## Contributing

This CLI is part of the TanStack AI project. Contributions are welcome!
