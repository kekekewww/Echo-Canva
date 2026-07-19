"use client";

import { HybridPathOverlay, type HybridDisplayPath } from "@/components/workspace/HybridPathOverlay";
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

export type HybridViewportSelection =
  | Readonly<{ type: "object"; id: string }>
  | Readonly<{ type: "wall"; id: string; endpoint?: "a" | "b" }>
  | Readonly<{ type: "portal"; id: string }>
  | null;

type Props = Readonly<{
  roomDimensions: Readonly<{ widthM: number; depthM: number; heightM: number }>;
  ceilingVisible?: boolean;
  objects: readonly HybridViewportObject[];
  walls: readonly HybridViewportWall[];
  paths?: readonly HybridDisplayPath[];
  pathsVisible?: boolean;
  showAllPaths?: boolean;
  camera: ViewportCamera;
  selectedTarget: HybridViewportSelection;
  onMoveObject: (id: string, position: ViewportVec3) => void;
  onMoveWallEndpoint: (id: string, endpoint: "a" | "b", position: PlanPosition) => void;
  onMovePortalCenter: (id: string, center: PlanPosition) => void;
  onSelectTarget: (target: NonNullable<HybridViewportSelection>) => void;
  onTogglePaths?: () => void;
  onToggleShowAllPaths?: () => void;
  onToggleCeiling?: () => void;
  onCameraChange: (camera: ViewportCamera) => void;
}>;

type DragState =
  | Readonly<{ kind: "orbit"; pointer: ScreenPoint; camera: ViewportCamera }>
  | Readonly<{ kind: "object"; id: string; pointer: ScreenPoint; position: ViewportVec3 }>
  | Readonly<{ kind: "wall"; id: string; endpoint: "a" | "b" }>
  | Readonly<{ kind: "portal"; id: string; heightM: number }>;

