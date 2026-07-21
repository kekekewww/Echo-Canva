import { sceneDocumentV2Schema } from "@/domain/scene-document/schema";
import type {
  SceneDocument,
  SceneDocumentV2,
  SceneDocumentValidationIssue,
  SceneDocumentValidationResult,
} from "@/domain/scene-document/types";
import type { SceneSpec } from "@/domain/scene/types";
import { validateScene } from "@/domain/scene/validate";
import { primitiveFootprint } from "@/domain/workspace/primitives";

function issue(path: string, code: string, message: string): SceneDocumentValidationIssue {
  return { path, code, message };
}

function pathToString(path: readonly PropertyKey[]): string {
  return path.map(String).join(".");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

/** Stable non-cryptographic compatibility fingerprint for a validated Classic projection. */
export function classicProjectionHash(scene: SceneSpec): string {
  let hash = 0x811c9dc5;
  for (const character of stableJson(scene)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function validateV2Semantics(document: SceneDocumentV2): readonly SceneDocumentValidationIssue[] {
  const errors: SceneDocumentValidationIssue[] = [];
  const base = validateScene(document.baseScene);
  if (!base.ok) {
    errors.push(
      ...base.errors.map(({ path, code, message }) =>
        issue(`baseScene.${path}`, code, message),
      ),
    );
    return errors;
  }

  if (document.compatibility.classicProjectionHash !== classicProjectionHash(base.scene)) {
    errors.push(
      issue(
        "compatibility.classicProjectionHash",
        "classic_projection_hash_mismatch",
        "Classic projection hash does not match the validated base scene.",
      ),
    );
  }

  const spatial = document.extensions.spatial3d;
  if (!spatial) {
    if (document.extensions.propagation3d?.maxReflectionOrder === 2) {
      errors.push(
        issue(
          "extensions.propagation3d.maxReflectionOrder",
          "requires_spatial_3d",
          "Second-order 3D propagation requires a spatial3d extension.",
        ),
      );
    }
    return errors;
  }

  const ceilingM = spatial.floorElevationM + base.scene.room.heightM;
  if (spatial.listenerHeightM <= spatial.floorElevationM || spatial.listenerHeightM >= ceilingM) {
    errors.push(
      issue(
        "extensions.spatial3d.listenerHeightM",
        "listener_height_out_of_room",
        "Listener height must be strictly between the configured floor and room ceiling.",
      ),
    );
  }

  const sourceIds = new Set(base.scene.sources.map(({ id }) => id));
  for (const [sourceId, heightM] of Object.entries(spatial.sourceHeightsM)) {
    if (!sourceIds.has(sourceId)) {
      errors.push(
        issue(
          `extensions.spatial3d.sourceHeightsM.${sourceId}`,
          "unknown_source_id",
          `3D source height refers to unknown source: ${sourceId}`,
        ),
      );
      continue;
    }
    if (heightM <= spatial.floorElevationM || heightM >= ceilingM) {
      errors.push(
        issue(
          `extensions.spatial3d.sourceHeightsM.${sourceId}`,
          "source_height_out_of_room",
          "Source height must be strictly between the configured floor and room ceiling.",
        ),
      );
    }
  }
  const primitiveIds = new Set<string>();
  const roomXs = base.scene.room.outerPolygon.map(({ x }) => x);
  const roomZs = base.scene.room.outerPolygon.map(({ y }) => y);
  const roomBounds = {
    minX: Math.min(...roomXs),
    maxX: Math.max(...roomXs),
    minZ: Math.min(...roomZs),
    maxZ: Math.max(...roomZs),
  };
  for (const [index, primitive] of (spatial.primitives ?? []).entries()) {
    if (primitiveIds.has(primitive.id)) {
      errors.push(issue(
        `extensions.spatial3d.primitives.${index}.id`,
        "duplicate_primitive_id",
        `Basic shape ID must be unique: ${primitive.id}`,
      ));
      continue;
    }
    primitiveIds.add(primitive.id);
    const halfHeight = primitive.dimensions.y / 2;
    const footprint = primitiveFootprint(primitive);
    const outsidePlan = footprint.some(({ x, y: z }) =>
      x < roomBounds.minX || x > roomBounds.maxX || z < roomBounds.minZ || z > roomBounds.maxZ);
    const outsideHeight = primitive.position.y - halfHeight < spatial.floorElevationM ||
      primitive.position.y + halfHeight > ceilingM;
    if (outsidePlan || outsideHeight) {
      errors.push(issue(
        `extensions.spatial3d.primitives.${index}`,
        "primitive_out_of_room",
        "Basic shape extents must remain inside the room.",
      ));
    }
  }
  return errors;
}

export function validateSceneDocument(input: unknown): SceneDocumentValidationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: [issue("", "invalid_type", "Scene document must be an object.")] };
  }

  if ("schemaVersion" in input) {
    const classic = validateScene(input);
    return classic.ok
      ? { ok: true, document: classic.scene }
      : { ok: false, errors: classic.errors };
  }

  const parsed = sceneDocumentV2Schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(({ path, code, message }) => issue(pathToString(path), code, message)),
    };
  }

  const document = parsed.data as SceneDocumentV2;
  const errors = validateV2Semantics(document);
  return errors.length === 0 ? { ok: true, document } : { ok: false, errors };
}

export function isSceneDocumentV2(document: SceneDocument): document is SceneDocumentV2 {
  return "documentVersion" in document;
}
