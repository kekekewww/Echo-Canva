"use client";

import {
  clientPointToSvg,
  svgToWorld,
  worldToSvg,
  type Rect,
} from "@/domain/editor/coordinates";
import type { Vec2 } from "@/domain/scene/types";
import {
  portalEdgePoints,
  type HybridEditablePartition,
  type HybridEditablePortal,
} from "@/components/lab/partition-editing";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useState,
} from "react";

export type HybridPlanPosition = Readonly<{ x: number; z: number }>;

type HybridPlanSource = Readonly<{
  id: "radio" | "rain";
  label: "Radio" | "Rain";
  position: HybridPlanPosition;
}>;

type DragTarget = "listener" | "radio" | "rain";

type HybridHeightMarker = Readonly<{
  id: DragTarget;
  label: "Listener" | "Radio" | "Rain";
  heightM: number;
}>;

type HybridPlanPositionEditorProps = Readonly<{
  listenerPosition: HybridPlanPosition;
  radioPosition: HybridPlanPosition;
  rainPosition: HybridPlanPosition;
  listenerHeightM: number;
  radioHeightM: number;
  rainHeightM: number;
  partition: HybridEditablePartition;
  portal: HybridEditablePortal;
  onMoveListener: (position: HybridPlanPosition) => void;
  onMoveSource: (sourceId: "radio" | "rain", position: HybridPlanPosition) => void;
  onMoveListenerHeight: (heightM: number) => void;
  onMoveSourceHeight: (sourceId: "radio" | "rain", heightM: number) => void;
}>;

const WORLD_BOUNDS: Rect = { minX: 0, minY: 0, width: 12, height: 8 };
const SVG_VIEW_BOX: Rect = { minX: 0, minY: 0, width: 1200, height: 800 };
const HEIGHT_VIEW_BOX: Rect = { minX: 0, minY: 0, width: 1200, height: 260 };
const KEYBOARD_STEP_M = 0.1;
const INSET_M = 0.2;
const MIN_HEIGHT_M = 0.2;
const MAX_HEIGHT_M = 2.8;
const HEIGHT_TRACK_TOP = 34;
const HEIGHT_TRACK_BOTTOM = 214;
const HEIGHT_COLUMNS: Readonly<Record<DragTarget, number>> = {
  listener: 220,
  radio: 600,
  rain: 980,
};

function clampAndSnap(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value * 10) / 10));
}

function formatPosition(position: HybridPlanPosition): string {
  return `X ${position.x.toFixed(1)} m, Z ${position.z.toFixed(1)} m`;
}

function formatHeight(heightM: number): string {
  return `Y ${heightM.toFixed(1)} m`;
}

function heightToSvgY(heightM: number): number {
  return HEIGHT_TRACK_BOTTOM - ((heightM - MIN_HEIGHT_M) / (MAX_HEIGHT_M - MIN_HEIGHT_M)) *
    (HEIGHT_TRACK_BOTTOM - HEIGHT_TRACK_TOP);
}

function svgYToHeight(svgY: number): number {
  const clampedY = Math.min(HEIGHT_TRACK_BOTTOM, Math.max(HEIGHT_TRACK_TOP, svgY));
  return clampAndSnap(
    MIN_HEIGHT_M + ((HEIGHT_TRACK_BOTTOM - clampedY) / (HEIGHT_TRACK_BOTTOM - HEIGHT_TRACK_TOP)) *
      (MAX_HEIGHT_M - MIN_HEIGHT_M),
    MIN_HEIGHT_M,
    MAX_HEIGHT_M,
  );
}

function toPlanPoint(position: HybridPlanPosition): Vec2 {
  return { x: position.x, y: position.z };
}

function markerPoint(position: HybridPlanPosition): Vec2 {
  return worldToSvg(toPlanPoint(position), WORLD_BOUNDS, SVG_VIEW_BOX);
}

function wallPoint(position: Vec2): Vec2 {
  return worldToSvg(position, WORLD_BOUNDS, SVG_VIEW_BOX);
}

