import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import type { WorkspaceMode, WorkspaceProject } from "@/domain/workspace/types";

function createDefaultProject(mode: WorkspaceMode): WorkspaceProject {
  const scene = structuredClone(CONCRETE_PARTITION_PRESET);
  const listener = {
    id: "listener_primary",
    name: "Listener",
    position: {
      x: scene.listener.position.x,
      y: 1.5,
      z: scene.listener.position.y,
    },
    headingDeg: scene.listener.headingDeg,
    enabled: true,
  } as const;

  return {
    schemaVersion: "1.0",
    mode,
    revision: scene.revision,
    scene,
    listeners: [listener],
    activeListenerId: listener.id,
    disabledEntityIds: [],
    selection: { type: "listener", id: listener.id },
    room3d: {
      widthM: 12,
      depthM: 8,
      heightM: scene.room.heightM,
    },
    sourceHeightsM: Object.fromEntries(scene.sources.map(({ id }) => [id, 1.5])),
    notice: null,
  };
}

export function createDefaultClassicProject(): WorkspaceProject {
  return createDefaultProject("classic-2d5d");
}

export function createDefaultHybridProject(): WorkspaceProject {
  return createDefaultProject("hybrid-3d");
}
