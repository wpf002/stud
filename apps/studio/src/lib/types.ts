export interface DogSummary {
  id: string;
  slug: string;
  callName: string;
  registeredName: string | null;
  breed: string;
  sex: 'MALE' | 'FEMALE';
  dateOfBirth: string | null;
  isAncestorStub: boolean;
  isPublished: boolean;
  registrations: { id: string; body: string; number: string; isPrimary: boolean }[];
  media: { id: string; url: string; thumbUrl: string | null }[];
  pedigreeStats: {
    coi: number;
    generations: number;
    completenessRatio: number;
    generationEquivalent: number;
    deepestGeneration: number;
  } | null;
  sire: { id: string; callName: string; registeredName: string | null } | null;
  damRel: { id: string; callName: string; registeredName: string | null } | null;
}

export interface DogDetail extends DogSummary {
  colorPattern: string | null;
  markings: string | null;
  heightCm: number | null;
  weightKg: number | null;
  microchip: string | null;
  temperamentNotes: string | null;
  ownerNotes: string | null;
  isRetired: boolean;
  isDeceased: boolean;
  supersededByDogId: string | null;
  supersededBy: { id: string; slug: string; callName: string } | null;
  kennel: { id: string; slug: string; name: string; city: string | null; region: string | null } | null;
  ownerships: { id: string; user: { id: string; displayName: string | null; avatarUrl: string | null } }[];
}

export interface ChartCellDto {
  node: {
    id: string;
    name: string | null;
    sex: 'MALE' | 'FEMALE' | null;
    breed: string | null;
    birthYear: number | null;
  } | null;
  generation: number;
  slot: number;
  path: ('S' | 'D')[];
  y: number;
  height: number;
  duplicateOf: { generation: number; slot: number } | null;
  contributionRank: number | null;
  contribution: number | null;
}

export interface PedigreeResponse {
  dog: { id: string; callName: string; registeredName: string | null };
  chart: {
    generations: number;
    rows: number;
    columns: ChartCellDto[][];
    repeats: { id: string; name: string | null; positions: { generation: number; slot: number }[] }[];
    knownSlots: number;
    totalSlots: number;
  };
  coi: number;
  completeness: {
    ratio: number;
    generationEquivalent: number;
    deepestGeneration: number;
    distinctAncestors: number;
    totalSlots: number;
    ancestorLossRatio: number;
    perGeneration: { generation: number; known: number; possible: number; ratio: number }[];
  };
  contributions: {
    id: string;
    name: string | null;
    contribution: number;
    pathCount: number;
    depthViaSire: number;
    depthViaDam: number;
    ownCoi: number;
  }[];
  contributionsTruncated: boolean;
}

export interface TrialPairingResponse {
  sire: { id: string; slug: string; callName: string; registeredName: string | null; breed: string };
  dam: { id: string; slug: string; callName: string; registeredName: string | null; breed: string };
  crossBreed: { sire: string; dam: string } | null;
  pairing: {
    projectedCoi: number;
    coiBand: 'MINIMAL' | 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';
    relatedness: number;
    relationship: string;
    sireCoi: number;
    damCoi: number;
    confidence: 'HIGH' | 'MODERATE' | 'LOW' | 'INSUFFICIENT';
    confidenceNote: string;
    generations: number;
    contributionsTruncated: boolean;
    sireCompleteness: { ratio: number; generationEquivalent: number; deepestGeneration: number };
    damCompleteness: { ratio: number; generationEquivalent: number; deepestGeneration: number };
    contributions: {
      id: string;
      name: string | null;
      contribution: number;
      pathCount: number;
      depthViaSire: number;
      depthViaDam: number;
      ownCoi: number;
      dog: { id: string; slug: string; callName: string; registeredName: string | null } | null;
    }[];
  };
}

export interface MergeCandidate {
  id: string;
  score: number;
  confidence: string;
  reasons: string[];
  conflicts: string[];
  dogA: MergeCandidateDog;
  dogB: MergeCandidateDog;
}

export interface MergeCandidateDog {
  id: string;
  slug: string;
  callName: string;
  registeredName: string | null;
  sex: string;
  breed: string;
  dateOfBirth: string | null;
  microchip: string | null;
  isAncestorStub: boolean;
  registrations: { body: string; number: string }[];
  _count: { sireOffspring: number; damOffspring: number };
}

export interface ParsedDogDto {
  key: string;
  registeredName: string | null;
  callName: string | null;
  registrationNumber: string | null;
  registryBody: string | null;
  sex: 'MALE' | 'FEMALE' | null;
  titlesPrefix: string | null;
  titlesSuffix: string | null;
  sireKey: string | null;
  damKey: string | null;
  generation: number;
}

export interface PreviewResponse {
  subjectKey: string | null;
  dogs: ParsedDogDto[];
  issues: { severity: 'error' | 'warning'; line?: number; message: string }[];
  matches: {
    key: string;
    existingDogId: string | null;
    score: number;
    confidence: 'certain' | 'likely' | 'possible' | null;
    reasons: string[];
    conflicts: string[];
  }[];
  projectedCoi: number | null;
  collapsedAncestors: number;
}
