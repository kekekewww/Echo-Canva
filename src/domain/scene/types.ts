export type Vec2 = {
  x: number;
  y: number;
};

export type Band3 = {
  low: number;
  mid: number;
  high: number;
};

export type SceneSpec = {
  schemaVersion: "1.0";
  revision: number;
  units: "m";
  name: string;
  room: {
    outerPolygon: Vec2[];
    heightM: number;
    floorMaterialId: string;
    ceilingMaterialId: string;
  };
  walls: Array<{
    id: string;
    a: Vec2;
    b: Vec2;
    thicknessM: number;
    materialId: string;
    kind: "boundary" | "partition";
  }>;
  portals: Array<{
    id: string;
    wallId: string;
    center: Vec2;
    widthM: number;
    heightM: number;
    open: boolean;
    lossDb: number;
  }>;
  sources: Array<{
    id: string;
    name: string;
    clipId: string;
    sourceType: "point";
    position: Vec2;
    gainDb: number;
    loop: boolean;
  }>;
  listener: {
    position: Vec2;
    headingDeg: number;
  };
  settings: {
    acousticUpdateHz: number;
    maxEarlyReflections: number;
    hrtfEnabled: boolean;
  };
};

export type SceneValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export type SceneValidationResult =
  | { ok: true; scene: SceneSpec }
  | { ok: false; errors: SceneValidationIssue[] };
