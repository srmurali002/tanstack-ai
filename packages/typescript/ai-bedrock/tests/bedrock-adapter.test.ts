
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime'
import { BedrockTextAdapter } from '../src/bedrock-adapter'

// Mock the AWS SDK
const { sendMock } = vi.hoisted(() => {
    return { sendMock: vi.fn() }
})

vi.mock('@aws-sdk/client-bedrock-runtime', () => {
    return {
        BedrockRuntimeClient: class {
            send = sendMock
        },
        InvokeModelCommand: vi.fn(),
        InvokeModelWithResponseStreamCommand: vi.fn(),
    }
})

describe('BedrockTextAdapter', () => {
    let adapter: BedrockTextAdapter<any>

    beforeEach(() => {
        vi.clearAllMocks()
        adapter = new BedrockTextAdapter({
            region: 'us-east-1',
            credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
        }, 'anthropic.claude-3-sonnet-20240229-v1:0')
    })

    describe('chatStream', () => {
        it('should handle streaming response', async () => {
            // Mocking async iterable response body for streaming
            const mockChunks = [
                {
                    chunk: {
                        bytes: new TextEncoder().encode(
                            JSON.stringify({
                                type: 'content_block_delta',
                                delta: { type: 'text_delta', text: 'Hello ' },
                            })
                        ),
                    },
                },
                {
                    chunk: {
                        bytes: new TextEncoder().encode(
                            JSON.stringify({
                                type: 'content_block_delta',
                                delta: { type: 'text_delta', text: 'world' },
                            })
                        ),
                    },
                },
            ]

            sendMock.mockResolvedValue({
                body: (async function* () {
                    for (const chunk of mockChunks) {
                        await Promise.resolve()
                        yield chunk
                    }
                })(),
            })

            const stream = adapter.chatStream({
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                messages: [{ role: 'user', content: 'Hi' }],
            })

            const result = []
            for await (const chunk of stream) {
                result.push(chunk)
            }

            expect(InvokeModelWithResponseStreamCommand).toHaveBeenCalled()
            // Filter for content chunks only
            const contentChunks = result.filter(c => c.type === 'content')
            expect(contentChunks).toEqual([
                expect.objectContaining({ type: 'content', delta: 'Hello ' }),
                expect.objectContaining({ type: 'content', delta: 'world' }),
            ])

            const doneChunk = result.find(c => c.type === 'done')
            expect(doneChunk).toBeDefined()
        })
    })
})
