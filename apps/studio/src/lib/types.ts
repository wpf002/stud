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

export interface VerifiedClaimDto {
  id: string;
  claimType: string;
  markerName: string | null;
  category: string;
  state: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'STALE' | 'CONFLICTED';
  source: string;
  outcome: 'NORMAL' | 'CARRIER' | 'AT_RISK' | 'ABNORMAL' | 'INCONCLUSIVE' | 'INFORMATIONAL' | null;
  rawResult: string | null;
  sourceUrl: string | null;
  detail: string | null;
  testedAt: string | null;
  lastCheckedAt: string | null;
  matchedIdentifier: string | null;
  conflictRawResult: string | null;
  conflictNote: string | null;
  conflictedAt: string | null;
}

export interface ReportedClaimDto {
  id: string;
  claimType: string;
  markerName: string | null;
  category: string;
  statedResult: string;
  statedTestedAt: string | null;
  note: string | null;
}

export interface VerificationSummaryDto {
  verifiedCount: number;
  reportedCount: number;
  unverifiedCount: number;
  staleCount: number;
  conflictedCount: number;
  healthNormalCount: number;
  concerningCount: number;
  verifiedTitleCount: number;
  hasChic: boolean;
  density: number;
}

export interface VerificationResponse {
  dog: {
    id: string;
    slug: string;
    callName: string;
    registeredName: string | null;
    breed: string;
    registrations: { id: string; body: string; number: string; isPrimary: boolean }[];
  };
  verified: VerifiedClaimDto[];
  reported: ReportedClaimDto[];
  summary: VerificationSummaryDto | null;
  recentChecks: {
    id: string;
    source: string;
    status: string;
    findingCount: number;
    durationMs: number;
    error: string | null;
    createdAt: string;
    identifier: string;
  }[];
}

// ── Phase 3: breeder workspace ──────────────────────────────────────────────

export type PredictionConfidence = 'NONE' | 'LOW' | 'MODERATE' | 'HIGH';

export interface HeatPredictionDto {
  predictedStart: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  averageIntervalDays: number | null;
  intervalStdDevDays: number | null;
  cyclesObserved: number;
  confidence: PredictionConfidence;
  note: string;
  daysAway: number | null;
}

export interface WhelpForecastDto {
  dueOn: string | null;
  earliest: string | null;
  latest: string | null;
  basis: 'OVULATION' | 'LH_SURGE' | 'BREEDING_DATE' | 'NONE';
  daysAway: number | null;
  gestationDay: number | null;
  confidence: PredictionConfidence;
  note: string;
}

export interface ProgesteroneInterpretationDto {
  phase: string;
  latest: { takenOn: string; ngMl: number } | null;
  estimatedLhDate: string | null;
  estimatedOvulationDate: string | null;
  ovulationBasis: 'MEASURED' | 'DERIVED_FROM_LH' | 'NONE';
  breedingWindows: Record<string, { from: string; to: string } | null>;
  retestOn: string | null;
  note: string;
}

export interface DogRef {
  id: string;
  slug?: string;
  callName: string;
  registeredName?: string | null;
  breed?: string;
}

export interface HeatCycleDto {
  id: string;
  startedOn: string;
  endedOn: string | null;
  notes: string | null;
  progesteroneTests: {
    id: string;
    takenOn: string;
    value: number;
    unit: 'NG_ML' | 'NMOL_L';
    lab: string | null;
  }[];
  observations: { id: string; observedOn: string; phase: string | null; temperatureC: number | null; notes: string | null }[];
  breedings: { id: string; status: string; method: string }[];
}

export interface BreedingDto {
  id: string;
  sireId: string;
  damId: string;
  method: string;
  status: string;
  ovulationDate: string | null;
  lhSurgeDate: string | null;
  ultrasoundOn: string | null;
  xrayOn: string | null;
  xrayPuppyCount: number | null;
  notes: string | null;
  sire: DogRef;
  dam: DogRef;
  events: { id: string; occurredOn: string; method: string; tieMinutes: number | null; notes: string | null }[];
  litter?: { id: string; status: string; whelpedOn: string | null; liveBorn: number | null } | null;
  forecast: WhelpForecastDto;
}

