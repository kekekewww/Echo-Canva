"use client";

import { useState } from "react";

import type { HybridAudiblePath } from "@/acoustics/hybrid3d/audible-direct";
import type { HybridGeometry } from "@/acoustics/hybrid3d/compile";
import type { HybridDirectFrame } from "@/acoustics/hybrid3d/direct";
import { renderHybridEarlyReflections } from "@/acoustics/hybrid3d/reflection-rendering";
import type { Vec3 } from "@/acoustics/hybrid3d/geometry";
import { projectViewportPoint, type ViewportCamera } from "@/components/lab/viewport-math";

export type HybridDisplayPath = Readonly<{
  id: string;
  sourceId: string;
  kind: "direct" | "blocked" | "portal" | "reflection";
  surfaceKind: "floor" | "ceiling" | "wall" | null;
  surfaceName: string | null;
  vertices: readonly Vec3[];
  pathLengthM: number;
  delayMs: number;
  gainDb: number;
}>;

export function deriveHybridPathDisplay(
  frame: HybridDirectFrame,
  geometry: HybridGeometry,
  selectedSourceId: string | null,
  showAll: boolean,
  expectedRevision: number,
  audiblePaths: readonly HybridAudiblePath[],
): readonly HybridDisplayPath[] {
  if (frame.revision !== expectedRevision) return [];
  const sourceIds = showAll
    ? new Set(geometry.document.baseScene.sources.map(({ id }) => id))
    : new Set(selectedSourceId ? [selectedSourceId] : [geometry.document.baseScene.sources[0]?.id].filter(Boolean) as string[]);
  const display: HybridDisplayPath[] = [];
  for (const path of frame.paths) {
    if (!path.sourceId || !sourceIds.has(path.sourceId)) continue;
    const source = geometry.sourcePositions[path.sourceId]!;
    const audible = audiblePaths.find(({ sourceId }) => sourceId === path.sourceId);
    const kind = audible?.routeType ?? path.routeType;
    const vertices = kind === "portal" && audible
      ? [source, audible.virtualPosition, geometry.listenerPosition]
      : [source, geometry.listenerPosition];
    display.push({
      id: `direct:${path.sourceId}`,
      sourceId: path.sourceId,
      kind,
      surfaceKind: null,
      surfaceName: null,
      vertices,
      pathLengthM: audible?.effectiveDistanceM ?? path.distanceM,
      delayMs: path.delayMs,
      gainDb: audible?.dryGainDb ?? 0,
    });
    const rendered = new Map(renderHybridEarlyReflections(frame.firstOrderReflectionsBySource[path.sourceId] ?? []).map((tap) => [tap.id, tap]));
    for (const reflection of frame.firstOrderReflectionsBySource[path.sourceId] ?? []) {
      const surfaceKind = reflection.surfaceId === "floor" || reflection.surfaceId === "ceiling"
        ? reflection.surfaceId
        : "wall";
      display.push({
        id: reflection.id,
        sourceId: path.sourceId,
        kind: "reflection",
        surfaceKind,
        surfaceName: reflection.surfaceId,
        vertices: [source, reflection.reflectionPoint, geometry.listenerPosition],
        pathLengthM: reflection.pathLengthM,
        delayMs: reflection.excessDelayMs,
        gainDb: rendered.get(reflection.id)?.gainDb ?? -36,
      });
    }
  }
  return display;
}

export function HybridPathOverlay({ paths, camera, xRay = false }: Readonly<{
  paths: readonly HybridDisplayPath[];
  camera: ViewportCamera;
  xRay?: boolean;
}>) {
  const [activePathId, setActivePathId] = useState<string | null>(null);
  return (
    <g className="hybrid-path-overlay" data-testid="hybrid-path-overlay">
      {paths.map((path) => {
        const projected = path.vertices.map((vertex) => projectViewportPoint(vertex, camera));
        const reflected = path.kind === "reflection" ? projected[1] : null;
        return (
          <g key={`${path.sourceId}:${path.id}`}>
            <polyline
              className={`hybrid-display-path kind-${path.kind}${xRay ? " is-xray" : ""}`}
              data-path-kind={path.kind}
              data-source-id={path.sourceId}
              points={projected.map(({ x, y }) => `${x},${y}`).join(" ")}
            />
            {reflected ? <>
              <circle
                aria-label={`${path.surfaceName} reflection; ${path.pathLengthM.toFixed(2)} metres; ${path.delayMs.toFixed(2)} milliseconds; ${path.gainDb.toFixed(1)} decibels`}
                className="hybrid-reflection-node"
                cx={reflected.x}
                cy={reflected.y}
                onBlur={() => setActivePathId(null)}
                onFocus={() => setActivePathId(path.id)}
                onMouseEnter={() => setActivePathId(path.id)}
                onMouseLeave={() => setActivePathId(null)}
                r="7"
                role="img"
                tabIndex={0}
              />
              {activePathId === path.id ? <foreignObject height="76" width="250" x={reflected.x + 12} y={reflected.y - 38}>
                <div className="hybrid-reflection-card" role="status"><strong>{path.surfaceName}</strong><span>{path.pathLengthM.toFixed(2)} m · {path.delayMs.toFixed(2)} ms · {path.gainDb.toFixed(1)} dB</span></div>
              </foreignObject> : null}
            </> : null}
          </g>
        );
      })}
    </g>
  );
}
