"use client";

import { HybridPathOverlay, type HybridDisplayPath } from "@/components/workspace/HybridPathOverlay";
import { clientPointToSvg, type Rect } from "@/domain/editor/coordinates";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { primitivePatches } from "@/acoustics/hybrid3d/primitives";
import type { AcousticPrimitive } from "@/domain/workspace/types";

import {
  DEFAULT_VIEWPORT_CAMERA,
  clampViewportCamera,
  frameViewportPoints,
  northViewportAngleDeg,
  projectViewportDepth,
  projectViewportPoint,
  unprojectViewportPointAtHeight,
  zoomViewportCameraAtPoint,
  type ScreenPoint,
  type ViewportCamera,
  type ViewportVec3,
} from "./viewport-math";

type PlanPosition = Readonly<{ x: number; z: number }>;

export type HybridViewportObject = Readonly<{
  id: string;
  kind: "listener" | "source";
  label: string;
  position: ViewportVec3;
}>;

export type HybridViewportPortal = Readonly<{
  id: string;
  center: PlanPosition;
  widthM: number;
  bottomM: number;
  topM: number;
  open: boolean;
}>;

export type HybridViewportWall = Readonly<{
  id: string;
  label: string;
  a: PlanPosition;
  b: PlanPosition;
  thicknessM: number;
  bottomM: number;
  topM: number;
  portals: readonly HybridViewportPortal[];
}>;

export type HybridViewportPrimitive = AcousticPrimitive;

export type HybridViewportSelection =
  | Readonly<{ type: "object"; id: string }>
  | Readonly<{ type: "wall"; id: string; endpoint?: "a" | "b" }>
  | Readonly<{ type: "portal"; id: string }>
  | Readonly<{ type: "primitive"; id: string }>
  | null;

type Props = Readonly<{
  roomDimensions: Readonly<{ widthM: number; depthM: number; heightM: number }>;
  ceilingVisible?: boolean;
  objects: readonly HybridViewportObject[];
  walls: readonly HybridViewportWall[];
  primitives?: readonly HybridViewportPrimitive[];
  paths?: readonly HybridDisplayPath[];
  pathsVisible?: boolean;
  showAllPaths?: boolean;
  camera: ViewportCamera;
  selectedTarget: HybridViewportSelection;
  onMoveObject: (id: string, position: ViewportVec3) => void;
  onMoveWallEndpoint: (id: string, endpoint: "a" | "b", position: PlanPosition) => void;
  onMovePortalCenter: (id: string, center: PlanPosition) => void;
  onMovePrimitive?: (id: string, position: ViewportVec3) => void;
  onSelectTarget: (target: NonNullable<HybridViewportSelection>) => void;
  onTogglePaths?: () => void;
  onToggleShowAllPaths?: () => void;
  onToggleCeiling?: () => void;
  onCameraChange: (camera: ViewportCamera) => void;
  wallPlacementFirst?: PlanPosition | null;
  onWallPlacementPoint?: (point: PlanPosition) => void;
}>;

type DragState =
  | Readonly<{ kind: "orbit"; pointer: ScreenPoint; camera: ViewportCamera }>
  | Readonly<{ kind: "pan"; pointer: ScreenPoint; camera: ViewportCamera }>
  | Readonly<{ kind: "object"; id: string; pointer: ScreenPoint; position: ViewportVec3 }>
  | Readonly<{ kind: "wall"; id: string; endpoint: "a" | "b" }>
  | Readonly<{ kind: "portal"; id: string; heightM: number }>
  | Readonly<{ kind: "primitive"; id: string; pointer: ScreenPoint; position: ViewportVec3 }>;

type ProjectedWall = Readonly<{
  wall: HybridViewportWall;
  panels: readonly ProjectedSurfacePanel[];
  portalOutlines: readonly Readonly<{ portal: HybridViewportPortal; points: readonly ScreenPoint[]; center: ScreenPoint }>[];
  endpointA: ScreenPoint;
  endpointB: ScreenPoint;
}>;

type ProjectedSurfacePanel = Readonly<{
  points: readonly ScreenPoint[];
  depth: number;
}>;

