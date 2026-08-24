/**
 * The title vocabulary.
 *
 * Titles arrive as an alphabet soup — CH, GCH, CD, CDX, RN, RA, RE, MACH, JH,
 * SH, MH, HT, PT, HS, CGC, ThD — issued by several different bodies, and stored
 * as free text they are unfilterable: a buyer who wants a stud with a hunting
 * title cannot ask for one, because "SH" is just a string.
 *
 * So each code maps to a discipline, and the discipline is what gets stored as
 * the claim type. The code itself is kept as the marker, because "SH" is what
 * is written on the certificate and what a breeder will look for.
 *
 * Service and assistance dogs are deliberately absent. There is no universal
 * per-dog service-dog certification — ADI accredits training programmes and
 * IAADP sets access standards — and fake credentials are a real problem that
 * AKC and disability advocates push back on. A badge here would be inventing
 * something that does not exist. Therapy titles ARE included: ThD and TDI are
 * real, issued per dog, and are not service-dog credentials.
 */

export interface TitleSpec {
  /** As written on the certificate. */
  code: string;
  label: string;
  /** Stored as the claim type, so titles are filterable by discipline. */
  claimType: string;
  /** Who issues it. */
  body: 'AKC' | 'UKC' | 'NAVHDA' | 'TDI' | 'OTHER';
  /** Where the title sits relative to others in the same discipline. */
  level?: number;
}

const TITLES: TitleSpec[] = [
  // Conformation
  { code: 'CH', label: 'Champion', claimType: 'TITLE_CONFORMATION', body: 'AKC', level: 1 },
  { code: 'GCH', label: 'Grand Champion', claimType: 'TITLE_CONFORMATION', body: 'AKC', level: 2 },
  { code: 'GRCH', label: 'Grand Champion (UKC)', claimType: 'TITLE_CONFORMATION', body: 'UKC', level: 2 },

  // Obedience
  { code: 'CD', label: 'Companion Dog', claimType: 'TITLE_OBEDIENCE', body: 'AKC', level: 1 },
  { code: 'CDX', label: 'Companion Dog Excellent', claimType: 'TITLE_OBEDIENCE', body: 'AKC', level: 2 },
  { code: 'UD', label: 'Utility Dog', claimType: 'TITLE_OBEDIENCE', body: 'AKC', level: 3 },

  // Rally
  { code: 'RN', label: 'Rally Novice', claimType: 'TITLE_RALLY', body: 'AKC', level: 1 },
  { code: 'RA', label: 'Rally Advanced', claimType: 'TITLE_RALLY', body: 'AKC', level: 2 },
  { code: 'RE', label: 'Rally Excellent', claimType: 'TITLE_RALLY', body: 'AKC', level: 3 },

  // Agility
  { code: 'MACH', label: 'Master Agility Champion', claimType: 'TITLE_AGILITY', body: 'AKC', level: 3 },

  // Hunt tests — sporting breeds
  { code: 'JH', label: 'Junior Hunter', claimType: 'TITLE_HUNT_TEST', body: 'AKC', level: 1 },
  { code: 'SH', label: 'Senior Hunter', claimType: 'TITLE_HUNT_TEST', body: 'AKC', level: 2 },
  { code: 'MH', label: 'Master Hunter', claimType: 'TITLE_HUNT_TEST', body: 'AKC', level: 3 },
  { code: 'NA (NAVHDA)', label: 'NAVHDA Natural Ability', claimType: 'NAVHDA_NA', body: 'NAVHDA', level: 1 },
  { code: 'UT (NAVHDA)', label: 'NAVHDA Utility', claimType: 'NAVHDA_UT', body: 'NAVHDA', level: 2 },

  // Herding
  { code: 'HT', label: 'Herding Tested', claimType: 'TITLE_HERDING', body: 'AKC', level: 1 },
  { code: 'PT', label: 'Pre-Trial Tested', claimType: 'TITLE_HERDING', body: 'AKC', level: 1 },
  { code: 'HS', label: 'Herding Started', claimType: 'TITLE_HERDING', body: 'AKC', level: 2 },

  // Citizenship and therapy
  { code: 'CGC', label: 'Canine Good Citizen', claimType: 'TITLE_TEMPERAMENT', body: 'AKC', level: 1 },
  { code: 'CGCA', label: 'Community Canine', claimType: 'TITLE_TEMPERAMENT', body: 'AKC', level: 2 },
  { code: 'ThD', label: 'Therapy Dog', claimType: 'TITLE_THERAPY', body: 'AKC', level: 1 },
  { code: 'TDIA', label: 'Therapy Dogs International', claimType: 'TITLE_THERAPY', body: 'TDI', level: 1 },
  { code: 'TDIG', label: 'Therapy Dogs International (Gold)', claimType: 'TITLE_THERAPY', body: 'TDI', level: 2 },
];

const BY_CODE = new Map(TITLES.map((t) => [t.code.toUpperCase(), t]));

export function titleSpec(code: string | null | undefined): TitleSpec | null {
  if (!code) return null;
  return BY_CODE.get(code.trim().toUpperCase()) ?? null;
}

/** The claim type a title code should be stored under. */
export function titleClaimType(code: string): string {
  return titleSpec(code)?.claimType ?? 'TITLE_AWARD';
}

/** Disciplines a buyer can filter by, in the order they are shown. */
export const TITLE_DISCIPLINES: { claimType: string; label: string }[] = [
  { claimType: 'TITLE_CONFORMATION', label: 'Conformation' },
  { claimType: 'TITLE_HUNT_TEST', label: 'Hunt Test' },
  { claimType: 'NAVHDA_NA', label: 'NAVHDA' },
  { claimType: 'TITLE_HERDING', label: 'Herding' },
  { claimType: 'TITLE_OBEDIENCE', label: 'Obedience' },
  { claimType: 'TITLE_RALLY', label: 'Rally' },
  { claimType: 'TITLE_AGILITY', label: 'Agility' },
  { claimType: 'TITLE_TEMPERAMENT', label: 'Good Citizen' },
  { claimType: 'TITLE_THERAPY', label: 'Therapy' },
];

export function allTitles(): readonly TitleSpec[] {
  return TITLES;
}
