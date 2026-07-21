export type Hybrid3DFlags = Readonly<{
  spatial3d: boolean;
  verticalReflections: boolean;
  secondOrderReflections: boolean;
  receiverConnection: boolean;
  sixBandMaterials: boolean;
  airAbsorption: boolean;
  diffuseScattering: boolean;
  directionalLateReverb: boolean;
  edgeDiffraction: boolean;
  lowFrequencyWaveBranch: boolean;
}>;

export type Hybrid3DFlagIssue = Readonly<{
  flag: keyof Hybrid3DFlags;
  message: string;
}>;

export const DEFAULT_HYBRID_3D_FLAGS: Hybrid3DFlags = Object.freeze({
  spatial3d: false,
  verticalReflections: false,
  secondOrderReflections: false,
  receiverConnection: false,
  sixBandMaterials: false,
  airAbsorption: false,
  diffuseScattering: false,
  directionalLateReverb: false,
  edgeDiffraction: false,
  lowFrequencyWaveBranch: false,
});

export function createHybrid3DFlags(overrides: Partial<Hybrid3DFlags> = {}): Hybrid3DFlags {
  const flags = { ...DEFAULT_HYBRID_3D_FLAGS, ...overrides };
  const issues = validateHybrid3DFlags(flags);
  if (issues.length > 0) {
    throw new Error(issues.map(({ message }) => message).join(" "));
  }
  return Object.freeze(flags);
}

export function validateHybrid3DFlags(flags: Hybrid3DFlags): readonly Hybrid3DFlagIssue[] {
  const issues: Hybrid3DFlagIssue[] = [];
  const spatialDependents: (keyof Hybrid3DFlags)[] = [
    "verticalReflections",
    "secondOrderReflections",
    "receiverConnection",
    "sixBandMaterials",
    "airAbsorption",
    "diffuseScattering",
    "directionalLateReverb",
    "edgeDiffraction",
    "lowFrequencyWaveBranch",
  ];

  for (const flag of spatialDependents) {
    if (flags[flag] && !flags.spatial3d) {
      issues.push({ flag, message: `${flag} requires spatial3d to be enabled.` });
    }
  }
  if (flags.secondOrderReflections && !flags.verticalReflections) {
    issues.push({
      flag: "secondOrderReflections",
      message: "secondOrderReflections requires verticalReflections to be enabled.",
    });
  }
  return issues;
}
