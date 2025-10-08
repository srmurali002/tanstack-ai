import { Command } from "commander";
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import * as dotenv from "dotenv";
import { AI } from "@tanstack/ai";
import { OpenAIAdapter } from "@tanstack/ai-openai";
import { AnthropicAdapter } from "@tanstack/ai-anthropic";
import { OllamaAdapter } from "@tanstack/ai-ollama";
import { GeminiAdapter } from "@tanstack/ai-gemini";
import type { AIAdapter, Message, ToolCall } from "@tanstack/ai";
import {
  getApiKeyUrl,
  saveApiKeyToEnv,
  maskApiKey,
  validateApiKey,
} from "./utils.js";
import { AVAILABLE_TOOLS, executeTool, listTools } from "./tools.js";

// Load environment variables
dotenv.config();

const program = new Command();

program
  .name("tanstack-ai")
  .description("TanStack AI CLI - Open source AI SDK demo")
  .version("0.1.0");

program
  .command("chat")
  .description("Interactive chat with AI models")
  .option(
    "-p, --provider <provider>",
    "AI provider (openai, anthropic, ollama, gemini)",
    "openai"
  )
  .option("-m, --model <model>", "Model to use")
  .option(
    "-k, --api-key <key>",
    "API key (can also be set via environment variable)"
  )
  .option("-d, --debug", "Show raw JSON stream chunks (for debugging)")
  .action(async (options) => {
    await runChat(options);
  });

program
  .command("generate")
  .description("Generate text from a prompt")
  .option(
    "-p, --provider <provider>",
    "AI provider (openai, anthropic, ollama, gemini)",
    "openai"
  )
  .option("-m, --model <model>", "Model to use")
  .option(
    "-k, --api-key <key>",
    "API key (can also be set via environment variable)"
  )
  .option("--prompt <prompt>", "Text prompt")
  .action(async (options) => {
    await runGenerate(options);
  });

program
  .command("summarize")
  .description("Summarize text")
  .option(
    "-p, --provider <provider>",
    "AI provider (openai, anthropic, ollama, gemini)",
    "openai"
  )
  .option("-m, --model <model>", "Model to use")
  .option(
    "-k, --api-key <key>",
    "API key (can also be set via environment variable)"
  )
  .option("--text <text>", "Text to summarize")
  .option(
    "--style <style>",
    "Summary style (bullet-points, paragraph, concise)",
    "paragraph"
  )
  .action(async (options) => {
    await runSummarize(options);
  });

program
  .command("embed")
  .description("Generate embeddings for text")
  .option(
    "-p, --provider <provider>",
    "AI provider (openai, ollama, gemini)",
    "openai"
  )
  .option("-m, --model <model>", "Model to use")
  .option(
    "-k, --api-key <key>",
    "API key (can also be set via environment variable)"
  )
  .option("--text <text>", "Text to embed")
  .action(async (options) => {
    await runEmbed(options);
  });

program
  .command("tools")
  .description("Interactive chat with tool/function calling")
  .option(
    "-p, --provider <provider>",
    "AI provider (openai, anthropic)",
    "openai"
  )
  .option("-m, --model <model>", "Model to use")
  .option(
    "-k, --api-key <key>",
    "API key (can also be set via environment variable)"
  )
  .option("-d, --debug", "Show raw JSON stream chunks (for debugging)")
  .action(async (options) => {
    await runTools(options);
  });

