import { BedrockTextAdapter  } from './bedrock-adapter'
import { getBedrockConfigFromEnv } from './utils'
import type {BedrockTextConfig} from './bedrock-adapter';
import type { BedrockModelId } from './model-meta'

export function createBedrockChat<
    TModel extends BedrockModelId,
>(model: TModel, config: BedrockTextConfig): BedrockTextAdapter<TModel> {
    return new BedrockTextAdapter(config, model)
}

export function bedrockText<TModel extends BedrockModelId>(
    model: TModel,
    config?: Partial<BedrockTextConfig>,
): BedrockTextAdapter<TModel> {
    const envConfig = getBedrockConfigFromEnv()
    return createBedrockChat(model, { ...envConfig, ...config })
}