type GeometrySurface = Readonly<{
  key: string;
  kind: "wall" | "primitive";
  ownerId: string;
  points: readonly ScreenPoint[];
  depth: number;
  closed?: boolean;
  selected?: boolean;
}>;

const VIEW_BOX: Rect = { minX: 0, minY: 0, width: 1200, height: 720 };
const MIN_PLAN = 0.2;
const MIN_HEIGHT = 0.2;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value * 10) / 10));
}

function points(value: readonly ScreenPoint[]): string {
  return value.map((point) => `${point.x},${point.y}`).join(" ");
}

function projectSurfacePanel(vertices: readonly ViewportVec3[], camera: ViewportCamera): ProjectedSurfacePanel {
  return {
    points: vertices.map((vertex) => projectViewportPoint(vertex, camera)),
    depth: vertices.reduce((total, vertex) => total + projectViewportDepth(vertex, camera), 0) / vertices.length,
  };
}

function lineDelta(origin: ScreenPoint, target: ScreenPoint): ScreenPoint {
  const x = target.x - origin.x;
  const y = target.y - origin.y;
  const magnitude = Math.hypot(x, y) || 1;
  return { x: x / magnitude * 42, y: y / magnitude * 42 };
}

function wallPoint(wall: HybridViewportWall, distanceM: number, offsetM: number): PlanPosition {
  const length = Math.max(0.001, Math.hypot(wall.b.x - wall.a.x, wall.b.z - wall.a.z));
  const dx = (wall.b.x - wall.a.x) / length;
  const dz = (wall.b.z - wall.a.z) / length;
  return {
    x: wall.a.x + dx * distanceM - dz * offsetM,
    z: wall.a.z + dz * distanceM + dx * offsetM,
  };
}

function portalInterval(wall: HybridViewportWall, portal: HybridViewportPortal): Readonly<{ start: number; end: number }> {
  const length = Math.max(0.001, Math.hypot(wall.b.x - wall.a.x, wall.b.z - wall.a.z));
  const dx = (wall.b.x - wall.a.x) / length;
  const dz = (wall.b.z - wall.a.z) / length;
  const center = (portal.center.x - wall.a.x) * dx + (portal.center.z - wall.a.z) * dz;
  return {
    start: Math.max(0, center - portal.widthM / 2),
    end: Math.min(length, center + portal.widthM / 2),
  };
}

