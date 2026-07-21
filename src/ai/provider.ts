import {
  ACOUSTIC_EXPLAINER_MODEL,
  OPENROUTER_LUNA_MODEL,
  SCENE_COMPILER_MODEL,
  type AiModel,
  type AiProvider,
} from "@/ai/contracts";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export type AiProviderConfig = Readonly<{
  provider: AiProvider;
  apiKey: string;
  baseURL?: string;
  compilerModel: AiModel;
  explainerModel: AiModel;
}>;

export function normalizeUserApiKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const apiKey = value.trim();
  return /^[A-Za-z0-9._-]{20,512}$/.test(apiKey) ? apiKey : null;
}

/** Builds a request-scoped provider config from the current user's key only. */
export function normalizeAiProvider(value: unknown): AiProvider | null {
  if (value === undefined || value === null || value === "") return "openai";
  return value === "openai" || value === "openrouter" ? value : null;
}

export function getAiProviderConfig(providerValue: unknown, userApiKey: unknown): AiProviderConfig | null {
  const provider = normalizeAiProvider(providerValue);
  const apiKey = normalizeUserApiKey(userApiKey);
  if (!provider || !apiKey) return null;
  return provider === "openrouter"
    ? {
        provider: "openrouter",
        apiKey,
        baseURL: OPENROUTER_BASE_URL,
        compilerModel: OPENROUTER_LUNA_MODEL,
        explainerModel: OPENROUTER_LUNA_MODEL,
      }
    : {
        provider: "openai",
        apiKey,
        compilerModel: SCENE_COMPILER_MODEL,
        explainerModel: ACOUSTIC_EXPLAINER_MODEL,
      };
}
