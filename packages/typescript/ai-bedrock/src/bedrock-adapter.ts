import {
    InvokeModelCommand,
    InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { convertSchemaToJsonSchema } from '@tanstack/ai'
import { createBedrockClient, generateId } from './utils'
import type { BedrockClientConfig } from './utils'
import type {
    StructuredOutputOptions,
    StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type {
    ContentPart,
    JSONSchema,
    ModelMessage,
    StreamChunk,
    TextOptions,
} from '@tanstack/ai'
import type { BedrockModelId } from './model-meta'

export interface BedrockTextConfig extends BedrockClientConfig { }

export class BedrockTextAdapter<
    TModel extends BedrockModelId,
> extends BaseTextAdapter<
    TModel,
    any, // Bedrock provider options
    readonly ['text', 'image', 'document', 'video'], // Supported input modalities
    any // Message metadata
> {
    readonly kind = 'text' as const
    readonly name = 'bedrock' as const
    private client: any

    constructor(config: BedrockTextConfig, model: TModel) {
        super({}, model)
        this.client = createBedrockClient(config)
    }

    async *chatStream(
        options: TextOptions<any>,
    ): AsyncIterable<StreamChunk> {
        const payload = this.createPayload(options)
        const timestamp = Date.now()
        const id = generateId(this.name)

        const command = new InvokeModelWithResponseStreamCommand({
            modelId: this.model,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify(payload),
        })

        try {
            const response = await this.client.send(command)

            if (!response.body) {
                throw new Error('No response body from Bedrock')
            }

            let accumulatedContent = ''
            let currentToolCall: any = null
            let toolCallIndex = -1

            for await (const chunk of response.body) {
                if (chunk.chunk && chunk.chunk.bytes) {
                    const decoded = new TextDecoder().decode(chunk.chunk.bytes)
                    const json = JSON.parse(decoded)

                    // Anthropic/Nova-style stream format
                    if (json.type === 'message_start') {
                        // ignore
                    } else if (json.type === 'content_block_start') {
                        if (json.content_block?.type === 'tool_use') {
                            toolCallIndex++
                            currentToolCall = {
                                id: json.content_block.id,
                                name: json.content_block.name,
                                arguments: '',
                            }
                        }
                    } else if (json.type === 'content_block_delta') {
                        if (json.delta?.type === 'text_delta') {
                            const delta = json.delta.text
                            accumulatedContent += delta
                            yield {
                                type: 'content',
                                id,
                                model: this.model,
                                timestamp,
                                delta,
                                content: accumulatedContent,
                                role: 'assistant',
                            }
                        } else if (json.delta?.type === 'input_json_delta') {
                            if (currentToolCall) {
                                currentToolCall.arguments += json.delta.partial_json
                                yield {
                                    type: 'tool_call',
                                    id,
                                    model: this.model,
                                    timestamp,
                                    toolCall: {
                                        id: currentToolCall.id,
                                        type: 'function',
                                        function: {
                                            name: currentToolCall.name,
                                            arguments: json.delta.partial_json,
                                        },
                                    },
                                    index: toolCallIndex,
                                }
                            }
                        }
                    } else if (json.type === 'message_delta') {
                        if (json.delta?.stop_reason === 'tool_use') {
                            yield {
                                type: 'done',
                                id,
                                model: this.model,
                                timestamp,
                                finishReason: 'tool_calls',
                                usage: json.usage ? {
                                    promptTokens: json.usage.input_tokens || 0,
                                    completionTokens: json.usage.output_tokens || 0,
                                    totalTokens: (json.usage.input_tokens || 0) + (json.usage.output_tokens || 0),
                                } : undefined,
                            }
                            return
                        }
                    } else if (json.type === 'message_stop') {
                        yield {
                            type: 'done',
                            id,
                            model: this.model,
                            timestamp,
                            finishReason: 'stop',
                        }
                        return
                    }
                    // Amazon Nova stream format (delta)
                    else if (json.delta?.text) {
                        const delta = json.delta.text
                        accumulatedContent += delta
                        yield {
                            type: 'content',
                            id,
                            model: this.model,
                            timestamp,
                            delta,
                            content: accumulatedContent,
                            role: 'assistant',
                        }
                    }
                    // Nova Tool Use (if any in non-Anthropic compatible stream)
                    // Note: Bedrock Nova often follows Anthropic stream format above if requested via chat API.
                }
            }

            yield {
                type: 'done',
                id,
                model: this.model,
                timestamp,
                finishReason: 'stop',
            }
        } catch (error) {
            console.error('BEDROCK ERROR:', error)
            yield {
                type: 'error',
                id,
                model: this.model,
                timestamp,
                error: {
                    message: error instanceof Error ? error.message : String(error),
                },
            }
        }
    }

    /**
     * Structured output using tool-use force for compatible models.
     */
    async structuredOutput(
        options: StructuredOutputOptions<any>,
    ): Promise<StructuredOutputResult<unknown>> {
        const { chatOptions, outputSchema } = options
        const model = this.model
        const isAnthropic = model.includes('anthropic')
        const isNova = model.includes('nova')

        if (!isAnthropic && !isNova) {
            throw new Error(`Structured output is not yet implemented for this model in Bedrock (${model}).`)
        }

        // Define a tool that captures the structured output
        const structuredOutputTool = {
            name: 'structured_output',
            description: 'Use this tool to provide your response in the required structured format.',
            input_schema: {
                type: 'object' as const,
                properties: outputSchema.properties ?? {},
                required: outputSchema.required ?? [],
            },
        }

        const payload = this.createPayload(chatOptions)

        if (isAnthropic) {
            Object.assign(payload, {
                tools: [structuredOutputTool],
                tool_choice: { type: 'tool', name: 'structured_output' },
            })
        } else if (isNova) {
            // Nova tool use format
            Object.assign(payload, {
                tools: [
                    {
                        toolSpec: {
                            name: 'structured_output',
                            description: 'Capture structured output',
                            inputSchema: {
                                json: {
                                    type: 'object' as const,
                                    properties: outputSchema.properties ?? {},
                                    required: outputSchema.required ?? [],
                                }
                            }
                        }
                    }
                ],
                toolConfig: {
                    tools: [{ tool: { name: 'structured_output' } }],
                    toolChoice: { tool: { name: 'structured_output' } }
                }
            })
        }

        try {
            const command = new InvokeModelCommand({
                modelId: this.model,
                contentType: 'application/json',
                accept: 'application/json',
                body: JSON.stringify(payload),
            })

            const response = await this.client.send(command)
            const decoded = new TextDecoder().decode(response.body)
            const json = JSON.parse(decoded)

            let parsed: unknown = null
            let rawText = ''

            // Anthropic format
            if (json.content && Array.isArray(json.content)) {
                for (const block of json.content) {
                    if (block.type === 'tool_use' && block.name === 'structured_output') {
                        parsed = block.input
                        rawText = JSON.stringify(block.input)
                        break
                    }
                }
            }

            // Nova format
            if (json.output?.message?.content) {
                for (const part of json.output.message.content) {
                    if (part.toolUse && part.toolUse.name === 'structured_output') {
                        parsed = part.toolUse.input
                        rawText = JSON.stringify(part.toolUse.input)
                        break
                    }
                }
            }

            if (parsed === null) {
                throw new Error('Model failed to call the structured output tool.')
            }

            return {
                data: parsed,
                rawText,
            }
        } catch (error) {
            throw new Error(`Structured output generation failed: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    private createPayload(options: TextOptions) {
        const model = this.model
        const messages = options.messages
        const isAnthropic = model.includes('anthropic')
        const isNova = model.includes('nova')
        const isLlama = model.includes('meta.llama')
        const isTitan = model.includes('amazon.titan')

        if (isAnthropic) {
            const payload: any = {
                anthropic_version: 'bedrock-2023-05-31',
                max_tokens: options.maxTokens || 4096,
                temperature: options.temperature,
                top_p: options.topP,
                system: options.systemPrompts?.join('\n'),
                messages: this.convertMessagesToAnthropic(messages),
            }

            if (options.tools?.length) {
                payload.tools = options.tools.map(t => {
                    // Tools should already be converted by TextEngine, but fallback to conversion if needed
                    let schema = t.inputSchema as JSONSchema | undefined
                    if (!schema || (schema as any)._def || (schema as any)['~standard']) {
                        // Schema wasn't properly converted, try converting it
                        schema = convertSchemaToJsonSchema(t.inputSchema) ?? {
                            type: 'object',
                            properties: {},
                            required: [],
                        }
                    }
                    return {
                        name: t.name,
                        description: t.description,
                        input_schema: schema,
                    }
                })
            }

            return payload
        }

        if (isNova) {
            const payload: any = {
                messages: this.convertMessagesToNova(messages),
                system: options.systemPrompts?.map(p => ({ text: p })),
                inferenceConfig: {
                    maxNewTokens: options.maxTokens || 5120,
                    temperature: options.temperature,
                    topP: options.topP,
                }
            }

            if (options.tools?.length) {
                payload.toolConfig = {
                    tools: options.tools.map(t => {
                        // Tools should already be converted by TextEngine, but fallback to conversion if needed
                        let schema = t.inputSchema as JSONSchema | undefined
                        if (!schema || (schema as any)._def || (schema as any)['~standard']) {
                            // Schema wasn't properly converted, try converting it
                            schema = convertSchemaToJsonSchema(t.inputSchema) ?? {
                                type: 'object',
                                properties: {},
                                required: [],
                            }
                        }
                        return {
                            toolSpec: {
                                name: t.name,
                                description: t.description,
                                inputSchema: {
                                    json: schema
                                }
                            }
                        }
                    })
                }
            }

            return payload
        }

        if (isLlama) {
            const prompt = this.formatPrompt(messages, options.systemPrompts)
            return {
                prompt,
                max_gen_len: options.maxTokens || 2048,
                temperature: options.temperature,
                top_p: options.topP,
            }
        }

        if (isTitan) {
            const lastMessage = messages[messages.length - 1]
            return {
                inputText: lastMessage?.content ?? '',
                textGenerationConfig: {
                    maxTokenCount: options.maxTokens || 8192,
                    temperature: options.temperature || 0.7,
                    topP: options.topP || 0.9,
                },
            }
        }

        return {
            prompt: this.formatPrompt(messages, options.systemPrompts),
        }
    }

    private convertMessagesToAnthropic(messages: Array<ModelMessage>) {
        const formatted: Array<any> = []

        for (const m of messages) {

            if (m.role === 'tool' && m.toolCallId) {
                formatted.push({
                    role: 'user',
                    content: [
                        {
                            type: 'tool_result',
                            tool_use_id: m.toolCallId,
                            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                        },
                    ],
                })
                continue
            }

            if (m.role === 'assistant' && (m.toolCalls?.length || Array.isArray(m.content))) {
                const content: Array<any> = []
                if (typeof m.content === 'string' && m.content) {
                    content.push({ type: 'text', text: m.content })
                } else if (Array.isArray(m.content)) {
                    content.push(...m.content.map(p => this.convertPartToAnthropic(p)))
                }

                if (m.toolCalls) {
                    for (const tc of m.toolCalls) {
                        content.push({
                            type: 'tool_use',
                            id: tc.id,
                            name: tc.function.name,
                            input: typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments,
                        })
                    }
                }

                formatted.push({ role: 'assistant', content })
                continue
            }

            formatted.push({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: Array.isArray(m.content)
                    ? m.content.map(p => this.convertPartToAnthropic(p))
                    : m.content as string,
            })
        }
        return formatted
    }

    private convertMessagesToNova(messages: Array<ModelMessage>) {
        const formatted: Array<any> = []

        for (const m of messages) {

            if (m.role === 'tool' && m.toolCallId) {
                formatted.push({
                    role: 'user',
                    content: [
                        {
                            toolResult: {
                                toolUseId: m.toolCallId,
                                content: [{ json: typeof m.content === 'string' ? JSON.parse(m.content) : m.content }],
                                status: 'success'
                            }
                        }
                    ]
                })
                continue
            }

            if (m.role === 'assistant' && (m.toolCalls?.length || Array.isArray(m.content))) {
                const content: Array<any> = []
                if (typeof m.content === 'string' && m.content) {
                    content.push({ text: m.content })
                } else if (Array.isArray(m.content)) {
                    content.push(...m.content.map(p => this.convertPartToNova(p)))
                }

                if (m.toolCalls) {
                    for (const tc of m.toolCalls) {
                        content.push({
                            toolUse: {
                                toolUseId: tc.id,
                                name: tc.function.name,
                                input: typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments
                            }
                        })
                    }
                }

                formatted.push({ role: 'assistant', content })
                continue
            }

            formatted.push({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: Array.isArray(m.content)
                    ? m.content.map(p => this.convertPartToNova(p))
                    : [{ text: m.content as string }]
            })
        }
        return formatted
    }

    private convertPartToAnthropic(part: ContentPart) {
        if (part.type === 'text') {
            return { type: 'text' as const, text: part.content }
        }
        if (part.type === 'image') {
            return {
                type: 'image' as const,
                source: {
                    type: 'base64' as const,
                    media_type: (part.metadata as any)?.mediaType ?? 'image/jpeg',
                    data: part.source.value,
                },
            }
        }
        if (part.type === 'document') {
            return {
                type: 'document' as const,
                source: {
                    type: 'base64' as const,
                    media_type: (part.metadata as any)?.mediaType ?? 'application/pdf',
                    data: part.source.value,
                },
                name: (part.metadata as any)?.name ?? 'document'
            }
        }
        throw new Error(`Unsupported content part type for Bedrock/Anthropic: ${part.type}`)
    }

    private convertPartToNova(part: ContentPart) {
        if (part.type === 'text') {
            return { text: part.content }
        }
        if (part.type === 'image') {
            return {
                image: {
                    format: (part.metadata as any)?.mediaType?.split('/')[1] ?? 'jpeg',
                    source: { bytes: part.source.value }
                }
            }
        }
        if (part.type === 'video') {
            return {
                video: {
                    format: (part.metadata as any)?.mediaType?.split('/')[1] ?? 'mp4',
                    source: { bytes: part.source.value }
                }
            }
        }
        if (part.type === 'document') {
            return {
                document: {
                    format: (part.metadata as any)?.mediaType?.split('/')[1] ?? 'pdf',
                    source: { bytes: part.source.value },
                    name: (part.metadata as any)?.name ?? 'document'
                }
            }
        }
        return { text: '[Unsupported Part]' }
    }

    private formatPrompt(messages: Array<ModelMessage>, systemPrompts?: Array<string>) {
        let prompt = ''
        if (systemPrompts?.length) {
            prompt += `System: ${systemPrompts.join('\n')}\n\n`
        }
        for (const msg of messages) {
            prompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`
        }
        prompt += 'Assistant: '
        return prompt
    }
}
