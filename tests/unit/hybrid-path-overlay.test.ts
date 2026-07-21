import { describe, expect, it } from "vitest";

import { compileHybridGeometry } from "@/acoustics/hybrid3d/compile";
import { computeHybridDirectFrame } from "@/acoustics/hybrid3d/direct";
import { createDefaultHybridProject } from "@/domain/workspace/defaults";
import { projectHybridDocument } from "@/domain/workspace/projections";
import { deriveHybridPathDisplay } from "@/components/workspace/HybridPathOverlay";

describe("Hybrid path overlay", () => {
  it("rejects stale frames", () => {
    const project = createDefaultHybridProject();
    const geometry = compileHybridGeometry(projectHybridDocument(project));
    const frame = computeHybridDirectFrame(geometry);
    expect(deriveHybridPathDisplay(frame, geometry, "radio", false, frame.revision + 1, [])).toEqual([]);
  });

  it("emits XYZ direct and first-order surface paths for the selected source", () => {
    const project = createDefaultHybridProject();
    const geometry = compileHybridGeometry(projectHybridDocument(project));
    const frame = computeHybridDirectFrame(geometry);
    const paths = deriveHybridPathDisplay(frame, geometry, "radio", false, frame.revision, []);

    expect(paths.length).toBeGreaterThan(1);
    expect(paths.every(({ sourceId }) => sourceId === "radio")).toBe(true);
    expect(paths[0]!.vertices).toHaveLength(2);
    expect(paths.filter(({ kind }) => kind === "reflection").every(({ vertices }) => vertices.length === 3)).toBe(true);
    expect(paths.some(({ surfaceKind }) => surfaceKind === "floor" || surfaceKind === "ceiling" || surfaceKind === "wall")).toBe(true);
  });

  it("shows every source only when requested", () => {
    const project = createDefaultHybridProject();
    const geometry = compileHybridGeometry(projectHybridDocument(project));
    const frame = computeHybridDirectFrame(geometry);
    const paths = deriveHybridPathDisplay(frame, geometry, "radio", true, frame.revision, []);
    expect(new Set(paths.map(({ sourceId }) => sourceId))).toEqual(new Set(["radio", "rain"]));
  });

  it("draws only the six reflection taps that can reach the fixed audio bank", () => {
    const project = createDefaultHybridProject();
    const geometry = compileHybridGeometry(projectHybridDocument(project));
    const frame = computeHybridDirectFrame(geometry);
    const base = frame.firstOrderReflectionsBySource.radio[0]!;
    const withExtraCandidates = {
      ...frame,
      firstOrderReflectionsBySource: {
        ...frame.firstOrderReflectionsBySource,
        radio: Array.from({ length: 9 }, (_, index) => ({
          ...base,
          id: `first:visual-candidate-${index}`,
          surfaceId: `visual-candidate-${index}`,
          pathLengthM: base.pathLengthM + index * 0.01,
        })),
      },
    };
    const paths = deriveHybridPathDisplay(
      withExtraCandidates,
      geometry,
      "radio",
      false,
      frame.revision,
      [],
    );

    expect(paths.filter(({ kind }) => kind === "reflection")).toHaveLength(6);
  });

  it("draws a second-order path through both finite reflection points", () => {
    const project = createDefaultHybridProject();
    const geometry = compileHybridGeometry(projectHybridDocument(project));
    const frame = computeHybridDirectFrame(geometry);
    const withSecondOrder = {
      ...frame,
      secondOrderReflectionsBySource: {
        ...frame.secondOrderReflectionsBySource,
        radio: [{
          id: "second:floor>partition_center",
          surfaceIds: ["floor", "partition_center"] as const,
          patchIds: ["floor", "partition_center:front"] as const,
          materialIds: ["concrete_hard", "concrete_hard"] as const,
          reflectionPoints: [{ x: 4, y: 0, z: 3 }, { x: 6, y: 1, z: 4 }] as const,
          pathLengthM: 9,
          delayMs: 26,
          excessDelayMs: 8,
          estimatedMidGainDb: -20,
          arrivalDirection: { x: 1, y: 0, z: 0 },
        }],
      },
    };
    const paths = deriveHybridPathDisplay(withSecondOrder, geometry, "radio", false, frame.revision, []);
    const secondOrder = paths.find(({ reflectionOrder }) => reflectionOrder === 2);

    expect(secondOrder).toBeDefined();
    expect(secondOrder?.vertices).toHaveLength(4);
    expect(secondOrder?.surfaceName).toContain("→");
  });
});