async function promptForApiKey(
  provider: string,
  envVarName: string
): Promise<string> {
  console.log(chalk.yellow(`\n⚠️  No API key found for ${provider}.\n`));

  const apiUrl = getApiKeyUrl(provider.toLowerCase().replace(" ", ""));
  if (apiUrl) {
    console.log(chalk.cyan(`📝 Get your API key at: ${apiUrl}\n`));
  }

  const { apiKey } = await inquirer.prompt([
    {
      type: "password",
      name: "apiKey",
      message: `Enter your ${provider} API key:`,
      mask: "*",
      validate: (input) => {
        if (!input || input.trim().length === 0) {
          return "API key is required";
        }
        return true;
      },
    },
  ]);

  // Ask if they want to save it
  const { saveKey } = await inquirer.prompt([
    {
      type: "confirm",
      name: "saveKey",
      message: "Would you like to save this API key to your .env file?",
      default: true,
    },
  ]);

  if (saveKey) {
    const saved = await saveApiKeyToEnv(envVarName, apiKey);
    if (saved) {
      console.log(
        chalk.gray(
          `\nNote: The .env file has been updated. Make sure it's in your .gitignore!\n`
        )
      );
    }
  } else {
    console.log(
      chalk.gray(
        `\nTo set it permanently, add ${envVarName}=${maskApiKey(
          apiKey
        )} to your .env file\n`
      )
    );
  }

  return apiKey;
}

async function createAdapter(
  provider: string,
  apiKey?: string
): Promise<AIAdapter> {
  let adapter: AIAdapter;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      switch (provider.toLowerCase()) {
        case "openai":
          let openaiKey = apiKey || process.env.OPENAI_API_KEY;
          if (!openaiKey || attempts > 0) {
            openaiKey = await promptForApiKey("OpenAI", "OPENAI_API_KEY");
            apiKey = undefined; // Clear to force re-prompt if needed
          }
          adapter = new OpenAIAdapter({ apiKey: openaiKey });
          break;

        case "anthropic":
          let anthropicKey = apiKey || process.env.ANTHROPIC_API_KEY;
          if (!anthropicKey || attempts > 0) {
            anthropicKey = await promptForApiKey(
              "Anthropic",
              "ANTHROPIC_API_KEY"
            );
            apiKey = undefined;
          }
          adapter = new AnthropicAdapter({ apiKey: anthropicKey });
          break;

        case "ollama":
          // Ollama doesn't require an API key, just the host
          const ollamaHost =
            process.env.OLLAMA_HOST || "http://localhost:11434";
          console.log(chalk.gray(`\nConnecting to Ollama at ${ollamaHost}\n`));
          adapter = new OllamaAdapter({ host: ollamaHost });
          break;

        case "gemini":
          let geminiKey = apiKey || process.env.GOOGLE_API_KEY;
          if (!geminiKey || attempts > 0) {
            geminiKey = await promptForApiKey(
              "Google Gemini",
              "GOOGLE_API_KEY"
            );
            apiKey = undefined;
          }
          adapter = new GeminiAdapter({ apiKey: geminiKey });
          break;

        default:
          console.error(chalk.red(`Unknown provider: ${provider}`));
          process.exit(1);
      }

      // Validate the adapter
      if (provider.toLowerCase() !== "ollama" || attempts === 0) {
        const spinner = ora("Validating API key...").start();
        try {
          const isValid = await validateApiKey(adapter, provider);
          if (!isValid) {
            spinner.fail(chalk.red("Invalid API key"));
            attempts++;
            if (attempts < maxAttempts) {
              console.log(
                chalk.yellow(
                  `\nPlease try again (${
                    maxAttempts - attempts
                  } attempts remaining)\n`
                )
              );
              continue;
            } else {
              console.error(
                chalk.red(
                  "\nMaximum attempts reached. Please check your API key."
                )
              );
              process.exit(1);
            }
          }
          spinner.succeed(chalk.green("API key validated"));
        } catch (error: any) {
          // Network or other errors
          spinner.warn(
            chalk.yellow("Could not validate API key (network issue?)")
          );
          console.log(chalk.gray("Proceeding anyway...\n"));
        }
      }

      return adapter;
    } catch (error) {
      console.error(chalk.red(`\nError creating adapter: ${error}\n`));
      attempts++;
      if (attempts >= maxAttempts) {
        process.exit(1);
      }
    }
  }

  process.exit(1);
}

