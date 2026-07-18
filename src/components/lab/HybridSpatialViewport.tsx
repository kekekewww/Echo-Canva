"use client";

import { clientPointToSvg, type Rect } from "@/domain/editor/coordinates";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_VIEWPORT_CAMERA,
  clampViewportCamera,
  northViewportAngleDeg,
  projectViewportPoint,
  unprojectViewportPointAtHeight,
  type ScreenPoint,
  type ViewportCamera,
  type ViewportVec3,
} from "./viewport-math";
import {
  portalEdgePoints,
  type HybridEditablePartition,
  type HybridEditablePortal,
} from "./partition-editing";

type PlanPosition = Readonly<{ x: number; z: number }>;
type ObjectId = "listener" | "radio" | "rain";
export type HybridViewportSelection = ObjectId | "partition-a" | "partition-b" | "portal";

type HybridSpatialViewportProps = Readonly<{
  listenerPosition: PlanPosition;
  listenerHeightM: number;
  radioPosition: PlanPosition;
  radioHeightM: number;
  rainPosition: PlanPosition;
  rainHeightM: number;
  partition: HybridEditablePartition;
  portal: HybridEditablePortal;
  onMoveListener: (position: PlanPosition) => void;
  onMoveListenerHeight: (heightM: number) => void;
  onMoveSource: (sourceId: "radio" | "rain", position: PlanPosition) => void;
  onMoveSourceHeight: (sourceId: "radio" | "rain", heightM: number) => void;
  onMovePartitionEndpoint: (endpoint: "a" | "b", position: PlanPosition) => void;
  onMovePortalCenter: (center: PlanPosition) => void;
  selectedTarget: HybridViewportSelection;
  onSelectTarget: (target: HybridViewportSelection) => void;
}>;

type DragState =
  | Readonly<{ kind: "orbit"; pointer: ScreenPoint; camera: ViewportCamera }>
  | Readonly<{ kind: "object"; objectId: ObjectId; pointer: ScreenPoint; position: ViewportVec3 }>
  | Readonly<{ kind: "partition-endpoint"; endpoint: "a" | "b" }>
  | Readonly<{ kind: "portal"; heightM: number }>;

const VIEW_BOX: Rect = { minX: 0, minY: 0, width: 1200, height: 720 };
const ROOM_HEIGHT_M = 2.8;
const MIN_X = 0.2;
const MAX_X = 11.8;
const MIN_Z = 0.2;
const MAX_Z = 7.8;
const MIN_Y = 0.2;
const MAX_Y = 2.8;

const OBJECT_STYLE: Readonly<Record<ObjectId, Readonly<{ label: string; className: string }>>> = {
  listener: { label: "Listener", className: "hybrid-viewport-listener" },
  radio: { label: "Radio", className: "hybrid-viewport-source" },
  rain: { label: "Rain", className: "hybrid-viewport-source" },
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value * 10) / 10));
}

function points(pointsToRender: readonly ScreenPoint[]): string {
  return pointsToRender.map((point) => `${point.x},${point.y}`).join(" ");
}

function lineDelta(origin: ScreenPoint, target: ScreenPoint): ScreenPoint {
  const x = target.x - origin.x;
  const y = target.y - origin.y;
  const magnitude = Math.hypot(x, y) || 1;
  return { x: x / magnitude * 42, y: y / magnitude * 42 };
}

