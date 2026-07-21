import { svgToWorld, worldToSvg, type Rect } from "@/domain/editor/coordinates";
import type { Vec2 } from "@/domain/scene/types";
import type { WorkspaceCamera } from "@/domain/workspace/types";

export const MIN_CLASSIC_ZOOM = 0.12;
export const MAX_CLASSIC_ZOOM = 6;
export const CLASSIC_SVG_VIEW_BOX: Rect = Object.freeze({ minX: 0, minY: 0, width: 900, height: 600 });
export const CLASSIC_VIEWPORT: Rect = Object.freeze({ minX: 54, minY: 36, width: 792, height: 528 });

function assertFiniteCamera(camera: WorkspaceCamera): void {
  if (
    !Number.isFinite(camera.yawDeg) ||
    !Number.isFinite(camera.pitchDeg) ||
    !Number.isFinite(camera.zoom) ||
    !Number.isFinite(camera.panX) ||
    !Number.isFinite(camera.panY)
  ) {
    throw new Error("Classic viewport camera values must be finite.");
  }
}

function viewportCenter(viewport: Rect): Vec2 {
  return {
    x: viewport.minX + viewport.width / 2,
    y: viewport.minY + viewport.height / 2,
  };
}

export function clampClassicCamera(camera: WorkspaceCamera): WorkspaceCamera {
  assertFiniteCamera(camera);
  return {
    ...camera,
    zoom: Math.min(MAX_CLASSIC_ZOOM, Math.max(MIN_CLASSIC_ZOOM, camera.zoom)),
  };
}

export function projectClassicPoint(
  point: Readonly<Vec2>,
  worldBounds: Rect,
  viewport: Rect,
  camera: WorkspaceCamera,
): Vec2 {
  const normalized = clampClassicCamera(camera);
  const base = worldToSvg(point, worldBounds, viewport);
  const center = viewportCenter(viewport);
  return {
    x: center.x + (base.x - center.x) * normalized.zoom + normalized.panX,
    y: center.y + (base.y - center.y) * normalized.zoom + normalized.panY,
  };
}

export function unprojectClassicPoint(
  point: Readonly<Vec2>,
  worldBounds: Rect,
  viewport: Rect,
  camera: WorkspaceCamera,
): Vec2 {
  const normalized = clampClassicCamera(camera);
  const center = viewportCenter(viewport);
  return svgToWorld({
    x: center.x + (point.x - center.x - normalized.panX) / normalized.zoom,
    y: center.y + (point.y - center.y - normalized.panY) / normalized.zoom,
  }, worldBounds, viewport);
}

export function zoomClassicCameraAtPoint(
  camera: WorkspaceCamera,
  anchor: Readonly<Vec2>,
  viewport: Rect,
  targetZoom: number,
): WorkspaceCamera {
  if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) || !Number.isFinite(targetZoom)) {
    throw new Error("Classic viewport zoom input must be finite.");
  }
  const current = clampClassicCamera(camera);
  const center = viewportCenter(viewport);
  const zoom = Math.min(MAX_CLASSIC_ZOOM, Math.max(MIN_CLASSIC_ZOOM, targetZoom));
  const ratio = zoom / current.zoom;
  return clampClassicCamera({
    ...current,
    zoom,
    panX: anchor.x - center.x - (anchor.x - center.x - current.panX) * ratio,
    panY: anchor.y - center.y - (anchor.y - center.y - current.panY) * ratio,
  });
}

export function frameClassicBounds(
  points: readonly Readonly<Vec2>[],
  worldBounds: Rect,
  viewport: Rect,
  camera: WorkspaceCamera,
  padding = 28,
): WorkspaceCamera {
  if (points.length === 0 || !Number.isFinite(padding) || padding < 0) {
    return clampClassicCamera(camera);
  }
  const baseCamera = clampClassicCamera({ ...camera, zoom: 1, panX: 0, panY: 0 });
  const projected = points.map((point) => projectClassicPoint(point, worldBounds, viewport, baseCamera));
  const minX = Math.min(...projected.map(({ x }) => x));
  const maxX = Math.max(...projected.map(({ x }) => x));
  const minY = Math.min(...projected.map(({ y }) => y));
  const maxY = Math.max(...projected.map(({ y }) => y));
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const zoom = Math.min(
    MAX_CLASSIC_ZOOM,
    Math.max(
      MIN_CLASSIC_ZOOM,
      Math.min(
        Math.max(1, viewport.width - padding * 2) / width,
        Math.max(1, viewport.height - padding * 2) / height,
      ),
    ),
  );
  const center = viewportCenter(viewport);
  const boundsCenterX = (minX + maxX) / 2;
  const boundsCenterY = (minY + maxY) / 2;
  return clampClassicCamera({
    ...baseCamera,
    zoom,
    panX: -(boundsCenterX - center.x) * zoom,
    panY: -(boundsCenterY - center.y) * zoom,
  });
}
