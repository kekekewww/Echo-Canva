import { describe, expect, it } from "vitest";

import { OPENROUTER_BASE_URL, getAiProviderConfig } from "@/ai/provider";

describe("getAiProviderConfig", () => {
  it("defaults to the official OpenAI provider and GPT-5.6", () => {
    expect(getAiProviderConfig(undefined, "sk-proj-user-key-1234567890")).toEqual({
      provider: "openai",
      apiKey: "sk-proj-user-key-1234567890",
      compilerModel: "gpt-5.6",
      explainerModel: "gpt-5.6",
    });
  });

  it("builds a fixed Luna config from a user-supplied OpenRouter key", () => {
    expect(getAiProviderConfig("openrouter", "sk-or-v1-user-key-1234567890")).toEqual({
      provider: "openrouter",
      apiKey: "sk-or-v1-user-key-1234567890",
      baseURL: OPENROUTER_BASE_URL,
      compilerModel: "openai/gpt-5.6-luna",
      explainerModel: "openai/gpt-5.6-luna",
    });
  });

  it("does not accept deployment environment credentials", () => {
    expect(getAiProviderConfig("openrouter", {
      AI_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: "sk-or-v1-owner-key-1234567890",
    } as never)).toBeNull();
  });

  it.each([null, "", "short", "key with spaces", "sk-or-v1-<script>"])(
    "rejects an absent or malformed user key: %s",
    (key) => {
      expect(getAiProviderConfig("openrouter", key)).toBeNull();
    },
  );

  it("trims a valid user key", () => {
    expect(getAiProviderConfig("openrouter", "  sk-or-v1-user-key-1234567890  ")?.apiKey).toBe(
      "sk-or-v1-user-key-1234567890",
    );
  });

  it("rejects an unsupported provider instead of accepting a custom endpoint", () => {
    expect(getAiProviderConfig("custom", "sk-user-key-12345678901234567890")).toBeNull();
  });
});