export function HybridSpatialViewport({
  listenerPosition,
  listenerHeightM,
  radioPosition,
  radioHeightM,
  rainPosition,
  rainHeightM,
  partition,
  portal,
  onMoveListener,
  onMoveListenerHeight,
  onMoveSource,
  onMoveSourceHeight,
  onMovePartitionEndpoint,
  onMovePortalCenter,
  selectedTarget,
  onSelectTarget,
}: HybridSpatialViewportProps) {
  const [camera, setCamera] = useState<ViewportCamera>(DEFAULT_VIEWPORT_CAMERA);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const viewportRef = useRef<HTMLElement>(null);
  const objectPositions: Readonly<Record<ObjectId, ViewportVec3>> = {
    listener: { x: listenerPosition.x, y: listenerHeightM, z: listenerPosition.z },
    radio: { x: radioPosition.x, y: radioHeightM, z: radioPosition.z },
    rain: { x: rainPosition.x, y: rainHeightM, z: rainPosition.z },
  };
  const projected = useMemo(() => {
    const portalEdges = portalEdgePoints(portal, partition);
    const panel = (start: PlanPosition, end: PlanPosition, lowerY: number, upperY: number) => [
      projectViewportPoint({ x: start.x, y: lowerY, z: start.z }, camera),
      projectViewportPoint({ x: start.x, y: upperY, z: start.z }, camera),
      projectViewportPoint({ x: end.x, y: upperY, z: end.z }, camera),
      projectViewportPoint({ x: end.x, y: lowerY, z: end.z }, camera),
    ];
    const wallPanels = portal.open
      ? [
        panel(partition.a, portalEdges.near, 0, ROOM_HEIGHT_M),
        panel(portalEdges.near, portalEdges.far, portal.heightM, ROOM_HEIGHT_M),
        panel(portalEdges.far, partition.b, 0, ROOM_HEIGHT_M),
      ]
      : [panel(partition.a, partition.b, 0, ROOM_HEIGHT_M)];

    return {
    floor: [
      projectViewportPoint({ x: 0, y: 0, z: 0 }, camera),
      projectViewportPoint({ x: 12, y: 0, z: 0 }, camera),
      projectViewportPoint({ x: 12, y: 0, z: 8 }, camera),
      projectViewportPoint({ x: 0, y: 0, z: 8 }, camera),
    ],
    ceiling: [
      projectViewportPoint({ x: 0, y: ROOM_HEIGHT_M, z: 0 }, camera),
      projectViewportPoint({ x: 12, y: ROOM_HEIGHT_M, z: 0 }, camera),
      projectViewportPoint({ x: 12, y: ROOM_HEIGHT_M, z: 8 }, camera),
      projectViewportPoint({ x: 0, y: ROOM_HEIGHT_M, z: 8 }, camera),
    ],
      wallPanels,
      portalOutline: [
        projectViewportPoint({ x: portalEdges.near.x, y: 0, z: portalEdges.near.z }, camera),
        projectViewportPoint({ x: portalEdges.near.x, y: portal.heightM, z: portalEdges.near.z }, camera),
        projectViewportPoint({ x: portalEdges.far.x, y: portal.heightM, z: portalEdges.far.z }, camera),
        projectViewportPoint({ x: portalEdges.far.x, y: 0, z: portalEdges.far.z }, camera),
      ],
      endpointA: projectViewportPoint({ x: partition.a.x, y: 0, z: partition.a.z }, camera),
      endpointB: projectViewportPoint({ x: partition.b.x, y: 0, z: partition.b.z }, camera),
      portalCenter: projectViewportPoint({ x: portal.center.x, y: portal.heightM * 0.5, z: portal.center.z }, camera),
    };
  }, [camera, partition, portal]);
  const axis = useMemo(() => {
    const origin = projectViewportPoint({ x: 6, y: 0, z: 4 }, camera);
    return {
      x: lineDelta(origin, projectViewportPoint({ x: 7, y: 0, z: 4 }, camera)),
      y: lineDelta(origin, projectViewportPoint({ x: 6, y: 1, z: 4 }, camera)),
      z: lineDelta(origin, projectViewportPoint({ x: 6, y: 0, z: 5 }, camera)),
    };
  }, [camera]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const zoomViewport = (event: WheelEvent): void => {
      event.preventDefault();
      setCamera((current) => clampViewportCamera({
        ...current,
        zoom: current.zoom + (event.deltaY < 0 ? 0.08 : -0.08),
      }));
    };
    viewport.addEventListener("wheel", zoomViewport, { passive: false });
    return () => viewport.removeEventListener("wheel", zoomViewport);
  }, []);

  function clientToViewport(event: ReactPointerEvent<SVGElement>): ScreenPoint {
    const svg = event.currentTarget.ownerSVGElement ?? event.currentTarget;
    const bounds = svg.getBoundingClientRect();
    return clientPointToSvg(
      { x: event.clientX, y: event.clientY },
      { minX: bounds.left, minY: bounds.top, width: bounds.width, height: bounds.height },
      VIEW_BOX,
    );
  }

  function moveObject(objectId: ObjectId, position: ViewportVec3): void {
    const plan = { x: clamp(position.x, MIN_X, MAX_X), z: clamp(position.z, MIN_Z, MAX_Z) };
    if (objectId === "listener") onMoveListener(plan);
    else onMoveSource(objectId, plan);
  }

  function moveObjectHeight(objectId: ObjectId, heightM: number): void {
    const height = clamp(heightM, MIN_Y, MAX_Y);
    if (objectId === "listener") onMoveListenerHeight(height);
    else onMoveSourceHeight(objectId, height);
  }

  function beginOrbit(event: ReactPointerEvent<SVGRectElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({ kind: "orbit", pointer: clientToViewport(event), camera });
  }

  function orbit(event: ReactPointerEvent<SVGRectElement>): void {
    if (dragState?.kind !== "orbit" || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const next = clientToViewport(event);
    setCamera(clampViewportCamera({
      yawDeg: dragState.camera.yawDeg + (next.x - dragState.pointer.x) * 0.35,
      pitchDeg: dragState.camera.pitchDeg - (next.y - dragState.pointer.y) * 0.22,
      zoom: dragState.camera.zoom,
    }));
  }

  function endOrbit(event: ReactPointerEvent<SVGRectElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragState(null);
  }

  function beginObjectDrag(event: ReactPointerEvent<SVGGElement>, objectId: ObjectId): void {
    event.preventDefault();
    event.stopPropagation();
    onSelectTarget(objectId);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      kind: "object",
      objectId,
      pointer: clientToViewport(event),
      position: objectPositions[objectId],
    });
  }

  function dragObject(event: ReactPointerEvent<SVGGElement>): void {
    if (dragState?.kind !== "object" || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const pointer = clientToViewport(event);
    if (event.shiftKey) {
      moveObjectHeight(dragState.objectId, dragState.position.y - (pointer.y - dragState.pointer.y) / (48 * camera.zoom));
      return;
    }
    moveObject(
      dragState.objectId,
      unprojectViewportPointAtHeight(pointer, dragState.position.y, camera),
    );
  }

  function endObjectDrag(event: ReactPointerEvent<SVGGElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragState(null);
  }

  function beginPartitionEndpointDrag(
    event: ReactPointerEvent<SVGGElement>,
    endpoint: "a" | "b",
  ): void {
    event.preventDefault();
    event.stopPropagation();
    onSelectTarget(`partition-${endpoint}`);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({ kind: "partition-endpoint", endpoint });
  }

  function beginPortalDrag(event: ReactPointerEvent<SVGGElement>): void {
    event.preventDefault();
    event.stopPropagation();
    onSelectTarget("portal");
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({ kind: "portal", heightM: portal.heightM * 0.5 });
  }

  function dragPartitionEditor(event: ReactPointerEvent<SVGGElement>): void {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !dragState) return;
    if (dragState.kind === "partition-endpoint") {
      const next = unprojectViewportPointAtHeight(clientToViewport(event), 0, camera);
      onMovePartitionEndpoint(dragState.endpoint, { x: next.x, z: next.z });
      return;
    }
    if (dragState.kind === "portal") {
      const next = unprojectViewportPointAtHeight(clientToViewport(event), dragState.heightM, camera);
      onMovePortalCenter({ x: next.x, z: next.z });
    }
  }

  function endPartitionEditorDrag(event: ReactPointerEvent<SVGGElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragState(null);
  }

  const northAngle = northViewportAngleDeg(camera);
  return (
    <section
      className="hybrid-spatial-viewport"
      data-camera={`${camera.yawDeg.toFixed(1)},${camera.pitchDeg.toFixed(1)},${camera.zoom.toFixed(2)}`}
      data-testid="hybrid-spatial-viewport"
      ref={viewportRef}
    >
      <header className="hybrid-viewport-header">
        <div>
          <p className="panel-kicker">3D scene viewport</p>
          <h3>Drag objects to move them. Drag empty space to orbit 360°.</h3>
        </div>
        <div className="hybrid-view-buttons" aria-label="Camera views">
          <button onClick={() => setCamera({ yawDeg: 0, pitchDeg: 78, zoom: 1 })} type="button">Top</button>
          <button onClick={() => setCamera({ yawDeg: 0, pitchDeg: 28, zoom: 1 })} type="button">Front</button>
          <button onClick={() => setCamera(DEFAULT_VIEWPORT_CAMERA)} type="button">Reset view</button>
        </div>
      </header>
      <p className="control-note" id="hybrid-viewport-help">
        Amber is the listener, cyan objects are sources, coral handles edit the wall, and the cyan
        doorway edits the Portal. Drag selects an object; normal drag moves X/Z, while Shift-drag
        changes an object&apos;s Y height. The mouse wheel zooms without scrolling this page; north is
        declared as +Z.
      </p>
      <svg
        aria-describedby="hybrid-viewport-help"
        aria-label="Interactive 3D acoustic scene viewport"
        className="hybrid-viewport-svg"
        preserveAspectRatio="xMidYMid meet"
        role="group"
        viewBox="0 0 1200 720"
      >
        <defs>
          <linearGradient id="hybrid-viewport-floor" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#173539" stopOpacity="0.56" />
            <stop offset="1" stopColor="#0b1417" stopOpacity="0.94" />
          </linearGradient>
          <filter id="hybrid-viewport-glow">
            <feGaussianBlur result="blur" stdDeviation="6" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect
          className="hybrid-viewport-orbit-surface"
          height="720"
          onPointerCancel={endOrbit}
          onPointerDown={beginOrbit}
          onPointerMove={orbit}
          onPointerUp={endOrbit}
          width="1200"
          x="0"
          y="0"
        />
        <polygon className="hybrid-viewport-floor" points={points(projected.floor)} />
        <polygon className="hybrid-viewport-ceiling" points={points(projected.ceiling)} />
        {projected.floor.map((point, index) => {
          const ceilingPoint = projected.ceiling[index]!;
          return <line className="hybrid-viewport-room-edge" key={`edge-${index}`} x1={point.x} x2={ceilingPoint.x} y1={point.y} y2={ceilingPoint.y} />;
        })}
        <polyline className="hybrid-viewport-room-edge" fill="none" points={points([...projected.floor, projected.floor[0]!])} />
        <polyline className="hybrid-viewport-ceiling-edge" fill="none" points={points([...projected.ceiling, projected.ceiling[0]!])} />
        {projected.wallPanels.map((wallPanel, index) => (
          <polygon
            className={`hybrid-viewport-wall-panel${portal.open ? "" : " is-closed"}`}
            key={`partition-panel-${index}`}
            points={points(wallPanel)}
          />
        ))}
        {portal.open && (
          <polyline className="hybrid-viewport-portal" fill="none" points={points(projected.portalOutline)} />
        )}
        {(["a", "b"] as const).map((endpoint) => {
          const screen = endpoint === "a" ? projected.endpointA : projected.endpointB;
          return (
            <g
              aria-label={`Drag partition endpoint ${endpoint.toUpperCase()} in 3D scene`}
              className={`hybrid-viewport-partition-handle${selectedTarget === `partition-${endpoint}` ? " is-selected" : ""}`}
              data-position={`${(endpoint === "a" ? partition.a : partition.b).x.toFixed(1)},${(endpoint === "a" ? partition.a : partition.b).z.toFixed(1)}`}
              data-testid={`hybrid-viewport-partition-${endpoint}`}
              key={endpoint}
              onPointerCancel={endPartitionEditorDrag}
              onPointerDown={(event) => beginPartitionEndpointDrag(event, endpoint)}
              onPointerMove={dragPartitionEditor}
              onPointerUp={endPartitionEditorDrag}
              role="button"
              tabIndex={0}
              transform={`translate(${screen.x} ${screen.y})`}
            >
              <circle className="hybrid-viewport-partition-handle-hit" r="28" />
              <rect className="hybrid-viewport-partition-handle-core" height="14" width="14" x="-7" y="-7" />
              <text className="hybrid-viewport-partition-handle-label" textAnchor="middle" x="0" y="-19">Wall {endpoint.toUpperCase()}</text>
            </g>
          );
        })}
        <g
          aria-label="Drag Portal centre along the partition"
          className={`hybrid-viewport-portal-handle${selectedTarget === "portal" ? " is-selected" : ""}`}
          data-position={`${portal.center.x.toFixed(1)},${portal.center.z.toFixed(1)}`}
          data-testid="hybrid-viewport-portal-handle"
          onPointerCancel={endPartitionEditorDrag}
          onPointerDown={beginPortalDrag}
          onPointerMove={dragPartitionEditor}
          onPointerUp={endPartitionEditorDrag}
          role="button"
          tabIndex={0}
          transform={`translate(${projected.portalCenter.x} ${projected.portalCenter.y})`}
        >
          <circle className="hybrid-viewport-portal-handle-hit" r="30" />
          <path className="hybrid-viewport-portal-handle-core" d="M-10 10 L-10 -10 L10 -10 L10 10 Z" />
          <text className="hybrid-viewport-partition-handle-label" textAnchor="middle" x="0" y="-22">Portal</text>
        </g>
        {(Object.keys(objectPositions) as ObjectId[]).map((objectId) => {
          const position = objectPositions[objectId];
          const screen = projectViewportPoint(position, camera);
          const style = OBJECT_STYLE[objectId];
          return (
            <g
              aria-label={`Drag ${style.label} in 3D scene; X ${position.x.toFixed(1)} m, Y ${position.y.toFixed(1)} m, Z ${position.z.toFixed(1)} m`}
              className={`hybrid-viewport-object ${style.className}${selectedTarget === objectId ? " is-selected" : ""}`}
              data-position={`${position.x.toFixed(1)},${position.y.toFixed(1)},${position.z.toFixed(1)}`}
              data-testid={`hybrid-viewport-${objectId}`}
              key={objectId}
              onPointerCancel={endObjectDrag}
              onPointerDown={(event) => beginObjectDrag(event, objectId)}
              onPointerMove={dragObject}
              onPointerUp={endObjectDrag}
              role="button"
              tabIndex={0}
              transform={`translate(${screen.x} ${screen.y})`}
            >
              <circle className="hybrid-viewport-object-hit" r="34" />
              {objectId === "listener" ? (
                <>
                  <circle className="hybrid-viewport-listener-head" cy="-6" r="14" />
                  <path className="hybrid-viewport-listener-body" d="M-19 24 C-17 7 17 7 19 24 Z" />
                </>
              ) : (
                <>
                  <circle className="hybrid-viewport-source-core" r="15" />
                  <path className="hybrid-viewport-source-glyph" d="M-5 -7 L8 0 L-5 7 Z" />
                </>
              )}
              <text className="hybrid-viewport-object-label" textAnchor="middle" x="0" y="-31">{style.label}</text>
              <text className="hybrid-viewport-object-value" textAnchor="middle" x="0" y="43">X {position.x.toFixed(1)} · Y {position.y.toFixed(1)} · Z {position.z.toFixed(1)}</text>
            </g>
          );
        })}
        <g aria-label="XYZ coordinate axes" className="hybrid-viewport-axis" transform="translate(94 610)">
          <circle className="hybrid-viewport-axis-origin" r="4" />
          <line className="hybrid-viewport-axis-x" x1="0" x2={axis.x.x} y1="0" y2={axis.x.y} />
          <line className="hybrid-viewport-axis-y" x1="0" x2={axis.y.x} y1="0" y2={axis.y.y} />
          <line className="hybrid-viewport-axis-z" x1="0" x2={axis.z.x} y1="0" y2={axis.z.y} />
          <text className="hybrid-viewport-axis-x" x={axis.x.x * 1.18} y={axis.x.y * 1.18}>X</text>
          <text className="hybrid-viewport-axis-y" x={axis.y.x * 1.18} y={axis.y.y * 1.18}>Y</text>
          <text className="hybrid-viewport-axis-z" x={axis.z.x * 1.18} y={axis.z.y * 1.18}>Z</text>
        </g>
        <g aria-label="Compass; north is positive Z" className="hybrid-viewport-compass" transform="translate(1090 88)">
          <circle r="42" />
          <g transform={`rotate(${northAngle})`}>
            <path d="M0 -33 L8 7 L0 0 L-8 7 Z" />
          </g>
          <text textAnchor="middle" x="0" y="-51">N</text>
          <text textAnchor="middle" x="0" y="66">+Z north</text>
        </g>
      </svg>
    </section>
  );
}
