import {
  SCENE_COMPILER_MODEL,
  type CompileSceneFailure,
  type CompileSceneResponse,
  type CompileSceneSuccess,
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
