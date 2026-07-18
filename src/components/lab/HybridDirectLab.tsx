"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
import { resolveHybridAudibleDirectState } from "@/acoustics/hybrid3d/audible-direct";
import { renderHybridEarlyReflections } from "@/acoustics/hybrid3d/reflection-rendering";
import { HybridPlanPositionEditor } from "@/components/lab/HybridPlanPositionEditor";
import {
  HybridSpatialViewport,
  type HybridViewportSelection,
} from "@/components/lab/HybridSpatialViewport";
import {
  constrainPartitionEndpoint,
  constrainPortalToPartition,
  type HybridEditablePartition,
  type HybridEditablePortal,
} from "@/components/lab/partition-editing";
import { MATERIALS } from "@/domain/materials/registry";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import { createSceneDocumentV2 } from "@/domain/scene-document/serialize";
import type { SceneSpec } from "@/domain/scene/types";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { useHybridDirectPaths } from "@/hooks/useHybridDirectPaths";

type PlanPosition = Readonly<{ x: number; z: number }>;

const SELECTION_COPY: Readonly<Record<HybridViewportSelection, Readonly<{
  label: string;
  description: string;
  controlHint: string;
}>>> = {
  listener: {
    label: "Listener",
    description: "The listener head sets the reference point for every Browser HRTF direction.",
    controlHint: "Fine position and vertical pose controls are highlighted below.",
  },
  radio: {
    label: "Radio source",
    description: "This point source is spatialized relative to the selected listener position.",
    controlHint: "Fine position and vertical pose controls are highlighted below.",
  },
  rain: {
    label: "Rain source",
    description: "This point source is spatialized relative to the selected listener position.",
    controlHint: "Fine position and vertical pose controls are highlighted below.",
  },
  "partition-a": {
    label: "Wall A endpoint",
    description: "This coral handle moves the first endpoint of the audible barrier in X/Z.",
    controlHint: "Partition controls are highlighted below; the Portal remains attached.",
  },
  "partition-b": {
    label: "Wall B endpoint",
    description: "This coral handle moves the second endpoint of the audible barrier in X/Z.",
    controlHint: "Partition controls are highlighted below; the Portal remains attached.",
  },
  portal: {
    label: "Portal opening",
    description: "This cyan doorway moves along the partition and can route blocked sound around it.",
    controlHint: "Portal width, height, and open state are highlighted below.",
  },
};

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
  const [partition, setPartition] = useState<HybridEditablePartition>({
    a: { x: 6, z: 0.2 },
    b: { x: 6, z: 7.8 },
    thicknessM: 0.2,
    materialId: "concrete_hard",
  });
  const [portal, setPortal] = useState<HybridEditablePortal>({
    center: { x: 6, z: 4 },
    widthM: 1.2,
    heightM: 2.1,
    open: true,
  });
  const [selectedTarget, setSelectedTarget] = useState<HybridViewportSelection>("listener");
  const [reflectionsEnabled, setReflectionsEnabled] = useState(true);
  const movePartitionEndpoint = useCallback((endpoint: "a" | "b", position: PlanPosition) => {
    const nextPartition = constrainPartitionEndpoint(partition, endpoint, position);
    if (nextPartition === partition) return;
    setPartition(nextPartition);
    setPortal((current) => constrainPortalToPartition(current, nextPartition));
  }, [partition]);
  const updatePortal = useCallback((next: HybridEditablePortal) => {
    setPortal(constrainPortalToPartition(next, partition));
  }, [partition]);
  const baseScene = useMemo<SceneSpec>(() => {
    const scene: SceneSpec = structuredClone(CONCRETE_PARTITION_PRESET);
    scene.walls = scene.walls.map((wall) => wall.id === "partition_center" ? {
      ...wall,
      a: { x: partition.a.x, y: partition.a.z },
      b: { x: partition.b.x, y: partition.b.z },
      thicknessM: partition.thicknessM,
      materialId: partition.materialId,
    } : wall);
    scene.portals[0] = {
      ...scene.portals[0]!,
      center: { x: portal.center.x, y: portal.center.z },
      widthM: portal.widthM,
      heightM: portal.heightM,
      open: portal.open,
    };
    scene.listener.position = { x: listenerPlanPosition.x, y: listenerPlanPosition.z };
    for (const source of scene.sources) {
      const position = source.id === "radio" ? radioPlanPosition : rainPlanPosition;
      source.position = { x: position.x, y: position.z };
    }
    return scene;
  }, [listenerPlanPosition, partition, portal, radioPlanPosition, rainPlanPosition]);
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
  const audibleDirect = useMemo(
    () => resolveHybridAudibleDirectState(geometry, direct.frame),
    [direct.frame, geometry],
  );
  const audiblePathsBySource = useMemo(
    () => new Map(audibleDirect.paths.map((path) => [path.sourceId, path])),
    [audibleDirect.paths],
  );
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
    applyHybridDirectState(audibleDirect.audioState);
  }, [applyHybridDirectState, audibleDirect]);

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
            partition={partition}
            portal={portal}
            onMovePartitionEndpoint={movePartitionEndpoint}
            onMovePortalCenter={(center) => updatePortal({ ...portal, center })}
            onSelectTarget={setSelectedTarget}
            radioHeightM={radioHeightM}
            radioPosition={radioPlanPosition}
            rainHeightM={rainHeightM}
            rainPosition={rainPlanPosition}
            selectedTarget={selectedTarget}
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
        partition={partition}
        portal={portal}
        radioHeightM={radioHeightM}
        radioPosition={radioPlanPosition}
        rainHeightM={rainHeightM}
        rainPosition={rainPlanPosition}
          />
          </details>
        </div>

        <aside
          className="hybrid-control-rack"
          aria-label="Hybrid pose and medium controls"
          data-selected-target={selectedTarget}
        >
      <section className="hybrid-selection-card" data-testid="hybrid-selection-card">
        <p className="panel-kicker">Selected in scene</p>
        <h3>{SELECTION_COPY[selectedTarget].label}</h3>
        <p>{SELECTION_COPY[selectedTarget].description}</p>
        <p className="hybrid-selection-hint">{SELECTION_COPY[selectedTarget].controlHint}</p>
      </section>

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
          aria-pressed={portal.open}
          className="secondary-action"
          onClick={() => updatePortal({ ...portal, open: !portal.open })}
          type="button"
        >
          {portal.open ? "Close partition portal" : "Open partition portal"}
        </button>
      </section>

      <section className="control-section hybrid-control-card" data-testid="hybrid-partition-controls">
        <p className="panel-kicker">04 / partition and Portal</p>
        <h3>Edit the audible barrier</h3>
        <p className="control-note">
          Drag the coral Wall A/B handles or cyan Portal handle in the viewport. These controls are
          the precise alternative; Portal remains attached to the partition automatically.
        </p>
        <label className="field-label" htmlFor="partition-a-x">Wall A X: {format(partition.a.x)} m</label>
        <input id="partition-a-x" aria-label="Partition endpoint A X" max="11.8" min="0.2" onChange={(event) => movePartitionEndpoint("a", { ...partition.a, x: Number(event.target.value) })} step="0.1" type="range" value={partition.a.x} />
        <label className="field-label" htmlFor="partition-a-z">Wall A Z: {format(partition.a.z)} m</label>
        <input id="partition-a-z" aria-label="Partition endpoint A Z" max="7.8" min="0.2" onChange={(event) => movePartitionEndpoint("a", { ...partition.a, z: Number(event.target.value) })} step="0.1" type="range" value={partition.a.z} />
        <label className="field-label" htmlFor="partition-b-x">Wall B X: {format(partition.b.x)} m</label>
        <input id="partition-b-x" aria-label="Partition endpoint B X" max="11.8" min="0.2" onChange={(event) => movePartitionEndpoint("b", { ...partition.b, x: Number(event.target.value) })} step="0.1" type="range" value={partition.b.x} />
        <label className="field-label" htmlFor="partition-b-z">Wall B Z: {format(partition.b.z)} m</label>
        <input id="partition-b-z" aria-label="Partition endpoint B Z" max="7.8" min="0.2" onChange={(event) => movePartitionEndpoint("b", { ...partition.b, z: Number(event.target.value) })} step="0.1" type="range" value={partition.b.z} />
        <label className="field-label" htmlFor="partition-material">Partition material</label>
        <select aria-label="Partition material" id="partition-material" onChange={(event) => setPartition((current) => ({ ...current, materialId: event.target.value }))} value={partition.materialId}>
          {MATERIALS.map((material) => <option key={material.id} value={material.id}>{material.displayName}</option>)}
        </select>
        <label className="field-label" htmlFor="portal-width">Portal width: {format(portal.widthM)} m</label>
        <input id="portal-width" aria-label="Portal width" max="3" min="0.4" onChange={(event) => updatePortal({ ...portal, widthM: Number(event.target.value) })} step="0.1" type="range" value={portal.widthM} />
        <label className="field-label" htmlFor="portal-height">Portal height: {format(portal.heightM)} m</label>
        <input id="portal-height" aria-label="Portal height" max="2.8" min="0.4" onChange={(event) => updatePortal({ ...portal, heightM: Number(event.target.value) })} step="0.1" type="range" value={portal.heightM} />
      </section>

      <section className="control-section hybrid-control-card" data-testid="atmosphere-preview">
        <p className="panel-kicker">05 / medium model</p>
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
        {paths.map((path) => {
          const audiblePath = audiblePathsBySource.get(path.sourceId ?? "");
          return (
          <article
            data-testid={`direct-${path.sourceId}`}
            data-route={path.routeType}
            data-render-route={audiblePath?.routeType ?? path.routeType}
            data-render-gain={format(audiblePath?.dryGainDb ?? 0, 4)}
            data-render-lowpass={format(audiblePath?.lowpassHz ?? 20_000, 2)}
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
              Audible route {audiblePath?.routeType ?? path.routeType}; gain {format(audiblePath?.dryGainDb ?? 0)} dB;
              low-pass {format(audiblePath?.lowpassHz ?? 20_000, 0)} Hz.
            </p>
            <p>
              Audible first-order 3D taps: {hybridReflectionState.reflectionsBySource[path.sourceId ?? ""]?.length ?? 0}
            </p>
          </article>
          );
        })}
        </div>
      </section>

    </section>
  );
}