async function runChat(options: any) {
  console.log(chalk.cyan("\n=== TanStack AI CLI ==="));
  console.log(chalk.gray(`Provider: ${options.provider}`));

  const adapter = await createAdapter(options.provider, options.apiKey);
  const ai = new AI(adapter);

  console.log(chalk.green(`\n✅ Connected to ${options.provider}\n`));
  console.log(chalk.cyan(`🤖 TanStack AI Chat`));
  console.log(chalk.gray('Type "exit" to quit\n'));

  const messages: Message[] = [];

  if (options.provider === "openai" || options.provider === "anthropic") {
    messages.push({
      role: "system",
      content:
        "You are a helpful AI assistant powered by TanStack AI, an open-source AI SDK.",
    });
  }

  while (true) {
    const { prompt } = await inquirer.prompt([
      {
        type: "input",
        name: "prompt",
        message: chalk.green("You:"),
      },
    ]);

    if (prompt.toLowerCase() === "exit") {
      console.log(chalk.yellow("\nGoodbye! 👋"));
      break;
    }

    messages.push({ role: "user", content: prompt });

    const spinner = ora("Thinking...").start();

    try {
      const model = options.model || getDefaultModel(options.provider);

      // Use structured streaming for ALL providers
      spinner.text = "Assistant:";
      spinner.stopAndPersist({ symbol: chalk.blue("🤖") });

      let fullContent = "";
      let totalTokens = 0;

      if (options.debug) {
        console.log(chalk.gray("\n--- Streaming JSON Chunks ---\n"));
      }

      // Stream with structured JSON chunks
      for await (const chunk of ai.streamChat({
        model,
        messages,
        temperature: 0.7,
        maxTokens: 1000,
      })) {
        // Debug mode: show raw JSON
        if (options.debug) {
          console.log(chalk.gray(JSON.stringify(chunk)));
        }

        if (chunk.type === "content") {
          // Write the delta (new token) to stdout
          if (!options.debug) {
            process.stdout.write(chunk.delta);
          }
          fullContent = chunk.content;
        } else if (chunk.type === "tool_call") {
          // Handle tool calls
          const toolName = chunk.toolCall.function.name;
          const toolArgs = chunk.toolCall.function.arguments;
          console.log(chalk.cyan(`\n🔧 Tool call: ${toolName}`));
          if (toolArgs) {
            console.log(chalk.gray(`   Arguments: ${toolArgs}`));
          }
        } else if (chunk.type === "done") {
          // Show token usage
          if (chunk.usage) {
            totalTokens = chunk.usage.totalTokens;
            if (options.debug) {
              console.log(
                chalk.green(`\n✅ Done! Reason: ${chunk.finishReason}`)
              );
              console.log(
                chalk.gray(`   Prompt tokens: ${chunk.usage.promptTokens}`)
              );
              console.log(
                chalk.gray(
                  `   Completion tokens: ${chunk.usage.completionTokens}`
                )
              );
              console.log(
                chalk.gray(`   Total tokens: ${chunk.usage.totalTokens}`)
              );
            }
          }
        } else if (chunk.type === "error") {
          console.error(chalk.red(`\n❌ Error: ${chunk.error.message}`));
          if (chunk.error.code) {
            console.error(chalk.gray(`   Code: ${chunk.error.code}`));
          }
        }
      }

      if (options.debug) {
        console.log(chalk.gray("\n--- End of Stream ---\n"));
        if (fullContent) {
          console.log(chalk.blue("Full response:"), fullContent);
        }
      } else {
        console.log("\n");
      }

      if (totalTokens > 0 && !options.debug) {
        console.log(chalk.gray(`[Tokens: ${totalTokens}]\n`));
      }

      // Add the full response to conversation history
      messages.push({
        role: "assistant",
        content: fullContent,
      });
    } catch (error) {
      spinner.stop();
      console.error(chalk.red("\nError:"), error);
    }
  }
}

