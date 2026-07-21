export type ViewportVec3 = Readonly<{ x: number; y: number; z: number }>;

export type ViewportCamera = Readonly<{
  yawDeg: number;
  pitchDeg: number;
  zoom: number;
  panX: number;
  panY: number;
}>;

export type ScreenPoint = Readonly<{ x: number; y: number }>;

export const VIEWPORT_CENTER: ScreenPoint = Object.freeze({ x: 600, y: 360 });
export const VIEWPORT_METERS_TO_PIXELS = 48;
export const DEFAULT_VIEWPORT_CAMERA: ViewportCamera = Object.freeze({
  yawDeg: -38,
  pitchDeg: 34,
  zoom: 1,
  panX: 0,
  panY: 0,
});

const MIN_PITCH_DEG = -85;
const MAX_PITCH_DEG = 85;
export const MIN_VIEWPORT_ZOOM = 0.12;
export const MAX_VIEWPORT_ZOOM = 4;

function radians(degrees: number): number {
  return degrees * Math.PI / 180;
}

export function clampViewportCamera(camera: ViewportCamera): ViewportCamera {
  if (
    !Number.isFinite(camera.yawDeg) ||
    !Number.isFinite(camera.pitchDeg) ||
    !Number.isFinite(camera.zoom) ||
    !Number.isFinite(camera.panX) ||
    !Number.isFinite(camera.panY)
  ) {
    throw new Error("Viewport camera values must be finite.");
  }
  return {
    yawDeg: ((camera.yawDeg % 360) + 360) % 360,
    pitchDeg: Math.min(MAX_PITCH_DEG, Math.max(MIN_PITCH_DEG, camera.pitchDeg)),
    zoom: Math.min(MAX_VIEWPORT_ZOOM, Math.max(MIN_VIEWPORT_ZOOM, camera.zoom)),
    panX: camera.panX,
    panY: camera.panY,
  };
}

function relativeToRoomCenter(point: ViewportVec3): ViewportVec3 {
  return { x: point.x - 6, y: point.y, z: point.z - 4 };
}

function viewportScale(camera: ViewportCamera): number {
  return VIEWPORT_METERS_TO_PIXELS * camera.zoom;
}

/** Orthographic 3D projection used only by the Lab camera, never by the acoustic solver. */
export function projectViewportPoint(point: ViewportVec3, camera: ViewportCamera): ScreenPoint {
  const normalizedCamera = clampViewportCamera(camera);
  const relative = relativeToRoomCenter(point);
  const yaw = radians(normalizedCamera.yawDeg);
  const pitch = radians(normalizedCamera.pitchDeg);
  const yawX = Math.cos(yaw) * relative.x + Math.sin(yaw) * relative.z;
  const yawZ = -Math.sin(yaw) * relative.x + Math.cos(yaw) * relative.z;
  const projectedY = Math.cos(pitch) * relative.y - Math.sin(pitch) * yawZ;
  const scale = viewportScale(normalizedCamera);
  return {
    x: VIEWPORT_CENTER.x + yawX * scale + normalizedCamera.panX,
    y: VIEWPORT_CENTER.y - projectedY * scale + normalizedCamera.panY,
  };
}

/** Camera-space depth for far-to-near SVG painter ordering. Larger values are nearer. */
export function projectViewportDepth(point: ViewportVec3, camera: ViewportCamera): number {
  const normalizedCamera = clampViewportCamera(camera);
  const relative = relativeToRoomCenter(point);
  const yaw = radians(normalizedCamera.yawDeg);
  const pitch = radians(normalizedCamera.pitchDeg);
  const yawZ = -Math.sin(yaw) * relative.x + Math.cos(yaw) * relative.z;
  return Math.sin(pitch) * relative.y + Math.cos(pitch) * yawZ;
}

