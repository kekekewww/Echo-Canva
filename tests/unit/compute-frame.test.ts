import { describe, expect, it } from "vitest";

import {
  assembleAcousticFrame,
  computeAcousticFrame,
  computeClassicSourceResults,
  createClassicPoseSnapshot,
  createClassicStaticContext,
} from "@/acoustics/compute-frame";
import { estimateRoomAcoustics } from "@/acoustics/room-acoustics";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import type { SceneSpec } from "@/domain/scene/types";

const visibleScene: SceneSpec = {
  schemaVersion: "1.0",
  revision: 7,
  units: "m",
  name: "Visible source",
  room: {
    outerPolygon: [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 6 },
      { x: 0, y: 6 },
    ],
    heightM: 3,
    floorMaterialId: "concrete_hard",
    ceilingMaterialId: "concrete_hard",
  },
  walls: [],
  portals: [],
  sources: [
    {
      id: "radio",
      name: "Radio",
      clipId: "rain_loop",
      sourceType: "point",
      position: { x: 6, y: 3 },
      gainDb: 0,
      loop: true,
    },
  ],
  listener: { position: { x: 2, y: 3 }, headingDeg: 0 },
  settings: { acousticUpdateHz: 12, maxEarlyReflections: 6, hrtfEnabled: true },
};