async function runGenerate(options: any) {
  const adapter = await createAdapter(options.provider, options.apiKey);
  const ai = new AI(adapter);

  let prompt = options.prompt;
  if (!prompt) {
    const result = await inquirer.prompt([
      {
        type: "input",
        name: "prompt",
        message: "Enter your prompt:",
      },
    ]);
    prompt = result.prompt;
  }

  const spinner = ora("Generating...").start();

  try {
    const model = options.model || getDefaultModel(options.provider, "text");
    const response = await ai.generateText({
      model,
      prompt,
      temperature: 0.7,
      maxTokens: 500,
    });

    spinner.stop();
    console.log(chalk.cyan("\n📝 Generated Text:\n"));
    console.log(response.text);
    console.log(chalk.gray(`\n[Tokens: ${response.usage.totalTokens}]`));
  } catch (error) {
    spinner.stop();
    console.error(chalk.red("\nError:"), error);
  }
}

async function runSummarize(options: any) {
  const adapter = await createAdapter(options.provider, options.apiKey);
  const ai = new AI(adapter);

  let text = options.text;
  if (!text) {
    const result = await inquirer.prompt([
      {
        type: "editor",
        name: "text",
        message: "Enter the text to summarize:",
      },
    ]);
    text = result.text;
  }

  const spinner = ora("Summarizing...").start();

  try {
    const model = options.model || getDefaultModel(options.provider);
    const response = await ai.summarize({
      model,
      text,
      style: options.style,
      maxLength: 300,
    });

    spinner.stop();
    console.log(chalk.cyan(`\n📄 Summary (${options.style}):\n`));
    console.log(response.summary);
    console.log(chalk.gray(`\n[Tokens: ${response.usage.totalTokens}]`));
  } catch (error) {
    spinner.stop();
    console.error(chalk.red("\nError:"), error);
  }
}

async function runEmbed(options: any) {
  const adapter = await createAdapter(options.provider, options.apiKey);
  const ai = new AI(adapter);

  let text = options.text;
  if (!text) {
    const result = await inquirer.prompt([
      {
        type: "input",
        name: "text",
        message: "Enter the text to embed:",
      },
    ]);
    text = result.text;
  }

  const spinner = ora("Generating embeddings...").start();

  try {
    const model = options.model || getDefaultEmbeddingModel(options.provider);
    const response = await ai.embed({
      model,
      input: text,
    });

    spinner.stop();
    console.log(chalk.cyan("\n🔢 Embeddings:\n"));
    console.log(chalk.gray(`Dimensions: ${response.embeddings[0].length}`));
    console.log(
      chalk.gray(
        `First 10 values: [${response.embeddings[0]
          .slice(0, 10)
          .map((v) => v.toFixed(4))
          .join(", ")}...]`
      )
    );
    console.log(chalk.gray(`\n[Tokens: ${response.usage.totalTokens}]`));
  } catch (error) {
    spinner.stop();
    console.error(chalk.red("\nError:"), error);
  }
}

