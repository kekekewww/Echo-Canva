"use client";

import { useEffect, useMemo, useState } from "react";

import {
  bindHybridPoses,
  compileHybridStaticGeometry,
} from "@/acoustics/hybrid3d/compile";
import { renderHybridEarlyReflections } from "@/acoustics/hybrid3d/reflection-rendering";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import { createSceneDocumentV2 } from "@/domain/scene-document/serialize";
import type { SceneSpec } from "@/domain/scene/types";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { useHybridDirectPaths } from "@/hooks/useHybridDirectPaths";

type PlanPosition = Readonly<{ x: number; z: number }>;

const PLAN_X_RANGE = { min: 0.2, max: 11.8 };
const PLAN_Z_RANGE = { min: 0.2, max: 7.8 };

function format(value: number, digits = 2): string {
  return value.toFixed(digits);
}

function planPositionLabel(name: string, position: PlanPosition): string {
  return `${name} plan position: X ${format(position.x)} m, Z ${format(position.z)} m`;
}

export function HybridDirectLab() {
  const [listenerHeightM, setListenerHeightM] = useState(1.5);
  const [radioHeightM, setRadioHeightM] = useState(1.3);
  const [rainHeightM, setRainHeightM] = useState(1.5);
  const [listenerPlanPosition, setListenerPlanPosition] = useState<PlanPosition>({ x: 3, z: 4 });
  const [radioPlanPosition, setRadioPlanPosition] = useState<PlanPosition>({ x: 9, z: 4 });
  const [rainPlanPosition, setRainPlanPosition] = useState<PlanPosition>({ x: 10, z: 1.5 });
  const [portalOpen, setPortalOpen] = useState(true);
  const [reflectionsEnabled, setReflectionsEnabled] = useState(true);
  const baseScene = useMemo<SceneSpec>(() => {
    const scene: SceneSpec = structuredClone(CONCRETE_PARTITION_PRESET);
    scene.portals[0]!.open = portalOpen;
    scene.listener.position = { x: listenerPlanPosition.x, y: listenerPlanPosition.z };
    for (const source of scene.sources) {
      const position = source.id === "radio" ? radioPlanPosition : rainPlanPosition;
      source.position = { x: position.x, y: position.z };
    }
    return scene;
  }, [listenerPlanPosition, portalOpen, radioPlanPosition, rainPlanPosition]);
  const document = useMemo(
    () => createSceneDocumentV2(baseScene, {
      spatial3d: {
        coordinateSystem: "x-right-y-up-z-forward",
        floorElevationM: 0,
        listenerHeightM,
        sourceHeightsM: { radio: radioHeightM, rain: rainHeightM },
      },
    }),
    [baseScene, listenerHeightM, radioHeightM, rainHeightM],
  );
  const staticDocument = useMemo(
    () => createSceneDocumentV2(baseScene, {
      spatial3d: {
        coordinateSystem: "x-right-y-up-z-forward",
        floorElevationM: 0,
        listenerHeightM: 1.5,
        sourceHeightsM: { radio: 1.5, rain: 1.5 },
      },
    }),
    [baseScene],
  );
  const staticGeometry = useMemo(() => compileHybridStaticGeometry(staticDocument), [staticDocument]);
  const geometry = useMemo(() => bindHybridPoses(staticGeometry, document), [document, staticGeometry]);
  const direct = useHybridDirectPaths(document, geometry);
  const paths = direct.frame.paths;
  const hybridReflectionState = useMemo(() => ({
    listenerPosition: geometry.listenerPosition,
    reflectionsBySource: Object.fromEntries(baseScene.sources.map((source) => [
      source.id,
      reflectionsEnabled ? renderHybridEarlyReflections(
        direct.frame.firstOrderReflectionsBySource[source.id] ?? [],
      ) : [],
    ])),
  }), [
    baseScene.sources,
    direct.frame.firstOrderReflectionsBySource,
    geometry.listenerPosition,
    reflectionsEnabled,
  ]);
  const {
    applyHybridDirectState,
    applyHybridReflectionState,
    diagnostics,
    startAudio,
    stopAudio,
  } = useAudioEngine(baseScene, "simulated", null, null);

  useEffect(() => {
    applyHybridDirectState({
      listenerPosition: geometry.listenerPosition,
      sourcePositions: geometry.sourcePositions,
    });
  }, [applyHybridDirectState, geometry]);

  useEffect(() => {
    applyHybridReflectionState(hybridReflectionState);
  }, [applyHybridReflectionState, hybridReflectionState]);

  return (
    <section className="canvas-panel" data-testid="hybrid-direct-lab" aria-labelledby="hybrid-direct-title">
      <p className="panel-kicker">Hybrid 3D / P3 first-order reflection beta</p>
      <h2 id="hybrid-direct-title">3D Direct Propagation + Early Reflections</h2>
      <p className="control-note">
        This lab extrudes the validated 2D scene into floor, ceiling, and finite-thickness wall
        patches. It reports geometric direct visibility, distance, delay, azimuth, and elevation.
      </p>
      <p className="control-note">
        Coordinate contract: X is left/right on the plan, Y is elevation, and Z is front/back on
        the plan. Use the plan controls below to test horizontal HRTF panning; the elevation controls
        test vertical positioning.
      </p>

      <div className="control-section">
        <h3>Plan position controls</h3>
        <p className="control-note">
          Listener and source positions use metres inside this 12 m × 8 m room. A source to the
          listener&apos;s left or right should move to the corresponding ear; moving it in Z changes
          front/back distance and angle.
        </p>
        <label className="field-label" htmlFor="listener-plan-x">
          {planPositionLabel("Listener", listenerPlanPosition)}
        </label>
        <input
          id="listener-plan-x"
          aria-label="Listener plan X"
          max={PLAN_X_RANGE.max}
          min={PLAN_X_RANGE.min}
          onChange={(event) => setListenerPlanPosition((position) => ({
            ...position,
            x: Number(event.target.value),
          }))}
          step="0.1"
          type="range"
          value={listenerPlanPosition.x}
        />
        <input
          id="listener-plan-z"
          aria-label="Listener plan Z"
          max={PLAN_Z_RANGE.max}
          min={PLAN_Z_RANGE.min}
          onChange={(event) => setListenerPlanPosition((position) => ({
            ...position,
            z: Number(event.target.value),
          }))}
          step="0.1"
          type="range"
          value={listenerPlanPosition.z}
        />
        <label className="field-label" htmlFor="radio-plan-x">
          {planPositionLabel("Radio", radioPlanPosition)}
        </label>
        <input
          id="radio-plan-x"
          aria-label="Radio plan X"
          max={PLAN_X_RANGE.max}
          min={PLAN_X_RANGE.min}
          onChange={(event) => setRadioPlanPosition((position) => ({
            ...position,
            x: Number(event.target.value),
          }))}
          step="0.1"
          type="range"
          value={radioPlanPosition.x}
        />
        <input
          id="radio-plan-z"
          aria-label="Radio plan Z"
          max={PLAN_Z_RANGE.max}
          min={PLAN_Z_RANGE.min}
          onChange={(event) => setRadioPlanPosition((position) => ({
            ...position,
            z: Number(event.target.value),
          }))}
          step="0.1"
          type="range"
          value={radioPlanPosition.z}
        />
        <label className="field-label" htmlFor="rain-plan-x">
          {planPositionLabel("Rain", rainPlanPosition)}
        </label>
        <input
          id="rain-plan-x"
          aria-label="Rain plan X"
          max={PLAN_X_RANGE.max}
          min={PLAN_X_RANGE.min}
          onChange={(event) => setRainPlanPosition((position) => ({
            ...position,
            x: Number(event.target.value),
          }))}
          step="0.1"
          type="range"
          value={rainPlanPosition.x}
        />
        <input
          id="rain-plan-z"
          aria-label="Rain plan Z"
          max={PLAN_Z_RANGE.max}
          min={PLAN_Z_RANGE.min}
          onChange={(event) => setRainPlanPosition((position) => ({
            ...position,
            z: Number(event.target.value),
          }))}
          step="0.1"
          type="range"
          value={rainPlanPosition.z}
        />
        <button
          className="secondary-action"
          onClick={() => {
            setListenerPlanPosition({ x: 3, z: 4 });
            setRadioPlanPosition({ x: 9, z: 4 });
            setRainPlanPosition({ x: 10, z: 1.5 });
          }}
          type="button"
        >
          Reset plan positions
        </button>
      </div>

      <div className="control-section">
        <h3>Elevation controls</h3>
        <label className="field-label" htmlFor="listener-height">Listener elevation: {format(listenerHeightM)} m</label>
        <input
          id="listener-height"
          aria-label="Listener elevation"
          max="2.8"
          min="0.2"
          onChange={(event) => setListenerHeightM(Number(event.target.value))}
          step="0.1"
          type="range"
          value={listenerHeightM}
        />
        <label className="field-label" htmlFor="radio-height">Radio elevation: {format(radioHeightM)} m</label>
        <input
          id="radio-height"
          aria-label="Radio elevation"
          max="2.8"
          min="0.2"
          onChange={(event) => setRadioHeightM(Number(event.target.value))}
          step="0.1"
          type="range"
          value={radioHeightM}
        />
        <label className="field-label" htmlFor="rain-height">Rain elevation: {format(rainHeightM)} m</label>
        <input
          id="rain-height"
          aria-label="Rain elevation"
          max="2.8"
          min="0.2"
          onChange={(event) => setRainHeightM(Number(event.target.value))}
          step="0.1"
          type="range"
          value={rainHeightM}
        />
        <button
          aria-pressed={portalOpen}
          className="secondary-action"
          onClick={() => setPortalOpen((open) => !open)}
          type="button"
        >
          {portalOpen ? "Close partition portal" : "Open partition portal"}
        </button>
      </div>

      <div className="control-section" aria-label="Hybrid direct-path diagnostics">
        <p className="control-note" data-testid="hybrid-worker-status">
          Hybrid solver: {direct.source}{direct.computeMs === null ? "" : ` · ${format(direct.computeMs, 1)} ms`}
          {direct.notice ? ` · ${direct.notice}` : ""}
        </p>
        {paths.map((path) => (
          <article
            data-testid={`direct-${path.sourceId}`}
            data-route={path.routeType}
            data-azimuth={format(path.azimuthDeg, 4)}
            data-elevation={format(path.elevationDeg, 4)}
            data-audible-reflections={hybridReflectionState.reflectionsBySource[path.sourceId ?? ""]?.length ?? 0}
            key={path.sourceId}
          >
            <h3>{path.sourceId === "radio" ? "Radio" : "Rain"}: {path.routeType}</h3>
            <p>Distance {format(path.distanceM)} m · Delay {format(path.delayMs)} ms</p>
            <p>Azimuth {format(path.azimuthDeg)}° · Elevation {format(path.elevationDeg)}°</p>
            <p>{path.directVisible ? "Direct path clear." : `Blocked by ${path.occluderWallIds.join(", ")}.`}</p>
            <p>
              Audible first-order 3D taps: {hybridReflectionState.reflectionsBySource[path.sourceId ?? ""]?.length ?? 0}
            </p>
          </article>
        ))}
      </div>

      <div className="audio-control" data-reflections-enabled={reflectionsEnabled}>
        <button
          className="audio-button"
          onClick={() => void (diagnostics.status === "idle" ? startAudio() : stopAudio())}
          type="button"
        >
          {diagnostics.status === "idle" ? "Start 3D Audio" : "Stop 3D Audio"}
        </button>
        <button
          aria-pressed={reflectionsEnabled}
          className="secondary-action"
          onClick={() => setReflectionsEnabled((enabled) => !enabled)}
          type="button"
        >
          {reflectionsEnabled ? "Disable 3D first-order reflections" : "Enable 3D first-order reflections"}
        </button>
        <p className="control-note">
          In Simulated mode, this beta writes the solved relative X/Y/Z direct position to the
          persistent browser HRTF panners. P3-B adds Worker-validated first-order 3D reflection taps;
          the late field remains Classic until P7.
        </p>
      </div>
    </section>
  );
}
