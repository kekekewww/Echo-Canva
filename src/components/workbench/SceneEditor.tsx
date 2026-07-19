"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  clientPointToSvg,
  type Rect,
} from "@/domain/editor/coordinates";
import {
  CLASSIC_SVG_VIEW_BOX,
  CLASSIC_VIEWPORT,
  projectClassicPoint,
  unprojectClassicPoint,
  zoomClassicCameraAtPoint,
} from "@/components/workspace/classic-viewport-math";
import type { EditorAction } from "@/domain/editor/reducer";
import type { EditorSelection } from "@/domain/editor/state";
import type { SceneSpec, Vec2 } from "@/domain/scene/types";
import type { AcousticFrame } from "@/acoustics/compute-frame";
import type { WorkspaceCamera } from "@/domain/workspace/types";

const SVG_WIDTH = CLASSIC_SVG_VIEW_BOX.width;
const SVG_HEIGHT = CLASSIC_SVG_VIEW_BOX.height;
const KEYBOARD_STEP_M = 0.1;
const FALLBACK_CLASSIC_CAMERA: WorkspaceCamera = Object.freeze({
  yawDeg: 0,
  pitchDeg: 90,
  zoom: 1,
  panX: 0,
  panY: 0,
});
const IGNORE_CAMERA_CHANGE = () => undefined;

type DragTarget =
  | { type: "listener" }
  | { type: "source"; id: string }
  | { type: "wall-endpoint"; id: string; endpoint: "a" | "b" };

type ViewDrag = Readonly<{
  pointerId: number;
  pointer: Vec2;
  camera: WorkspaceCamera;
}>;