/** Inverse ground-plane projection for direct object dragging at a fixed elevation. */
export function unprojectViewportPointAtHeight(
  screen: ScreenPoint,
  heightM: number,
  camera: ViewportCamera,
): ViewportVec3 {
  if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y) || !Number.isFinite(heightM)) {
    throw new Error("Viewport drag input must be finite.");
  }
  const normalizedCamera = clampViewportCamera(camera);
  const yaw = radians(normalizedCamera.yawDeg);
  const pitch = radians(normalizedCamera.pitchDeg);
  const scale = viewportScale(normalizedCamera);
  const u = (screen.x - VIEWPORT_CENTER.x - normalizedCamera.panX) / scale;
  const vertical = -(screen.y - VIEWPORT_CENTER.y - normalizedCamera.panY) / scale;
  const residual = vertical - Math.cos(pitch) * heightM;
  const sinePitch = Math.sin(pitch);
  // At a horizon-level view the ground plane is nearly edge-on. Keep the drag inverse finite while
  // allowing the camera itself to orbit continuously through that presentation angle.
  const stableSinePitch = Math.abs(sinePitch) < Math.sin(radians(5))
    ? Math.sign(sinePitch || 1) * Math.sin(radians(5))
    : sinePitch;
  const relativeX = Math.cos(yaw) * u + Math.sin(yaw) * residual / stableSinePitch;
  const relativeZ = Math.sin(yaw) * u - Math.cos(yaw) * residual / stableSinePitch;
  return { x: relativeX + 6, y: heightM, z: relativeZ + 4 };
}

export function northViewportAngleDeg(camera: ViewportCamera): number {
  const center = projectViewportPoint({ x: 6, y: 0, z: 4 }, camera);
  const north = projectViewportPoint({ x: 6, y: 0, z: 5 }, camera);
  return Math.atan2(north.y - center.y, north.x - center.x) * 180 / Math.PI + 90;
}

export function zoomViewportCameraAtPoint(
  camera: ViewportCamera,
  anchor: ScreenPoint,
  targetZoom: number,
): ViewportCamera {
  if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) || !Number.isFinite(targetZoom)) {
    throw new Error("Viewport zoom input must be finite.");
  }
  const current = clampViewportCamera(camera);
  const zoom = Math.min(MAX_VIEWPORT_ZOOM, Math.max(MIN_VIEWPORT_ZOOM, targetZoom));
  const ratio = zoom / current.zoom;
  return clampViewportCamera({
    ...current,
    zoom,
    panX: anchor.x - VIEWPORT_CENTER.x - (anchor.x - VIEWPORT_CENTER.x - current.panX) * ratio,
    panY: anchor.y - VIEWPORT_CENTER.y - (anchor.y - VIEWPORT_CENTER.y - current.panY) * ratio,
  });
}

export function frameViewportPoints(
  points: readonly ViewportVec3[],
  camera: ViewportCamera,
  padding = 56,
): ViewportCamera {
  if (points.length === 0 || !Number.isFinite(padding) || padding < 0) {
    return clampViewportCamera(camera);
  }
  const baseCamera = clampViewportCamera({ ...camera, zoom: 1, panX: 0, panY: 0 });
  const projected = points.map((point) => projectViewportPoint(point, baseCamera));
  const minX = Math.min(...projected.map(({ x }) => x));
  const maxX = Math.max(...projected.map(({ x }) => x));
  const minY = Math.min(...projected.map(({ y }) => y));
  const maxY = Math.max(...projected.map(({ y }) => y));
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const zoom = Math.min(
    MAX_VIEWPORT_ZOOM,
    Math.max(
      MIN_VIEWPORT_ZOOM,
      Math.min(
        Math.max(1, VIEWPORT_CENTER.x * 2 - padding * 2) / width,
        Math.max(1, VIEWPORT_CENTER.y * 2 - padding * 2) / height,
      ),
    ),
  );
  const boundsCenterX = (minX + maxX) / 2;
  const boundsCenterY = (minY + maxY) / 2;
  return clampViewportCamera({
    ...baseCamera,
    zoom,
    panX: -(boundsCenterX - VIEWPORT_CENTER.x) * zoom,
    panY: -(boundsCenterY - VIEWPORT_CENTER.y) * zoom,
  });
}