describe("computeAcousticFrame", () => {
  it.each([
    ["direct", visibleScene],
    ["portal", {
      ...CONCRETE_PARTITION_PRESET,
      sources: [{ ...CONCRETE_PARTITION_PRESET.sources[0]!, position: { x: 9, y: 1.5 } }],
      listener: { ...CONCRETE_PARTITION_PRESET.listener, position: { x: 3, y: 1.5 } },
    }],
    ["blocked", {
      ...CONCRETE_PARTITION_PRESET,
      portals: CONCRETE_PARTITION_PRESET.portals.map((portal) => ({ ...portal, open: false })),
      sources: [{ ...CONCRETE_PARTITION_PRESET.sources[0]!, position: { x: 9, y: 1.5 } }],
      listener: { ...CONCRETE_PARTITION_PRESET.listener, position: { x: 3, y: 1.5 } },
    }],
    ["reflection", {
      ...visibleScene,
      walls: [{
        id: "top",
        a: { x: 8, y: 6 },
        b: { x: 0, y: 6 },
        thicknessM: 0.2,
        materialId: "concrete_hard",
        kind: "boundary" as const,
      }],
    }],
  ])("deep-equals independently computed and assembled %s source results", (_, scene) => {
    const context = createClassicStaticContext(scene);
    const snapshot = createClassicPoseSnapshot(scene);
    const results = computeClassicSourceResults(
      context,
      snapshot,
      snapshot.sources.map(({ id }) => id),
    );

    expect(assembleAcousticFrame(snapshot, estimateRoomAcoustics(scene), results, 2468)).toEqual(
      computeAcousticFrame(scene, 2468),
    );
  });

  it("assembles independently computed results in authored source order", () => {
    const reordered: SceneSpec = {
      ...visibleScene,
      sources: [
        { ...visibleScene.sources[0]!, id: "second", position: { x: 4, y: 1 } },
        { ...visibleScene.sources[0]!, id: "first", position: { x: 7, y: 2 } },
      ],
    };
    const context = createClassicStaticContext(reordered);
    const snapshot = createClassicPoseSnapshot(reordered);
    const results = computeClassicSourceResults(context, snapshot, ["first", "second"]);

    const frame = assembleAcousticFrame(snapshot, estimateRoomAcoustics(reordered), results, 0);

    expect(frame.sources.map(({ sourceId }) => sourceId)).toEqual(["second", "first"]);
    expect(frame).toEqual(computeAcousticFrame(reordered));
  });

  it("rejects incomplete, duplicate, unknown, stale, and cross-static source results", () => {
    const scene: SceneSpec = {
      ...visibleScene,
      sources: [
        visibleScene.sources[0]!,
        { ...visibleScene.sources[0]!, id: "rain", position: { x: 7, y: 2 } },
      ],
    };
    const context = createClassicStaticContext(scene);
    const snapshot = createClassicPoseSnapshot(scene);
    const room = estimateRoomAcoustics(scene);
    const results = computeClassicSourceResults(context, snapshot, ["radio", "rain"]);

    expect(() => assembleAcousticFrame(snapshot, room, results.slice(0, 1), 0)).toThrow(/missing/i);
    expect(() => assembleAcousticFrame(snapshot, room, [results[0]!, results[0]!], 0)).toThrow(/duplicate/i);
    expect(() => assembleAcousticFrame(snapshot, room, [
      results[0]!,
      { ...results[1]!, sourceId: "unknown" },
    ], 0)).toThrow(/unknown/i);
    expect(() => assembleAcousticFrame(snapshot, room, [
      results[0]!,
      { ...results[1]!, revision: snapshot.revision - 1 },
    ], 0)).toThrow(/revision/i);
    expect(() => assembleAcousticFrame(snapshot, room, [
      results[0]!,
      { ...results[1]!, staticFingerprint: "wrong" },
    ], 0)).toThrow(/fingerprint/i);
  });

  it("maps an unobstructed source to a direct frame", () => {
    const frame = computeAcousticFrame(visibleScene, 1234);

    expect(frame).toMatchObject({ revision: 7, generatedAtMs: 1234 });
    expect(frame.sources[0]).toMatchObject({
      sourceId: "radio",
      routeType: "direct",
      directVisible: true,
      physicalDistanceM: 4,
      effectiveDistanceM: 4,
      dryGainDb: 0,
      lowpassHz: 20_000,
      virtualPosition: { x: 6, y: 3 },
      occluderWallIds: [],
      portalIds: [],
      routePolyline: [{ x: 6, y: 3 }, { x: 2, y: 3 }],
      earlyReflections: [],
    });
  });

  it("uses portal direction and total route distance only after direct visibility is blocked", () => {
    const openPortalScene = {
      ...CONCRETE_PARTITION_PRESET,
      sources: [
        {
          ...CONCRETE_PARTITION_PRESET.sources[0]!,
          position: { x: 9, y: 1.5 },
        },
      ],
      listener: { ...CONCRETE_PARTITION_PRESET.listener, position: { x: 3, y: 1.5 } },
    };

    const sourceFrame = computeAcousticFrame(openPortalScene).sources[0]!;

    expect(sourceFrame).toMatchObject({
      routeType: "portal",
      directVisible: false,
      portalIds: ["partition_door"],
      virtualPosition: { x: 6, y: 4 },
    });
    expect(sourceFrame.effectiveDistanceM).toBeGreaterThan(sourceFrame.physicalDistanceM);
    expect(sourceFrame.occluderWallIds).toEqual(["partition_center"]);
  });

  it("keeps a direct-visible source direct when its line passes through an open portal", () => {
    const directOpenPortalScene = {
      ...CONCRETE_PARTITION_PRESET,
      sources: [{ ...CONCRETE_PARTITION_PRESET.sources[0]!, position: { x: 9, y: 4 } }],
      listener: { ...CONCRETE_PARTITION_PRESET.listener, position: { x: 3, y: 4 } },
    };

    expect(computeAcousticFrame(directOpenPortalScene).sources[0]).toMatchObject({
      routeType: "direct",
      directVisible: true,
      portalIds: [],
      virtualPosition: { x: 9, y: 4 },
    });
  });

  it("keeps the blocked fallback when no open portal route exists", () => {
    const closedPortalScene = {
      ...CONCRETE_PARTITION_PRESET,
      portals: CONCRETE_PARTITION_PRESET.portals.map((portal) => ({ ...portal, open: false })),
      sources: [{ ...CONCRETE_PARTITION_PRESET.sources[0]!, position: { x: 9, y: 1.5 } }],
      listener: { ...CONCRETE_PARTITION_PRESET.listener, position: { x: 3, y: 1.5 } },
    };

    expect(computeAcousticFrame(closedPortalScene).sources[0]).toMatchObject({
      routeType: "blocked",
      directVisible: false,
      portalIds: [],
      virtualPosition: { x: 9, y: 1.5 },
      occluderWallIds: ["partition_center"],
    });
  });

  it("emits a bounded two-point second-order path for a blocked Classic source", () => {
    const secondOrderScene: SceneSpec = {
      ...visibleScene,
      room: {
        ...visibleScene.room,
        outerPolygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
      },
      walls: [
        { id: "bottom", a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "boundary" },
        { id: "right", a: { x: 10, y: 0 }, b: { x: 10, y: 10 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "boundary" },
        { id: "top", a: { x: 10, y: 10 }, b: { x: 0, y: 10 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "boundary" },
        { id: "left", a: { x: 0, y: 10 }, b: { x: 0, y: 0 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "boundary" },
        { id: "direct_blocker", a: { x: 5, y: 4.5 }, b: { x: 5, y: 5.5 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "partition" },
      ],
      sources: [{ ...visibleScene.sources[0]!, position: { x: 2, y: 5 } }],
      listener: { position: { x: 8, y: 5 }, headingDeg: 0 },
    };

    const reflection = computeAcousticFrame(secondOrderScene).sources[0]!.earlyReflections
      .find((candidate) => candidate.wallIds?.join(">") === "bottom>right");

    expect(reflection).toMatchObject({
      order: 2,
      wallIds: ["bottom", "right"],
    });
    expect(reflection?.reflectionPoints).toHaveLength(2);
  });

  it("references portal-frame reflection delays to the selected effective route", () => {
    const portalReflectionScene: SceneSpec = {
      ...visibleScene,
      walls: [
        { id: "bottom", a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "boundary" },
        { id: "east", a: { x: 10, y: 0 }, b: { x: 10, y: 10 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "boundary" },
        { id: "top", a: { x: 10, y: 10 }, b: { x: 0, y: 10 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "boundary" },
        { id: "west", a: { x: 0, y: 10 }, b: { x: 0, y: 0 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "boundary" },
        { id: "partition", a: { x: 5, y: 0 }, b: { x: 5, y: 8 }, thicknessM: 0.2, materialId: "concrete_hard", kind: "partition" },
      ],
      portals: [{
        id: "door",
        wallId: "partition",
        center: { x: 5, y: 1 },
        widthM: 1,
        heightM: 2,
        open: true,
        lossDb: 3,
      }],
      sources: [{ ...visibleScene.sources[0]!, position: { x: 2, y: 3 } }],
      listener: { position: { x: 8, y: 3 }, headingDeg: 0 },
    };

    const sourceFrame = computeAcousticFrame(portalReflectionScene).sources[0]!;
    const topReflection = sourceFrame.earlyReflections.find((tap) => tap.wallId === "top");

    expect(sourceFrame.routeType).toBe("portal");
    expect(topReflection).toBeDefined();
    expect(topReflection?.delayMs).toBeCloseTo(
      ((topReflection!.pathLengthM - sourceFrame.effectiveDistanceM) / 343) * 1000,
    );
  });
});
