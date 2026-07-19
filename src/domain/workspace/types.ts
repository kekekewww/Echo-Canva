import type { SceneSpec } from "@/domain/scene/types";

export type WorkspaceMode = "classic-2d5d" | "hybrid-3d";

export type Vec3 = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

export type AuthoringListener = Readonly<{
  id: string;
  name: string;
  position: Vec3;
  headingDeg: number;
  enabled: boolean;
}>;

export type EntityType = "listener" | "source" | "wall" | "portal" | "surface";

export type EntityRef = Readonly<{
  type: EntityType;
  id: string;
}>;

export type WorkspaceNotice = Readonly<{
  code: "listener_required" | "floor_required" | "entity_missing" | "limit_reached";
  message: string;
}>;

export type Room3D = Readonly<{
  widthM: number;
  depthM: number;
  heightM: number;
}>;

export type WorkspaceProject = Readonly<{
  schemaVersion: "1.0";
  mode: WorkspaceMode;
  revision: number;
  scene: SceneSpec;
  listeners: readonly AuthoringListener[];
  activeListenerId: string;
  disabledEntityIds: readonly string[];
  selection: EntityRef | null;
  room3d: Room3D;
  sourceHeightsM: Readonly<Record<string, number>>;
  notice: WorkspaceNotice | null;
}>;

export type ProjectAction =
  | Readonly<{ type: "ADD_LISTENER"; listener: AuthoringListener }>
  | Readonly<{ type: "DELETE_LISTENER"; id: string }>
  | Readonly<{ type: "SELECT_ENTITY"; selection: EntityRef | null }>
  | Readonly<{ type: "SET_ACTIVE_LISTENER"; id: string }>
  | Readonly<{ type: "SET_ENTITY_ENABLED"; entity: EntityRef; enabled: boolean }>
  | Readonly<{ type: "CLEAR_NOTICE" }>;
