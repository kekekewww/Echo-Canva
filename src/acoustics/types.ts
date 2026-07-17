import type { Band3, SceneSpec, Vec2 } from "@/domain/scene/types";

export type AcousticWall = SceneSpec["walls"][number];

export type SegmentHit = Readonly<{
  point: Vec2;
  t: number;
  u: number;
}>;

export type WallCrossing = Readonly<
  SegmentHit & {
    wallId: string;
    wall: AcousticWall;
  }
>;

export type DirectTrace = Readonly<{
  visible: boolean;
  crossings: readonly WallCrossing[];
  polyline: readonly Vec2[];
}>;

export type OcclusionEstimate = Readonly<{
  dryGainDb: number;
  lowpassHz: number;
  occluderWallIds: readonly string[];
  transmissionLossDb: Band3;
}>;

export type PortalRoute = Readonly<{
  portalIds: readonly string[];
  polyline: readonly Vec2[];
  effectiveDistanceM: number;
  cost: number;
  virtualPosition: Vec2;
  dryGainDb: number;
  lowpassHz: number;
}>;
