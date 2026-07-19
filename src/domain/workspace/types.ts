import type { SceneSpec } from "@/domain/scene/types";

type Wall = SceneSpec["walls"][number];
type Portal = SceneSpec["portals"][number];
type Source = SceneSpec["sources"][number];

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
  code: "listener_required" | "floor_required" | "entity_missing" | "limit_reached" | "geometry_clamped" | "host_wall_required";
  message: string;
}>;

export type WorkspaceCamera = Readonly<{
  yawDeg: number;
  pitchDeg: number;
  zoom: number;
}>;

export type WorkspaceViewState = Readonly<{
  camera: WorkspaceCamera;
  overlays: Readonly<{
    pathsVisible: boolean;
    showAllPaths: boolean;
    ceilingVisible: boolean;
  }>;
  panels: Readonly<{
    outlinerCollapsed: boolean;
    inspectorCollapsed: boolean;
  }>;
}>;

export type Room3D = Readonly<{
  widthM: number;
  depthM: number;
  heightM: number;
}>;

export type Wall3DSettings = Readonly<{
  bottomM: number;
  topM: number;
  thicknessM: number;
}>;

export type Portal3DSettings = Readonly<{
  bottomM: number;
  topM: number;
  thicknessM: number;
}>;

export type WorkspaceProject = Readonly<{
  schemaVersion: "2.0";
  mode: WorkspaceMode;
  revision: number;
  scene: SceneSpec;
  listeners: readonly AuthoringListener[];
  activeListenerId: string;
  disabledEntityIds: readonly string[];
  selection: EntityRef | null;
  room3d: Room3D;
  sourceHeightsM: Readonly<Record<string, number>>;
  wall3dById: Readonly<Record<string, Wall3DSettings>>;
  portal3dById: Readonly<Record<string, Portal3DSettings>>;
  missingAudioAssetIds: readonly string[];
  view: WorkspaceViewState;
  notice: WorkspaceNotice | null;
}>;

export type ProjectAction =
  | Readonly<{ type: "ADD_LISTENER"; listener: AuthoringListener }>
  | Readonly<{ type: "DELETE_LISTENER"; id: string }>
  | Readonly<{ type: "SELECT_ENTITY"; selection: EntityRef | null }>
  | Readonly<{ type: "SET_ACTIVE_LISTENER"; id: string }>
  | Readonly<{ type: "SET_ENTITY_ENABLED"; entity: EntityRef; enabled: boolean }>
  | Readonly<{ type: "UPDATE_LISTENER"; id: string; changes: Partial<Pick<AuthoringListener, "name" | "position" | "headingDeg">> }>
  | Readonly<{ type: "MOVE_SOURCE"; id: string; position: Vec3 }>
  | Readonly<{ type: "ADD_SOURCE"; source: Source; heightM: number }>
  | Readonly<{ type: "DELETE_SOURCE"; id: string }>
  | Readonly<{ type: "ADD_WALL"; wall: Wall; vertical?: Wall3DSettings }>
  | Readonly<{ type: "UPDATE_WALL"; id: string; changes: Partial<Wall>; vertical?: Partial<Wall3DSettings> }>
  | Readonly<{ type: "DELETE_WALL"; id: string }>
  | Readonly<{ type: "ADD_PORTAL"; portal: Portal; vertical?: Portal3DSettings }>
  | Readonly<{ type: "UPDATE_PORTAL"; id: string; changes: Partial<Portal>; vertical?: Partial<Portal3DSettings> }>
  | Readonly<{ type: "DELETE_PORTAL"; id: string }>
  | Readonly<{ type: "SET_ROOM_3D"; changes: Partial<Room3D> }>
  | Readonly<{ type: "SET_VIEW_STATE"; changes: Partial<WorkspaceViewState> }>
  | Readonly<{ type: "REPLACE_SCENE"; scene: SceneSpec }>
  | Readonly<{ type: "REPLACE_PROJECT"; project: WorkspaceProject }>
  | Readonly<{ type: "CLEAR_NOTICE" }>;
