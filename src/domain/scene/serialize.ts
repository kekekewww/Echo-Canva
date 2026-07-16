import type { SceneSpec, SceneValidationIssue } from "@/domain/scene/types";
import { validateScene } from "@/domain/scene/validate";

export class SceneSerializationError extends Error {
  readonly issues: readonly SceneValidationIssue[];

  constructor(message: string, issues: readonly SceneValidationIssue[] = []) {
    super(message);
    this.name = "SceneSerializationError";
    this.issues = issues;
  }
}

function migrateScene(input: unknown): unknown {
  if (typeof input !== "object" || input === null || !("schemaVersion" in input)) {
    return input;
  }

  const schemaVersion = input.schemaVersion;
  if (schemaVersion === "1.0") {
    return input;
  }

  throw new SceneSerializationError(
    `Unsupported scene schema version: ${String(schemaVersion)}`,
  );
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

  return requireValidScene(migrateScene(input));
}
