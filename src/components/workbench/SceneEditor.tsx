"use client";

import {
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  clientPointToSvg,
  svgToWorld,
  worldToSvg,
  type Rect,
} from "@/domain/editor/coordinates";
import type { EditorAction } from "@/domain/editor/reducer";
import type { EditorSelection } from "@/domain/editor/state";
import type { SceneSpec, Vec2 } from "@/domain/scene/types";
import type { AcousticFrame } from "@/acoustics/compute-frame";

const SVG_WIDTH = 900;
const SVG_HEIGHT = 600;
const SVG_VIEW_BOX: Rect = { minX: 0, minY: 0, width: SVG_WIDTH, height: SVG_HEIGHT };
const VIEWPORT: Rect = { minX: 54, minY: 36, width: 792, height: 528 };
const KEYBOARD_STEP_M = 0.1;

type DragTarget =
  | { type: "listener" }
  | { type: "source"; id: string }
  | { type: "wall-endpoint"; id: string; endpoint: "a" | "b" };

type SceneEditorProps = Readonly<{
  scene: SceneSpec;
  selection: EditorSelection;
  acousticFrame: AcousticFrame | null;
  dispatch: (action: EditorAction) => void;
}>;

function getWorldBounds(scene: SceneSpec): Rect {
  const xs = scene.room.outerPolygon.map(({ x }) => x);
  const ys = scene.room.outerPolygon.map(({ y }) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    minX,
    minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

function portalSegment(scene: SceneSpec, portal: SceneSpec["portals"][number]): [Vec2, Vec2] | null {
  const wall = scene.walls.find(({ id }) => id === portal.wallId);
  if (!wall) return null;
  const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
  if (length === 0) return null;
  const dx = (wall.b.x - wall.a.x) / length;
  const dy = (wall.b.y - wall.a.y) / length;
  const halfWidth = portal.widthM / 2;
  return [
    { x: portal.center.x - dx * halfWidth, y: portal.center.y - dy * halfWidth },
    { x: portal.center.x + dx * halfWidth, y: portal.center.y + dy * halfWidth },
  ];
}

export function SceneEditor({ scene, selection, acousticFrame, dispatch }: SceneEditorProps) {
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const worldBounds = getWorldBounds(scene);
  const selectedSource =
    selection?.type === "source"
      ? scene.sources.find(({ id }) => id === selection.id)
      : undefined;
  const activeSource = selectedSource ?? scene.sources[0];
  const activeSourceFrame = activeSource
    ? acousticFrame?.sources.find(({ sourceId }) => sourceId === activeSource.id)
    : undefined;
  const firstPortal = activeSourceFrame?.portalIds[0]
    ? scene.portals.find(({ id }) => id === activeSourceFrame.portalIds[0])
    : undefined;

  function eventToWorld(event: ReactPointerEvent<SVGElement>): Vec2 {
    const svg = event.currentTarget.ownerSVGElement ?? (event.currentTarget as SVGSVGElement);
    const bounds = svg.getBoundingClientRect();
    const svgPoint = clientPointToSvg(
      { x: event.clientX, y: event.clientY },
      { minX: bounds.left, minY: bounds.top, width: bounds.width, height: bounds.height },
      SVG_VIEW_BOX,
    );
    const point = svgToWorld(svgPoint, worldBounds, VIEWPORT);
    const inset = 0.02;
    return {
      x: Math.min(worldBounds.minX + worldBounds.width - inset, Math.max(worldBounds.minX + inset, point.x)),
      y: Math.min(worldBounds.minY + worldBounds.height - inset, Math.max(worldBounds.minY + inset, point.y)),
    };
  }

  function startDrag(event: ReactPointerEvent<SVGGElement>, target: DragTarget): void {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragTarget(target);
  }

  function moveDrag(event: ReactPointerEvent<SVGGElement>): void {
    const target = dragTarget;
    if (!target || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const position = eventToWorld(event);
    if (target.type === "listener") {
      dispatch({ type: "MOVE_LISTENER", position });
    } else if (target.type === "source") {
      dispatch({ type: "MOVE_SOURCE", sourceId: target.id, position });
    } else {
      dispatch({
        type: "MOVE_WALL_ENDPOINT",
        wallId: target.id,
        endpoint: target.endpoint,
        position,
      });
    }
  }

  function stopDrag(event: ReactPointerEvent<SVGGElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragTarget(null);
  }

  function keyboardSelect(selectionValue: NonNullable<EditorSelection>) {
    return (event: ReactKeyboardEvent<SVGElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        dispatch({ type: "SELECT_OBJECT", selection: selectionValue });
      }
    };
  }

  function keyboardMove(
    selectionValue: NonNullable<EditorSelection>,
    position: Vec2,
    move: (position: Vec2) => EditorAction,
  ) {
    return (event: ReactKeyboardEvent<SVGElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        dispatch({ type: "SELECT_OBJECT", selection: selectionValue });
        return;
      }

      const offset =
        event.key === "ArrowLeft"
          ? { x: -KEYBOARD_STEP_M, y: 0 }
          : event.key === "ArrowRight"
            ? { x: KEYBOARD_STEP_M, y: 0 }
            : event.key === "ArrowUp"
              ? { x: 0, y: KEYBOARD_STEP_M }
              : event.key === "ArrowDown"
                ? { x: 0, y: -KEYBOARD_STEP_M }
                : null;
      if (!offset) return;

      event.preventDefault();
      dispatch({ type: "SELECT_OBJECT", selection: selectionValue });
      dispatch(move({ x: position.x + offset.x, y: position.y + offset.y }));
    };
  }

  return (
    <div className="canvas-stage">
      <svg
        className="scene-canvas"
        data-testid="scene-canvas"
        preserveAspectRatio="xMidYMid meet"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        role="group"
        aria-label={`${scene.name} editable floor plan in meters`}
      >
        <defs>
          <filter id="signal-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <rect x="0" y="0" width={SVG_WIDTH} height={SVG_HEIGHT} className="canvas-bed" />
        <rect
          x={VIEWPORT.minX}
          y={VIEWPORT.minY}
          width={VIEWPORT.width}
          height={VIEWPORT.height}
          className="room-field"
        />

        <g className="coordinate-grid" aria-hidden="true">
          {Array.from({ length: Math.floor(worldBounds.width * 2) + 1 }, (_, index) => {
            const value = worldBounds.minX + index / 2;
            const x = worldToSvg({ x: value, y: worldBounds.minY }, worldBounds, VIEWPORT).x;
            return (
              <line
                key={`grid-x-${index}`}
                x1={x}
                x2={x}
                y1={VIEWPORT.minY}
                y2={VIEWPORT.minY + VIEWPORT.height}
                className={index % 2 === 0 ? "meter-grid-line" : "minor-grid-line"}
              />
            );
          })}
          {Array.from({ length: Math.floor(worldBounds.height * 2) + 1 }, (_, index) => {
            const value = worldBounds.minY + index / 2;
            const y = worldToSvg({ x: worldBounds.minX, y: value }, worldBounds, VIEWPORT).y;
            return (
              <line
                key={`grid-y-${index}`}
                x1={VIEWPORT.minX}
                x2={VIEWPORT.minX + VIEWPORT.width}
                y1={y}
                y2={y}
                className={index % 2 === 0 ? "meter-grid-line" : "minor-grid-line"}
              />
            );
          })}
        </g>

        {Array.from({ length: Math.floor(worldBounds.width) + 1 }, (_, index) => {
          const point = worldToSvg({ x: worldBounds.minX + index, y: worldBounds.minY }, worldBounds, VIEWPORT);
          return <text key={`x-${index}`} x={point.x} y="586" className="axis-label">{index} m</text>;
        })}
        {Array.from({ length: Math.floor(worldBounds.height) + 1 }, (_, index) => {
          const point = worldToSvg({ x: worldBounds.minX, y: worldBounds.minY + index }, worldBounds, VIEWPORT);
          return <text key={`y-${index}`} x="44" y={point.y + 3} className="axis-label axis-label-y">{index}</text>;
        })}

        {activeSource ? (() => {
          const center = worldToSvg(activeSource.position, worldBounds, VIEWPORT);
          return (
            <g className="wavefront-signature" aria-hidden="true">
              {[34, 74, 118].map((radius, index) => (
                <circle key={radius} cx={center.x} cy={center.y} r={radius} style={{ animationDelay: `${index * -0.65}s` }} />
              ))}
            </g>
          );
        })() : null}

        {scene.walls.map((wall) => {
          const a = worldToSvg(wall.a, worldBounds, VIEWPORT);
          const b = worldToSvg(wall.b, worldBounds, VIEWPORT);
          const selected = selection?.type === "wall" && selection.id === wall.id;
          return (
            <g key={wall.id}>
              <g
                data-testid={`wall-${wall.id}`}
                data-material={wall.materialId}
                role="button"
                tabIndex={0}
                aria-label={`Select wall ${wall.id}`}
                className={`wall-hit-target${selected ? " is-selected" : ""}`}
                onClick={() => dispatch({ type: "SELECT_OBJECT", selection: { type: "wall", id: wall.id } })}
                onKeyDown={keyboardSelect({ type: "wall", id: wall.id })}
              >
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="wall-hit-line" />
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className={`wall-line wall-${wall.kind}${activeSourceFrame?.occluderWallIds.includes(wall.id) ? " is-occluder" : ""}`}
                />
              </g>
              {selected ? (["a", "b"] as const).map((endpoint) => {
                const position = endpoint === "a" ? a : b;
                return (
                  <g
                    key={endpoint}
                    data-testid={`endpoint-${wall.id}-${endpoint}`}
                    data-position={`${wall[endpoint].x.toFixed(3)},${wall[endpoint].y.toFixed(3)}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Move ${endpoint} endpoint of ${wall.id}`}
                    className="endpoint-handle"
                    transform={`translate(${position.x} ${position.y})`}
                    onPointerDown={(event) => startDrag(event, { type: "wall-endpoint", id: wall.id, endpoint })}
                    onPointerMove={moveDrag}
                    onPointerUp={stopDrag}
                    onPointerCancel={stopDrag}
                    onKeyDown={keyboardMove(
                      { type: "wall", id: wall.id },
                      wall[endpoint],
                      (nextPosition) => ({
                        type: "MOVE_WALL_ENDPOINT",
                        wallId: wall.id,
                        endpoint,
                        position: nextPosition,
                      }),
                    )}
                  >
                    <circle r="12" className="endpoint-hit" />
                    <circle r="5" className="endpoint-dot" />
                  </g>
                );
              }) : null}
            </g>
          );
        })}

        {activeSourceFrame?.routePolyline.length ? (
          <polyline
            data-testid="acoustic-route-overlay"
            points={activeSourceFrame.routePolyline
              .map((point) => {
                const svgPoint = worldToSvg(point, worldBounds, VIEWPORT);
                return `${svgPoint.x},${svgPoint.y}`;
              })
              .join(" ")}
            className="acoustic-route-overlay"
            aria-hidden="true"
          />
        ) : null}

        {firstPortal ? (() => {
          const point = worldToSvg(firstPortal.center, worldBounds, VIEWPORT);
          return (
            <circle
              data-testid="first-portal-route-marker"
              cx={point.x}
              cy={point.y}
              r="9"
              className="first-portal-route-marker"
              aria-hidden="true"
            />
          );
        })() : null}

        {scene.portals.map((portal) => {
          const segment = portalSegment(scene, portal);
          if (!segment) return null;
          const a = worldToSvg(segment[0], worldBounds, VIEWPORT);
          const b = worldToSvg(segment[1], worldBounds, VIEWPORT);
          const centerX = (a.x + b.x) / 2;
          const centerY = (a.y + b.y) / 2;
          const length = Math.hypot(b.x - a.x, b.y - a.y);
          const angleDeg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
          const selected = selection?.type === "portal" && selection.id === portal.id;
          return (
            <g
              key={portal.id}
              className={`portal-marker ${portal.open ? "is-open" : "is-closed"}`}
            >
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="portal-underlay" />
              <rect
                x={-length / 2}
                y="-10"
                width={length}
                height="20"
                transform={`translate(${centerX} ${centerY}) rotate(${angleDeg})`}
                data-testid={`portal-${portal.id}`}
                data-position={`${portal.center.x.toFixed(3)},${portal.center.y.toFixed(3)}`}
                role="button"
                tabIndex={0}
                aria-label={`Select portal ${portal.id}`}
                aria-pressed={selected}
                className="portal-hitbox"
                onClick={() => dispatch({ type: "SELECT_OBJECT", selection: { type: "portal", id: portal.id } })}
                onKeyDown={keyboardSelect({ type: "portal", id: portal.id })}
              />
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="portal-line" />
            </g>
          );
        })}

        {scene.sources.map((source, index) => {
          const point = worldToSvg(source.position, worldBounds, VIEWPORT);
          const selected = selection?.type === "source" && selection.id === source.id;
          return (
            <g key={source.id} transform={`translate(${point.x} ${point.y})`}>
              <g
                data-testid={`source-${source.id}`}
                data-position={`${source.position.x.toFixed(3)},${source.position.y.toFixed(3)}`}
                role="button"
                tabIndex={0}
                aria-label={`Move source ${source.name}`}
                aria-pressed={selected}
                className={`source-marker${selected ? " is-selected" : ""}`}
                onClick={() => dispatch({ type: "SELECT_OBJECT", selection: { type: "source", id: source.id } })}
                onKeyDown={keyboardMove(
                  { type: "source", id: source.id },
                  source.position,
                  (position) => ({ type: "MOVE_SOURCE", sourceId: source.id, position }),
                )}
                onPointerDown={(event) => {
                  dispatch({ type: "SELECT_OBJECT", selection: { type: "source", id: source.id } });
                  startDrag(event, { type: "source", id: source.id });
                }}
                onPointerMove={moveDrag}
                onPointerUp={stopDrag}
                onPointerCancel={stopDrag}
              >
                <circle r="17" className="marker-hit" />
                <circle r="10" className="source-core" />
                <path d="M -4 -6 L 7 0 L -4 6 Z" className="source-icon" />
              </g>
              <text x="17" y="-15" className="marker-label">S{index + 1} · {source.name}</text>
            </g>
          );
        })}

        {(() => {
          const point = worldToSvg(scene.listener.position, worldBounds, VIEWPORT);
          const selected = selection?.type === "listener";
          return (
            <g transform={`translate(${point.x} ${point.y})`}>
              <g
                data-testid="listener"
                data-position={`${scene.listener.position.x.toFixed(3)},${scene.listener.position.y.toFixed(3)}`}
                role="button"
                tabIndex={0}
                aria-label="Move listener"
                aria-pressed={selected}
                className={`listener-marker${selected ? " is-selected" : ""}`}
                onClick={() => dispatch({ type: "SELECT_OBJECT", selection: { type: "listener" } })}
                onKeyDown={keyboardMove(
                  { type: "listener" },
                  scene.listener.position,
                  (position) => ({ type: "MOVE_LISTENER", position }),
                )}
                onPointerDown={(event) => {
                  dispatch({ type: "SELECT_OBJECT", selection: { type: "listener" } });
                  startDrag(event, { type: "listener" });
                }}
                onPointerMove={moveDrag}
                onPointerUp={stopDrag}
                onPointerCancel={stopDrag}
              >
                <circle r="19" className="marker-hit" />
                <circle r="10" className="listener-core" />
                <path d="M 0 -18 L 5 -9 L -5 -9 Z" className="listener-heading" />
              </g>
              <text x="18" y="25" className="marker-label listener-label">L · Listener</text>
            </g>
          );
        })()}
      </svg>
      <div className="canvas-legend" aria-hidden="true">
        <span><i className="legend-source" /> Source</span>
        <span><i className="legend-listener" /> Listener</span>
        <span><i className="legend-portal" /> Portal</span>
      </div>
    </div>
  );
}
