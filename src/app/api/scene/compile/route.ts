import { createHash } from "node:crypto";

import OpenAI from "openai";

import {
  SCENE_COMPILER_MODEL,
  sceneSpecJsonSchema,
  type CompileSceneFailureCode,
  type CompileDependencies,
  type CompileSchemaPrompt,
} from "@/ai/contracts";
import { createSlidingWindowLimiter, type SlidingWindowLimiter } from "@/ai/rate-limit";
import { compileScene } from "@/ai/scene-compiler";
import { DEFAULT_PRESET_ID } from "@/domain/presets";
import { validateScene } from "@/domain/scene/validate";

export const runtime = "nodejs";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const DEFAULT_TIMEOUT_MS = 30_000;

class ModelRefusalError extends Error {
  constructor() {
    super("The model did not return a structured scene.");
    this.name = "ModelRefusalError";
  }
}

export type CompileRouteDependencies = CompileDependencies & {
  available: boolean;
  limiter: SlidingWindowLimiter;
  clientKey(request: Request): string;
};

function jsonFailure(
  code: Exclude<CompileSceneFailureCode, "PROMPT_TOO_LONG" | "RATE_LIMITED" | "SCENE_VALIDATION_FAILED">,
  message: string,
  status: number,
): Response {
  return Response.json(
    { ok: false, error: { code, message }, fallbackSceneId: DEFAULT_PRESET_ID },
    { status },
  );
}

function requestTimeoutMs(): number {
  const configured = Number.parseInt(process.env.AI_REQUEST_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

function reasoningEffort(): "low" | "medium" | "high" {
  const configured = process.env.OPENAI_REASONING_EFFORT;
  return configured === "low" || configured === "high" ? configured : "medium";
}

function hasRefusal(response: { output: Array<{ type: string }> }): boolean {
  return response.output.some((item) => item.type === "refusal");
}

function createOpenAIAdapter(apiKey: string): CompileDependencies["generateScene"] {
  const client = new OpenAI({ apiKey, timeout: requestTimeoutMs() });

  return async (
    schemaPrompt: CompileSchemaPrompt,
    repairErrors?: Parameters<CompileDependencies["generateScene"]>[1],
  ): Promise<unknown> => {
    const response = await client.responses.create({
      model: SCENE_COMPILER_MODEL,
      reasoning: { effort: reasoningEffort() },
      tools: [],
      input: [
        {
          role: "developer",
          content: schemaPrompt.instructions,
        },
        {
          role: "user",
          content: JSON.stringify({
            prompt: schemaPrompt.prompt,
            ...(schemaPrompt.baseScene === undefined ? {} : { baseScene: schemaPrompt.baseScene }),
            ...(repairErrors?.length ? { validationErrors: repairErrors } : {}),
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "scene_spec",
          strict: true,
          schema: sceneSpecJsonSchema,
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

function createDefaultDependencies(): CompileRouteDependencies {
  const apiKey = process.env.OPENAI_API_KEY;
  return {
    available: Boolean(apiKey),
    generateScene: apiKey
      ? createOpenAIAdapter(apiKey)
      : async () => {
          throw new Error("OpenAI is unavailable.");
        },
    limiter: createSlidingWindowLimiter(RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS),
    clientKey: derivedClientKey,
  };
}

const defaultDependencies = createDefaultDependencies();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

export async function handleCompileRequest(
  request: Request,
  dependencies: CompileRouteDependencies = defaultDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonFailure("INVALID_REQUEST", "Only POST is supported.", 405);
  }

  const body = await parseRequestBody(request);
  if (body instanceof Response) {
    return body;
  }

  if (typeof body.prompt !== "string") {
    return jsonFailure("INVALID_REQUEST", "Prompt must be a string.", 400);
  }

  const baseScene = body.baseScene;
  if (baseScene !== undefined && !validateScene(baseScene).ok) {
    return jsonFailure("INVALID_BASE_SCENE", "Base scene must be a valid SceneSpec.", 400);
  }

  const rateLimit = dependencies.limiter.check(dependencies.clientKey(request), Date.now());
  if (!rateLimit.allowed) {
    return Response.json(
      {
        ok: false,
        error: { code: "RATE_LIMITED", message: "Too many scene compile requests. Try again shortly." },
        fallbackSceneId: DEFAULT_PRESET_ID,
        retryAfterMs: rateLimit.retryAfterMs,
      },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1_000)) } },
    );
  }

  if (!dependencies.available) {
    return jsonFailure("AI_UNAVAILABLE", "AI scene generation is unavailable. Load a preset instead.", 503);
  }

  try {
    const result = await compileScene({ prompt: body.prompt, baseScene }, dependencies);
    const status = result.ok ? 200 : result.error.code === "PROMPT_TOO_LONG" ? 400 : 422;
    return Response.json(result, { status });
  } catch (error) {
    if (isTimeout(error)) {
      return jsonFailure("AI_TIMEOUT", "The scene generator timed out. Try again.", 504);
    }
    if (isModelRefusal(error)) {
      return jsonFailure("AI_REFUSED", "The scene generator could not complete that request.", 422);
    }
    return jsonFailure("AI_REQUEST_FAILED", "The scene generator is temporarily unavailable.", 502);
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleCompileRequest(request);
}
