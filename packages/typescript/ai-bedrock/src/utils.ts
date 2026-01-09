
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'

export interface BedrockClientConfig {
    region?: string
    credentials?: {
        accessKeyId: string
        secretAccessKey: string
        sessionToken?: string
    }
}

/**
 * Creates a Bedrock Runtime SDK client instance
 */
export function createBedrockClient(config: BedrockClientConfig = {}): BedrockRuntimeClient {
    return new BedrockRuntimeClient(config)
}

/**
 * Gets Bedrock config from environment variables
 */
export function getBedrockConfigFromEnv(): BedrockClientConfig {
    const env =
        typeof globalThis !== 'undefined' && (globalThis as any).window?.env
            ? (globalThis as any).window.env
            : typeof process !== 'undefined'
                ? process.env
                : undefined

    const config: BedrockClientConfig = {}

    if (env?.AWS_REGION || env?.AWS_DEFAULT_REGION) {
        config.region = env.AWS_REGION || env.AWS_DEFAULT_REGION
    }

    if (env?.AWS_ACCESS_KEY_ID && env?.AWS_SECRET_ACCESS_KEY) {
        config.credentials = {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            sessionToken: env.AWS_SESSION_TOKEN
        }
    }

    return config
}

/**
 * Generates a unique ID with a prefix
 */
export function generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`
}