export interface PuppyDto {
  id: string;
  birthOrder: number | null;
  name: string | null;
  collarColor: string | null;
  sex: 'MALE' | 'FEMALE';
  status: string;
  birthWeightGrams: number | null;
  colorPattern: string | null;
  markings: string | null;
  microchip: string | null;
  bornAt: string | null;
  notes: string | null;
  weights: { id: string; recordedOn: string; grams: number }[];
}

export interface LitterMilestonesDto {
  ageDays: number;
  ageWeeks: number;
  eyesOpenOn: string;
  weaningStartsOn: string;
  socialisationOpensOn: string;
  firstVaccinationOn: string;
  goHomeFrom: string;
  inCriticalWindow: boolean;
}

export interface GrowthAssessmentDto {
  latestGrams: number | null;
  ageDays: number | null;
  multipleOfBirthWeight: number | null;
  expectedGrams: number | null;
  ratioToExpected: number | null;
  recentDailyGainGrams: number | null;
  flags: { kind: string; severity: 'WATCH' | 'URGENT'; message: string; observedOn: string }[];
  summary: string;
}

export interface CareTaskDto {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  dueOn: string;
  status: 'PENDING' | 'DONE' | 'SKIPPED';
  completedOn: string | null;
  required: boolean;
  productUsed: string | null;
  litter?: { id: string; name: string | null; letter: string | null; dam: { callName: string } } | null;
  dog?: { id: string; slug: string; callName: string } | null;
}

export interface LitterDetailResponse {
  litter: {
    id: string;
    name: string | null;
    letter: string | null;
    status: string;
    expectedWhelpOn: string | null;
    whelpedOn: string | null;
    totalBorn: number | null;
    liveBorn: number | null;
    stillborn: number | null;
    neonatalDeaths: number;
    whelpingNotes: string | null;
    sire: DogRef;
    dam: DogRef;
    breeding: { id: string; method: string; ovulationDate: string | null; xrayPuppyCount: number | null } | null;
    puppies: PuppyDto[];
    whelpingEvents: { id: string; kind: string; occurredAt: string; note: string | null }[];
    careTasks: CareTaskDto[];
  };
  milestones: LitterMilestonesDto | null;
  growth: { puppyId: string; assessment: GrowthAssessmentDto }[];
  siblings: { puppyId: string; latestGrams: number | null; rank: number | null; ofTotal: number; vsMedianGrams: number | null }[];
  referenceBand: { day: number; grams: number; lowGrams: number; highGrams: number }[];
  medianBirthWeightGrams: number | null;
}

export interface DashboardResponse {
  kennels: { id: string; name: string; slug: string; role: string }[];
  counts: {
    dogs: number;
    females: number;
    activeBreedings: number;
    littersOnTheGround: number;
    puppiesOnTheGround: number;
    overdueTasks: number;
    openConflicts: number;
    verifiedClaims: number;
  };
  upcomingHeats: { dog: DogRef; prediction: HeatPredictionDto }[];
  activeBreedings: BreedingDto[];
  activeLitters: {
    id: string;
    name: string | null;
    letter: string | null;
    status: string;
    expectedWhelpOn: string | null;
    whelpedOn: string | null;
    sire: DogRef;
    dam: DogRef;
    puppies: { id: string; sex: string; status: string }[];
    milestones: LitterMilestonesDto | null;
    available: number;
    reserved: number;
  }[];
  dueTasks: CareTaskDto[];
}

export interface HeatsResponse {
  dog: { id: string; callName: string; sex: string };
  cycles: HeatCycleDto[];
  prediction: HeatPredictionDto;
  interpretation: ProgesteroneInterpretationDto | null;
}

// ── Phase 4: stud directory ─────────────────────────────────────────────────

