import { AUDIO_ASSETS } from "@/domain/audio-assets/registry";
import { MATERIALS } from "@/domain/materials/registry";
import { DEFAULT_PRESET_ID } from "@/domain/presets";
import { validateScene } from "@/domain/scene/validate";

import {
  MAX_SCENE_PROMPT_CHARS,
  SCENE_COMPILER_MODEL,
  type CompileDependencies,
  type CompileSceneFailure,
  type CompileSceneRequest,
  type CompileSceneResponse,
  type CompileSceneSuccess,
  type CompileSchemaPrompt,
} from "@/ai/contracts";

function failure(
  code: CompileSceneFailure["error"]["code"],
  message: string,
): CompileSceneFailure {
  return { ok: false, error: { code, message }, fallbackSceneId: DEFAULT_PRESET_ID };
}

function success(scene: CompileSceneSuccess["scene"], repairAttempted: boolean): CompileSceneSuccess {
  return { ok: true, scene, repairAttempted, warnings: [], model: SCENE_COMPILER_MODEL };
}

export function buildCompilePrompt(prompt: string, baseScene?: unknown): CompileSchemaPrompt {
  return {
    instructions: [
      "Compile the request into exactly one editable SceneSpec JSON object.",
      "Use only the supplied material IDs and audio clip IDs.",
      "Keep all geometry within the supplied SceneSpec schema limits.",
      `Allowed material IDs: ${MATERIALS.map((material) => material.id).join(", ")}.`,
      `Allowed audio clip IDs: ${AUDIO_ASSETS.map((asset) => asset.id).join(", ")}.`,
      "Do not include prose, URLs, code, tools, or fields outside the schema.",
    ].join("\n"),
    prompt,
    ...(baseScene === undefined ? {} : { baseScene }),
  };
}

export async function compileScene(
  { prompt, baseScene }: CompileSceneRequest,
  deps: CompileDependencies,
): Promise<CompileSceneResponse> {
  if (prompt.length > MAX_SCENE_PROMPT_CHARS) {
    return failure("PROMPT_TOO_LONG", "Describe the scene in 2,000 characters or fewer.");
  }

  const schemaPrompt = buildCompilePrompt(prompt, baseScene);
  const first = await deps.generateScene(schemaPrompt);
  const firstResult = validateScene(first);
  if (firstResult.ok) {
    return success(firstResult.scene, false);
  }

  const repaired = await deps.generateScene(schemaPrompt, firstResult.errors);
  const repairedResult = validateScene(repaired);
  return repairedResult.ok
    ? success(repairedResult.scene, true)
    : failure("SCENE_VALIDATION_FAILED", "The generated scene could not be validated.");
}
