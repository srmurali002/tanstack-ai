#!/usr/bin/env node

/**
 * TanStack AI - Tool Calling Example
 *
 * This demonstrates how to use function calling with streaming
 * Works with both OpenAI and Anthropic using the same code!
 *
 * Usage:
 *   # With OpenAI only:
 *   OPENAI_API_KEY=sk-... node examples/tool-calling-example.js
 *
 *   # With Anthropic only:
 *   ANTHROPIC_API_KEY=sk-ant-... node examples/tool-calling-example.js
 *
 *   # With both (recommended):
 *   OPENAI_API_KEY=sk-... ANTHROPIC_API_KEY=sk-ant-... node examples/tool-calling-example.js
 */

import { AI } from "../packages/ai/dist/index.js";
import { OpenAIAdapter } from "../packages/ai-openai/dist/index.js";
import { AnthropicAdapter } from "../packages/ai-anthropic/dist/index.js";

// Define a simple calculator tool
const tools = [
  {
    type: "function",
    function: {
      name: "calculate",
      description: "Perform mathematical calculations",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "Mathematical expression like '2 + 2' or '10 * 5'",
          },
        },
        required: ["expression"],
      },
    },
  },
];

// Simple calculator implementation
async function calculate(expression) {
  try {
    // eslint-disable-next-line no-eval
    const result = eval(expression.replace(/[^0-9+\-*/().\s]/g, ""));
    return JSON.stringify({ result, expression });
  } catch (error) {
    return JSON.stringify({ error: error.message });
  }
}

async function demoProvider(providerName, adapter, model) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🛠️  ${providerName} - Tool Calling Demo`);
  console.log("=".repeat(60));

  const ai = new AI(adapter);

  const messages = [
    { role: "user", content: "What is 847 multiplied by 392?" },
  ];

  console.log("\n📝 User: What is 847 multiplied by 392?\n");

  try {
    let iteration = 0;
    const maxIterations = 2;

    while (iteration < maxIterations) {
      iteration++;

      const toolCalls = [];
      const toolCallsMap = new Map();
      let content = "";

      console.log("🔄 Streaming response...\n");

      for await (const chunk of ai.streamChat({
        model,
        messages,
        tools,
        toolChoice: "auto",
      })) {
        if (chunk.type === "content") {
          content = chunk.content;
          process.stdout.write(chunk.delta);
        } else if (chunk.type === "tool_call") {
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
        } else if (chunk.type === "done") {
          if (chunk.finishReason === "tool_calls") {
            console.log("\n");
            toolCallsMap.forEach((call) => {
              toolCalls.push({
                id: call.id,
                type: "function",
                function: {
                  name: call.name,
                  arguments: call.args,
                },
              });
            });
          }

          if (chunk.usage) {
            console.log(`\n[Tokens used: ${chunk.usage.totalTokens}]\n`);
          }
        }
      }

      if (toolCalls.length > 0) {
        // Add assistant message with tool calls
        messages.push({
          role: "assistant",
          content: content || null,
          toolCalls,
        });

        console.log(`🔧 AI wants to call ${toolCalls.length} tool(s):\n`);

        // Execute tools
        for (const call of toolCalls) {
          console.log(`  → ${call.function.name}(${call.function.arguments})`);

          const result = await calculate(
            JSON.parse(call.function.arguments).expression
          );
          console.log(`  ✓ Result: ${result}\n`);

          // Add tool result to messages
          messages.push({
            role: "tool",
            content: result,
            toolCallId: call.id,
            name: call.function.name,
          });
        }

        // Continue to get final response
        console.log("🔄 Getting final response...\n");
      } else {
        console.log("\n✅ Conversation complete!\n");
        break;
      }
    }
  } catch (error) {
    console.error(`\n❌ ${providerName} Error:`, error.message);
    if (error.message.includes("401") || error.message.includes("API key")) {
      console.log(
        `   Set ${
          providerName === "OpenAI" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"
        } to try this provider`
      );
    }
  }
}

async function demo() {
  console.log("\n🌟 TanStack AI - Universal Tool Calling Demo 🌟");
  console.log("\nThis shows the SAME code working with multiple providers!\n");

  // Try OpenAI
  if (process.env.OPENAI_API_KEY) {
    await demoProvider(
      "OpenAI",
      new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY }),
      "gpt-3.5-turbo-0125"
    );
  } else {
    console.log("\n⏭️  Skipping OpenAI (set OPENAI_API_KEY to try)");
  }

  // Try Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    await demoProvider(
      "Anthropic Claude",
      new AnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY }),
      "claude-3-5-sonnet-20241022"
    );
  } else {
    console.log("\n⏭️  Skipping Anthropic (set ANTHROPIC_API_KEY to try)");
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n✨ Key Takeaway:");
  console.log("   The EXACT SAME code works with both providers!");
  console.log("   No provider-specific logic needed.\n");

  console.log("📚 What happened in each demo:");
  console.log("  1. User asked a math question");
  console.log("  2. AI decided to use the 'calculate' tool");
  console.log("  3. Tool was executed with the expression");
  console.log("  4. Result was sent back to AI");
  console.log("  5. AI provided the final answer to user\n");

  console.log("🎯 Try the interactive CLI:");
  console.log("  pnpm cli tools --provider openai");
  console.log("  pnpm cli tools --provider anthropic\n");
}

demo();
