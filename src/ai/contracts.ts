import { sceneSpecSchema } from "@/domain/scene/schema";
import type { PresetId } from "@/domain/presets";
import type { SceneValidationIssue, SceneSpec } from "@/domain/scene/types";

export const SCENE_COMPILER_MODEL = "gpt-5.6";
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
  model: typeof SCENE_COMPILER_MODEL;
};

export type CompileSceneFailureCode = "PROMPT_TOO_LONG" | "SCENE_VALIDATION_FAILED";

export type CompileSceneFailure = {
  ok: false;
  error: {
    code: CompileSceneFailureCode;
    message: string;
  };
  fallbackSceneId: PresetId;
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

export type AcousticExplanation = Readonly<{
  summary: string;
  factors: readonly Readonly<{ label: string; evidence: string }>[];
  limitations: readonly string[];
}>;

export type ExplainDependencies = Readonly<{
  generateExplanation(prompt: string): Promise<unknown>;
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
  | Readonly<{ ok: true; explanation: AcousticExplanation; model: typeof ACOUSTIC_EXPLAINER_MODEL }>
  | Readonly<{
      ok: false;
      error: {
        code: AcousticExplanationFailureCode;
        message: string;
      };
    }>;
