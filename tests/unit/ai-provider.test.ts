import { describe, expect, it } from "vitest";

import { OPENROUTER_BASE_URL, getAiProviderConfig } from "@/ai/provider";

describe("getAiProviderConfig", () => {
  it("keeps OpenAI as the default provider", () => {
    expect(getAiProviderConfig({ OPENAI_API_KEY: "official-key" })).toEqual({
      provider: "openai",
      apiKey: "official-key",
      compilerModel: "gpt-5.6",
      explainerModel: "gpt-5.6",
    });
  });

  it("selects the fixed Luna model only when OpenRouter is explicit", () => {
    expect(
      getAiProviderConfig({
        AI_PROVIDER: "openrouter",
        OPENROUTER_API_KEY: "router-key",
        OPENAI_API_KEY: "official-key",
      }),
    ).toEqual({
      provider: "openrouter",
      apiKey: "router-key",
      baseURL: OPENROUTER_BASE_URL,
      compilerModel: "openai/gpt-5.6-luna",
      explainerModel: "openai/gpt-5.6-luna",
    });
  });

  it("does not silently fall back to another provider when the selected provider has no key", () => {
    expect(
      getAiProviderConfig({ AI_PROVIDER: "openrouter", OPENAI_API_KEY: "official-key" }),
    ).toBeNull();
  });

  it("rejects unknown provider values into preset/manual mode", () => {
    expect(getAiProviderConfig({ AI_PROVIDER: "untrusted", OPENAI_API_KEY: "official-key" })).toBeNull();
  });
});
