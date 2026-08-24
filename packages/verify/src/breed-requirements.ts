/**
 * What health testing a breed is expected to have on file.
 *
 * Replaces a flat five-test list that every breed shared, which was wrong for
 * most of them: a Cavalier's problem is its heart, a Yorkshire Terrier's is its
 * knees, and showing both dogs "elbows: not tested" told a buyer nothing while
 * hiding what actually matters for that breed.
 *
 * PROVENANCE, because this is health data and getting it wrong misleads
 * someone spending thousands on a dog. OFA's CHIC programme is the authority:
 * it defines, per breed, which tests a dog must have to earn a CHIC number.
 * This table is NOT scraped from it. `docs/verification-sources.md` gates live
 * OFA access on a terms-of-use review that has not happened, and the standard
 * this product holds breeders to is the one it has to hold itself to.
 *
 * So these lists are authored, and every entry carries the breed's own CHIC
 * page so a human can check it. They are labelled in the UI as what is
 * commonly required — not as CHIC's own list — until somebody has confirmed
 * them against the source. Treat an unreviewed entry as a strong hint, not a
 * citation.
 */

/** Claim types, matching the vocabulary in packages/ui/src/claim-label.ts. */
const HIP = 'HIP';
const ELBOW = 'ELBOW';
const EYE = 'EYE_CAER';
const CARDIAC = 'CARDIAC';
const PATELLA = 'PATELLA';
const THYROID = 'THYROID';
const TRACHEA = 'TRACHEA';
const LCP = 'LEGG_CALVE_PERTHES';
const DNA = 'DNA_PANEL';
const HEARING = 'HEARING_BAER';

export interface BreedRequirement {
  /** Tests a buyer should expect to see, or see explicitly marked untested. */
  required: readonly string[];
  /** Worth having, commonly done, not treated as an omission when missing. */
  recommended?: readonly string[];
  /** Whether a human has checked this against OFA's CHIC page. */
  reviewed: boolean;
}

/**
 * Keyed by AKC breed name, matching the `breed` string on Dog.
 * Covers the breeds in the seeded dataset; anything else falls back.
 */
const BREEDS: Record<string, BreedRequirement> = {
  'Golden Retriever': { required: [HIP, ELBOW, EYE, CARDIAC], recommended: [DNA], reviewed: false },
  'Labrador Retriever': { required: [HIP, ELBOW, EYE], recommended: [DNA, CARDIAC], reviewed: false },
  'German Shepherd Dog': { required: [HIP, ELBOW], recommended: [DNA, CARDIAC], reviewed: false },
  'German Shorthaired Pointer': { required: [HIP, EYE, CARDIAC], recommended: [DNA, ELBOW], reviewed: false },
  'Poodle': { required: [HIP, EYE], recommended: [DNA, PATELLA], reviewed: false },
  'Bernese Mountain Dog': { required: [HIP, ELBOW, EYE, CARDIAC], recommended: [DNA], reviewed: false },
  'Rottweiler': { required: [HIP, ELBOW, CARDIAC, EYE], recommended: [DNA], reviewed: false },
  'Cane Corso': { required: [HIP, ELBOW, EYE, CARDIAC], recommended: [DNA], reviewed: false },
  'Great Dane': { required: [HIP, CARDIAC, EYE], recommended: [THYROID, DNA], reviewed: false },
  'Doberman Pinscher': { required: [CARDIAC, THYROID, EYE, HIP], recommended: [DNA], reviewed: false },
  'Boxer': { required: [CARDIAC, THYROID, HIP], recommended: [DNA], reviewed: false },
  'Siberian Husky': { required: [HIP, EYE], recommended: [DNA], reviewed: false },
  'Australian Shepherd': { required: [HIP, EYE], recommended: [DNA, ELBOW], reviewed: false },
  'Miniature American Shepherd': { required: [HIP, EYE], recommended: [DNA], reviewed: false },
  'Border Collie': { required: [HIP, EYE], recommended: [DNA, HEARING], reviewed: false },
  'Shetland Sheepdog': { required: [HIP, EYE], recommended: [DNA, THYROID], reviewed: false },
  'Pembroke Welsh Corgi': { required: [HIP, EYE], recommended: [DNA], reviewed: false },
  'English Springer Spaniel': { required: [HIP, EYE], recommended: [DNA, THYROID], reviewed: false },
  'Beagle': { required: [HIP, EYE], recommended: [THYROID, DNA], reviewed: false },
  'Cavalier King Charles Spaniel': { required: [CARDIAC, EYE, HIP, PATELLA], recommended: [DNA], reviewed: false },
  'Dachshund': { required: [EYE, CARDIAC, PATELLA], recommended: [DNA], reviewed: false },
  'Miniature Schnauzer': { required: [EYE, CARDIAC], recommended: [DNA], reviewed: false },
  'Yorkshire Terrier': { required: [PATELLA, EYE, LCP], recommended: [DNA], reviewed: false },
  'Chihuahua': { required: [PATELLA, CARDIAC, EYE], recommended: [DNA], reviewed: false },
  'Pomeranian': { required: [PATELLA, EYE, CARDIAC], recommended: [DNA], reviewed: false },
  'Havanese': { required: [HIP, EYE, PATELLA], recommended: [HEARING, DNA], reviewed: false },
  'Shih Tzu': { required: [HIP, EYE, PATELLA], recommended: [DNA], reviewed: false },
  'French Bulldog': { required: [PATELLA, CARDIAC, EYE, TRACHEA], recommended: [HIP, DNA], reviewed: false },
  'Bulldog': { required: [CARDIAC, PATELLA, TRACHEA], recommended: [HIP, DNA], reviewed: false },
  'Boston Terrier': { required: [PATELLA, EYE, CARDIAC], recommended: [DNA], reviewed: false },
};

/**
 * Used when a breed is not in the table. Deliberately the orthopedic and eye
 * basics rather than a guess at that breed's specifics — a generic list that is
 * merely incomplete is honest; an invented breed-specific one is not.
 */
const FALLBACK: BreedRequirement = {
  required: [HIP, ELBOW, EYE],
  recommended: [CARDIAC],
  reviewed: false,
};

export interface BreedRequirementResult extends BreedRequirement {
  breed: string;
  /** False when the fallback was used, so the UI can word it accordingly. */
  breedSpecific: boolean;
  /** OFA's CHIC page — the authority for this breed. */
  chicUrl: string;
}

export function breedRequirements(breed: string | null | undefined): BreedRequirementResult {
  const key = (breed ?? '').trim();
  const hit = BREEDS[key];
  const base = hit ?? FALLBACK;
  return {
    ...base,
    breed: key,
    breedSpecific: Boolean(hit),
    chicUrl: `https://ofa.org/chic-programs/browse-by-breed/?breed=${encodeURIComponent(key)}`,
  };
}

/** Just the claim types a profile should show as expected. */
export function expectedClaims(breed: string | null | undefined): string[] {
  return [...breedRequirements(breed).required];
}

/** Breeds this table actually knows about — used by tests and tooling. */
export function coveredBreeds(): string[] {
  return Object.keys(BREEDS).sort();
}
