import type { SceneSpec, SceneValidationIssue } from "@/domain/scene/types";
import {
  SceneDocumentSerializationError,
  parseSceneDocument,
  toClassicScene,
} from "@/domain/scene-document/serialize";
import { validateScene } from "@/domain/scene/validate";

export class SceneSerializationError extends Error {
  readonly issues: readonly SceneValidationIssue[];

  constructor(message: string, issues: readonly SceneValidationIssue[] = []) {
    super(message);
    this.name = "SceneSerializationError";
    this.issues = issues;
  }
}

function requireValidScene(input: unknown): SceneSpec {
  const result = validateScene(input);
  if (!result.ok) {
    throw new SceneSerializationError("Scene validation failed", result.errors);
  }

  return result.scene;
}

export function serializeScene(scene: SceneSpec): string {
  return JSON.stringify(requireValidScene(scene), null, 2);
}

export function parseScene(json: string): SceneSpec {
  let input: unknown;
  try {
    input = JSON.parse(json) as unknown;
  } catch {
    throw new SceneSerializationError("Scene JSON must be valid JSON");
  }

  if (typeof input === "object" && input !== null && "schemaVersion" in input) {
    if (input.schemaVersion !== "1.0") {
      throw new SceneSerializationError(
        `Unsupported scene schema version: ${String(input.schemaVersion)}`,
      );
    }
    return requireValidScene(input);
  }

  try {
    return toClassicScene(parseSceneDocument(json));
  } catch (error) {
    if (error instanceof SceneDocumentSerializationError) {
      throw new SceneSerializationError(error.message, error.issues);
    }
    throw error;
  }
}