type ProjectedWall = Readonly<{
  wall: HybridViewportWall;
  panels: readonly (readonly ScreenPoint[])[];
  portalOutlines: readonly Readonly<{ portal: HybridViewportPortal; points: readonly ScreenPoint[]; center: ScreenPoint }>[];
  endpointA: ScreenPoint;
  endpointB: ScreenPoint;
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

  const panel = (start: number, end: number, bottom: number, top: number, offset: number) => {
    const a = wallPoint(wall, start, offset);
    const b = wallPoint(wall, end, offset);
    return [
      projectViewportPoint({ x: a.x, y: bottom, z: a.z }, camera),
      projectViewportPoint({ x: a.x, y: top, z: a.z }, camera),
      projectViewportPoint({ x: b.x, y: top, z: b.z }, camera),
      projectViewportPoint({ x: b.x, y: bottom, z: b.z }, camera),
    ];
  };
  const half = wall.thicknessM / 2;
  const panels = rectangles.flatMap((rectangle) => [
    panel(rectangle.start, rectangle.end, rectangle.bottom, rectangle.top, -half),
    panel(rectangle.start, rectangle.end, rectangle.bottom, rectangle.top, half),
  ]);
  panels.push(panel(0, 0, wall.bottomM, wall.topM, -half).slice(0, 2).concat(panel(0, 0, wall.bottomM, wall.topM, half).slice(0, 2).reverse()));
  panels.push(panel(length, length, wall.bottomM, wall.topM, -half).slice(0, 2).concat(panel(length, length, wall.bottomM, wall.topM, half).slice(0, 2).reverse()));

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
  paths = [],
  pathsVisible = true,
  showAllPaths = false,
  selectedTarget,
  onMoveObject,
  onMoveWallEndpoint,
  onMovePortalCenter,
  onSelectTarget,
  onTogglePaths,
  onToggleShowAllPaths,
  onToggleCeiling,
  camera,
  onCameraChange,
}: Props) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const viewportRef = useRef<HTMLElement>(null);
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
  }), [camera, room, walls]);
  const axis = useMemo(() => {
    const origin = projectViewportPoint({ x: room.widthM / 2, y: 0, z: room.depthM / 2 }, camera);
    return {
      x: lineDelta(origin, projectViewportPoint({ x: room.widthM / 2 + 1, y: 0, z: room.depthM / 2 }, camera)),
      y: lineDelta(origin, projectViewportPoint({ x: room.widthM / 2, y: 1, z: room.depthM / 2 }, camera)),
      z: lineDelta(origin, projectViewportPoint({ x: room.widthM / 2, y: 0, z: room.depthM / 2 + 1 }, camera)),
    };
  }, [camera, room.depthM, room.widthM]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const zoomViewport = (event: WheelEvent): void => {
      event.preventDefault();
      onCameraChange(clampViewportCamera({ ...camera, zoom: camera.zoom + (event.deltaY < 0 ? 0.08 : -0.08) }));
    };
    viewport.addEventListener("wheel", zoomViewport, { passive: false });
    return () => viewport.removeEventListener("wheel", zoomViewport);
  }, [camera, onCameraChange]);

  function clientToViewport(event: ReactPointerEvent<SVGElement>): ScreenPoint {
    const svg = event.currentTarget.ownerSVGElement ?? event.currentTarget;
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

  function beginOrbit(event: ReactPointerEvent<SVGRectElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({ kind: "orbit", pointer: clientToViewport(event), camera });
  }

  function orbit(event: ReactPointerEvent<SVGRectElement>): void {
    if (dragState?.kind !== "orbit" || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const next = clientToViewport(event);
    onCameraChange(clampViewportCamera({
      yawDeg: dragState.camera.yawDeg + (next.x - dragState.pointer.x) * 0.35,
      pitchDeg: dragState.camera.pitchDeg - (next.y - dragState.pointer.y) * 0.22,
      zoom: dragState.camera.zoom,
    }));
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
    <section className="hybrid-spatial-viewport" data-camera={`${camera.yawDeg.toFixed(1)},${camera.pitchDeg.toFixed(1)},${camera.zoom.toFixed(2)}`} data-testid="hybrid-spatial-viewport" ref={viewportRef}>
      <header className="hybrid-viewport-header">
        <div><p className="panel-kicker">3D viewport</p><h3>Orbit · select · place</h3></div>
        <div className="hybrid-view-buttons" aria-label="Camera views">
          {onTogglePaths ? <button aria-pressed={pathsVisible} onClick={onTogglePaths} type="button">Paths</button> : null}
          {onToggleShowAllPaths ? <button aria-pressed={showAllPaths} onClick={onToggleShowAllPaths} type="button">All paths</button> : null}
          {onToggleCeiling ? <button aria-pressed={ceilingVisible} onClick={onToggleCeiling} type="button">Ceiling</button> : null}
          <button onClick={() => onCameraChange({ yawDeg: 0, pitchDeg: 78, zoom: 1 })} type="button">Top</button>
          <button onClick={() => onCameraChange({ yawDeg: 0, pitchDeg: 28, zoom: 1 })} type="button">Front</button>
          <button onClick={() => onCameraChange(DEFAULT_VIEWPORT_CAMERA)} type="button">Reset view</button>
        </div>
      </header>
      <p className="hybrid-viewport-help" id="hybrid-viewport-help">
        <span>Amber: listener</span><span>Cyan: source / Portal</span><span>Coral: wall</span>
        <span>Drag: X/Z</span><span>Shift-drag: Y</span><span>Wheel: zoom</span><span>North: +Z</span>
      </p>
      <svg aria-describedby="hybrid-viewport-help" aria-label="Interactive 3D acoustic scene viewport" className="hybrid-viewport-svg" preserveAspectRatio="xMidYMid meet" role="group" viewBox="0 0 1200 720">
        <defs>
          <linearGradient id="hybrid-viewport-floor" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#173539" stopOpacity="0.56" /><stop offset="1" stopColor="#0b1417" stopOpacity="0.94" /></linearGradient>
          <filter id="hybrid-viewport-glow"><feGaussianBlur result="blur" stdDeviation="6" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <rect className="hybrid-viewport-orbit-surface" height="720" onPointerCancel={endDrag} onPointerDown={beginOrbit} onPointerMove={orbit} onPointerUp={endDrag} width="1200" x="0" y="0" />
        <polygon className="hybrid-viewport-floor" points={points(projected.floor)} />
        {ceilingVisible ? <polygon className="hybrid-viewport-ceiling" points={points(projected.ceiling)} /> : null}
        {projected.floor.map((point, index) => <line className="hybrid-viewport-room-edge" key={`edge-${index}`} x1={point.x} x2={projected.ceiling[index]!.x} y1={point.y} y2={projected.ceiling[index]!.y} />)}
        <polyline className="hybrid-viewport-room-edge" fill="none" points={points([...projected.floor, projected.floor[0]!])} />
        {ceilingVisible ? <polyline className="hybrid-viewport-ceiling-edge" fill="none" points={points([...projected.ceiling, projected.ceiling[0]!])} /> : null}
        {projected.walls.flatMap(({ wall, panels }) => panels.map((panel, index) => (
          <polygon aria-label={`Select ${wall.label}`} className={`hybrid-viewport-wall-panel${wall.portals.some(({ open }) => open) ? "" : " is-closed"}`} key={`${wall.id}-panel-${index}`} onClick={(event) => { event.stopPropagation(); onSelectTarget({ type: "wall", id: wall.id }); }} points={points(panel)} role="button" tabIndex={0} />
        )))}
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
        {pathsVisible ? <HybridPathOverlay camera={camera} paths={paths} /> : null}
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
