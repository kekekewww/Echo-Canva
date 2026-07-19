"use client";

import { useEffect, useMemo } from "react";

import { resolveHybridAudibleDirectState } from "@/acoustics/hybrid3d/audible-direct";
import { compileHybridGeometry } from "@/acoustics/hybrid3d/compile";
import { renderHybridEarlyReflections } from "@/acoustics/hybrid3d/reflection-rendering";
import {
  HybridSpatialViewport,
  type HybridViewportObject,
  type HybridViewportSelection,
  type HybridViewportWall,
} from "@/components/lab/HybridSpatialViewport";
import { deriveHybridPathDisplay } from "@/components/workspace/HybridPathOverlay";
import { constrainPortal3D, constrainWall3D } from "@/domain/workspace/geometry-constraints";
import { projectClassicScene, projectHybridDocument } from "@/domain/workspace/projections";
import type { ProjectAction, Vec3, WorkspaceProject } from "@/domain/workspace/types";
import { useHybridDirectPaths } from "@/hooks/useHybridDirectPaths";
import type { AudioEngine } from "@/audio/AudioEngine";
import type { WorkspaceAcousticStatus } from "@/components/workspace/WorkspaceStatusBar";
import { estimateRoomAcoustics } from "@/acoustics/room-acoustics";

export function HybridViewportAdapter({ project, dispatch, audioEngine, wallPlacementFirst, onWallPlacementPoint, onAcousticStatus }: Readonly<{
  project: WorkspaceProject;
  dispatch: (action: ProjectAction) => void;
  audioEngine: AudioEngine;
  wallPlacementFirst?: Readonly<{ x: number; z: number }> | null;
  onWallPlacementPoint?: (point: Readonly<{ x: number; z: number }>) => void;
  onAcousticStatus?: (status: WorkspaceAcousticStatus) => void;
}>) {
  const { pathsVisible, showAllPaths, ceilingVisible } = project.view.overlays;
  const scene = useMemo(() => projectClassicScene(project), [project]);
  const document = useMemo(() => projectHybridDocument(project), [project]);
  const geometry = useMemo(() => compileHybridGeometry(document), [document]);
  const direct = useHybridDirectPaths(document, geometry);
  const workerAccepted = direct.source === "worker";
  const audible = useMemo(() => resolveHybridAudibleDirectState(geometry, direct.frame), [direct.frame, geometry]);
  const reflectionState = useMemo(() => ({
    listenerPosition: geometry.listenerPosition,
    reflectionsBySource: Object.fromEntries(scene.sources.map(({ id }) => [
      id,
      renderHybridEarlyReflections(direct.frame.firstOrderReflectionsBySource[id] ?? []),
    ])),
  }), [direct.frame.firstOrderReflectionsBySource, geometry.listenerPosition, scene.sources]);
  const disabled = useMemo(() => new Set(project.disabledEntityIds), [project.disabledEntityIds]);
  const selectedSourceId = project.selection?.type === "source"
    ? project.selection.id
    : project.scene.sources.find(({ id }) => !disabled.has(id))?.id ?? null;
  const displayPaths = useMemo(() => deriveHybridPathDisplay(
    direct.frame,
    geometry,
    selectedSourceId,
    showAllPaths,
    project.revision,
    audible.paths,
  ), [audible.paths, direct.frame, geometry, project.revision, selectedSourceId, showAllPaths]);

  const objects = useMemo<readonly HybridViewportObject[]>(() => [
    ...project.listeners.filter(({ enabled }) => enabled).map((listener) => ({
      id: listener.id,
      kind: "listener" as const,
      label: listener.id === project.activeListenerId ? `${listener.name} · Active` : listener.name,
      position: listener.position,
    })),
    ...project.scene.sources.filter(({ id }) => !disabled.has(id)).map((source) => ({
      id: source.id,
      kind: "source" as const,
      label: source.name,
      position: { x: source.position.x, y: project.sourceHeightsM[source.id] ?? 1.5, z: source.position.y },
    })),
  ], [disabled, project.activeListenerId, project.listeners, project.scene.sources, project.sourceHeightsM]);

  const walls = useMemo<readonly HybridViewportWall[]>(() => project.scene.walls
    .filter(({ id }) => !disabled.has(id))
    .map((wall) => {
      const vertical = project.wall3dById[wall.id] ?? {
        bottomM: 0,
        topM: project.room3d.heightM,
        thicknessM: wall.thicknessM,
      };
      return {
        id: wall.id,
        label: wall.id.replaceAll("_", " "),
        a: { x: wall.a.x, z: wall.a.y },
        b: { x: wall.b.x, z: wall.b.y },
        thicknessM: vertical.thicknessM,
        bottomM: vertical.bottomM,
        topM: vertical.topM,
        portals: project.scene.portals.filter((portal) => portal.wallId === wall.id && !disabled.has(portal.id)).map((portal) => {
          const portalVertical = project.portal3dById[portal.id] ?? { bottomM: 0, topM: portal.heightM, thicknessM: 0.12 };
          return {
            id: portal.id,
            center: { x: portal.center.x, z: portal.center.y },
            widthM: portal.widthM,
            bottomM: portalVertical.bottomM,
            topM: portalVertical.topM,
            open: portal.open,
          };
        }),
      };
    }), [disabled, project.portal3dById, project.room3d.heightM, project.scene.portals, project.scene.walls, project.wall3dById]);

  const selectedTarget = useMemo<HybridViewportSelection>(() => {
    const selection = project.selection;
    if (!selection) return null;
    if (selection.type === "listener" || selection.type === "source") return { type: "object", id: selection.id };
    if (selection.type === "wall") return { type: "wall", id: selection.id };
    if (selection.type === "portal") return { type: "portal", id: selection.id };
    return null;
  }, [project.selection]);

  useEffect(() => {
    if (workerAccepted) audioEngine.applyHybridDirectState(audible.audioState);
  }, [audioEngine, audible, workerAccepted]);
  useEffect(() => {
    if (workerAccepted) audioEngine.applyHybridReflectionState(reflectionState);
  }, [audioEngine, reflectionState, workerAccepted]);
  useEffect(() => {
    const active = project.listeners.find(({ id }) => id === project.activeListenerId);
    const path = audible.paths.find(({ sourceId }) => sourceId === selectedSourceId) ?? audible.paths[0];
    const room = estimateRoomAcoustics(scene, { ceilingEnabled: !disabled.has("ceiling") });
    onAcousticStatus?.({
      listenerName: active?.name ?? "Listener",
      route: workerAccepted ? path?.routeType ?? "none" : "none",
      gainDb: workerAccepted ? path?.dryGainDb ?? null : null,
      rt60MidS: workerAccepted ? room.rt60S.mid : null,
      worker: workerAccepted ? "Worker" : "Stopped",
      computeMs: workerAccepted ? direct.computeMs : null,
    });
  }, [audible.paths, direct.computeMs, disabled, onAcousticStatus, project.activeListenerId, project.listeners, scene, selectedSourceId, workerAccepted]);

  function moveObject(id: string, position: Vec3): void {
    const listener = project.listeners.find((candidate) => candidate.id === id);
    if (listener) {
      dispatch({ type: "UPDATE_LISTENER", id, changes: { position } });
      return;
    }
    if (project.scene.sources.some((source) => source.id === id)) dispatch({ type: "MOVE_SOURCE", id, position });
  }

  function moveWallEndpoint(id: string, endpoint: "a" | "b", position: Readonly<{ x: number; z: number }>): void {
    const wall = project.scene.walls.find((candidate) => candidate.id === id);
    if (!wall) return;
    const vertical = project.wall3dById[id] ?? { bottomM: 0, topM: project.room3d.heightM, thicknessM: wall.thicknessM };
    const candidate = {
      a: endpoint === "a" ? { x: position.x, y: position.z } : wall.a,
      b: endpoint === "b" ? { x: position.x, y: position.z } : wall.b,
      ...vertical,
    };
    const result = constrainWall3D(project, id, candidate);
    if (result.ok) dispatch({ type: "REPLACE_PROJECT", project: { ...result.project, selection: { type: "wall", id } } });
  }

  function movePortal(id: string, center: Readonly<{ x: number; z: number }>): void {
    const portal = project.scene.portals.find((candidate) => candidate.id === id);
    if (!portal) return;
    const vertical = project.portal3dById[id] ?? { bottomM: 0, topM: portal.heightM, thicknessM: 0.12 };
    const result = constrainPortal3D(project, id, {
      center: { x: center.x, y: center.z },
      widthM: portal.widthM,
      ...vertical,
    });
    if (result.ok) dispatch({ type: "REPLACE_PROJECT", project: { ...result.project, selection: { type: "portal", id } } });
  }

  return (
    <section className="workspace-viewport-panel" data-testid="hybrid-workspace-viewport">
      <header className="viewport-tools">
        <span>{project.scene.name}</span><span>{workerAccepted ? "Worker" : "Stopped · Worker unavailable"}</span>
      </header>
      <HybridSpatialViewport
        camera={project.view.camera}
        ceilingVisible={ceilingVisible && !disabled.has("ceiling")}
        objects={objects}
        onMoveObject={moveObject}
        onCameraChange={(camera) => dispatch({ type: "SET_VIEW_STATE", changes: { camera } })}
        onMovePortalCenter={movePortal}
        onMoveWallEndpoint={moveWallEndpoint}
        onSelectTarget={(target) => {
          if (target.type === "object") {
            const type = project.listeners.some(({ id }) => id === target.id) ? "listener" : "source";
            dispatch({ type: "SELECT_ENTITY", selection: { type, id: target.id } });
          } else dispatch({ type: "SELECT_ENTITY", selection: { type: target.type === "wall" ? "wall" : "portal", id: target.id } });
        }}
        onToggleCeiling={() => dispatch({ type: "SET_VIEW_STATE", changes: { overlays: { ...project.view.overlays, ceilingVisible: !ceilingVisible } } })}
        onTogglePaths={() => dispatch({ type: "SET_VIEW_STATE", changes: { overlays: { ...project.view.overlays, pathsVisible: !pathsVisible } } })}
        onToggleShowAllPaths={() => dispatch({ type: "SET_VIEW_STATE", changes: { overlays: { ...project.view.overlays, showAllPaths: !showAllPaths } } })}
        paths={workerAccepted ? displayPaths : []}
        pathsVisible={pathsVisible}
        roomDimensions={project.room3d}
        selectedTarget={selectedTarget}
        showAllPaths={showAllPaths}
        wallPlacementFirst={wallPlacementFirst}
        onWallPlacementPoint={onWallPlacementPoint}
        walls={walls}
      />
    </section>
  );
}
