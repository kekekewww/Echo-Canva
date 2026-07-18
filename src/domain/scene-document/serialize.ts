import type { SceneSpec } from "@/domain/scene/types";
import { validateScene } from "@/domain/scene/validate";
import {
  classicProjectionHash,
  isSceneDocumentV2,
  validateSceneDocument,
} from "@/domain/scene-document/validate";
import type {
  SceneDocument,
  SceneDocumentExtensions,
  SceneDocumentV2,
  SceneDocumentValidationIssue,
} from "@/domain/scene-document/types";

export class SceneDocumentSerializationError extends Error {
  readonly issues: readonly SceneDocumentValidationIssue[];

  constructor(message: string, issues: readonly SceneDocumentValidationIssue[] = []) {
    super(message);
    this.name = "SceneDocumentSerializationError";
    this.issues = issues;
  }
}

function requireValidDocument(input: unknown): SceneDocument {
  const result = validateSceneDocument(input);
  if (!result.ok) {
    const detail = result.errors[0]?.message;
    throw new SceneDocumentSerializationError(
      detail ? `Scene document validation failed: ${detail}` : "Scene document validation failed",
      result.errors,
    );
  }
  return result.document;
}

export function createSceneDocumentV2(
  baseScene: SceneSpec,
  extensions: SceneDocumentExtensions = {},
): SceneDocumentV2 {
  const classic = validateScene(baseScene);
  if (!classic.ok) {
    throw new SceneDocumentSerializationError("Scene document validation failed", classic.errors);
  }

  return requireValidDocument({
    documentVersion: "2.0",
    baseScene: structuredClone(classic.scene),
    extensions: structuredClone(extensions),
    compatibility: {
      migratedFrom: "1.0",
      classicProjectionHash: classicProjectionHash(classic.scene),
    },
  }) as SceneDocumentV2;
}

export function serializeSceneDocument(document: SceneDocument): string {
  return JSON.stringify(requireValidDocument(document), null, 2);
}

export function parseSceneDocument(json: string): SceneDocument {
  let input: unknown;
  try {
    input = JSON.parse(json) as unknown;
  } catch {
    throw new SceneDocumentSerializationError("Scene document JSON must be valid JSON");
  }
  return requireValidDocument(input);
}

export function toClassicScene(document: SceneDocument): SceneSpec {
  return structuredClone(isSceneDocumentV2(document) ? document.baseScene : document);
}