type SceneEditorProps = Readonly<{
  scene: SceneSpec;
  selection: EditorSelection;
  acousticFrame: AcousticFrame | null;
  camera?: WorkspaceCamera;
  dispatch: (action: EditorAction) => void;
  onCameraChange?: (camera: WorkspaceCamera) => void;
  wallPlacementFirst?: Vec2 | null;
  onWallPlacementPoint?: (point: Vec2) => void;
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

export function portalForRouteMarker(
  portals: readonly SceneSpec["portals"][number][],
  portalIds: readonly string[],
): SceneSpec["portals"][number] | undefined {
  const listenerFacingPortalId = portalIds.at(-1);
  return portals.find(({ id }) => id === listenerFacingPortalId);
}

export function SceneEditor({ scene, selection, acousticFrame, camera = FALLBACK_CLASSIC_CAMERA, dispatch, onCameraChange = IGNORE_CAMERA_CHANGE, wallPlacementFirst = null, onWallPlacementPoint }: SceneEditorProps) {
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const [viewDrag, setViewDrag] = useState<ViewDrag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const suppressPlacementClickRef = useRef(false);
  const worldBounds = getWorldBounds(scene);
  const selectedSource =
    selection?.type === "source"
      ? scene.sources.find(({ id }) => id === selection.id)
      : undefined;
  const activeSource = selectedSource ?? scene.sources[0];
  const activeSourceFrame = activeSource
    ? acousticFrame?.sources.find(({ sourceId }) => sourceId === activeSource.id)
    : undefined;
  const listenerFacingPortal = activeSourceFrame
    ? portalForRouteMarker(scene.portals, activeSourceFrame.portalIds)
    : undefined;

  function clientToSvgPoint(event: Pick<PointerEvent | MouseEvent, "clientX" | "clientY">): Vec2 {
    const svg = svgRef.current;
    if (!svg) return { x: CLASSIC_SVG_VIEW_BOX.width / 2, y: CLASSIC_SVG_VIEW_BOX.height / 2 };
    const bounds = svg.getBoundingClientRect();
    return clientPointToSvg(
      { x: event.clientX, y: event.clientY },
      { minX: bounds.left, minY: bounds.top, width: bounds.width, height: bounds.height },
      CLASSIC_SVG_VIEW_BOX,
    );
  }

  function eventToWorld(event: ReactPointerEvent<SVGElement> | ReactMouseEvent<SVGElement>): Vec2 {
    const svg = event.currentTarget.ownerSVGElement ?? (event.currentTarget as SVGSVGElement);
    const bounds = svg.getBoundingClientRect();
    const svgPoint = clientPointToSvg(
      { x: event.clientX, y: event.clientY },
      { minX: bounds.left, minY: bounds.top, width: bounds.width, height: bounds.height },
      CLASSIC_SVG_VIEW_BOX,
    );
    const point = unprojectClassicPoint(svgPoint, worldBounds, CLASSIC_VIEWPORT, camera);
    const inset = 0.02;
    return {
      x: Math.min(worldBounds.minX + worldBounds.width - inset, Math.max(worldBounds.minX + inset, point.x)),
      y: Math.min(worldBounds.minY + worldBounds.height - inset, Math.max(worldBounds.minY + inset, point.y)),
    };
  }

  function project(point: Readonly<Vec2>): Vec2 {
    return projectClassicPoint(point, worldBounds, CLASSIC_VIEWPORT, camera);
  }

  function startPan(event: ReactPointerEvent<SVGSVGElement>): void {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressPlacementClickRef.current = true;
    setViewDrag({ pointerId: event.pointerId, pointer: clientToSvgPoint(event), camera });
  }

  function movePan(event: ReactPointerEvent<SVGSVGElement>): void {
    if (!viewDrag || viewDrag.pointerId !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const next = clientToSvgPoint(event);
    onCameraChange({
      ...viewDrag.camera,
      panX: viewDrag.camera.panX + next.x - viewDrag.pointer.x,
      panY: viewDrag.camera.panY + next.y - viewDrag.pointer.y,
    });
  }

  function stopPan(event: ReactPointerEvent<SVGSVGElement>): void {
    if (!viewDrag || viewDrag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setViewDrag(null);
    window.setTimeout(() => { suppressPlacementClickRef.current = false; }, 0);
  }

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const anchor = clientToSvgPoint(event);
      const targetZoom = camera.zoom * Math.exp(-event.deltaY * 0.0015);
      onCameraChange(zoomClassicCameraAtPoint(camera, anchor, CLASSIC_VIEWPORT, targetZoom));
    };
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [camera, onCameraChange]);

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
        data-camera={`${camera.yawDeg.toFixed(1)},${camera.pitchDeg.toFixed(1)},${camera.zoom.toFixed(2)},${camera.panX.toFixed(1)},${camera.panY.toFixed(1)}`}
        data-panning={viewDrag ? "true" : "false"}
        data-testid="scene-canvas"
        ref={svgRef}
        preserveAspectRatio="xMidYMid meet"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        role="group"
        aria-label={`${scene.name} editable floor plan in meters`}
        onPointerDownCapture={(event) => {
          if (event.button === 1) startPan(event);
        }}
        onPointerDown={(event) => {
          const target = event.target as Element;
          const emptySpace = !target.closest('[role="button"]');
          if (event.button === 0 && event.shiftKey && emptySpace) startPan(event);
        }}
        onPointerMove={movePan}
        onPointerUp={stopPan}
        onPointerCancel={stopPan}
        onLostPointerCapture={(event) => {
          if (viewDrag?.pointerId === event.pointerId) setViewDrag(null);
        }}
      >
        <defs>
          <filter id="signal-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <rect x="0" y="0" width={SVG_WIDTH} height={SVG_HEIGHT} className="canvas-bed" />
        <rect
          x={CLASSIC_VIEWPORT.minX}
          y={CLASSIC_VIEWPORT.minY}
          width={CLASSIC_VIEWPORT.width}
          height={CLASSIC_VIEWPORT.height}
          className={`room-field${onWallPlacementPoint ? " is-placement-active" : ""}`}
          data-testid="wall-placement-surface"
          onClick={onWallPlacementPoint ? (event) => {
            if (suppressPlacementClickRef.current) {
              suppressPlacementClickRef.current = false;
              return;
            }
            onWallPlacementPoint(eventToWorld(event));
          } : undefined}
        />

        {wallPlacementFirst ? (() => {
          const point = project(wallPlacementFirst);
          return <g aria-label="First wall point" className="wall-placement-point" transform={`translate(${point.x} ${point.y})`}><circle r="9" /><text y="-16">A</text></g>;
        })() : null}

        <g className="coordinate-grid" aria-hidden="true">
          {Array.from({ length: Math.floor(worldBounds.width * 2) + 1 }, (_, index) => {
            const value = worldBounds.minX + index / 2;
            const x = project({ x: value, y: worldBounds.minY }).x;
            return (
              <line
                key={`grid-x-${index}`}
                x1={x}
                x2={x}
                y1={CLASSIC_VIEWPORT.minY}
                y2={CLASSIC_VIEWPORT.minY + CLASSIC_VIEWPORT.height}
                className={index % 2 === 0 ? "meter-grid-line" : "minor-grid-line"}
              />
            );
          })}
          {Array.from({ length: Math.floor(worldBounds.height * 2) + 1 }, (_, index) => {
            const value = worldBounds.minY + index / 2;
            const y = project({ x: worldBounds.minX, y: value }).y;
            return (
              <line
                key={`grid-y-${index}`}
                x1={CLASSIC_VIEWPORT.minX}
                x2={CLASSIC_VIEWPORT.minX + CLASSIC_VIEWPORT.width}
                y1={y}
                y2={y}
                className={index % 2 === 0 ? "meter-grid-line" : "minor-grid-line"}
              />
            );
          })}
        </g>

        {Array.from({ length: Math.floor(worldBounds.width) + 1 }, (_, index) => {
          const point = project({ x: worldBounds.minX + index, y: worldBounds.minY });
          return <text key={`x-${index}`} x={point.x} y="586" className="axis-label">{index} m</text>;
        })}
        {Array.from({ length: Math.floor(worldBounds.height) + 1 }, (_, index) => {
          const point = project({ x: worldBounds.minX, y: worldBounds.minY + index });
          return <text key={`y-${index}`} x="44" y={point.y + 3} className="axis-label axis-label-y">{index}</text>;
        })}

        {activeSource ? (() => {
          const center = project(activeSource.position);
          return (
            <g className="wavefront-signature" aria-hidden="true">
              {[34, 74, 118].map((radius, index) => (
                <circle key={radius} cx={center.x} cy={center.y} r={radius} style={{ animationDelay: `${index * -0.65}s` }} />
              ))}
            </g>
          );
        })() : null}

        {scene.walls.map((wall) => {
          const a = project(wall.a);
          const b = project(wall.b);
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
            data-route-type={activeSourceFrame.routeType}
            data-source-id={activeSourceFrame.sourceId}
            points={activeSourceFrame.routePolyline
              .map((point) => {
                const svgPoint = project(point);
                return `${svgPoint.x},${svgPoint.y}`;
              })
              .join(" ")}
            className="acoustic-route-overlay"
            aria-hidden="true"
          />
        ) : null}

        {activeSource && activeSourceFrame?.earlyReflections.map((reflection) => {
          const sourcePoint = project(activeSource.position);
          const reflectionPoint = project(reflection.reflectionPoint);
          const listenerPoint = project(scene.listener.position);
          return (
            <polyline
              key={`${reflection.wallId}-${reflection.reflectionPoint.x}-${reflection.reflectionPoint.y}`}
              data-testid="early-reflection-path"
              data-wall-id={reflection.wallId}
              points={`${sourcePoint.x},${sourcePoint.y} ${reflectionPoint.x},${reflectionPoint.y} ${listenerPoint.x},${listenerPoint.y}`}
              className="early-reflection-path"
              aria-hidden="true"
            />
          );
        })}

        {listenerFacingPortal ? (() => {
          const point = project(listenerFacingPortal.center);
          return (
            <circle
              data-testid="first-portal-route-marker"
              data-portal-id={listenerFacingPortal.id}
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
          const a = project(segment[0]);
          const b = project(segment[1]);
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
          const point = project(source.position);
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
          const point = project(scene.listener.position);
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
