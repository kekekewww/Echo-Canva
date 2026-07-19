import { AUDIO_ASSETS } from "@/domain/audio-assets/registry";
import { MATERIALS } from "@/domain/materials/registry";
import { DEFAULT_PRESET_ID } from "@/domain/presets";
import { validateScene } from "@/domain/scene/validate";
import { isSafeModelLabel } from "@/ai/content-policy";
import { validateGeneratedHybridScene } from "@/ai/hybrid-scene";
import type { SceneValidationIssue, SceneValidationResult } from "@/domain/scene/types";
import type { GeneratedSpatial3D } from "@/domain/workspace/types";

import {
  MAX_SCENE_PROMPT_CHARS,
  SCENE_COMPILER_MODEL,
  type CompileDependencies,
  type CompileSceneFailure,
  type CompileSceneRequest,
  type CompileSceneResponse,
  type CompileSceneSuccess,
  type SceneCompileMode,
  type CompileSchemaPrompt,
} from "@/ai/contracts";

function failure(
  code: Exclude<CompileSceneFailure["error"]["code"], "RATE_LIMITED">,
  message: string,
): CompileSceneFailure {
  return { ok: false, error: { code, message }, fallbackSceneId: DEFAULT_PRESET_ID };
}

function success(
  scene: CompileSceneSuccess["scene"],
  spatial3d: GeneratedSpatial3D | undefined,
  repairAttempted: boolean,
  model: CompileSceneSuccess["model"],
): CompileSceneSuccess {
  return { ok: true, scene, ...(spatial3d ? { spatial3d } : {}), repairAttempted, warnings: [], model };
}

type ValidatedCandidate =
  | Readonly<{ ok: true; scene: CompileSceneSuccess["scene"]; spatial3d?: GeneratedSpatial3D }>
  | Readonly<{ ok: false; errors: readonly SceneValidationIssue[] }>;

function validateSafeLabels(scene: CompileSceneSuccess["scene"]): SceneValidationResult {
  const validation = validateScene(scene);
  if (!validation.ok) {
    return validation;
  }

  const unsafeLabels = [
    !isSafeModelLabel(validation.scene.name)
      ? { path: "name", code: "unsafe_model_text", message: "Scene name must be a safe display label." }
      : null,
    ...validation.scene.sources.map((source, index) =>
      !isSafeModelLabel(source.name)
        ? {
            path: `sources.${index}.name`,
            code: "unsafe_model_text",
            message: "Source name must be a safe display label.",
          }
        : null,
    ),
  ].filter((issue): issue is NonNullable<typeof issue> => issue !== null);

  return unsafeLabels.length > 0 ? { ok: false, errors: unsafeLabels } : validation;
}

function validateGeneratedCandidate(candidate: unknown, targetMode: SceneCompileMode): ValidatedCandidate {
  if (targetMode === "hybrid-3d") {
    const hybrid = validateGeneratedHybridScene(candidate);
    if (!hybrid.ok) return hybrid;
    const labels = validateSafeLabels(hybrid.candidate.scene);
    return labels.ok
      ? { ok: true, scene: labels.scene, spatial3d: hybrid.candidate.spatial3d }
      : labels;
  }
  const classic = validateSafeLabels(candidate as CompileSceneSuccess["scene"]);
  return classic.ok ? { ok: true, scene: classic.scene } : classic;
}

export function buildCompilePrompt(
  prompt: string,
  baseScene?: unknown,
  targetMode: SceneCompileMode = "classic-2d5d",
): CompileSchemaPrompt {
  const coordinateInstructions = targetMode === "hybrid-3d"
    ? [
        "Return an object with scene and spatial3d fields.",
        "Use x-right, y-up, z-forward coordinates: store horizontal X/Z as scene x/y, and store vertical Y only in spatial3d heights.",
        "The room outerPolygon must be a four-corner rectangle anchored at (0,0); its X and Y extents are the room width and depth, while room.heightM is vertical height.",
        "Include exactly one sourceHeights entry per source, one wallVerticalBounds entry per wall, and one portalVerticalBounds entry per portal, using matching IDs.",
        "Keep every height strictly inside the room; each Portal vertical opening must fit inside its host Wall.",
      ]
    : ["Use scene x/y as the editable 2.5D floor-plan coordinates."];
  return {
    instructions: [
      "Compile the request into exactly one editable SceneSpec JSON object.",
      ...coordinateInstructions,
      "Use only the supplied material IDs and audio clip IDs.",
      "Keep all geometry within the supplied SceneSpec schema limits.",
      `Allowed material IDs: ${MATERIALS.map((material) => material.id).join(", ")}.`,
      `Allowed audio clip IDs: ${AUDIO_ASSETS.map((asset) => asset.id).join(", ")}.`,
      "Do not include prose, URLs, code, tools, or fields outside the schema.",
    ].join("\n"),
    prompt,
    targetMode,
    ...(baseScene === undefined ? {} : { baseScene }),
  };
}

async function generateCandidate(
  deps: CompileDependencies,
  schemaPrompt: CompileSchemaPrompt,
  repairErrors?: Parameters<CompileDependencies["generateScene"]>[1],
): Promise<unknown> {
  try {
    return await deps.generateScene(schemaPrompt, repairErrors);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

export async function compileScene(
  { prompt, baseScene, targetMode = "classic-2d5d" }: CompileSceneRequest,
  deps: CompileDependencies,
): Promise<CompileSceneResponse> {
  if (prompt.length > MAX_SCENE_PROMPT_CHARS) {
    return failure("PROMPT_TOO_LONG", "Describe the scene in 2,000 characters or fewer.");
  }

  const schemaPrompt = buildCompilePrompt(prompt, baseScene, targetMode);
  const first = await generateCandidate(deps, schemaPrompt);
  const firstResult = validateGeneratedCandidate(first, targetMode);
  if (firstResult.ok) {
    return success(firstResult.scene, firstResult.spatial3d, false, deps.model ?? SCENE_COMPILER_MODEL);
  }

  const repaired = await generateCandidate(deps, schemaPrompt, firstResult.errors);
  const repairedResult = validateGeneratedCandidate(repaired, targetMode);
  return repairedResult.ok
    ? success(repairedResult.scene, repairedResult.spatial3d, true, deps.model ?? SCENE_COMPILER_MODEL)
    : failure("SCENE_VALIDATION_FAILED", "The generated scene could not be validated.");
}
