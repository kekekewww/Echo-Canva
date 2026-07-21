import { OPENROUTER_LUNA_MODEL, type AiModel } from "@/ai/contracts";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export type AiProvider = "openrouter";

export type AiProviderConfig = Readonly<{
  provider: AiProvider;
  apiKey: string;
  baseURL?: string;
  compilerModel: AiModel;
  explainerModel: AiModel;
}>;

export function normalizeUserOpenRouterKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const apiKey = value.trim();
  return /^[A-Za-z0-9._-]{20,512}$/.test(apiKey) ? apiKey : null;
}

/** Builds a request-scoped provider config from the current user's key only. */
export function getAiProviderConfig(userApiKey: unknown): AiProviderConfig | null {
  const apiKey = normalizeUserOpenRouterKey(userApiKey);
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