function projectWall(wall: HybridViewportWall, camera: ViewportCamera): ProjectedWall {
  const length = Math.max(0.001, Math.hypot(wall.b.x - wall.a.x, wall.b.z - wall.a.z));
  const openings = wall.portals.filter(({ open }) => open).map((portal) => ({ portal, ...portalInterval(wall, portal) }))
    .sort((left, right) => left.start - right.start);
  const rectangles: Array<Readonly<{ start: number; end: number; bottom: number; top: number }>> = [];
  let cursor = 0;
  for (const opening of openings) {
    if (opening.start > cursor) rectangles.push({ start: cursor, end: opening.start, bottom: wall.bottomM, top: wall.topM });
    if (opening.portal.bottomM > wall.bottomM) rectangles.push({ start: opening.start, end: opening.end, bottom: wall.bottomM, top: opening.portal.bottomM });
    if (opening.portal.topM < wall.topM) rectangles.push({ start: opening.start, end: opening.end, bottom: opening.portal.topM, top: wall.topM });
    cursor = Math.max(cursor, opening.end);
  }
  if (cursor < length) rectangles.push({ start: cursor, end: length, bottom: wall.bottomM, top: wall.topM });
  if (openings.length === 0) rectangles.push({ start: 0, end: length, bottom: wall.bottomM, top: wall.topM });

  const panelVertices = (start: number, end: number, bottom: number, top: number, offset: number): readonly ViewportVec3[] => {
    const a = wallPoint(wall, start, offset);
    const b = wallPoint(wall, end, offset);
    return [
      { x: a.x, y: bottom, z: a.z },
      { x: a.x, y: top, z: a.z },
      { x: b.x, y: top, z: b.z },
      { x: b.x, y: bottom, z: b.z },
    ];
  };
  const panel = (start: number, end: number, bottom: number, top: number, offset: number) =>
    projectSurfacePanel(panelVertices(start, end, bottom, top, offset), camera);
  const half = wall.thicknessM / 2;
  const panels = rectangles.flatMap((rectangle) => [
    panel(rectangle.start, rectangle.end, rectangle.bottom, rectangle.top, -half),
    panel(rectangle.start, rectangle.end, rectangle.bottom, rectangle.top, half),
  ]);
  for (const distance of [0, length]) {
    const front = wallPoint(wall, distance, -half);
    const back = wallPoint(wall, distance, half);
    panels.push(projectSurfacePanel([
      { x: front.x, y: wall.bottomM, z: front.z },
      { x: front.x, y: wall.topM, z: front.z },
      { x: back.x, y: wall.topM, z: back.z },
      { x: back.x, y: wall.bottomM, z: back.z },
    ], camera));
  }

  const portalOutlines = wall.portals.map((portal) => {
    const interval = portalInterval(wall, portal);
    const a = wallPoint(wall, interval.start, 0);
    const b = wallPoint(wall, interval.end, 0);
    return {
      portal,
      points: [
        projectViewportPoint({ x: a.x, y: portal.bottomM, z: a.z }, camera),
        projectViewportPoint({ x: a.x, y: portal.topM, z: a.z }, camera),
        projectViewportPoint({ x: b.x, y: portal.topM, z: b.z }, camera),
        projectViewportPoint({ x: b.x, y: portal.bottomM, z: b.z }, camera),
        projectViewportPoint({ x: a.x, y: portal.bottomM, z: a.z }, camera),
      ],
      center: projectViewportPoint({ x: portal.center.x, y: (portal.bottomM + portal.topM) / 2, z: portal.center.z }, camera),
    };
  });

  return {
    wall,
    panels,
    portalOutlines,
    endpointA: projectViewportPoint({ x: wall.a.x, y: wall.bottomM, z: wall.a.z }, camera),
    endpointB: projectViewportPoint({ x: wall.b.x, y: wall.bottomM, z: wall.b.z }, camera),
  };
}

