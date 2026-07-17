import {
  ACOUSTIC_EXPLAINER_MODEL,
  SCENE_COMPILER_MODEL,
  type AcousticExplanation,
  type AcousticExplanationFailureCode,
  type AcousticExplanationResponse,
  type CompileSceneFailure,
  type CompileSceneResponse,
  type CompileSceneSuccess,
  type ExplainAcousticsRequest,
} from "@/ai/contracts";
import { DEFAULT_PRESET_ID, PRESETS, type PresetId } from "@/domain/presets";
import type { SceneSpec } from "@/domain/scene/types";
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

function parseSuccess(value: Record<string, unknown>): CompileSceneSuccess | null {
  const validation = validateScene(value.scene);
  if (
    !validation.ok ||
    value.model !== SCENE_COMPILER_MODEL ||
    typeof value.repairAttempted !== "boolean" ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every((warning) => typeof warning === "string")
  ) {
    return null;
  }

  return {
    ok: true,
    scene: validation.scene,
    model: SCENE_COMPILER_MODEL,
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
    (code !== "PROMPT_TOO_LONG" && code !== "SCENE_VALIDATION_FAILED") ||
    typeof message !== "string"
  ) {
    return null;
  }

  return {
    ok: false,
    error: { code, message },
    fallbackSceneId: value.fallbackSceneId,
  };
}

function parseCompileResponse(value: unknown): CompileSceneResponse | null {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return null;
  }

  return value.ok ? parseSuccess(value) : parseFailure(value);
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
    return explanation && value.model === ACOUSTIC_EXPLAINER_MODEL
      ? { ok: true, explanation, model: ACOUSTIC_EXPLAINER_MODEL }
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
  baseScene: SceneSpec,
  fetcher: Fetcher = fetch,
): Promise<CompileSceneResponse> {
  let response: Response;
  try {
    response = await fetcher("/api/scene/compile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, baseScene }),
    });
  } catch {
    return typedFailure("The scene generator is unavailable. Keep editing manually or load a preset.");
  }

  try {
    const parsed = parseCompileResponse(await response.json());
    return parsed ?? typedFailure();
  } catch {
    return typedFailure();
  }
}

/** Calls the explanation endpoint without exposing server credentials to the browser. */
export async function requestAcousticExplanation(
  request: ExplainAcousticsRequest,
  fetcher: Fetcher = fetch,
): Promise<AcousticExplanationResponse> {
  let response: Response;
  try {
    response = await fetcher("/api/scene/explain", {
      method: "POST",
      headers: { "content-type": "application/json" },
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
