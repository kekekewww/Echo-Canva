import {
  ACOUSTIC_EPSILON,
  cross,
  collinearInteriorOverlap,
  distance,
  dot,
  segmentIntersection,
  subtract,
} from "@/acoustics/geometry";
import type { PortalRoute } from "@/acoustics/types";
import type { SceneSpec, Vec2 } from "@/domain/scene/types";

export const PORTAL_LOWPASS_PENALTY_HZ = 1_500;
export const MIN_PORTAL_LOWPASS_HZ = 1_200;
export const MAX_PORTAL_LOWPASS_HZ = 20_000;

type OpenPortal = SceneSpec["portals"][number];
type AcousticWall = SceneSpec["walls"][number];

type GraphNode = Readonly<{
  id: string;
  kind: "source" | "listener" | "portal";
  position: Vec2;
  portal?: OpenPortal;
  portalBit?: number;
}>;

type RouteState = Readonly<{
  previousNodeIndex: number;
  currentNodeIndex: number;
  visitedPortalMask: number;
  portalIds: readonly string[];
  polyline: readonly Vec2[];
  effectiveDistanceM: number;
  portalLossDb: number;
  cost: number;
}>;

class MinPriorityQueue<T> {
  private readonly items: T[] = [];

  constructor(private readonly compare: (left: T, right: T) => number) {}

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  push(value: T): void {
    this.items.push(value);
    let index = this.items.length - 1;

    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);

      if (this.compare(this.items[parentIndex]!, value) <= 0) {
        break;
      }

      this.items[index] = this.items[parentIndex]!;
      index = parentIndex;
    }

    this.items[index] = value;
  }

  pop(): T | undefined {
    const minimum = this.items[0];
    const last = this.items.pop();

    if (minimum === undefined || last === undefined || this.items.length === 0) {
      return minimum;
    }

    let index = 0;

    while (true) {
      const leftChildIndex = index * 2 + 1;
      const rightChildIndex = leftChildIndex + 1;

      if (leftChildIndex >= this.items.length) {
        break;
      }

      const smallestChildIndex =
        rightChildIndex < this.items.length &&
        this.compare(this.items[rightChildIndex]!, this.items[leftChildIndex]!) < 0
          ? rightChildIndex
          : leftChildIndex;

      if (this.compare(last, this.items[smallestChildIndex]!) <= 0) {
        break;
      }

      this.items[index] = this.items[smallestChildIndex]!;
      index = smallestChildIndex;
    }

    this.items[index] = last;
    return minimum;
  }
}

export const edgeCost = (distanceM: number, portalLossDb: number, turnRadians: number): number =>
  distanceM + 0.08 * portalLossDb + 0.25 * turnRadians * turnRadians;

export function portalLowpassHz(portalCount: number): number {
  return clamp(
    MAX_PORTAL_LOWPASS_HZ - PORTAL_LOWPASS_PENALTY_HZ * portalCount,
    MIN_PORTAL_LOWPASS_HZ,
    MAX_PORTAL_LOWPASS_HZ,
  );
}

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

  const leftNode = nodes[a.currentNodeIndex]!;
  const rightNode = nodes[b.currentNodeIndex]!;

  if (leftNode.id !== rightNode.id) {
    return leftNode.id < rightNode.id ? -1 : 1;
  }

  const leftPreviousNode = nodes[a.previousNodeIndex];
  const rightPreviousNode = nodes[b.previousNodeIndex];
  const leftPreviousId = leftPreviousNode?.id ?? "";
  const rightPreviousId = rightPreviousNode?.id ?? "";

  return leftPreviousId < rightPreviousId ? -1 : leftPreviousId > rightPreviousId ? 1 : 0;
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

function isPointOnWall(point: Vec2, wall: AcousticWall): boolean {
  const wallDirection = subtract(wall.b, wall.a);
  const wallLength = Math.hypot(wallDirection.x, wallDirection.y);

  if (wallLength <= ACOUSTIC_EPSILON) {
    return false;
  }

  const offset = subtract(point, wall.a);
  const distanceAlongWall = dot(offset, wallDirection);

  return (
    Math.abs(cross(offset, wallDirection)) <= ACOUSTIC_EPSILON * wallLength &&
    distanceAlongWall >= -ACOUSTIC_EPSILON &&
    distanceAlongWall <= wallLength * wallLength + ACOUSTIC_EPSILON
  );
}

function liesStrictlyInsidePortal(point: Vec2, portal: OpenPortal, wall: AcousticWall): boolean {
  const wallDirection = subtract(wall.b, wall.a);
  const wallLength = Math.hypot(wallDirection.x, wallDirection.y);

  if (wallLength <= ACOUSTIC_EPSILON || portal.widthM <= ACOUSTIC_EPSILON) {
    return false;
  }

  const relativeToCenter = subtract(point, portal.center);
  const distanceAlongWall = dot(relativeToCenter, wallDirection) / wallLength;
  const halfWidth = portal.widthM / 2;

  return distanceAlongWall > -halfWidth && distanceAlongWall < halfWidth;
}

function isWaivedPortalEndpoint(
  point: Vec2,
  wall: AcousticWall,
  endpointPortal: OpenPortal | undefined,
): boolean {
  return (
    endpointPortal !== undefined &&
    endpointPortal.open &&
    endpointPortal.wallId === wall.id &&
    liesStrictlyInsidePortal(point, endpointPortal, wall)
  );
}

