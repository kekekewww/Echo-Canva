import {
  ACOUSTIC_EXPLAINER_MODEL,
  OPENROUTER_LUNA_MODEL,
  SCENE_COMPILER_MODEL,
  type AiModel,
} from "@/ai/contracts";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export type AiProvider = "openai" | "openrouter";

export type AiProviderConfig = Readonly<{
  provider: AiProvider;
  apiKey: string;
  baseURL?: string;
  compilerModel: AiModel;
  explainerModel: AiModel;
}>;

/**
 * Resolves server-only model credentials. An absent or invalid selection leaves
 * the application in its existing preset/manual fallback mode.
 */
export function getAiProviderConfig(environment: NodeJS.ProcessEnv = process.env): AiProviderConfig | null {
  const provider = environment.AI_PROVIDER?.trim().toLowerCase();

  if (provider === "openrouter") {
    const apiKey = environment.OPENROUTER_API_KEY?.trim();
    return apiKey
      ? {
          provider: "openrouter",
          apiKey,
          baseURL: OPENROUTER_BASE_URL,
          compilerModel: OPENROUTER_LUNA_MODEL,
          explainerModel: OPENROUTER_LUNA_MODEL,
        }
      : null;
  }

  if (provider === undefined || provider === "" || provider === "openai") {
    const apiKey = environment.OPENAI_API_KEY?.trim();
    return apiKey
      ? {
          provider: "openai",
          apiKey,
          compilerModel: SCENE_COMPILER_MODEL,
          explainerModel: ACOUSTIC_EXPLAINER_MODEL,
        }
      : null;
  }

  return null;
}
