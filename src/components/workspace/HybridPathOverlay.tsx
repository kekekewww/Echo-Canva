"use client";

import { useState } from "react";

import type { HybridAudiblePath } from "@/acoustics/hybrid3d/audible-direct";
import type { HybridGeometry } from "@/acoustics/hybrid3d/compile";
import type { HybridDirectFrame } from "@/acoustics/hybrid3d/direct";
import type { Vec3 } from "@/acoustics/hybrid3d/geometry";
import { renderHybridEarlyReflections } from "@/acoustics/hybrid3d/reflection-rendering";
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
  reflectionOrder: 1 | 2 | null;
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
    : new Set(selectedSourceId
      ? [selectedSourceId]
      : [geometry.document.baseScene.sources[0]?.id].filter(Boolean) as string[]);
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
      reflectionOrder: null,
    });

    const firstOrder = frame.firstOrderReflectionsBySource[path.sourceId] ?? [];
    const secondOrder = frame.secondOrderReflectionsBySource[path.sourceId] ?? [];
    const rendered = new Map(renderHybridEarlyReflections(firstOrder, secondOrder)
      .map((tap) => [tap.id, tap]));

    for (const reflection of firstOrder.filter(({ id }) => rendered.has(id))) {
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
        reflectionOrder: 1,
      });
    }

    for (const reflection of secondOrder.filter(({ id }) => rendered.has(id))) {
      const listenerFacingSurface = reflection.surfaceIds[1];
      const surfaceKind = listenerFacingSurface === "floor" || listenerFacingSurface === "ceiling"
        ? listenerFacingSurface
        : "wall";
      display.push({
        id: reflection.id,
        sourceId: path.sourceId,
        kind: "reflection",
        surfaceKind,
        surfaceName: reflection.surfaceIds.join(" → "),
        vertices: [source, ...reflection.reflectionPoints, geometry.listenerPosition],
        pathLengthM: reflection.pathLengthM,
        delayMs: reflection.excessDelayMs,
        gainDb: rendered.get(reflection.id)?.gainDb ?? reflection.estimatedMidGainDb,
        reflectionOrder: 2,
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
        const reflectionNodes = path.kind === "reflection" ? projected.slice(1, -1) : [];
        const tooltipAnchor = reflectionNodes[0];
        return (
          <g key={`${path.sourceId}:${path.id}`}>
            <polyline
              className={`hybrid-display-path kind-${path.kind} order-${path.reflectionOrder ?? 0}${xRay ? " is-xray" : ""}`}
              data-path-kind={path.kind}
              data-reflection-order={path.reflectionOrder ?? undefined}
              data-source-id={path.sourceId}
              points={projected.map(({ x, y }) => `${x},${y}`).join(" ")}
            />
            {reflectionNodes.map((node, index) => (
              <circle
                aria-label={`${path.reflectionOrder === 2 ? "Second-order" : "First-order"} reflection; ${path.surfaceName} point ${index + 1}; ${path.pathLengthM.toFixed(2)} metres; ${path.delayMs.toFixed(2)} milliseconds; ${path.gainDb.toFixed(1)} decibels`}
                className={`hybrid-reflection-node order-${path.reflectionOrder ?? 1}`}
                cx={node.x}
                cy={node.y}
                key={`${path.id}:node:${index}`}
                onBlur={() => setActivePathId(null)}
                onFocus={() => setActivePathId(path.id)}
                onMouseEnter={() => setActivePathId(path.id)}
                onMouseLeave={() => setActivePathId(null)}
                r={path.reflectionOrder === 2 ? "6" : "7"}
                role="img"
                tabIndex={0}
              />
            ))}
            {activePathId === path.id && tooltipAnchor ? (
              <foreignObject height="76" width="250" x={tooltipAnchor.x + 12} y={tooltipAnchor.y - 38}>
                <div className="hybrid-reflection-card" role="tooltip">
                  <strong>{path.reflectionOrder === 2 ? "2nd order · " : "1st order · "}{path.surfaceName}</strong>
                  <span>{path.pathLengthM.toFixed(2)} m · {path.delayMs.toFixed(2)} ms · {path.gainDb.toFixed(1)} dB</span>
                </div>
              </foreignObject>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}