function isPortalEdgeVisible(from: GraphNode, to: GraphNode, scene: SceneSpec): boolean {
  for (const wall of scene.walls) {
    if (collinearInteriorOverlap(from.position, to.position, wall.a, wall.b)) return false;
    const hit = segmentIntersection(from.position, to.position, wall.a, wall.b);

    if (hit !== null) {
      const isFromEndpoint = hit.t <= ACOUSTIC_EPSILON;
      const isToEndpoint = hit.t >= 1 - ACOUSTIC_EPSILON;

      if (
        (isFromEndpoint && isWaivedPortalEndpoint(hit.point, wall, from.portal)) ||
        (isToEndpoint && isWaivedPortalEndpoint(hit.point, wall, to.portal))
      ) {
        continue;
      }

      return false;
    }

    if (isPointOnWall(from.position, wall) || isPointOnWall(to.position, wall)) {
      return false;
    }
  }

  return true;
}

function routeVirtualPosition(portalIds: readonly string[], portals: readonly OpenPortal[]): Vec2 {
  const listenerFacingPortalId = portalIds.at(-1);
  const listenerFacingPortal = portals.find((portal) => portal.id === listenerFacingPortalId);

  if (listenerFacingPortal === undefined) {
    throw new Error("A portal route must contain at least one portal");
  }

  return listenerFacingPortal.center;
}

function buildVisibleGraph(nodes: readonly GraphNode[], scene: SceneSpec): readonly (readonly number[])[] {
  return nodes.map((node, nodeIndex) => {
    const neighbors: number[] = [];

    for (let candidateIndex = 0; candidateIndex < nodes.length; candidateIndex += 1) {
      if (nodeIndex !== candidateIndex && isPortalEdgeVisible(node, nodes[candidateIndex]!, scene)) {
        neighbors.push(candidateIndex);
      }
    }

    return neighbors;
  });
}

function routeStateKey(state: RouteState): string {
  return `${state.previousNodeIndex}:${state.currentNodeIndex}:${state.visitedPortalMask}`;
}

export function findBestPortalRoute(
  source: Vec2,
  listener: Vec2,
  scene: SceneSpec,
): PortalRoute | null {
  const openPortals = scene.portals.filter((portal) => portal.open).sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const nodes: GraphNode[] = [
    { id: "__listener", kind: "listener", position: listener },
    { id: "__source", kind: "source", position: source },
    ...openPortals.map((portal, portalBit) => ({
      id: portal.id,
      kind: "portal" as const,
      position: portal.center,
      portal,
      portalBit,
    })),
  ];

  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const sourceIndex = nodes.findIndex((node) => node.kind === "source");
  const listenerIndex = nodes.findIndex((node) => node.kind === "listener");
  const visibleGraph = buildVisibleGraph(nodes, scene);
  const pending = new MinPriorityQueue<RouteState>((left, right) =>
    compareRouteStates(left, right, nodes),
  );
  const initialState: RouteState = {
    previousNodeIndex: -1,
    currentNodeIndex: sourceIndex,
    visitedPortalMask: 0,
    portalIds: [],
    polyline: [source],
    effectiveDistanceM: 0,
    portalLossDb: 0,
    cost: 0,
  };
  const bestStates = new Map<string, RouteState>([[routeStateKey(initialState), initialState]]);

  pending.push(initialState);

  while (!pending.isEmpty) {
    const state = pending.pop()!;

    if (bestStates.get(routeStateKey(state)) !== state) {
      continue;
    }

    if (state.currentNodeIndex === listenerIndex && state.portalIds.length > 0) {
      return {
        portalIds: state.portalIds,
        polyline: state.polyline,
        effectiveDistanceM: state.effectiveDistanceM,
        cost: state.cost,
        virtualPosition: routeVirtualPosition(state.portalIds, openPortals),
        dryGainDb: -state.portalLossDb,
        lowpassHz: portalLowpassHz(state.portalIds.length),
      };
    }

    const current = nodes[state.currentNodeIndex]!;
    const previous = nodes[state.previousNodeIndex];

    for (const nextIndex of visibleGraph[state.currentNodeIndex]!) {
      const next = nodes[nextIndex]!;

      if (
        next.kind === "source" ||
        (next.kind === "listener" && state.portalIds.length === 0) ||
        (next.portalBit !== undefined && (state.visitedPortalMask & (1 << next.portalBit)) !== 0)
      ) {
        continue;
      }

      const nextPortalLossDb = next.portal?.lossDb ?? 0;
      const nextDistanceM = distance(current.position, next.position);
      const nextTurnRadians = turnRadians(previous?.position, current.position, next.position);
      const candidate: RouteState = {
        previousNodeIndex: state.currentNodeIndex,
        currentNodeIndex: nextIndex,
        visitedPortalMask:
          next.portalBit === undefined
            ? state.visitedPortalMask
            : state.visitedPortalMask | (1 << next.portalBit),
        portalIds:
          next.portal === undefined ? state.portalIds : [...state.portalIds, next.portal.id],
        polyline: [...state.polyline, next.position],
        effectiveDistanceM: state.effectiveDistanceM + nextDistanceM,
        portalLossDb: state.portalLossDb + nextPortalLossDb,
        cost: state.cost + edgeCost(nextDistanceM, nextPortalLossDb, nextTurnRadians),
      };
      const candidateKey = routeStateKey(candidate);
      const previousBest = bestStates.get(candidateKey);

      if (
        previousBest === undefined ||
        compareRouteStates(candidate, previousBest, nodes) < 0
      ) {
        bestStates.set(candidateKey, candidate);
        pending.push(candidate);
      }
    }
  }

  return null;
}