export function HybridPlanPositionEditor({
  listenerPosition,
  radioPosition,
  rainPosition,
  listenerHeightM,
  radioHeightM,
  rainHeightM,
  partition,
  portal,
  onMoveListener,
  onMoveSource,
  onMoveListenerHeight,
  onMoveSourceHeight,
}: HybridPlanPositionEditorProps) {
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const [heightDragTarget, setHeightDragTarget] = useState<DragTarget | null>(null);
  const sources: readonly HybridPlanSource[] = [
    { id: "radio", label: "Radio", position: radioPosition },
    { id: "rain", label: "Rain", position: rainPosition },
  ];
  const heightMarkers: readonly HybridHeightMarker[] = [
    { id: "listener", label: "Listener", heightM: listenerHeightM },
    { id: "radio", label: "Radio", heightM: radioHeightM },
    { id: "rain", label: "Rain", heightM: rainHeightM },
  ];
  const listenerPoint = markerPoint(listenerPosition);
  const partitionTop = wallPoint({ x: partition.a.x, y: partition.a.z });
  const partitionBottom = wallPoint({ x: partition.b.x, y: partition.b.z });
  const portalEdges = portalEdgePoints(portal, partition);
  const doorTop = wallPoint({ x: portalEdges.near.x, y: portalEdges.near.z });
  const doorBottom = wallPoint({ x: portalEdges.far.x, y: portalEdges.far.z });

  function applyPosition(target: DragTarget, position: HybridPlanPosition): void {
    if (target === "listener") onMoveListener(position);
    else onMoveSource(target, position);
  }

  function applyHeight(target: DragTarget, heightM: number): void {
    if (target === "listener") onMoveListenerHeight(heightM);
    else onMoveSourceHeight(target, heightM);
  }

  function eventToPlan(event: ReactPointerEvent<SVGGElement>): HybridPlanPosition {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return targetPosition(dragTarget);
    const bounds = svg.getBoundingClientRect();
    const svgPoint = clientPointToSvg(
      { x: event.clientX, y: event.clientY },
      { minX: bounds.left, minY: bounds.top, width: bounds.width, height: bounds.height },
      SVG_VIEW_BOX,
    );
    const world = svgToWorld(svgPoint, WORLD_BOUNDS, SVG_VIEW_BOX);
    return {
      x: clampAndSnap(world.x, INSET_M, WORLD_BOUNDS.width - INSET_M),
      z: clampAndSnap(world.y, INSET_M, WORLD_BOUNDS.height - INSET_M),
    };
  }

  function targetPosition(target: DragTarget | null): HybridPlanPosition {
    if (target === "listener") return listenerPosition;
    if (target === "radio") return radioPosition;
    return rainPosition;
  }

  function targetHeight(target: DragTarget | null): number {
    if (target === "listener") return listenerHeightM;
    if (target === "radio") return radioHeightM;
    return rainHeightM;
  }

  function startDrag(event: ReactPointerEvent<SVGGElement>, target: DragTarget): void {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragTarget(target);
  }

  function moveDrag(event: ReactPointerEvent<SVGGElement>): void {
    if (!dragTarget || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    applyPosition(dragTarget, eventToPlan(event));
  }

  function stopDrag(event: ReactPointerEvent<SVGGElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragTarget(null);
  }

  function keyboardMove(target: DragTarget, event: ReactKeyboardEvent<SVGGElement>): void {
    const current = targetPosition(target);
    const delta = event.key === "ArrowLeft" ? { x: -KEYBOARD_STEP_M, z: 0 }
      : event.key === "ArrowRight" ? { x: KEYBOARD_STEP_M, z: 0 }
        : event.key === "ArrowUp" ? { x: 0, z: KEYBOARD_STEP_M }
          : event.key === "ArrowDown" ? { x: 0, z: -KEYBOARD_STEP_M }
            : null;
    if (!delta) return;
    event.preventDefault();
    applyPosition(target, {
      x: clampAndSnap(current.x + delta.x, INSET_M, WORLD_BOUNDS.width - INSET_M),
      z: clampAndSnap(current.z + delta.z, INSET_M, WORLD_BOUNDS.height - INSET_M),
    });
  }

  function eventToHeight(event: ReactPointerEvent<SVGGElement>): number {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return targetHeight(heightDragTarget);
    const bounds = svg.getBoundingClientRect();
    const point = clientPointToSvg(
      { x: event.clientX, y: event.clientY },
      { minX: bounds.left, minY: bounds.top, width: bounds.width, height: bounds.height },
      HEIGHT_VIEW_BOX,
    );
    return svgYToHeight(point.y);
  }

  function startHeightDrag(event: ReactPointerEvent<SVGGElement>, target: DragTarget): void {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setHeightDragTarget(target);
  }

  function moveHeightDrag(event: ReactPointerEvent<SVGGElement>): void {
    if (!heightDragTarget || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    applyHeight(heightDragTarget, eventToHeight(event));
  }

  function stopHeightDrag(event: ReactPointerEvent<SVGGElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setHeightDragTarget(null);
  }

  function keyboardHeight(target: DragTarget, event: ReactKeyboardEvent<SVGGElement>): void {
    const delta = event.key === "ArrowUp" ? KEYBOARD_STEP_M
      : event.key === "ArrowDown" ? -KEYBOARD_STEP_M
        : null;
    if (delta === null) return;
    event.preventDefault();
    applyHeight(target, clampAndSnap(targetHeight(target) + delta, MIN_HEIGHT_M, MAX_HEIGHT_M));
  }

  return (
    <div className="hybrid-plan-editor" data-testid="hybrid-plan-editor">
      <div className="hybrid-plan-heading">
        <div>
          <p className="panel-kicker">Plan position map</p>
          <h3>Drag a marker to place it in X/Z</h3>
        </div>
        <p className="hybrid-plan-scale">12 m × 8 m</p>
      </div>
      <p className="control-note" id="hybrid-plan-help">
        Orange is the listener. Cyan markers are sound sources. Drag any marker or focus it and use
        arrow keys; height remains a separate Y control below.
      </p>
      <svg
        aria-describedby="hybrid-plan-help"
        aria-label="Hybrid 3D editable plan position map in meters"
        className="hybrid-plan-svg"
        preserveAspectRatio="xMidYMid meet"
        role="group"
        viewBox="0 0 1200 800"
      >
        <defs>
          <filter id="hybrid-plan-glow">
            <feGaussianBlur result="blur" stdDeviation="7" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect className="hybrid-plan-bed" height="800" width="1200" x="0" y="0" />
        <g aria-hidden="true" className="hybrid-plan-grid">
          {Array.from({ length: 13 }, (_, index) => wallPoint({ x: index, y: 0 })).map((point, index) => (
            <line className="hybrid-plan-grid-line" key={`vertical-${index}`} x1={point.x} x2={point.x} y1="0" y2="800" />
          ))}
          {Array.from({ length: 9 }, (_, index) => wallPoint({ x: 0, y: index })).map((point, index) => (
            <line className="hybrid-plan-grid-line" key={`horizontal-${index}`} x1="0" x2="1200" y1={point.y} y2={point.y} />
          ))}
        </g>
        <rect className="hybrid-plan-room" height="800" width="1200" x="0" y="0" />
        <line className="hybrid-plan-partition" x1={partitionTop.x} x2={partitionBottom.x} y1={partitionTop.y} y2={partitionBottom.y} />
        {portal.open ? (
          <line className="hybrid-plan-portal" x1={doorTop.x} x2={doorBottom.x} y1={doorTop.y} y2={doorBottom.y} />
        ) : (
          <line className="hybrid-plan-portal hybrid-plan-portal-closed" x1={doorTop.x} x2={doorBottom.x} y1={doorTop.y} y2={doorBottom.y} />
        )}
        {sources.map((source) => {
          const point = markerPoint(source.position);
          return (
            <line
              className="hybrid-plan-direct-line"
              key={`route-${source.id}`}
              x1={point.x}
              x2={listenerPoint.x}
              y1={point.y}
              y2={listenerPoint.y}
            />
          );
        })}
        {sources.map((source) => {
          const point = markerPoint(source.position);
          return (
            <g
              aria-label={`Move ${source.label} on plan; ${formatPosition(source.position)}`}
              className="hybrid-plan-marker hybrid-plan-source"
              data-position={`${source.position.x.toFixed(1)},${source.position.z.toFixed(1)}`}
              data-testid={`hybrid-plan-${source.id}`}
              key={source.id}
              onKeyDown={(event) => keyboardMove(source.id, event)}
              onPointerCancel={stopDrag}
              onPointerDown={(event) => startDrag(event, source.id)}
              onPointerMove={moveDrag}
              onPointerUp={stopDrag}
              role="button"
              tabIndex={0}
              transform={`translate(${point.x} ${point.y})`}
            >
              <circle className="hybrid-plan-hit" r="42" />
              <circle className="hybrid-plan-source-core" r="17" />
              <path className="hybrid-plan-source-glyph" d="M-5 -7 L7 0 L-5 7 Z" />
              <text className="hybrid-plan-marker-label" x="24" y="-10">{source.label}</text>
              <text className="hybrid-plan-marker-value" x="24" y="10">{formatPosition(source.position)}</text>
            </g>
          );
        })}
        <g
          aria-label={`Move Listener on plan; ${formatPosition(listenerPosition)}`}
          className="hybrid-plan-marker hybrid-plan-listener"
          data-position={`${listenerPosition.x.toFixed(1)},${listenerPosition.z.toFixed(1)}`}
          data-testid="hybrid-plan-listener"
          onKeyDown={(event) => keyboardMove("listener", event)}
          onPointerCancel={stopDrag}
          onPointerDown={(event) => startDrag(event, "listener")}
          onPointerMove={moveDrag}
          onPointerUp={stopDrag}
          role="button"
          tabIndex={0}
          transform={`translate(${listenerPoint.x} ${listenerPoint.y})`}
        >
          <circle className="hybrid-plan-hit" r="42" />
          <circle className="hybrid-plan-listener-core" r="18" />
          <path className="hybrid-plan-listener-heading" d="M0 -30 L8 -10 L-8 -10 Z" />
          <text className="hybrid-plan-marker-label hybrid-plan-listener-label" textAnchor="middle" x="0" y="46">Listener</text>
          <text className="hybrid-plan-marker-value hybrid-plan-listener-label" textAnchor="middle" x="0" y="64">{formatPosition(listenerPosition)}</text>
        </g>
      </svg>
      <p aria-live="polite" className="hybrid-plan-readout">
        Listener: {formatPosition(listenerPosition)} · Radio: {formatPosition(radioPosition)} · Rain: {formatPosition(rainPosition)}
      </p>
      <div className="hybrid-height-editor" data-testid="hybrid-height-editor">
        <div className="hybrid-height-heading">
          <div>
            <p className="panel-kicker">Elevation map</p>
            <h3>Drag a marker to place it on Y</h3>
          </div>
          <p className="hybrid-plan-scale">0.2–2.8 m</p>
        </div>
        <p className="control-note" id="hybrid-height-help">
          Y is height above the floor. Drag a marker up or down; focus it and use the up/down arrow
          keys for 0.1 m changes. This changes the 3D source or listener pose used by browser HRTF.
        </p>
        <svg
          aria-describedby="hybrid-height-help"
          aria-label="Hybrid 3D editable elevation map in meters"
          className="hybrid-height-svg"
          preserveAspectRatio="xMidYMid meet"
          role="group"
          viewBox="0 0 1200 260"
        >
          <rect className="hybrid-height-bed" height="260" width="1200" x="0" y="0" />
          <line className="hybrid-height-floor" x1="80" x2="1120" y1={HEIGHT_TRACK_BOTTOM} y2={HEIGHT_TRACK_BOTTOM} />
          {[0.2, 1, 1.5, 2, 2.8].map((heightM) => {
            const y = heightToSvgY(heightM);
            return (
              <g aria-hidden="true" key={heightM}>
                <line className="hybrid-height-grid-line" x1="80" x2="1120" y1={y} y2={y} />
                <text className="hybrid-height-axis-label" x="62" y={y + 6}>{heightM.toFixed(1)} m</text>
              </g>
            );
          })}
          {heightMarkers.map((marker) => {
            const x = HEIGHT_COLUMNS[marker.id];
            const y = heightToSvgY(marker.heightM);
            return (
              <g
                aria-label={`Drag ${marker.label} height on elevation map; ${formatHeight(marker.heightM)}`}
                className={`hybrid-height-marker hybrid-height-${marker.id}`}
                data-height={marker.heightM.toFixed(1)}
                data-testid={`hybrid-height-${marker.id}`}
                key={marker.id}
                onKeyDown={(event) => keyboardHeight(marker.id, event)}
                onPointerCancel={stopHeightDrag}
                onPointerDown={(event) => startHeightDrag(event, marker.id)}
                onPointerMove={moveHeightDrag}
                onPointerUp={stopHeightDrag}
                role="button"
                tabIndex={0}
                transform={`translate(${x} ${y})`}
              >
                <line className="hybrid-height-stem" x1="0" x2="0" y1={HEIGHT_TRACK_BOTTOM - y} y2="0" />
                <circle className="hybrid-height-hit" r="38" />
                <circle className="hybrid-height-marker-core" r="17" />
                <text className="hybrid-height-marker-label" textAnchor="middle" x="0" y="-36">{marker.label}</text>
                <text className="hybrid-height-marker-value" textAnchor="middle" x="0" y="42">{formatHeight(marker.heightM)}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
