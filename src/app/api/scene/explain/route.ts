import { createHash } from "node:crypto";

import OpenAI from "openai";

import {
  ACOUSTIC_EXPLAINER_MODEL,
  USER_OPENROUTER_KEY_HEADER,
  type ExplainAcousticsRequest,
  type ExplainDependencies,
  type ExplainSchemaPrompt,
} from "@/ai/contracts";
import { getAiProviderConfig, type AiProviderConfig } from "@/ai/provider";
import { acousticExplanationJsonSchema, explainAcoustics } from "@/ai/acoustic-explainer";
import { createSlidingWindowLimiter, type SlidingWindowLimiter } from "@/ai/rate-limit";

export const runtime = "nodejs";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const DEFAULT_TIMEOUT_MS = 30_000;
const PRIVATE_RESPONSE_HEADERS = { "Cache-Control": "private, no-store" } as const;

class ModelRefusalError extends Error {
  constructor() {
    super("The model did not return a structured explanation.");
    this.name = "ModelRefusalError";
  }
}

export type ExplainRouteDependencies = ExplainDependencies & {
  available: boolean;
  limiter: SlidingWindowLimiter;
  clientKey(request: Request): string;
};

type FailureCode =
  | "AI_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_REFUSED"
  | "AI_REQUEST_FAILED"
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "RATE_LIMITED";

function jsonFailure(code: FailureCode, message: string, status: number): Response {
  return Response.json(
    { ok: false, error: { code, message } },
    { status, headers: PRIVATE_RESPONSE_HEADERS },
  );
}

function requestTimeoutMs(): number {
  const configured = Number.parseInt(process.env.AI_REQUEST_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

function hasRefusal(response: { output: Array<{ type: string }> }): boolean {
  return response.output.some((item) => item.type === "refusal");
}

function createOpenAIAdapter(config: AiProviderConfig): ExplainDependencies["generateExplanation"] {
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL, timeout: requestTimeoutMs() });

  return async (schemaPrompt: ExplainSchemaPrompt, repairErrors?: readonly string[]): Promise<unknown> => {
    const response = await client.responses.create({
      model: config.explainerModel,
      reasoning: { effort: "low" },
      tools: [],
      input: [
        { role: "developer", content: schemaPrompt.instructions },
        ...(repairErrors?.length
          ? [{ role: "developer" as const, content: repairErrors.join("\n") }]
          : []),
        {
          role: "user",
          content: JSON.stringify(schemaPrompt.request),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "acoustic_explanation",
          strict: true,
          schema: acousticExplanationJsonSchema,
        },
      },
    });

    if (hasRefusal(response) || !response.output_text) {
      throw new ModelRefusalError();
    }

    return JSON.parse(response.output_text) as unknown;
  };
}

function derivedClientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const userAgent = request.headers.get("user-agent") ?? "";
  return createHash("sha256").update(`${forwardedFor}\n${userAgent}`).digest("hex");
}

const defaultLimiter = createSlidingWindowLimiter(RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);

function createDefaultDependencies(request: Request): ExplainRouteDependencies {
  const config = getAiProviderConfig(request.headers.get(USER_OPENROUTER_KEY_HEADER));
  return {
    available: Boolean(config),
    model: config?.explainerModel ?? ACOUSTIC_EXPLAINER_MODEL,
    generateExplanation: config
      ? createOpenAIAdapter(config)
      : async () => {
          throw new Error("OpenAI is unavailable.");
        },
    limiter: defaultLimiter,
    clientKey: derivedClientKey,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isExplainRequestBody(value: Record<string, unknown>): value is ExplainAcousticsRequest {
  if (typeof value.sceneName !== "string" || typeof value.sourceName !== "string" || !isRecord(value.snapshot)) {
    return false;
  }
  const { snapshot } = value;
  return (
    (snapshot.routeType === "direct" || snapshot.routeType === "portal" || snapshot.routeType === "blocked") &&
    isFiniteNumber(snapshot.effectiveDistanceM) &&
    isFiniteNumber(snapshot.dryGainDb) &&
    isFiniteNumber(snapshot.lowpassHz) &&
    isFiniteNumber(snapshot.portalCount) &&
    isRecord(snapshot.rt60S) &&
    isFiniteNumber(snapshot.rt60S.low) &&
    isFiniteNumber(snapshot.rt60S.mid) &&
    isFiniteNumber(snapshot.rt60S.high)
  );
}

async function parseRequestBody(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const body: unknown = await request.json();
    return isRecord(body)
      ? body
      : jsonFailure("INVALID_REQUEST", "Request body must be a JSON object.", 400);
  } catch {
    return jsonFailure("INVALID_JSON", "Request body must be valid JSON.", 400);
  }
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "APIConnectionTimeoutError");
}

function isModelRefusal(error: unknown): boolean {
  return error instanceof Error && error.name === "ModelRefusalError";
}

export async function handleExplainRequest(
  request: Request,
  dependencies?: ExplainRouteDependencies,
): Promise<Response> {
  const activeDependencies = dependencies ?? createDefaultDependencies(request);
  if (request.method !== "POST") {
    return jsonFailure("INVALID_REQUEST", "Only POST is supported.", 405);
  }

  const body = await parseRequestBody(request);
  if (body instanceof Response) {
    return body;
  }

  if (!isExplainRequestBody(body)) {
    return jsonFailure("INVALID_REQUEST", "Explanation request must contain a finite acoustic snapshot.", 400);
  }

  const rateLimit = activeDependencies.limiter.check(activeDependencies.clientKey(request), Date.now());
  if (!rateLimit.allowed) {
    return Response.json(
      {
        ok: false,
        error: { code: "RATE_LIMITED", message: "Too many explanation requests. Try again shortly." },
        retryAfterMs: rateLimit.retryAfterMs,
      },
      {
        status: 429,
        headers: {
          ...PRIVATE_RESPONSE_HEADERS,
          "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1_000)),
        },
      },
    );
  }

  if (!activeDependencies.available) {
    return jsonFailure("AI_UNAVAILABLE", "Add your OpenRouter API key in Settings to explain acoustics.", 503);
  }

  try {
    const result = await explainAcoustics(body, activeDependencies);
    return Response.json(result, {
      status: result.ok ? 200 : 422,
      headers: PRIVATE_RESPONSE_HEADERS,
    });
  } catch (error) {
    if (isTimeout(error)) {
      return jsonFailure("AI_TIMEOUT", "The acoustic explanation timed out. Try again.", 504);
    }
    if (isModelRefusal(error)) {
      return jsonFailure("AI_REFUSED", "The acoustic explanation could not be completed.", 422);
    }
    return jsonFailure("AI_REQUEST_FAILED", "The acoustic explanation is temporarily unavailable.", 502);
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleExplainRequest(request);
}
