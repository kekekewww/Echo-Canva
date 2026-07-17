import { z } from "zod";

import {
  ACOUSTIC_EXPLAINER_MODEL,
  FIXED_PORTAL_LIMITATION,
  type AcousticExplanation,
  type AcousticExplanationResponse,
  type AcousticSnapshotProjection,
  type ExplainAcousticsRequest,
  type ExplainDependencies,
} from "@/ai/contracts";

const MAX_LABEL_LENGTH = 120;
const MAX_EXPLANATION_STRING_LENGTH = 600;

const explanationCandidateSchema = z
  .object({
    summary: z.string().trim().min(1).max(MAX_EXPLANATION_STRING_LENGTH),
    factors: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(MAX_LABEL_LENGTH),
            evidence: z.string().trim().min(1).max(MAX_EXPLANATION_STRING_LENGTH),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    limitations: z.array(z.string().trim().min(1).max(MAX_EXPLANATION_STRING_LENGTH)).max(4),
  })
  .strict();

export const acousticExplanationJsonSchema = explanationCandidateSchema.toJSONSchema();

function failure(message: string): AcousticExplanationResponse {
  return { ok: false, error: { code: "EXPLANATION_VALIDATION_FAILED", message } };
}

function isFiniteProjection(snapshot: AcousticSnapshotProjection): boolean {
  return [
    snapshot.effectiveDistanceM,
    snapshot.dryGainDb,
    snapshot.lowpassHz,
    snapshot.portalCount,
    snapshot.rt60S.low,
    snapshot.rt60S.mid,
    snapshot.rt60S.high,
  ].every(Number.isFinite);
}

function isValidRequest(request: ExplainAcousticsRequest): boolean {
  return (
    request.sceneName.trim().length > 0 &&
    request.sceneName.length <= MAX_LABEL_LENGTH &&
    request.sourceName.trim().length > 0 &&
    request.sourceName.length <= MAX_LABEL_LENGTH &&
    (request.snapshot.routeType === "direct" ||
      request.snapshot.routeType === "portal" ||
      request.snapshot.routeType === "blocked") &&
    isFiniteProjection(request.snapshot)
  );
}

function projectedNumbers(snapshot: AcousticSnapshotProjection): readonly number[] {
  return [
    snapshot.effectiveDistanceM,
    snapshot.dryGainDb,
    snapshot.lowpassHz,
    snapshot.portalCount,
    snapshot.rt60S.low,
    snapshot.rt60S.mid,
    snapshot.rt60S.high,
  ];
}

function hasOnlyProjectedNumbers(value: string, snapshot: AcousticSnapshotProjection): boolean {
  if (
    /[-+]?(?:\d+(?:\.\d+)?|\.\d+)[eE][-+]?\d+/.test(value) ||
    /(?:\d|\.\d)[A-Za-z_]/.test(value) ||
    /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\b/i.test(
      value,
    )
  ) {
    return false;
  }
  const allowed = projectedNumbers(snapshot);
  const numericTokens = value.match(/(?<![A-Za-z_])[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?![A-Za-z_])/g) ?? [];
  return numericTokens.every((token) => allowed.some((number) => Number(token) === number));
}

function isUnsupportedClaim(value: string): boolean {
  return /\b(?:heard|listen(?:ed|ing)?|sound(?:s|ed|ing)?|realistic|accurate|accuracy|physically accurate|scientifically validated|architectural(?:[- ]acoustics?)?)\b/i.test(
    value,
  );
}

function isGroundedExplanation(candidate: AcousticExplanation, snapshot: AcousticSnapshotProjection): boolean {
  const displayedStrings = [
    candidate.summary,
    ...candidate.factors.flatMap((factor) => [factor.label, factor.evidence]),
    ...candidate.limitations,
  ];
  return displayedStrings.every(
    (value) => hasOnlyProjectedNumbers(value, snapshot) && !isUnsupportedClaim(value),
  );
}

export function buildAcousticExplanationPrompt(request: ExplainAcousticsRequest): string {
  return [
    "Explain only the deterministic acoustic projection below.",
    "Do not calculate, infer, or introduce measurements not present in the projection.",
    "Do not claim to hear audio or claim physical/scientific accuracy.",
    "Use concise prose. Any numeric token you display must exactly represent a provided value; do not use attached units, scientific notation, or spelled-out numbers.",
    "Return only the strict JSON object requested by the schema.",
    JSON.stringify(request),
  ].join("\n");
}

export async function explainAcoustics(
  request: ExplainAcousticsRequest,
  dependencies: ExplainDependencies,
): Promise<AcousticExplanationResponse> {
  if (!isValidRequest(request)) {
    return failure("The deterministic acoustic snapshot is invalid or contains non-finite values.");
  }

  let output: unknown;
  try {
    output = await dependencies.generateExplanation(buildAcousticExplanationPrompt(request));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return failure("The explanation response was not valid structured data.");
    }
    throw error;
  }

  const parsed = explanationCandidateSchema.safeParse(output);
  if (!parsed.success || !isGroundedExplanation(parsed.data, request.snapshot)) {
    return failure("The explanation introduced unsupported content or measurements.");
  }

  return {
    ok: true,
    explanation: {
      ...parsed.data,
      limitations: [...new Set([...parsed.data.limitations, FIXED_PORTAL_LIMITATION])],
    },
    model: ACOUSTIC_EXPLAINER_MODEL,
  };
}
