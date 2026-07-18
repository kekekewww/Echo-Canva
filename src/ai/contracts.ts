import { sceneSpecSchema } from "@/domain/scene/schema";
import type { PresetId } from "@/domain/presets";
import type { SceneValidationIssue, SceneSpec } from "@/domain/scene/types";

export const SCENE_COMPILER_MODEL = "gpt-5.6";
export const OPENROUTER_LUNA_MODEL = "openai/gpt-5.6-luna";
export const AI_MODEL_IDS = [SCENE_COMPILER_MODEL, OPENROUTER_LUNA_MODEL] as const;
export type AiModel = (typeof AI_MODEL_IDS)[number];
export function isAiModel(value: unknown): value is AiModel {
  return typeof value === "string" && (AI_MODEL_IDS as readonly string[]).includes(value);
}
export const MAX_SCENE_PROMPT_CHARS = 2_000;
export const ACOUSTIC_EXPLAINER_MODEL = "gpt-5.6";
export const FIXED_PORTAL_LIMITATION = "Portal routing is a geometric perceptual approximation.";

export type CompileSceneRequest = {
  prompt: string;
  baseScene?: unknown;
};

export type CompileSchemaPrompt = {
  instructions: string;
  prompt: string;
  baseScene?: unknown;
};

export type CompileDependencies = {
  model?: AiModel;
  generateScene(
    schemaPrompt: CompileSchemaPrompt,
    repairErrors?: readonly SceneValidationIssue[],
  ): Promise<unknown>;
};

export type CompileSceneSuccess = {
  ok: true;
  scene: SceneSpec;
  repairAttempted: boolean;
  warnings: string[];
  model: AiModel;
};

export const COMPILE_SCENE_FAILURE_CODES = [
  "AI_REQUEST_FAILED",
  "AI_REFUSED",
  "AI_TIMEOUT",
  "AI_UNAVAILABLE",
  "INVALID_BASE_SCENE",
  "INVALID_JSON",
  "INVALID_REQUEST",
  "PROMPT_TOO_LONG",
  "RATE_LIMITED",
  "SCENE_VALIDATION_FAILED",
] as const;

export type CompileSceneFailureCode = (typeof COMPILE_SCENE_FAILURE_CODES)[number];

type CompileSceneFailureBase = {
  ok: false;
  error: {
    code: Exclude<CompileSceneFailureCode, "RATE_LIMITED">;
    message: string;
  };
  fallbackSceneId: PresetId;
};

export type CompileSceneFailure =
  | CompileSceneFailureBase
  | {
      ok: false;
      error: { code: "RATE_LIMITED"; message: string };
      fallbackSceneId: PresetId;
      retryAfterMs: number;
    };

export type CompileSceneResponse = CompileSceneSuccess | CompileSceneFailure;

export const sceneSpecJsonSchema = sceneSpecSchema.toJSONSchema();

export type AcousticSnapshotProjection = Readonly<{
  routeType: "direct" | "portal" | "blocked";
  effectiveDistanceM: number;
  dryGainDb: number;
  lowpassHz: number;
  portalCount: number;
  rt60S: Readonly<{ low: number; mid: number; high: number }>;
}>;

export type ExplainAcousticsRequest = Readonly<{
  sceneName: string;
  sourceName: string;
  snapshot: AcousticSnapshotProjection;
}>;

export type ExplainSchemaPrompt = Readonly<{
  /** Static control-plane policy; this must never contain request data. */
  instructions: string;
  /** Untrusted labels and snapshot data, sent only in a user message. */
  request: ExplainAcousticsRequest;
}>;

export type AcousticExplanation = Readonly<{
  summary: string;
  factors: readonly Readonly<{ label: string; evidence: string }>[];
  limitations: readonly string[];
}>;

export type ExplainDependencies = Readonly<{
  model?: AiModel;
  generateExplanation(schemaPrompt: ExplainSchemaPrompt): Promise<unknown>;
}>;

export type AcousticExplanationFailureCode =
  | "AI_REQUEST_FAILED"
  | "AI_REFUSED"
  | "AI_TIMEOUT"
  | "AI_UNAVAILABLE"
  | "EXPLANATION_VALIDATION_FAILED"
  | "INVALID_REQUEST"
  | "RATE_LIMITED";

export type AcousticExplanationResponse =
  | Readonly<{ ok: true; explanation: AcousticExplanation; model: AiModel }>
  | Readonly<{
      ok: false;
      error: {
        code: AcousticExplanationFailureCode;
        message: string;
      };
    }>;
