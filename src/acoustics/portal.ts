import { distance, dot, subtract, traceDirectPath } from "@/acoustics/geometry";
import type { PortalRoute } from "@/acoustics/types";
import type { SceneSpec, Vec2 } from "@/domain/scene/types";

export const PORTAL_LOWPASS_PENALTY_HZ = 1_500;
export const MIN_PORTAL_LOWPASS_HZ = 1_200;
export const MAX_PORTAL_LOWPASS_HZ = 20_000;

type OpenPortal = SceneSpec["portals"][number];

type GraphNode = Readonly<{
  id: string;
  kind: "source" | "listener" | "portal";
  position: Vec2;
  portal?: OpenPortal;
}>;

type RouteState = Readonly<{
  nodeIndex: number;
  previousPosition?: Vec2;
  portalIds: readonly string[];
  polyline: readonly Vec2[];
  effectiveDistanceM: number;
  portalLossDb: number;
  cost: number;
}>;

export const edgeCost = (distanceM: number, portalLossDb: number, turnRadians: number): number =>
  distanceM + 0.08 * portalLossDb + 0.25 * turnRadians * turnRadians;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function comparePortalIdSequences(a: readonly string[], b: readonly string[]): number {
  const sharedLength = Math.min(a.length, b.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const left = a[index]!;
    const right = b[index]!;

    if (left < right) {
      return -1;
    }

    if (left > right) {
      return 1;
    }
  }

  return a.length - b.length;
}

function compareRouteStates(a: RouteState, b: RouteState, nodes: readonly GraphNode[]): number {
  if (a.cost !== b.cost) {
    return a.cost - b.cost;
  }

  const portalSequenceComparison = comparePortalIdSequences(a.portalIds, b.portalIds);

  if (portalSequenceComparison !== 0) {
    return portalSequenceComparison;
  }

  const leftNodeId = nodes[a.nodeIndex]!.id;
  const rightNodeId = nodes[b.nodeIndex]!.id;

  return leftNodeId < rightNodeId ? -1 : leftNodeId > rightNodeId ? 1 : 0;
}

function turnRadians(previous: Vec2 | undefined, current: Vec2, next: Vec2): number {
  if (previous === undefined) {
    return 0;
  }

  const incoming = subtract(current, previous);
  const outgoing = subtract(next, current);
  const incomingLength = Math.hypot(incoming.x, incoming.y);
  const outgoingLength = Math.hypot(outgoing.x, outgoing.y);

  if (incomingLength === 0 || outgoingLength === 0) {
    return 0;
  }

  return Math.acos(
    clamp(dot(incoming, outgoing) / (incomingLength * outgoingLength), -1, 1),
  );
}

function routeVirtualPosition(portalIds: readonly string[], portals: readonly OpenPortal[], listener: Vec2): Vec2 {
  return portalIds
    .map((portalId) => portals.find((portal) => portal.id === portalId))
    .filter((portal): portal is OpenPortal => portal !== undefined)
    .sort((left, right) => {
      const distanceDifference = distance(left.center, listener) - distance(right.center, listener);

      if (distanceDifference !== 0) {
        return distanceDifference;
      }

      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    })[0]!.center;
}

function buildVisibleGraph(nodes: readonly GraphNode[], scene: SceneSpec): readonly (readonly number[])[] {
  return nodes.map((node, nodeIndex) =>
    nodes
      .flatMap((candidate, candidateIndex) => {
        if (nodeIndex === candidateIndex) {
          return [];
        }

        return traceDirectPath(node.position, candidate.position, scene).visible
          ? [candidateIndex]
          : [];
      })
      .sort((left, right) => {
        const leftId = nodes[left]!.id;
        const rightId = nodes[right]!.id;
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
      }),
  );
}

export function findBestPortalRoute(
  source: Vec2,
  listener: Vec2,
  scene: SceneSpec,
): PortalRoute | null {
  const openPortals = scene.portals.filter((portal) => portal.open).sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const nodes: readonly GraphNode[] = [
    { id: "__listener", kind: "listener" as const, position: listener },
    ...openPortals.map((portal) => ({ id: portal.id, kind: "portal" as const, position: portal.center, portal })),
    { id: "__source", kind: "source" as const, position: source },
  ].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const sourceIndex = nodes.findIndex((node) => node.kind === "source");
  const listenerIndex = nodes.findIndex((node) => node.kind === "listener");
  const visibleGraph = buildVisibleGraph(nodes, scene);
  const pending: RouteState[] = [
    {
      nodeIndex: sourceIndex,
      portalIds: [],
      polyline: [source],
      effectiveDistanceM: 0,
      portalLossDb: 0,
      cost: 0,
    },
  ];

  while (pending.length > 0) {
    pending.sort((left, right) => compareRouteStates(left, right, nodes));
    const state = pending.shift()!;
    const current = nodes[state.nodeIndex]!;

    if (state.nodeIndex === listenerIndex && state.portalIds.length > 0) {
      return {
        portalIds: state.portalIds,
        polyline: state.polyline,
        effectiveDistanceM: state.effectiveDistanceM,
        cost: state.cost,
        virtualPosition: routeVirtualPosition(state.portalIds, openPortals, listener),
        dryGainDb: -state.portalLossDb,
        lowpassHz: clamp(
          MAX_PORTAL_LOWPASS_HZ - PORTAL_LOWPASS_PENALTY_HZ * state.portalIds.length,
          MIN_PORTAL_LOWPASS_HZ,
          MAX_PORTAL_LOWPASS_HZ,
        ),
      };
    }

    for (const nextIndex of visibleGraph[state.nodeIndex]!) {
      const next = nodes[nextIndex]!;

      if (
        next.kind === "source" ||
        (next.kind === "listener" && state.portalIds.length === 0) ||
        (next.portal !== undefined && state.portalIds.includes(next.portal.id))
      ) {
        continue;
      }

      const nextPortalLossDb = next.portal?.lossDb ?? 0;
      const nextDistanceM = distance(current.position, next.position);
      const nextTurnRadians = turnRadians(state.previousPosition, current.position, next.position);

      pending.push({
        nodeIndex: nextIndex,
        previousPosition: current.position,
        portalIds:
          next.portal === undefined ? state.portalIds : [...state.portalIds, next.portal.id],
        polyline: [...state.polyline, next.position],
        effectiveDistanceM: state.effectiveDistanceM + nextDistanceM,
        portalLossDb: state.portalLossDb + nextPortalLossDb,
        cost: state.cost + edgeCost(nextDistanceM, nextPortalLossDb, nextTurnRadians),
      });
    }
  }

  return null;
}