export interface StudRow {
  id: string;
  dogId: string;
  availability: string;
  studFeeCents: number | null;
  pickOfLitter: boolean;
  semenTypes: string[];
  shipsSemen: boolean;
  travelRadiusMiles: number | null;
  distanceMiles: number | null;
  driveHours: number | null;
  projectedCoi: number | null;
  geneticRisk: { atRisk: number; unknown: number; worst: string } | null;
  cachedDensity: number;
  dog: {
    id: string;
    slug: string;
    callName: string;
    registeredName: string | null;
    breed: string;
    dateOfBirth: string | null;
    colorPattern: string | null;
    media: { id: string; url: string }[];
    registrations: { body: string; number: string }[];
    pedigreeStats: { coi: number; completenessRatio: number } | null;
    verificationSummary: VerificationSummaryDto | null;
    kennel: {
      id: string;
      slug: string;
      name: string;
      city: string | null;
      region: string | null;
    } | null;
    verifiedClaims: {
      claimType: string;
      markerName: string;
      outcome: string | null;
      rawResult: string | null;
      state: string;
      source: string;
    }[];
  };
}

export interface StudSearchResponse {
  studs: StudRow[];
  total: number;
  take: number;
  skip: number;
  filtersApplied: {
    verifiedNormal: string[];
    hasTitle: string[];
    requireChic: boolean;
    withinMiles: number | null;
    damId: string | null;
  };
}

export interface MarkerRiskDto {
  markerName: string;
  claimType: string;
  mode: string;
  sireStatus: 'CLEAR' | 'CARRIER' | 'AFFECTED' | 'UNKNOWN';
  damStatus: 'CLEAR' | 'CARRIER' | 'AFFECTED' | 'UNKNOWN';
  outcome: { affected: number; carrier: number; clear: number } | null;
  level: 'NONE' | 'CARRIERS_PRODUCED' | 'AT_RISK' | 'UNKNOWN';
  message: string;
  untestedSide: 'SIRE' | 'DAM' | 'BOTH' | null;
}

export interface GeneticRiskDto {
  markers: MarkerRiskDto[];
  atRisk: MarkerRiskDto[];
  safe: MarkerRiskDto[];
  unknown: MarkerRiskDto[];
  worst: string;
  summary: string;
}

export interface HealthComparisonRow {
  claimType: string;
  sire: { result: string | null; outcome: string | null; state: string } | null;
  dam: { result: string | null; outcome: string | null; state: string } | null;
  bothVerified: boolean;
  gap: 'BOTH' | 'SIRE' | 'DAM' | null;
}

export interface PairingEvaluateResponse extends TrialPairingResponse {
  geneticRisk: GeneticRiskDto;
  healthComparison: HealthComparisonRow[];
}

export interface StudInquiryDto {
  id: string;
  status: string;
  message: string;
  projectedCoi: number | null;
  coiGenerations: number | null;
  geneticRiskSummary: string | null;
  atRiskMarkerCount: number;
  damVerifiedCount: number;
  proposedSeason: string | null;
  proposedMethod: string | null;
  replyMessage: string | null;
  createdAt: string;
  studListing: { id: string; dog: { id: string; slug: string; callName: string; registeredName?: string | null } };
  dam: {
    id: string;
    slug: string;
    callName: string;
    registeredName: string | null;
    breed?: string;
    dateOfBirth?: string | null;
    verificationSummary?: VerificationSummaryDto | null;
    pedigreeStats?: { coi: number; completenessRatio: number } | null;
    kennel?: { id: string; slug: string; name: string; city: string | null; region: string | null } | null;
    verifiedClaims?: { claimType: string; outcome: string | null; rawResult: string | null; markerName: string }[];
  } | null;
  fromUser: { id: string; displayName: string | null; city: string | null; region: string | null; avatarUrl: string | null };
}

export interface SavedPairingDto {
  id: string;
  label: string | null;
  notes: string | null;
  projectedCoi: number | null;
  coiBand: string | null;
  coiConfidence: string | null;
  atRiskMarkerCount: number;
  sharedAncestors: number;
  computedAt: string;
  sire: {
    id: string;
    slug: string;
    callName: string;
    registeredName: string | null;
    verificationSummary: { density: number; verifiedCount: number } | null;
    studListing: { studFeeCents: number | null; availability: string } | null;
  };
  dam: { id: string; slug: string; callName: string; registeredName: string | null };
}
