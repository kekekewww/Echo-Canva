import { sceneSpecSchema } from "@/domain/scene/schema";
import type { PresetId } from "@/domain/presets";
import type { SceneValidationIssue, SceneSpec } from "@/domain/scene/types";

export const SCENE_COMPILER_MODEL = "gpt-5.6";
export const MAX_SCENE_PROMPT_CHARS = 2_000;

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
