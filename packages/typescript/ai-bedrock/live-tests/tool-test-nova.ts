import { bedrockText } from '../src/index'
import { z } from 'zod'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { chat } from '@tanstack/ai'

// Load environment variables from .env.local manually
const __dirname = dirname(fileURLToPath(import.meta.url))
try {
    const envContent = readFileSync(join(__dirname, '.env.local'), 'utf-8')
    envContent.split('\n').forEach((line) => {
        const match = line.match(/^([^=]+)=(.*)$/)
        if (match) {
            process.env[match[1].trim()] = match[2].trim()
        }
    })
} catch (e) {
    // .env.local not found
}

async function testBedrockNovaToolCalling() {
    console.log('Testing Bedrock tool calling (Amazon Nova Pro)\n')

    const adapter = bedrockText('amazon.nova-pro-v1:0', {
        region: process.env.AWS_REGION || 'us-west-2',
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        }
    })

    const getTemperatureTool = {
        name: 'get_temperature',
        description: 'Get the current temperature for a specific location',
        inputSchema: {
            type: 'object' as const,
            properties: {
                location: {
                    type: 'string' as const,
                    description: 'The city or location',
                },
                unit: {
                    type: 'string' as const,
                    enum: ['celsius', 'fahrenheit'],
                    description: 'The temperature unit',
                },
            },
            required: ['location', 'unit'],
        },
        execute: async (args: any) => {
            console.log('Tool executed with:', JSON.stringify(args))
            return `The temperature in ${args.location} is 72°${args.unit === 'celsius' ? 'C' : 'F'}`
        },
    }

    try {
        const result = await chat({
            adapter,
            messages: [{ role: 'user', content: 'What is the temperature in New York in fahrenheit?' }],
            tools: [getTemperatureTool],
            stream: false,
        })

        if (!result) {
            throw new Error('No response received from the model.')
        }

        console.log('\nFinal Response:', result)
        console.log('\nSuccess!')
    } catch (error) {
        console.error('\nTest Failed:', error instanceof Error ? error.message : String(error))
        process.exit(1)
    }
}

testBedrockNovaToolCalling()
