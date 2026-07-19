import type { SceneSpec } from "@/domain/scene/types";

export type Spatial3DExtension = Readonly<{
  coordinateSystem: "x-right-y-up-z-forward";
  floorElevationM: number;
  listenerHeightM: number;
  sourceHeightsM: Readonly<Record<string, number>>;
  wallVerticalBoundsM?: Readonly<Record<string, Readonly<{ bottomM: number; topM: number }>>>;
  portalVerticalBoundsM?: Readonly<Record<string, Readonly<{ bottomM: number; topM: number; thicknessM: number }>>>;
  disabledSurfaceIds?: readonly string[];
}>;

export type Propagation3DConfig = Readonly<{
  maxReflectionOrder: 1 | 2;
  receiverConnection: boolean;
}>;

export type MaterialBandExtension = Readonly<{
  bandCount: 6;
}>;

export type AtmosphericMediaExtension = Readonly<{
  temperatureC: number;
  relativeHumidity: number;
}>;

export type SceneDocumentExtensions = Readonly<{
  spatial3d?: Spatial3DExtension;
  propagation3d?: Propagation3DConfig;
  materialBands?: MaterialBandExtension;
  atmosphericMedia?: AtmosphericMediaExtension;
}>;

export type SceneDocumentV2 = Readonly<{
  documentVersion: "2.0";
  baseScene: SceneSpec;
  extensions: SceneDocumentExtensions;
  compatibility: Readonly<{
    migratedFrom?: "1.0";
    classicProjectionHash: string;
  }>;
}>;

export type SceneDocument = SceneSpec | SceneDocumentV2;

export type SceneDocumentValidationIssue = Readonly<{
  path: string;
  code: string;
  message: string;
}>;

export type SceneDocumentValidationResult =
  | Readonly<{ ok: true; document: SceneDocument }>
  | Readonly<{ ok: false; errors: readonly SceneDocumentValidationIssue[] }>;
