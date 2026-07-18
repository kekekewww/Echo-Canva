export type ViewportVec3 = Readonly<{ x: number; y: number; z: number }>;

export type ViewportCamera = Readonly<{
  yawDeg: number;
  pitchDeg: number;
  zoom: number;
}>;

export type ScreenPoint = Readonly<{ x: number; y: number }>;

export const VIEWPORT_CENTER: ScreenPoint = Object.freeze({ x: 600, y: 360 });
export const VIEWPORT_METERS_TO_PIXELS = 48;
export const DEFAULT_VIEWPORT_CAMERA: ViewportCamera = Object.freeze({
  yawDeg: -38,
  pitchDeg: 34,
  zoom: 1,
});

const MIN_PITCH_DEG = 12;
const MAX_PITCH_DEG = 78;
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 1.7;

function radians(degrees: number): number {
  return degrees * Math.PI / 180;
}

export function clampViewportCamera(camera: ViewportCamera): ViewportCamera {
  if (!Number.isFinite(camera.yawDeg) || !Number.isFinite(camera.pitchDeg) || !Number.isFinite(camera.zoom)) {
    throw new Error("Viewport camera values must be finite.");
  }
  return {
    yawDeg: ((camera.yawDeg % 360) + 360) % 360,
    pitchDeg: Math.min(MAX_PITCH_DEG, Math.max(MIN_PITCH_DEG, camera.pitchDeg)),
    zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom)),
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
    x: VIEWPORT_CENTER.x + yawX * scale,
    y: VIEWPORT_CENTER.y - projectedY * scale,
  };
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
  const u = (screen.x - VIEWPORT_CENTER.x) / scale;
  const vertical = -(screen.y - VIEWPORT_CENTER.y) / scale;
  const residual = vertical - Math.cos(pitch) * heightM;
  const sinePitch = Math.sin(pitch);
  const relativeX = Math.cos(yaw) * u + Math.sin(yaw) * residual / sinePitch;
  const relativeZ = Math.sin(yaw) * u - Math.cos(yaw) * residual / sinePitch;
  return { x: relativeX + 6, y: heightM, z: relativeZ + 4 };
}

export function northViewportAngleDeg(camera: ViewportCamera): number {
  const center = projectViewportPoint({ x: 6, y: 0, z: 4 }, camera);
  const north = projectViewportPoint({ x: 6, y: 0, z: 5 }, camera);
  return Math.atan2(north.y - center.y, north.x - center.x) * 180 / Math.PI + 90;
}