async function runTools(options: any) {
  console.log(chalk.cyan("\n=== TanStack AI - Tool Calling Demo ==="));
  console.log(chalk.gray(`Provider: ${options.provider}`));

  if (options.provider !== "openai" && options.provider !== "anthropic") {
    console.log(
      chalk.yellow(
        "\n⚠️  Tool calling is currently only supported with OpenAI and Anthropic."
      )
    );
    console.log(chalk.gray("Ollama and Gemini coming soon!\n"));
    return;
  }

  // Enable adapter-level debugging if CLI debug is on
  if (options.debug) {
    process.env.DEBUG_TOOLS = "true";
  }

  const adapter = await createAdapter(options.provider, options.apiKey);
  const ai = new AI(adapter);

  console.log(chalk.green(`\n✅ Connected to ${options.provider}\n`));
  console.log(chalk.cyan("🛠️  TanStack AI - Function Calling"));
  console.log(
    chalk.gray('Type "exit" to quit, "tools" to list available tools\n')
  );

  console.log(chalk.magenta("Available tools:"));
  console.log(chalk.gray(listTools()));
  console.log("");

  console.log(chalk.yellow("💡 Try these prompts:"));
  console.log(chalk.gray("  - What's 123 * 456?"));
  console.log(chalk.gray("  - What's the weather in Paris?"));
  console.log(chalk.gray("  - Search for React tutorials"));
  console.log(chalk.gray("  - What time is it in Tokyo?"));
  console.log("");

  const messages: Message[] = [
    {
      role: "system",
      content: `You are a helpful AI assistant with access to the following tools:

${listTools()}

IMPORTANT: You MUST use the appropriate tool when the user asks for:
- Weather information → use get_weather
- Mathematical calculations → use calculate  
- Search queries → use search
- Time information → use get_current_time

Do not attempt to answer these questions without using the tools. Always call the appropriate tool to get accurate, real-time information.`,
    },
  ];

  while (true) {
    const { prompt } = await inquirer.prompt([
      {
        type: "input",
        name: "prompt",
        message: chalk.green("You:"),
      },
    ]);

    if (prompt.toLowerCase() === "exit") {
      console.log(chalk.yellow("\nGoodbye! 👋"));
      break;
    }

    if (prompt.toLowerCase() === "tools") {
      console.log(chalk.magenta("\nAvailable tools:"));
      console.log(chalk.gray(listTools()));
      console.log("");
      continue;
    }

    messages.push({ role: "user", content: prompt });

    // Process the conversation with potential tool calls
    let continueLoop = true;
    let maxIterations = 5; // Prevent infinite loops
    let iteration = 0;

    while (continueLoop && iteration < maxIterations) {
      iteration++;
      const spinner = ora("Thinking...").start();

      try {
        const model =
          options.model ||
          (options.provider === "anthropic"
            ? "claude-3-5-sonnet-20241022"
            : "gpt-3.5-turbo-0125");

        spinner.text = "Assistant:";
        spinner.stopAndPersist({ symbol: chalk.blue("🤖") });

        let fullContent = "";
        let totalTokens = 0;
        const toolCalls: ToolCall[] = [];
        const toolCallsMap = new Map<
          number,
          { id: string; name: string; args: string }
        >();

        if (options.debug) {
          console.log(chalk.gray("\n--- Streaming JSON Chunks ---\n"));
          console.log(chalk.gray(`Model: ${model}`));
          console.log(chalk.gray(`Tools provided: ${AVAILABLE_TOOLS.length}`));
          console.log(
            chalk.gray(
              `Tool names: ${AVAILABLE_TOOLS.map((t) => t.function.name).join(
                ", "
              )}\n`
            )
          );
          console.log(chalk.gray(`Tool definitions sample:`));
          console.log(chalk.gray(JSON.stringify(AVAILABLE_TOOLS[0], null, 2)));
          console.log("");
        }

        // Stream with tools
        const streamOptions = {
          model,
          messages,
          temperature: 0.7,
          maxTokens: 1000,
          tools: AVAILABLE_TOOLS,
          toolChoice: "auto" as const,
        };

        if (options.debug) {
          console.log(chalk.gray("Stream options being sent:"));
          console.log(chalk.gray(`  - model: ${streamOptions.model}`));
          console.log(
            chalk.gray(`  - messages: ${streamOptions.messages.length}`)
          );
          console.log(chalk.gray(`  - tools: ${streamOptions.tools.length}`));
          console.log(
            chalk.gray(`  - toolChoice: ${streamOptions.toolChoice}\n`)
          );
        }

        for await (const chunk of ai.streamChat(streamOptions)) {
          if (options.debug) {
            console.log(chalk.gray(JSON.stringify(chunk)));
          }

          if (chunk.type === "content") {
            if (!options.debug && chunk.delta) {
              process.stdout.write(chunk.delta);
            }
            fullContent = chunk.content;
          } else if (chunk.type === "tool_call") {
            // Accumulate tool call information
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
            if (chunk.usage) {
              totalTokens = chunk.usage.totalTokens;
              if (options.debug) {
                console.log(
                  chalk.green(`\n✅ Done! Reason: ${chunk.finishReason}`)
                );
                console.log(
                  chalk.gray(`   Total tokens: ${chunk.usage.totalTokens}`)
                );
              }
            }

            // Check if we need to execute tools
            if (chunk.finishReason === "tool_calls" && toolCallsMap.size > 0) {
              console.log("\n");

              // Convert map to array of tool calls
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
          } else if (chunk.type === "error") {
            console.error(chalk.red(`\n❌ Error: ${chunk.error.message}`));
          }
        }

        if (options.debug) {
          console.log(chalk.gray("\n--- End of Stream ---\n"));
          if (fullContent) {
            console.log(chalk.blue("Full response:"), fullContent);
          }
        }

        // Add assistant message to history
        if (toolCalls.length > 0) {
          // Assistant wants to call tools
          messages.push({
            role: "assistant",
            content: fullContent || null,
            toolCalls,
          });

          console.log(
            chalk.cyan(`\n🔧 Executing ${toolCalls.length} tool call(s)...\n`)
          );

          // Execute each tool
          for (const toolCall of toolCalls) {
            const toolName = toolCall.function.name;
            const toolArgs = toolCall.function.arguments;

            console.log(chalk.magenta(`  → ${toolName}(`));
            try {
              const parsedArgs = JSON.parse(toolArgs);
              console.log(
                chalk.gray(
                  `      ${JSON.stringify(parsedArgs, null, 2)
                    .split("\n")
                    .join("\n      ")}`
                )
              );
              console.log(chalk.magenta(`    )`));
            } catch {
              console.log(chalk.gray(`      ${toolArgs}`));
              console.log(chalk.magenta(`    )`));
            }

            // Execute the tool
            const toolSpinner = ora(`Executing ${toolName}...`).start();
            try {
              const result = await executeTool(toolName, toolArgs);
              toolSpinner.succeed(chalk.green(`${toolName} completed`));

              if (options.debug) {
                console.log(chalk.gray(`    Result: ${result}`));
              }

              // Add tool result to messages
              messages.push({
                role: "tool",
                content: result,
                toolCallId: toolCall.id,
                name: toolName,
              });
            } catch (error: any) {
              toolSpinner.fail(chalk.red(`${toolName} failed`));
              console.error(chalk.red(`    Error: ${error.message}`));

              // Add error result
              messages.push({
                role: "tool",
                content: JSON.stringify({
                  error: true,
                  message: error.message,
                }),
                toolCallId: toolCall.id,
                name: toolName,
              });
            }
          }

          console.log("");
          // Continue the loop to get the final response
          continueLoop = true;
        } else {
          // Normal response, no tools
          if (!options.debug) {
            console.log("\n");
          }

          if (totalTokens > 0 && !options.debug) {
            console.log(chalk.gray(`[Tokens: ${totalTokens}]\n`));
          }

          messages.push({
            role: "assistant",
            content: fullContent,
          });

          continueLoop = false;
        }
      } catch (error) {
        spinner.stop();
        console.error(chalk.red("\nError:"), error);
        continueLoop = false;
      }
    }

    if (iteration >= maxIterations) {
      console.log(chalk.yellow("\n⚠️  Maximum tool call iterations reached"));
    }
  }
}

function getDefaultModel(provider: string, type: string = "chat"): string {
  switch (provider.toLowerCase()) {
    case "openai":
      return type === "text" ? "gpt-3.5-turbo-instruct" : "gpt-3.5-turbo";
    case "anthropic":
      return "claude-3-sonnet-20240229";
    case "ollama":
      return "llama2";
    case "gemini":
      return "gemini-pro";
    default:
      return "";
  }
}

function getDefaultEmbeddingModel(provider: string): string {
  switch (provider.toLowerCase()) {
    case "openai":
      return "text-embedding-ada-002";
    case "ollama":
      return "nomic-embed-text";
    case "gemini":
      return "embedding-001";
    default:
      return "";
  }
}

// Parse arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
