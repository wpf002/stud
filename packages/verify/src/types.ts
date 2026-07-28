/**
 * The vocabulary of verification.
 *
 * Everything downstream — the state machine, the adapters, the badge, the
 * marketplace filters — speaks these types. Getting them right is most of the
 * work; the adapters are comparatively mechanical.
 */

// ── States ──────────────────────────────────────────────────────────────────

/**
 * Verification is a state machine, never a boolean (invariant 3).
 *
 *   UNVERIFIED ──submit──▶ PENDING ──found────▶ VERIFIED
 *        ▲                    │                     │
 *        └────not found───────┘                     │
 *                                          age out  ▼
 *                                              STALE ──recheck──▶ VERIFIED
 *                                                  │                  │
 *                                                  └──source changed──┤
 *                                                                     ▼
 *                                                              CONFLICTED
 *
 * REPORTED is deliberately NOT in this machine. It is a different *tier* of
 * claim — owner-attested — living in its own table and its own column
 * (invariant 5). It can never transition into VERIFIED; only a source lookup
 * produces a verified claim.
 */
export type VerificationState = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'STALE' | 'CONFLICTED';

/** Includes the self-attested tier, for presentation only. */
export type ClaimTier = VerificationState | 'REPORTED';

// ── What can be claimed ─────────────────────────────────────────────────────

export type ClaimCategory = 'HEALTH' | 'GENETIC' | 'TITLE' | 'REGISTRATION' | 'PERFORMANCE';

/**
 * The specific thing being attested. Deliberately granular: "health tested"
 * is the vague phrase this whole product exists to replace.
 */
export type ClaimType =
  // ── Orthopaedic / phenotypic (OFA, PennHIP, BVA) ──
  | 'HIP'
  | 'ELBOW'
  | 'PATELLA'
  | 'SHOULDER'
  | 'LEGG_CALVE_PERTHES'
  | 'CARDIAC'
  | 'EYE_CAER'
  | 'THYROID'
  | 'DENTITION'
  | 'TRACHEA'
  | 'HEARING_BAER'
  // ── Genetic panels ──
  | 'DNA_PANEL'
  | 'DNA_MARKER'
  | 'GENETIC_COI'
  // ── Registry ──
  | 'REGISTRATION'
  | 'CHIC'
  | 'DNA_PROFILE'
  // ── Titles and performance ──
  | 'TITLE_CONFORMATION'
  | 'TITLE_FIELD'
  | 'TITLE_HUNT_TEST'
  | 'TITLE_OBEDIENCE'
  | 'TITLE_RALLY'
  | 'TITLE_AGILITY'
  | 'TITLE_TRACKING'
  | 'TITLE_HERDING'
  | 'TITLE_WORKING'
  | 'TITLE_SERVICE'
  | 'TITLE_TEMPERAMENT'
  | 'NAVHDA_NA'
  | 'NAVHDA_UT'
  | 'NAVHDA_INVITATIONAL';

export const CLAIM_CATEGORY: Record<ClaimType, ClaimCategory> = {
  HIP: 'HEALTH', ELBOW: 'HEALTH', PATELLA: 'HEALTH', SHOULDER: 'HEALTH',
  LEGG_CALVE_PERTHES: 'HEALTH', CARDIAC: 'HEALTH', EYE_CAER: 'HEALTH',
  THYROID: 'HEALTH', DENTITION: 'HEALTH', TRACHEA: 'HEALTH', HEARING_BAER: 'HEALTH',
  DNA_PANEL: 'GENETIC', DNA_MARKER: 'GENETIC', GENETIC_COI: 'GENETIC',
  REGISTRATION: 'REGISTRATION', CHIC: 'REGISTRATION', DNA_PROFILE: 'REGISTRATION',
  TITLE_CONFORMATION: 'TITLE', TITLE_OBEDIENCE: 'TITLE', TITLE_RALLY: 'TITLE',
  TITLE_AGILITY: 'TITLE', TITLE_TRACKING: 'TITLE', TITLE_TEMPERAMENT: 'TITLE',
  TITLE_FIELD: 'PERFORMANCE', TITLE_HUNT_TEST: 'PERFORMANCE', TITLE_HERDING: 'PERFORMANCE',
  TITLE_WORKING: 'PERFORMANCE', TITLE_SERVICE: 'PERFORMANCE',
  NAVHDA_NA: 'PERFORMANCE', NAVHDA_UT: 'PERFORMANCE', NAVHDA_INVITATIONAL: 'PERFORMANCE',
};

export const CLAIM_LABEL: Record<ClaimType, string> = {
  HIP: 'Hips', ELBOW: 'Elbows', PATELLA: 'Patellas', SHOULDER: 'Shoulders',
  LEGG_CALVE_PERTHES: 'Legg-Calve-Perthes', CARDIAC: 'Cardiac', EYE_CAER: 'Eyes (CAER)',
  THYROID: 'Thyroid', DENTITION: 'Dentition', TRACHEA: 'Trachea', HEARING_BAER: 'Hearing (BAER)',
  DNA_PANEL: 'Genetic panel', DNA_MARKER: 'Genetic marker', GENETIC_COI: 'Genetic COI',
  REGISTRATION: 'Registration', CHIC: 'CHIC number', DNA_PROFILE: 'DNA profile',
  TITLE_CONFORMATION: 'Conformation title', TITLE_FIELD: 'Field trial title',
  TITLE_HUNT_TEST: 'Hunt test title', TITLE_OBEDIENCE: 'Obedience title',
  TITLE_RALLY: 'Rally title', TITLE_AGILITY: 'Agility title', TITLE_TRACKING: 'Tracking title',
  TITLE_HERDING: 'Herding title', TITLE_WORKING: 'Working title', TITLE_SERVICE: 'Service title',
  TITLE_TEMPERAMENT: 'Temperament test',
  NAVHDA_NA: 'NAVHDA Natural Ability', NAVHDA_UT: 'NAVHDA Utility',
  NAVHDA_INVITATIONAL: 'NAVHDA Invitational',
};

