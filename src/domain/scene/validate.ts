import { AUDIO_ASSETS } from "@/domain/audio-assets/registry";
import { MATERIALS } from "@/domain/materials/registry";
import {
  MAX_ROOM_DIMENSION_M,
  MIN_WALL_LENGTH_M,
  distance,
  isSimplePolygon,
  pointInPolygon,
  portalFitsWall,
  roomDimensions,
} from "@/domain/scene/geometry-validation";
import { sceneSpecSchema } from "@/domain/scene/schema";
import type {
  SceneSpec,
  SceneValidationIssue,
  SceneValidationResult,
} from "@/domain/scene/types";

const MATERIAL_IDS = new Set(MATERIALS.map((material) => material.id));
const AUDIO_ASSET_IDS = new Set(AUDIO_ASSETS.map((asset) => asset.id));

function pathToString(path: readonly PropertyKey[]): string {
  return path.map(String).join(".");
}

function issue(path: string, code: string, message: string): SceneValidationIssue {
  return { path, code, message };
}

function validateRegistryIds(scene: SceneSpec, errors: SceneValidationIssue[]): void {
  for (const field of ["floorMaterialId", "ceilingMaterialId"] as const) {
    const id = scene.room[field];
    if (!MATERIAL_IDS.has(id)) {
      errors.push(issue(`room.${field}`, "unknown_material_id", `Unknown material ID: ${id}`));
    }
  }

  scene.walls.forEach((wall, index) => {
    if (!MATERIAL_IDS.has(wall.materialId)) {
      errors.push(
        issue(
          `walls.${index}.materialId`,
          "unknown_material_id",
          `Unknown material ID: ${wall.materialId}`,
        ),
      );
    }
  });

  scene.sources.forEach((source, index) => {
    if (!AUDIO_ASSET_IDS.has(source.clipId)) {
      errors.push(
        issue(
          `sources.${index}.clipId`,
          "unknown_audio_asset_id",
          `Unknown audio asset ID: ${source.clipId}`,
        ),
      );
    }
  });
}

function validateUniqueIds(scene: SceneSpec, errors: SceneValidationIssue[]): void {
  const seen = new Set<string>();
  const entities = [
    ...scene.walls.map((entity, index) => ({ entity, path: `walls.${index}.id` })),
    ...scene.portals.map((entity, index) => ({ entity, path: `portals.${index}.id` })),
    ...scene.sources.map((entity, index) => ({ entity, path: `sources.${index}.id` })),
  ];

  for (const { entity, path } of entities) {
    if (seen.has(entity.id)) {
      errors.push(issue(path, "duplicate_id", `Duplicate entity ID: ${entity.id}`));
    } else {
      seen.add(entity.id);
    }
  }
}

function validateSettings(scene: SceneSpec, errors: SceneValidationIssue[]): void {
  if (
    scene.settings.acousticUpdateHz < 10 ||
    scene.settings.acousticUpdateHz > 15
  ) {
    errors.push(
      issue(
        "settings.acousticUpdateHz",
        "acoustic_update_rate_out_of_range",
        "Acoustic update rate must be between 10 and 15 Hz",
      ),
    );
  }
}

function validateGeometry(scene: SceneSpec, errors: SceneValidationIssue[]): void {
  if (!isSimplePolygon(scene.room.outerPolygon)) {
    errors.push(
      issue(
        "room.outerPolygon",
        "polygon_self_intersection",
        "Room outer polygon must be simple and non-self-intersecting",
      ),
    );
  }

  const dimensions = roomDimensions(scene.room.outerPolygon);
  if (
    dimensions.width > MAX_ROOM_DIMENSION_M ||
    dimensions.height > MAX_ROOM_DIMENSION_M
  ) {
    errors.push(
      issue(
        "room.outerPolygon",
        "room_dimension_exceeded",
        `Room width and height must not exceed ${MAX_ROOM_DIMENSION_M} m`,
      ),
    );
  }

  scene.walls.forEach((wall, index) => {
    if (distance(wall.a, wall.b) < MIN_WALL_LENGTH_M) {
      errors.push(
        issue(
          `walls.${index}`,
          "wall_too_short",
          `Wall length must be at least ${MIN_WALL_LENGTH_M} m`,
        ),
      );
    }
  });

  const wallsById = new Map(scene.walls.map((wall) => [wall.id, wall]));
  scene.portals.forEach((portal, index) => {
    const wall = wallsById.get(portal.wallId);
    if (!wall) {
      errors.push(
        issue(
          `portals.${index}.wallId`,
          "unknown_wall_id",
          `Unknown portal wall ID: ${portal.wallId}`,
        ),
      );
      return;
    }

    if (!portalFitsWall(portal.center, portal.widthM, wall.a, wall.b)) {
      errors.push(
        issue(
          `portals.${index}.center`,
          "portal_detached",
          "Portal must lie on and fit within its referenced wall",
        ),
      );
    }

    if (portal.heightM > scene.room.heightM) {
      errors.push(
        issue(
          `portals.${index}.heightM`,
          "portal_too_tall",
          "Portal height must not exceed room height",
        ),
      );
    }
  });

  if (isSimplePolygon(scene.room.outerPolygon)) {
    if (!pointInPolygon(scene.listener.position, scene.room.outerPolygon)) {
      errors.push(
        issue(
          "listener.position",
          "position_out_of_bounds",
          "Listener position must be inside the room",
        ),
      );
    }

    scene.sources.forEach((source, index) => {
      if (!pointInPolygon(source.position, scene.room.outerPolygon)) {
        errors.push(
          issue(
            `sources.${index}.position`,
            "position_out_of_bounds",
            "Source position must be inside the room",
          ),
        );
      }
    });
  }
}

export function validateScene(input: unknown): SceneValidationResult {
  const parsed = sceneSpecSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((zodIssue) =>
        issue(pathToString(zodIssue.path), zodIssue.code, zodIssue.message),
      ),
    };
  }

  const errors: SceneValidationIssue[] = [];
  validateRegistryIds(parsed.data, errors);
  validateUniqueIds(parsed.data, errors);
  validateSettings(parsed.data, errors);
  validateGeometry(parsed.data, errors);

  return errors.length === 0 ? { ok: true, scene: parsed.data } : { ok: false, errors };
}
