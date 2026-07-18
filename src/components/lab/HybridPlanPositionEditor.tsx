"use client";

import {
  clientPointToSvg,
  svgToWorld,
  worldToSvg,
  type Rect,
} from "@/domain/editor/coordinates";
import type { Vec2 } from "@/domain/scene/types";
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

type HybridPlanPositionEditorProps = Readonly<{
  listenerPosition: HybridPlanPosition;
  radioPosition: HybridPlanPosition;
  rainPosition: HybridPlanPosition;
  portalOpen: boolean;
  onMoveListener: (position: HybridPlanPosition) => void;
  onMoveSource: (sourceId: "radio" | "rain", position: HybridPlanPosition) => void;
}>;

const WORLD_BOUNDS: Rect = { minX: 0, minY: 0, width: 12, height: 8 };
const SVG_VIEW_BOX: Rect = { minX: 0, minY: 0, width: 1200, height: 800 };
const KEYBOARD_STEP_M = 0.1;
const INSET_M = 0.2;

function clampAndSnap(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value * 10) / 10));
}

function formatPosition(position: HybridPlanPosition): string {
  return `X ${position.x.toFixed(1)} m, Z ${position.z.toFixed(1)} m`;
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
  portalOpen,
  onMoveListener,
  onMoveSource,
}: HybridPlanPositionEditorProps) {
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const sources: readonly HybridPlanSource[] = [
    { id: "radio", label: "Radio", position: radioPosition },
    { id: "rain", label: "Rain", position: rainPosition },
  ];
  const listenerPoint = markerPoint(listenerPosition);
  const partitionTop = wallPoint({ x: 6, y: 0 });
  const partitionBottom = wallPoint({ x: 6, y: 8 });
  const doorTop = wallPoint({ x: 6, y: 4.6 });
  const doorBottom = wallPoint({ x: 6, y: 3.4 });

  function applyPosition(target: DragTarget, position: HybridPlanPosition): void {
    if (target === "listener") onMoveListener(position);
    else onMoveSource(target, position);
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
        {portalOpen ? (
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
    </div>
  );
}
