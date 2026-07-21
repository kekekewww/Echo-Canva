import {
  COMPILE_SCENE_FAILURE_CODES,
  USER_OPENROUTER_KEY_HEADER,
  isAiModel,
  type AcousticExplanation,
  type AcousticExplanationFailureCode,
  type AcousticExplanationResponse,
  type CompileSceneFailure,
  type CompileSceneFailureCode,
  type CompileSceneResponse,
  type CompileSceneSuccess,
  type SceneCompileMode,
  type ExplainAcousticsRequest,
} from "@/ai/contracts";
import { validateGeneratedHybridScene } from "@/ai/hybrid-scene";
import { DEFAULT_PRESET_ID, PRESETS, type PresetId } from "@/domain/presets";
import { validateScene } from "@/domain/scene/validate";

type Fetcher = typeof fetch;

const INVALID_RESPONSE_MESSAGE =
  "The scene generator returned an invalid response. Keep editing manually or load a preset.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPresetId(value: unknown): value is PresetId {
  return typeof value === "string" && Object.hasOwn(PRESETS, value);
}

function typedFailure(message = INVALID_RESPONSE_MESSAGE): CompileSceneFailure {
  return {
    ok: false,
    error: { code: "SCENE_VALIDATION_FAILED", message },
    fallbackSceneId: DEFAULT_PRESET_ID,
  };
}

function parseSuccess(value: Record<string, unknown>, targetMode: SceneCompileMode): CompileSceneSuccess | null {
  const hybrid = targetMode === "hybrid-3d"
    ? validateGeneratedHybridScene({ scene: value.scene, spatial3d: value.spatial3d })
    : null;
  const validation = hybrid?.ok
    ? { ok: true as const, scene: hybrid.candidate.scene }
    : targetMode === "hybrid-3d"
      ? { ok: false as const }
      : validateScene(value.scene);
  if (
    !validation.ok ||
    !isAiModel(value.model) ||
    typeof value.repairAttempted !== "boolean" ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every((warning) => typeof warning === "string")
  ) {
    return null;
  }

  return {
    ok: true,
    scene: validation.scene,
    ...(hybrid?.ok ? { spatial3d: hybrid.candidate.spatial3d } : {}),
    model: value.model,
    repairAttempted: value.repairAttempted,
    warnings: value.warnings,
  };
}

function parseFailure(value: Record<string, unknown>): CompileSceneFailure | null {
  if (!isRecord(value.error) || !isPresetId(value.fallbackSceneId)) {
    return null;
  }

  const { code, message } = value.error;
  if (
    typeof message !== "string" ||
    typeof code !== "string" ||
    !(COMPILE_SCENE_FAILURE_CODES as readonly string[]).includes(code)
  ) {
    return null;
  }

  if (code === "RATE_LIMITED") {
    if (typeof value.retryAfterMs !== "number" || !Number.isFinite(value.retryAfterMs) || value.retryAfterMs < 0) {
      return null;
    }
    return { ok: false, error: { code, message }, fallbackSceneId: value.fallbackSceneId, retryAfterMs: value.retryAfterMs };
  }

  return {
    ok: false,
    error: { code: code as Exclude<CompileSceneFailureCode, "RATE_LIMITED">, message },
    fallbackSceneId: value.fallbackSceneId,
  };
}

function parseCompileResponse(value: unknown, targetMode: SceneCompileMode): CompileSceneResponse | null {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return null;
  }

  return value.ok ? parseSuccess(value, targetMode) : parseFailure(value);
}

function isExplanationFailureCode(value: unknown): value is AcousticExplanationFailureCode {
  return (
    value === "AI_REQUEST_FAILED" ||
    value === "AI_REFUSED" ||
    value === "AI_TIMEOUT" ||
    value === "AI_UNAVAILABLE" ||
    value === "EXPLANATION_VALIDATION_FAILED" ||
    value === "INVALID_REQUEST" ||
    value === "RATE_LIMITED"
  );
}

function parseExplanation(value: unknown): AcousticExplanation | null {
  if (!isRecord(value) || typeof value.summary !== "string" || !Array.isArray(value.factors) || !Array.isArray(value.limitations)) {
    return null;
  }
  if (
    !value.factors.every(
      (factor) => isRecord(factor) && typeof factor.label === "string" && typeof factor.evidence === "string",
    ) ||
    !value.limitations.every((limitation) => typeof limitation === "string")
  ) {
    return null;
  }
  return {
    summary: value.summary,
    factors: value.factors.map((factor) => ({
      label: (factor as Record<string, string>).label,
      evidence: (factor as Record<string, string>).evidence,
    })),
    limitations: value.limitations,
  };
}

function parseExplanationResponse(value: unknown): AcousticExplanationResponse | null {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return null;
  }
  if (value.ok) {
    const explanation = parseExplanation(value.explanation);
    return explanation && isAiModel(value.model)
      ? { ok: true, explanation, model: value.model }
      : null;
  }
  if (!isRecord(value.error) || !isExplanationFailureCode(value.error.code) || typeof value.error.message !== "string") {
    return null;
  }
  return { ok: false, error: { code: value.error.code, message: value.error.message } };
}

/**
 * Calls the compiler endpoint and always resolves to the public compile contract.
 * Browser failures and malformed responses are converted into a safe typed fallback.
 */
export async function requestSceneCompilation(
  prompt: string,
  baseScene: unknown,
  targetModeOrFetcher: SceneCompileMode | Fetcher = "classic-2d5d",
  fetcherArgument: Fetcher = fetch,
  userApiKey?: string,
): Promise<CompileSceneResponse> {
  const targetMode = typeof targetModeOrFetcher === "function" ? "classic-2d5d" : targetModeOrFetcher;
  const fetcher = typeof targetModeOrFetcher === "function" ? targetModeOrFetcher : fetcherArgument;
  let response: Response;
  try {
    response = await fetcher("/api/scene/compile", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(userApiKey ? { [USER_OPENROUTER_KEY_HEADER]: userApiKey } : {}),
      },
      body: JSON.stringify({ prompt, baseScene, targetMode }),
    });
  } catch {
    return typedFailure("The scene generator is unavailable. Keep editing manually or load a preset.");
  }

  try {
    const parsed = parseCompileResponse(await response.json(), targetMode);
    return parsed ?? typedFailure();
  } catch {
    return typedFailure();
  }
}

/** Calls the explanation endpoint without exposing server credentials to the browser. */
export async function requestAcousticExplanation(
  request: ExplainAcousticsRequest,
  fetcher: Fetcher = fetch,
  userApiKey?: string,
): Promise<AcousticExplanationResponse> {
  let response: Response;
  try {
    response = await fetcher("/api/scene/explain", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(userApiKey ? { [USER_OPENROUTER_KEY_HEADER]: userApiKey } : {}),
      },
      body: JSON.stringify(request),
    });
  } catch {
    return {
      ok: false,
      error: {
        code: "AI_REQUEST_FAILED",
        message: "The acoustic explanation is unavailable. Keep editing manually.",
      },
    };
  }

  try {
    return (
      parseExplanationResponse(await response.json()) ?? {
        ok: false,
        error: {
          code: "EXPLANATION_VALIDATION_FAILED",
          message: "The acoustic explanation returned an invalid response. Keep editing manually.",
        },
      }
    );
  } catch {
    return {
      ok: false,
      error: {
        code: "EXPLANATION_VALIDATION_FAILED",
        message: "The acoustic explanation returned an invalid response. Keep editing manually.",
      },
    };
  }
}