// ── Outcome ─────────────────────────────────────────────────────────────────

/**
 * The normalised meaning of a result, across sources that all phrase it
 * differently. This is what buyer-facing filters key on — "verified health
 * status" has to mean something comparable across OFA, PennHIP and BVA.
 *
 * NORMAL is deliberately not called "PASS": OFA does not pass dogs, it grades
 * them, and a Fair hip is a normal hip.
 */
export type ClaimOutcome =
  | 'NORMAL'
  | 'CARRIER'
  | 'AT_RISK'
  | 'ABNORMAL'
  | 'INCONCLUSIVE'
  | 'INFORMATIONAL';

export const OUTCOME_LABEL: Record<ClaimOutcome, string> = {
  NORMAL: 'Normal',
  CARRIER: 'Carrier',
  AT_RISK: 'At risk',
  ABNORMAL: 'Abnormal',
  INCONCLUSIVE: 'Inconclusive',
  INFORMATIONAL: 'On record',
};

// ── Sources ─────────────────────────────────────────────────────────────────

export type SourceId =
  | 'OFA'
  | 'AKC'
  | 'UKC'
  | 'CKC'
  | 'NAVHDA'
  | 'AFTCA'
  | 'PENNHIP'
  | 'EMBARK'
  | 'WISDOM'
  | 'UC_DAVIS'
  | 'PAW_PRINT'
  | 'DOCUMENT'
  | 'FIXTURE';

export interface SourceMeta {
  id: SourceId;
  label: string;
  /** Public homepage, shown in evidence panels. */
  homepage: string;
  /** Which claim types this source can speak to. */
  claimTypes: readonly ClaimType[];
  /** How long a successful check stays fresh, in days. */
  freshnessDays: number;
  /**
   * `machine` — we query it and parse a response.
   * `human`   — a person reviews an uploaded document.
   *
   * The distinction matters for what we promise: a machine-checked claim is
   * reproducible, a human-reviewed one is a judgement.
   */
  mode: 'machine' | 'human';
}

// ── Lookup contract ─────────────────────────────────────────────────────────

export interface LookupInput {
  /** The key the source indexes on — usually a registration number. */
  identifier: string;
  /** Registry the identifier belongs to, when the source needs it. */
  registryBody?: string | null;
  /** Narrow the lookup. Omit for "everything this source has". */
  claimTypes?: readonly ClaimType[];
  /** Helps disambiguate when a source keys on more than a number. */
  dogName?: string | null;
  breed?: string | null;
  /** Abort signal, so a slow source cannot hold a request open. */
  signal?: AbortSignal;
}

/** One finding from a source. Sources return zero or more of these. */
export interface SourceFinding {
  claimType: ClaimType;
  /** Verbatim, as the source phrases it: "Excellent", "Normal", "MH". */
  rawResult: string;
  /** Our normalised reading of `rawResult`. */
  outcome: ClaimOutcome;
  /** When the test was performed or the title awarded. */
  testedAt?: Date | null;
  /** Source's own identifier for this record, when it has one. */
  sourceRecordId?: string | null;
  /** Deep link to the public record. */
  sourceUrl?: string | null;
  /** Anything worth showing that does not fit the shape above. */
  detail?: string | null;
  /** For DNA_MARKER: which gene/variant. */
  markerName?: string | null;
  /** Age at test, in months, where the source publishes it. */
  ageAtTestMonths?: number | null;
}

export type LookupStatus =
  /** The source answered and had records. */
  | 'FOUND'
  /** The source answered and had nothing for this identifier. */
  | 'NOT_FOUND'
  /** The source could not be reached, or refused. Not a negative result. */
  | 'UNAVAILABLE'
  /** We are configured not to contact this source right now. */
  | 'DISABLED'
  /** The identifier is not one this source can use. */
  | 'UNSUPPORTED_IDENTIFIER';

export interface LookupResult {
  source: SourceId;
  status: LookupStatus;
  findings: SourceFinding[];
  /** The identifier actually matched on, after normalisation. */
  matchedIdentifier?: string | null;
  /** The dog name the source holds — a mismatch is worth surfacing. */
  matchedName?: string | null;
  /** Wall-clock time of the lookup, for the audit trail. */
  checkedAt: Date;
  durationMs: number;
  /** Populated on UNAVAILABLE. Never conflated with NOT_FOUND. */
  error?: string | null;
  /** Raw payload, retained so a parser fix can be replayed without re-querying. */
  raw?: unknown;
}

export interface SourceAdapter {
  meta: SourceMeta;
  /**
   * Look up an identifier.
   *
   * MUST NOT throw for an absent record — that is `NOT_FOUND`. Throwing is
   * reserved for programmer error. Transport failures return `UNAVAILABLE`,
   * because "we could not ask" and "the answer is no" are different facts and
   * conflating them is how a trust product starts lying.
   */
  lookup(input: LookupInput): Promise<LookupResult>;
}

export class VerifyError extends Error {
  constructor(
    message: string,
    public code: 'CONFIG' | 'TRANSPORT' | 'PARSE',
  ) {
    super(message);
    this.name = 'VerifyError';
  }
}
