"use client";

import { useEffect, useMemo, useState } from "react";

import {
  bindHybridPoses,
  compileHybridStaticGeometry,
} from "@/acoustics/hybrid3d/compile";
import {
  DEFAULT_HYBRID_ATMOSPHERE,
  airAbsorptionLossDb,
  atmosphereTimeOfFlightSeconds,
  speedOfSoundForAtmosphere,
  type HybridAtmosphere,
} from "@/acoustics/hybrid3d/atmosphere";
import { renderHybridEarlyReflections } from "@/acoustics/hybrid3d/reflection-rendering";
import { HybridPlanPositionEditor } from "@/components/lab/HybridPlanPositionEditor";
import { HybridSpatialViewport } from "@/components/lab/HybridSpatialViewport";
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

function planAxisLabel(name: string, axis: "X" | "Z", value: number): string {
  return `${name} ${axis}: ${format(value)} m`;
}

export function HybridDirectLab() {
  const [listenerHeightM, setListenerHeightM] = useState(1.5);
  const [radioHeightM, setRadioHeightM] = useState(1.3);
  const [rainHeightM, setRainHeightM] = useState(1.5);
  const [listenerPlanPosition, setListenerPlanPosition] = useState<PlanPosition>({ x: 3, z: 4 });
  const [radioPlanPosition, setRadioPlanPosition] = useState<PlanPosition>({ x: 9, z: 4 });
  const [rainPlanPosition, setRainPlanPosition] = useState<PlanPosition>({ x: 10, z: 1.5 });
  const [atmosphere, setAtmosphere] = useState<HybridAtmosphere>(DEFAULT_HYBRID_ATMOSPHERE);
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
  const atmospherePreview = useMemo(() => ({
    speedMps: speedOfSoundForAtmosphere(atmosphere),
    travelTimeMs: atmosphereTimeOfFlightSeconds(100, atmosphere) * 1000,
    lossAt1kHzDb: airAbsorptionLossDb(100, 1000, atmosphere),
    lossAt4kHzDb: airAbsorptionLossDb(100, 4000, atmosphere),
  }), [atmosphere]);
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
    <section className="canvas-panel hybrid-lab-panel" data-testid="hybrid-direct-lab" aria-labelledby="hybrid-direct-title">
      <header className="hybrid-instrument-header">
        <div>
          <p className="panel-kicker">Hybrid 3D / listening instrument</p>
          <h2 id="hybrid-direct-title">Place a listener. Then hear the geometry.</h2>
          <p className="control-note">
            The Lab turns this fixed scene into finite floor, ceiling, and wall patches. X/Z sets
            horizontal placement; Y sets elevation above the floor.
          </p>
        </div>
        <div className="hybrid-signal-strip" aria-label="Hybrid Lab capabilities">
          <span>3D pose</span>
          <span>HRTF</span>
          <span>1st reflections</span>
          <span>P6 preview</span>
        </div>
      </header>

      <div className="hybrid-command-deck audio-control" data-reflections-enabled={reflectionsEnabled}>
        <div>
          <p className="panel-kicker">Audition</p>
          <p className="hybrid-command-copy">Use headphones. The reflection toggle affects only the audible first-order tap bank.</p>
        </div>
        <div className="hybrid-command-actions">
          <button
            className="audio-button"
            onClick={() => void (diagnostics.status === "idle" ? startAudio() : stopAudio())}
            type="button"
          >
            {diagnostics.status === "idle" ? "Start 3D Audio" : "Stop 3D Audio"}
          </button>
          <button
            aria-label={reflectionsEnabled ? "Disable 3D first-order reflections" : "Enable 3D first-order reflections"}
            aria-pressed={reflectionsEnabled}
            className="secondary-action"
            onClick={() => setReflectionsEnabled((enabled) => !enabled)}
            type="button"
          >
            {reflectionsEnabled ? "Reflections: on" : "Reflections: off"}
          </button>
        </div>
      </div>

      <div className="hybrid-workbench-grid">
        <div className="hybrid-spatial-zone">
          <div className="hybrid-zone-heading">
            <p className="panel-kicker">01 / spatial pose</p>
            <p>The viewport is the primary 3D control. Its cyan/amber markers are the actual inputs to the Hybrid HRTF pose.</p>
          </div>

          <HybridSpatialViewport
            listenerHeightM={listenerHeightM}
            listenerPosition={listenerPlanPosition}
            onMoveListenerHeight={setListenerHeightM}
            onMoveListener={setListenerPlanPosition}
            onMoveSource={(sourceId, position) => {
              if (sourceId === "radio") setRadioPlanPosition(position);
              else setRainPlanPosition(position);
            }}
            onMoveSourceHeight={(sourceId, heightM) => {
              if (sourceId === "radio") setRadioHeightM(heightM);
              else setRainHeightM(heightM);
            }}
            portalOpen={portalOpen}
            radioHeightM={radioHeightM}
            radioPosition={radioPlanPosition}
            rainHeightM={rainHeightM}
            rainPosition={rainPlanPosition}
          />

          <details className="hybrid-orthographic-reference">
            <summary>Open orthographic X/Z and Y reference maps</summary>
      <HybridPlanPositionEditor
        listenerHeightM={listenerHeightM}
        listenerPosition={listenerPlanPosition}
        onMoveListenerHeight={setListenerHeightM}
        onMoveListener={setListenerPlanPosition}
        onMoveSource={(sourceId, position) => {
          if (sourceId === "radio") setRadioPlanPosition(position);
          else setRainPlanPosition(position);
        }}
        onMoveSourceHeight={(sourceId, heightM) => {
          if (sourceId === "radio") setRadioHeightM(heightM);
          else setRainHeightM(heightM);
        }}
        portalOpen={portalOpen}
        radioHeightM={radioHeightM}
        radioPosition={radioPlanPosition}
        rainHeightM={rainHeightM}
        rainPosition={rainPlanPosition}
          />
          </details>
        </div>

        <aside className="hybrid-control-rack" aria-label="Hybrid pose and medium controls">

      <section className="control-section hybrid-control-card">
        <p className="panel-kicker">02 / exact position</p>
        <h3>Fine X/Z controls</h3>
        <p className="control-note">
          Listener and source positions use metres inside this 12 m × 8 m room. A source to the
          listener&apos;s left or right should move to the corresponding ear; moving it in Z changes
          front/back distance and angle.
        </p>
        <label className="field-label" htmlFor="listener-plan-x">
          {planAxisLabel("Listener", "X", listenerPlanPosition.x)}
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
        <label className="field-label" htmlFor="listener-plan-z">
          {planAxisLabel("Listener", "Z", listenerPlanPosition.z)}
        </label>
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
          {planAxisLabel("Radio", "X", radioPlanPosition.x)}
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
        <label className="field-label" htmlFor="radio-plan-z">
          {planAxisLabel("Radio", "Z", radioPlanPosition.z)}
        </label>
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
          {planAxisLabel("Rain", "X", rainPlanPosition.x)}
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
        <label className="field-label" htmlFor="rain-plan-z">
          {planAxisLabel("Rain", "Z", rainPlanPosition.z)}
        </label>
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
      </section>

      <section className="control-section hybrid-control-card">
        <p className="panel-kicker">03 / vertical pose</p>
        <h3>Fine Y controls</h3>
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
      </section>

      <section className="control-section hybrid-control-card" data-testid="atmosphere-preview">
        <p className="panel-kicker">04 / medium model</p>
        <h3>Atmospheric preview</h3>
        <p className="control-note">
          Adjust the bounded air model used for the P6 propagation preview. These controls update the
          displayed medium calculations only; they do not yet alter this Lab&apos;s HRTF, direct delay,
          reflections, or audible sound.
        </p>
        <label className="field-label" htmlFor="atmosphere-temperature">
          Temperature: {format(atmosphere.temperatureC, 0)} °C
        </label>
        <input
          aria-label="Atmosphere temperature"
          id="atmosphere-temperature"
          max="50"
          min="-20"
          onChange={(event) => setAtmosphere((current) => ({
            ...current,
            temperatureC: Number(event.target.value),
          }))}
          step="1"
          type="range"
          value={atmosphere.temperatureC}
        />
        <label className="field-label" htmlFor="atmosphere-humidity">
          Relative humidity: {format(atmosphere.relativeHumidity * 100, 0)}%
        </label>
        <input
          aria-label="Atmosphere relative humidity"
          id="atmosphere-humidity"
          max="100"
          min="0"
          onChange={(event) => setAtmosphere((current) => ({
            ...current,
            relativeHumidity: Number(event.target.value) / 100,
          }))}
          step="1"
          type="range"
          value={atmosphere.relativeHumidity * 100}
        />
        <label className="field-label" htmlFor="atmosphere-pressure">
          Pressure: {format(atmosphere.pressurePa / 100, 0)} hPa
        </label>
        <input
          aria-label="Atmosphere pressure"
          id="atmosphere-pressure"
          max="1100"
          min="800"
          onChange={(event) => setAtmosphere((current) => ({
            ...current,
            pressurePa: Number(event.target.value) * 100,
          }))}
          step="1"
          type="range"
          value={atmosphere.pressurePa / 100}
        />
        <dl className="atmosphere-metrics">
          <div>
            <dt>Speed of sound</dt>
            <dd data-speed-mps={format(atmospherePreview.speedMps, 3)}>{format(atmospherePreview.speedMps, 1)} m/s</dd>
          </div>
          <div>
            <dt>100 m travel time</dt>
            <dd data-travel-time-ms={format(atmospherePreview.travelTimeMs, 3)}>{format(atmospherePreview.travelTimeMs, 1)} ms</dd>
          </div>
          <div>
            <dt>1 kHz loss over 100 m</dt>
            <dd data-loss-1khz-db={format(atmospherePreview.lossAt1kHzDb, 5)}>{format(atmospherePreview.lossAt1kHzDb, 3)} dB</dd>
          </div>
          <div>
            <dt>4 kHz loss over 100 m</dt>
            <dd data-loss-4khz-db={format(atmospherePreview.lossAt4kHzDb, 5)}>{format(atmospherePreview.lossAt4kHzDb, 3)} dB</dd>
          </div>
        </dl>
        <button
          className="secondary-action"
          onClick={() => setAtmosphere(DEFAULT_HYBRID_ATMOSPHERE)}
          type="button"
        >
          Reset atmospheric medium
        </button>
      </section>
        </aside>
      </div>

      <section className="hybrid-diagnostics-panel" aria-label="Hybrid direct-path diagnostics">
        <header>
          <div>
            <p className="panel-kicker">05 / projected path state</p>
            <h3>What the current geometry resolves</h3>
          </div>
        </header>
        <p className="control-note" data-testid="hybrid-worker-status">
          Hybrid solver: {direct.source}{direct.computeMs === null ? "" : ` · ${format(direct.computeMs, 1)} ms`}
          {direct.notice ? ` · ${direct.notice}` : ""}
        </p>
        <div className="hybrid-path-grid">
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
      </section>

    </section>
  );
}