export function HybridSpatialViewport({
  roomDimensions: room,
  ceilingVisible = true,
  objects,
  walls,
  primitives = [],
  paths = [],
  pathsVisible = true,
  showAllPaths = false,
  selectedTarget,
  onMoveObject,
  onMoveWallEndpoint,
  onMovePortalCenter,
  onMovePrimitive,
  onSelectTarget,
  onTogglePaths,
  onToggleShowAllPaths,
  onToggleCeiling,
  camera,
  onCameraChange,
  wallPlacementFirst = null,
  onWallPlacementPoint,
}: Props) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const projected = useMemo(() => ({
    floor: [
      projectViewportPoint({ x: 0, y: 0, z: 0 }, camera),
      projectViewportPoint({ x: room.widthM, y: 0, z: 0 }, camera),
      projectViewportPoint({ x: room.widthM, y: 0, z: room.depthM }, camera),
      projectViewportPoint({ x: 0, y: 0, z: room.depthM }, camera),
    ],
    ceiling: [
      projectViewportPoint({ x: 0, y: room.heightM, z: 0 }, camera),
      projectViewportPoint({ x: room.widthM, y: room.heightM, z: 0 }, camera),
      projectViewportPoint({ x: room.widthM, y: room.heightM, z: room.depthM }, camera),
      projectViewportPoint({ x: 0, y: room.heightM, z: room.depthM }, camera),
    ],
    walls: walls.map((wall) => projectWall(wall, camera)),
    primitives: primitives.map((primitive) => ({
      primitive,
      panels: primitivePatches(primitive).map((patch) => projectSurfacePanel(patch.vertices, camera)),
    })),
  }), [camera, primitives, room, walls]);
  const geometrySurfaces = useMemo<readonly GeometrySurface[]>(() => [
    ...projected.walls.flatMap(({ wall, panels }) => panels.map((panel, index) => ({
      key: `${wall.id}-panel-${index}`,
      kind: "wall" as const,
      ownerId: wall.id,
      points: panel.points,
      depth: panel.depth,
      closed: !wall.portals.some(({ open }) => open),
      selected: selectedTarget?.type === "wall" && selectedTarget.id === wall.id,
    }))),
    ...projected.primitives.flatMap(({ primitive, panels }) => panels.map((panel, index) => ({
      key: `${primitive.id}-panel-${index}`,
      kind: "primitive" as const,
      ownerId: primitive.id,
      points: panel.points,
      depth: panel.depth,
      selected: selectedTarget?.type === "primitive" && selectedTarget.id === primitive.id,
    }))),
  ].sort((left, right) => left.depth - right.depth || (
    left.kind === right.kind ? left.key.localeCompare(right.key) : left.kind === "wall" ? -1 : 1
  )), [projected.primitives, projected.walls, selectedTarget]);
  const axis = useMemo(() => {
    const origin = projectViewportPoint({ x: room.widthM / 2, y: 0, z: room.depthM / 2 }, camera);
    return {
      x: lineDelta(origin, projectViewportPoint({ x: room.widthM / 2 + 1, y: 0, z: room.depthM / 2 }, camera)),
      y: lineDelta(origin, projectViewportPoint({ x: room.widthM / 2, y: 1, z: room.depthM / 2 }, camera)),
      z: lineDelta(origin, projectViewportPoint({ x: room.widthM / 2, y: 0, z: room.depthM / 2 + 1 }, camera)),
    };
  }, [camera, room.depthM, room.widthM]);

  const framePoints = useMemo<readonly ViewportVec3[]>(() => [
    { x: 0, y: 0, z: 0 },
    { x: room.widthM, y: 0, z: 0 },
    { x: room.widthM, y: 0, z: room.depthM },
    { x: 0, y: 0, z: room.depthM },
    { x: 0, y: room.heightM, z: 0 },
    { x: room.widthM, y: room.heightM, z: 0 },
    { x: room.widthM, y: room.heightM, z: room.depthM },
    { x: 0, y: room.heightM, z: room.depthM },
    ...objects.map(({ position }) => position),
    ...primitives.flatMap((primitive) => primitivePatches(primitive).flatMap(({ vertices }) => vertices)),
    ...walls.flatMap((wall) => [
      { x: wall.a.x, y: wall.bottomM, z: wall.a.z },
      { x: wall.a.x, y: wall.topM, z: wall.a.z },
      { x: wall.b.x, y: wall.bottomM, z: wall.b.z },
      { x: wall.b.x, y: wall.topM, z: wall.b.z },
      ...wall.portals.flatMap((portal) => {
        const interval = portalInterval(wall, portal);
        const a = wallPoint(wall, interval.start, 0);
        const b = wallPoint(wall, interval.end, 0);
        return [
          { x: a.x, y: portal.bottomM, z: a.z },
          { x: a.x, y: portal.topM, z: a.z },
          { x: b.x, y: portal.bottomM, z: b.z },
          { x: b.x, y: portal.topM, z: b.z },
        ];
      }),
    ]),
  ], [objects, primitives, room.depthM, room.heightM, room.widthM, walls]);

  useEffect(() => {
    const viewport = svgRef.current;
    if (!viewport) return undefined;
    const zoomViewport = (event: WheelEvent): void => {
      event.preventDefault();
      const anchor = clientToViewport(event);
      onCameraChange(zoomViewportCameraAtPoint(
        camera,
        anchor,
        camera.zoom * Math.exp(-event.deltaY * 0.0015),
      ));
    };
    viewport.addEventListener("wheel", zoomViewport, { passive: false });
    return () => viewport.removeEventListener("wheel", zoomViewport);
  }, [camera, onCameraChange]);

  function clientToViewport(event: Pick<PointerEvent | WheelEvent, "clientX" | "clientY">): ScreenPoint {
    const svg = svgRef.current;
    if (!svg) return { x: VIEW_BOX.width / 2, y: VIEW_BOX.height / 2 };
    const bounds = svg.getBoundingClientRect();
    return clientPointToSvg(
      { x: event.clientX, y: event.clientY },
      { minX: bounds.left, minY: bounds.top, width: bounds.width, height: bounds.height },
      VIEW_BOX,
    );
  }

  function endDrag(event: ReactPointerEvent<SVGElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragState(null);
  }

  function beginPan(event: ReactPointerEvent<SVGElement>): void {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({ kind: "pan", pointer: clientToViewport(event), camera });
  }

  function beginOrbit(event: ReactPointerEvent<SVGRectElement>): void {
    if (event.button !== 0) return;
    if (event.shiftKey) {
      beginPan(event);
      return;
    }
    if (onWallPlacementPoint) {
      event.preventDefault();
      const point = unprojectViewportPointAtHeight(clientToViewport(event), 0, camera);
      onWallPlacementPoint({
        x: clamp(point.x, MIN_PLAN, Math.max(MIN_PLAN, room.widthM - MIN_PLAN)),
        z: clamp(point.z, MIN_PLAN, Math.max(MIN_PLAN, room.depthM - MIN_PLAN)),
      });
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({ kind: "orbit", pointer: clientToViewport(event), camera });
  }

  function moveView(event: ReactPointerEvent<SVGElement>): void {
    if (!dragState || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (dragState.kind !== "orbit" && dragState.kind !== "pan") return;
    const next = clientToViewport(event);
    if (dragState.kind === "pan") {
      onCameraChange(clampViewportCamera({
        ...dragState.camera,
        panX: dragState.camera.panX + next.x - dragState.pointer.x,
        panY: dragState.camera.panY + next.y - dragState.pointer.y,
      }));
    } else {
      onCameraChange(clampViewportCamera({
        ...dragState.camera,
        yawDeg: dragState.camera.yawDeg + (next.x - dragState.pointer.x) * 0.35,
        pitchDeg: dragState.camera.pitchDeg - (next.y - dragState.pointer.y) * 0.22,
      }));
    }
  }

  function dragObject(event: ReactPointerEvent<SVGGElement>): void {
    if (dragState?.kind !== "object" || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const pointer = clientToViewport(event);
    const position = event.shiftKey
      ? { ...dragState.position, y: clamp(dragState.position.y - (pointer.y - dragState.pointer.y) / (48 * camera.zoom), MIN_HEIGHT, room.heightM) }
      : unprojectViewportPointAtHeight(pointer, dragState.position.y, camera);
    onMoveObject(dragState.id, {
      x: clamp(position.x, MIN_PLAN, Math.max(MIN_PLAN, room.widthM - MIN_PLAN)),
      y: clamp(position.y, MIN_HEIGHT, room.heightM),
      z: clamp(position.z, MIN_PLAN, Math.max(MIN_PLAN, room.depthM - MIN_PLAN)),
    });
  }

  function dragPrimitive(event: ReactPointerEvent<SVGGElement>): void {
    if (dragState?.kind !== "primitive" || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const pointer = clientToViewport(event);
    const position = event.shiftKey
      ? { ...dragState.position, y: dragState.position.y - (pointer.y - dragState.pointer.y) / (48 * camera.zoom) }
      : unprojectViewportPointAtHeight(pointer, dragState.position.y, camera);
    onMovePrimitive?.(dragState.id, position);
  }

  function dragGeometry(event: ReactPointerEvent<SVGGElement>): void {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !dragState) return;
    if (dragState.kind === "wall") {
      const next = unprojectViewportPointAtHeight(clientToViewport(event), 0, camera);
      onMoveWallEndpoint(dragState.id, dragState.endpoint, { x: next.x, z: next.z });
    } else if (dragState.kind === "portal") {
      const next = unprojectViewportPointAtHeight(clientToViewport(event), dragState.heightM, camera);
      onMovePortalCenter(dragState.id, { x: next.x, z: next.z });
    }
  }

  const northAngle = northViewportAngleDeg(camera);
  return (
    <section className="hybrid-spatial-viewport" data-camera={`${camera.yawDeg.toFixed(1)},${camera.pitchDeg.toFixed(1)},${camera.zoom.toFixed(2)},${camera.panX.toFixed(1)},${camera.panY.toFixed(1)}`} data-testid="hybrid-spatial-viewport">
      <header className="hybrid-viewport-header">
        <div><p className="panel-kicker">3D viewport</p><h3>Orbit · select · place</h3></div>
        <div className="hybrid-view-buttons" aria-label="Camera views">
          {onTogglePaths ? <button aria-pressed={pathsVisible} onClick={onTogglePaths} type="button">Paths</button> : null}
          {onToggleShowAllPaths ? <button aria-pressed={showAllPaths} onClick={onToggleShowAllPaths} type="button">Show all paths</button> : null}
          {onToggleCeiling ? <button aria-pressed={ceilingVisible} onClick={onToggleCeiling} type="button">Ceiling</button> : null}
          <button onClick={() => onCameraChange({ yawDeg: 0, pitchDeg: 78, zoom: 1, panX: 0, panY: 0 })} type="button">Top</button>
          <button onClick={() => onCameraChange({ yawDeg: 0, pitchDeg: 28, zoom: 1, panX: 0, panY: 0 })} type="button">Front</button>
          <button onClick={() => onCameraChange(DEFAULT_VIEWPORT_CAMERA)} type="button">Home</button>
          <button onClick={() => onCameraChange(frameViewportPoints(framePoints, camera))} type="button">Frame All</button>
        </div>
      </header>
      <p className="hybrid-viewport-help" id="hybrid-viewport-help">
        <span>Amber: listener</span><span>Cyan: source / Portal</span><span>Coral: wall</span>
        <span>Drag: X/Z</span><span>Shift-object: Y</span><span>MMB / Shift-empty: pan</span><span>Wheel: zoom</span><span>North: +Z</span>
      </p>
      <svg aria-describedby="hybrid-viewport-help" aria-label="Interactive 3D acoustic scene viewport" className="hybrid-viewport-svg" data-panning={dragState?.kind === "pan" ? "true" : "false"} data-placing-wall={onWallPlacementPoint ? "true" : "false"} onLostPointerCapture={() => { if (dragState?.kind === "pan") setDragState(null); }} onPointerCancel={endDrag} onPointerDownCapture={(event) => { if (event.button === 1) beginPan(event); }} onPointerMove={moveView} onPointerUp={endDrag} preserveAspectRatio="xMidYMid meet" ref={svgRef} role="group" viewBox="0 0 1200 720">
        <defs>
          <linearGradient id="hybrid-viewport-floor" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#173539" stopOpacity="0.56" /><stop offset="1" stopColor="#0b1417" stopOpacity="0.94" /></linearGradient>
          <filter id="hybrid-viewport-glow"><feGaussianBlur result="blur" stdDeviation="6" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <rect className="hybrid-viewport-orbit-surface" data-testid="hybrid-wall-placement-surface" height="720" onPointerCancel={endDrag} onPointerDown={beginOrbit} onPointerMove={moveView} onPointerUp={endDrag} width="1200" x="0" y="0" />
        <polygon className="hybrid-viewport-floor" points={points(projected.floor)} />
        {wallPlacementFirst ? (() => {
          const point = projectViewportPoint({ x: wallPlacementFirst.x, y: 0, z: wallPlacementFirst.z }, camera);
          return <g aria-label="First wall point" className="wall-placement-point" transform={`translate(${point.x} ${point.y})`}><circle r="10" /><text y="-16">A</text></g>;
        })() : null}
        {ceilingVisible ? <polygon className="hybrid-viewport-ceiling" points={points(projected.ceiling)} /> : null}
        {projected.floor.map((point, index) => <line className="hybrid-viewport-room-edge" key={`edge-${index}`} x1={point.x} x2={projected.ceiling[index]!.x} y1={point.y} y2={projected.ceiling[index]!.y} />)}
        <polyline className="hybrid-viewport-room-edge" fill="none" points={points([...projected.floor, projected.floor[0]!])} />
        {ceilingVisible ? <polyline className="hybrid-viewport-ceiling-edge" fill="none" points={points([...projected.ceiling, projected.ceiling[0]!])} /> : null}
        <g data-testid="hybrid-geometry-surface-layer">
          {geometrySurfaces.map((surface) => <polygon
            aria-hidden="true"
            className={surface.kind === "wall"
              ? `hybrid-viewport-wall-panel${surface.closed ? " is-closed" : ""}${surface.selected ? " is-selected" : ""}`
              : `hybrid-viewport-primitive-panel${surface.selected ? " is-selected" : ""}`}
            data-surface-depth={surface.depth}
            data-surface-kind={surface.kind}
            key={surface.key}
            onClick={surface.kind === "wall" ? (event) => {
              event.stopPropagation();
              onSelectTarget({ type: "wall", id: surface.ownerId });
            } : undefined}
            points={points(surface.points)}
          />)}
        </g>
        {projected.primitives.map(({ primitive, panels }) => {
          const selected = selectedTarget?.type === "primitive" && selectedTarget.id === primitive.id;
          return <g
            aria-label={`Drag ${primitive.name} in 3D scene`}
            aria-pressed={selected}
            className={`hybrid-viewport-primitive hybrid-viewport-primitive-${primitive.kind}${selected ? " is-selected" : ""}`}
            data-testid={`hybrid-primitive-${primitive.id}`}
            key={primitive.id}
            onPointerCancel={endDrag}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelectTarget({ type: "primitive", id: primitive.id });
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragState({ kind: "primitive", id: primitive.id, pointer: clientToViewport(event), position: primitive.position });
            }}
            onPointerMove={dragPrimitive}
            onPointerUp={endDrag}
            role="button"
            tabIndex={0}
          >
            {panels.map((panel, index) => <polygon className="hybrid-viewport-primitive-hit-panel" key={`${primitive.id}-${index}`} points={points(panel.points)} />)}
            <text x={projectViewportPoint(primitive.position, camera).x} y={projectViewportPoint(primitive.position, camera).y - 18} textAnchor="middle">{primitive.name}</text>
          </g>;
        })}
        {projected.walls.flatMap(({ portalOutlines }) => portalOutlines.map(({ portal, points: outline, center }) => (
          <g key={portal.id}>
            <polyline className="hybrid-viewport-portal" fill="none" points={points(outline)} />
            <g aria-label={`Drag ${portal.id} along its wall`} className={`hybrid-viewport-portal-handle${selectedTarget?.type === "portal" && selectedTarget.id === portal.id ? " is-selected" : ""}`} data-testid={`hybrid-viewport-portal-${portal.id}`} onPointerCancel={endDrag} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onSelectTarget({ type: "portal", id: portal.id }); event.currentTarget.setPointerCapture(event.pointerId); setDragState({ kind: "portal", id: portal.id, heightM: (portal.bottomM + portal.topM) / 2 }); }} onPointerMove={dragGeometry} onPointerUp={endDrag} role="button" tabIndex={0} transform={`translate(${center.x} ${center.y})`}>
              <circle className="hybrid-viewport-portal-handle-hit" r="30" /><path className="hybrid-viewport-portal-handle-core" d="M-10 10 L-10 -10 L10 -10 L10 10 Z" /><text className="hybrid-viewport-partition-handle-label" textAnchor="middle" x="0" y="-22">Portal</text>
            </g>
          </g>
        )))}
        {projected.walls.flatMap(({ wall, endpointA, endpointB }) => (["a", "b"] as const).map((endpoint) => {
          if (selectedTarget?.type !== "wall" || selectedTarget.id !== wall.id) return null;
          const screen = endpoint === "a" ? endpointA : endpointB;
          const position = endpoint === "a" ? wall.a : wall.b;
          return <g aria-label={`Drag wall endpoint ${endpoint.toUpperCase()} in 3D scene`} className="hybrid-viewport-partition-handle is-selected" data-position={`${position.x.toFixed(1)},${position.z.toFixed(1)}`} data-testid={`hybrid-viewport-partition-${endpoint}`} key={`${wall.id}-${endpoint}`} onPointerCancel={endDrag} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onSelectTarget({ type: "wall", id: wall.id, endpoint }); event.currentTarget.setPointerCapture(event.pointerId); setDragState({ kind: "wall", id: wall.id, endpoint }); }} onPointerMove={dragGeometry} onPointerUp={endDrag} role="button" tabIndex={0} transform={`translate(${screen.x} ${screen.y})`}><circle className="hybrid-viewport-partition-handle-hit" r="28" /><rect className="hybrid-viewport-partition-handle-core" height="14" width="14" x="-7" y="-7" /><text className="hybrid-viewport-partition-handle-label" textAnchor="middle" x="0" y="-19">{endpoint.toUpperCase()}</text></g>;
        }))}
        {pathsVisible ? <HybridPathOverlay camera={camera} paths={paths} xRay={ceilingVisible} /> : null}
        {objects.map((object) => {
          const screen = projectViewportPoint(object.position, camera);
          const selected = selectedTarget?.type === "object" && selectedTarget.id === object.id;
          const testId = object.kind === "listener" ? "hybrid-viewport-listener" : `hybrid-viewport-source-${object.id}`;
          return <g aria-label={`Drag ${object.label} in 3D scene; X ${object.position.x.toFixed(1)} m, Y ${object.position.y.toFixed(1)} m, Z ${object.position.z.toFixed(1)} m`} className={`hybrid-viewport-object ${object.kind === "listener" ? "hybrid-viewport-listener" : "hybrid-viewport-source"}${selected ? " is-selected" : ""}`} data-position={`${object.position.x.toFixed(1)},${object.position.y.toFixed(1)},${object.position.z.toFixed(1)}`} data-testid={testId} key={object.id} onPointerCancel={endDrag} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onSelectTarget({ type: "object", id: object.id }); event.currentTarget.setPointerCapture(event.pointerId); setDragState({ kind: "object", id: object.id, pointer: clientToViewport(event), position: object.position }); }} onPointerMove={dragObject} onPointerUp={endDrag} role="button" tabIndex={0} transform={`translate(${screen.x} ${screen.y})`}>
            <circle className="hybrid-viewport-object-hit" r="34" />
            {object.kind === "listener" ? <><circle className="hybrid-viewport-listener-head" cy="-6" r="14" /><path className="hybrid-viewport-listener-body" d="M-19 24 C-17 7 17 7 19 24 Z" /></> : <><circle className="hybrid-viewport-source-core" r="15" /><path className="hybrid-viewport-source-glyph" d="M-5 -7 L8 0 L-5 7 Z" /></>}
            <text className="hybrid-viewport-object-label" textAnchor="middle" x="0" y="-31">{object.label}</text><text className="hybrid-viewport-object-value" textAnchor="middle" x="0" y="43">X {object.position.x.toFixed(1)} · Y {object.position.y.toFixed(1)} · Z {object.position.z.toFixed(1)}</text>
          </g>;
        })}
        <g aria-label="XYZ coordinate axes" className="hybrid-viewport-axis" transform="translate(94 610)"><circle className="hybrid-viewport-axis-origin" r="4" /><line className="hybrid-viewport-axis-x" x1="0" x2={axis.x.x} y1="0" y2={axis.x.y} /><line className="hybrid-viewport-axis-y" x1="0" x2={axis.y.x} y1="0" y2={axis.y.y} /><line className="hybrid-viewport-axis-z" x1="0" x2={axis.z.x} y1="0" y2={axis.z.y} /><text className="hybrid-viewport-axis-x" x={axis.x.x * 1.18} y={axis.x.y * 1.18}>X</text><text className="hybrid-viewport-axis-y" x={axis.y.x * 1.18} y={axis.y.y * 1.18}>Y</text><text className="hybrid-viewport-axis-z" x={axis.z.x * 1.18} y={axis.z.y * 1.18}>Z</text></g>
        <g aria-label="Compass; north is positive Z" className="hybrid-viewport-compass" transform="translate(1090 88)"><circle r="42" /><g transform={`rotate(${northAngle})`}><path d="M0 -33 L8 7 L0 0 L-8 7 Z" /></g><text textAnchor="middle" x="0" y="-51">N</text><text textAnchor="middle" x="0" y="66">+Z north</text></g>
      </svg>
    </section>
  );
}
