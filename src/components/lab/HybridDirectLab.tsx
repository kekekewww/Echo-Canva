"use client";

import { useEffect, useMemo, useState } from "react";

import {
  bindHybridPoses,
  compileHybridStaticGeometry,
} from "@/acoustics/hybrid3d/compile";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import { createSceneDocumentV2 } from "@/domain/scene-document/serialize";
import type { SceneSpec } from "@/domain/scene/types";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { useHybridDirectPaths } from "@/hooks/useHybridDirectPaths";

function format(value: number, digits = 2): string {
  return value.toFixed(digits);
}

export function HybridDirectLab() {
  const [listenerHeightM, setListenerHeightM] = useState(1.5);
  const [radioHeightM, setRadioHeightM] = useState(1.3);
  const [rainHeightM, setRainHeightM] = useState(1.5);
  const [portalOpen, setPortalOpen] = useState(true);
  const baseScene = useMemo<SceneSpec>(() => {
    const scene: SceneSpec = structuredClone(CONCRETE_PARTITION_PRESET);
    scene.portals[0]!.open = portalOpen;
    return scene;
  }, [portalOpen]);
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
  const {
    applyHybridDirectState,
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

  return (
    <section className="canvas-panel" data-testid="hybrid-direct-lab" aria-labelledby="hybrid-direct-title">
      <p className="panel-kicker">Hybrid 3D / P2 direct-path beta</p>
      <h2 id="hybrid-direct-title">3D Direct Propagation</h2>
      <p className="control-note">
        This lab extrudes the validated 2D scene into floor, ceiling, and finite-thickness wall
        patches. It reports geometric direct visibility, distance, delay, azimuth, and elevation.
      </p>

      <div className="control-section">
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
            data-elevation={format(path.elevationDeg, 4)}
            key={path.sourceId}
          >
            <h3>{path.sourceId === "radio" ? "Radio" : "Rain"}: {path.routeType}</h3>
            <p>Distance {format(path.distanceM)} m · Delay {format(path.delayMs)} ms</p>
            <p>Azimuth {format(path.azimuthDeg)}° · Elevation {format(path.elevationDeg)}°</p>
            <p>{path.directVisible ? "Direct path clear." : `Blocked by ${path.occluderWallIds.join(", ")}.`}</p>
            <p>
              First-order 3D reflections: {direct.frame.firstOrderReflectionsBySource[path.sourceId ?? ""]?.length ?? 0}
            </p>
          </article>
        ))}
      </div>

      <div className="audio-control">
        <button
          className="audio-button"
          onClick={() => void (diagnostics.status === "idle" ? startAudio() : stopAudio())}
          type="button"
        >
          {diagnostics.status === "idle" ? "Start 3D Audio" : "Stop 3D Audio"}
        </button>
        <p className="control-note">
          In Simulated mode, this beta writes the solved relative X/Y/Z direct position to the
          persistent browser HRTF panners. Early reflections and late reverb remain Classic until P3/P7.
        </p>
      </div>
    </section>
  );
}
