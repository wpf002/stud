/**
 * Duplicate-dog detection.
 *
 * This problem starts on day one and never stops. Every pedigree import
 * carries ancestors that already exist under a slightly different spelling,
 * and a duplicated ancestor silently *lowers* the COI it appears in — the two
 * copies look like two unrelated dogs. Left alone it quietly corrupts the one
 * number the whole product is selling.
 *
 * Scoring is deliberately conservative. A false merge destroys a record;
 * a missed one just leaves work for a human.
 *
 * Pure module. (Invariant 1.)
 */

import { normaliseName } from './parse.js';

export interface DedupeCandidate {
  id: string;
  registeredName?: string | null;
  callName?: string | null;
  registrationNumber?: string | null;
  registryBody?: string | null;
  microchip?: string | null;
  sex?: 'MALE' | 'FEMALE' | null;
  breed?: string | null;
  birthYear?: number | null;
  dateOfBirth?: string | Date | null;
}

export interface DuplicateMatch {
  a: string;
  b: string;
  /** 0–1. Only pairs at or above the threshold are returned. */
  score: number;
  /** `certain` merges can be offered one-click; `likely` needs a human. */
  confidence: 'certain' | 'likely' | 'possible';
  reasons: string[];
  /** Facts that argue against the merge. Shown even on a high score. */
  conflicts: string[];
}

/** Levenshtein, capped — we only care about small distances. */
function editDistance(a: string, b: string, max = 6): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(cur[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
    }
  return prev[b.length]!;
}

/** 0–1 name similarity on normalised names, with a token-overlap fallback. */
export function nameSimilarity(a: string, b: string): number {
  const na = normaliseName(a);
  const nb = normaliseName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const longest = Math.max(na.length, nb.length);
  // The cap returns a sentinel of `max + 1`, which is NOT a real distance.
  // Feeding it into the ratio produces a confident-looking score for two
  // completely different names, so bail out instead.
  const cap = 6;
  const dist = editDistance(na, nb, cap);
  const byEdit = dist > cap || dist > longest ? 0 : 1 - dist / longest;

  // "Blackwater's Ranger Of The Marsh" vs "Ranger Of The Marsh" — a kennel
  // prefix dropped on one side is the single most common variation.
  const ta = new Set(na.split(' ').filter((t) => t.length > 2));
  const tb = new Set(nb.split(' ').filter((t) => t.length > 2));
  const overlap = [...ta].filter((t) => tb.has(t)).length;
  const byToken = overlap === 0 ? 0 : overlap / Math.min(ta.size, tb.size);

  return Math.max(byEdit, byToken * 0.92);
}

function normaliseReg(n: string): string {
  return n.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function yearOf(c: DedupeCandidate): number | null {
  if (c.birthYear) return c.birthYear;
  if (!c.dateOfBirth) return null;
  const d = c.dateOfBirth instanceof Date ? c.dateOfBirth : new Date(c.dateOfBirth);
  return Number.isNaN(d.getTime()) ? null : d.getUTCFullYear();
}

/**
 * Score one pair.
 *
 * Two identifiers are decisive on their own — a matching microchip or a
 * matching registration number on the same registry. Everything else is
 * evidence that has to accumulate.
 */
export function scorePair(a: DedupeCandidate, b: DedupeCandidate): DuplicateMatch | null {
  if (a.id === b.id) return null;

  const reasons: string[] = [];
  const conflicts: string[] = [];
  let score = 0;

  // ── Decisive identifiers ────────────────────────────────────────────────
  if (a.microchip && b.microchip) {
    if (normaliseReg(a.microchip) === normaliseReg(b.microchip)) {
      reasons.push('Same microchip number');
      score = 1;
    } else {
      conflicts.push('Different microchip numbers');
      score -= 0.6;
    }
  }

  if (a.registrationNumber && b.registrationNumber) {
    const sameNumber = normaliseReg(a.registrationNumber) === normaliseReg(b.registrationNumber);
    const sameBody = !a.registryBody || !b.registryBody || a.registryBody === b.registryBody;
    if (sameNumber && sameBody) {
      reasons.push(`Same ${a.registryBody ?? 'registration'} number`);
      score = Math.max(score, 0.97);
    } else if (sameNumber) {
      reasons.push('Same number on different registries');
      score += 0.25;
    } else if (sameBody) {
      conflicts.push(`Different ${a.registryBody ?? 'registration'} numbers`);
      score -= 0.55;
    }
  }

  // ── Name ────────────────────────────────────────────────────────────────
  const nameA = a.registeredName ?? a.callName ?? '';
  const nameB = b.registeredName ?? b.callName ?? '';
  const sim = nameSimilarity(nameA, nameB);
  if (sim >= 0.98) {
    reasons.push('Identical registered name');
    score += 0.6;
  } else if (sim >= 0.86) {
    reasons.push(`Very similar name (${Math.round(sim * 100)}% match)`);
    score += 0.42;
  } else if (sim >= 0.72) {
    reasons.push(`Similar name (${Math.round(sim * 100)}% match)`);
    score += 0.2;
  } else if (score < 0.9) {
    // Without a decisive identifier, dissimilar names end it.
    return null;
  }

  // ── Corroborating attributes ────────────────────────────────────────────
  if (a.sex && b.sex) {
    if (a.sex === b.sex) {
      score += 0.06;
    } else {
      conflicts.push('Recorded as different sexes');
      score -= 0.5;
    }
  }

  if (a.breed && b.breed) {
    if (normaliseName(a.breed) === normaliseName(b.breed)) {
      score += 0.06;
    } else {
      conflicts.push(`Different breeds (${a.breed} vs ${b.breed})`);
      score -= 0.35;
    }
  }

  const ya = yearOf(a);
  const yb = yearOf(b);
  if (ya && yb) {
    const gap = Math.abs(ya - yb);
    if (gap === 0) {
      reasons.push('Same birth year');
      score += 0.14;
    } else if (gap === 1) {
      score += 0.02;
    } else {
      conflicts.push(`Birth years ${gap} years apart (${ya} vs ${yb})`);
      score -= 0.4;
    }
  }

  score = Math.max(0, Math.min(1, score));
  if (score < 0.6) return null;

  return {
    a: a.id,
    b: b.id,
    score,
    confidence: score >= 0.95 ? 'certain' : score >= 0.8 ? 'likely' : 'possible',
    reasons,
    conflicts,
  };
}

/**
 * Find duplicate pairs across a set.
 *
 * Blocked on cheap keys (registration number, microchip, first significant
 * name token) so this stays near-linear instead of comparing every dog to
 * every other dog.
 */
export function findDuplicates(
  candidates: readonly DedupeCandidate[],
  opts: { minScore?: number; maxPairs?: number } = {},
): DuplicateMatch[] {
  const minScore = opts.minScore ?? 0.6;
  const maxPairs = opts.maxPairs ?? 500;

  const blocks = new Map<string, DedupeCandidate[]>();
  const addTo = (key: string, c: DedupeCandidate) => {
    const list = blocks.get(key);
    if (list) list.push(c);
    else blocks.set(key, [c]);
  };

  for (const c of candidates) {
    if (c.registrationNumber) addTo(`r:${normaliseReg(c.registrationNumber)}`, c);
    if (c.microchip) addTo(`m:${normaliseReg(c.microchip)}`, c);
    const tokens = normaliseName(c.registeredName ?? c.callName ?? '')
      .split(' ')
      .filter((t) => t.length > 2);
    // Block on every significant token — a dropped kennel prefix must still
    // land the two records in a shared bucket.
    for (const t of tokens) addTo(`n:${t}`, c);
  }

  const seen = new Set<string>();
  const out: DuplicateMatch[] = [];

  for (const bucket of blocks.values()) {
    if (bucket.length < 2 || bucket.length > 400) continue;
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i]!;
        const b = bucket[j]!;
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const match = scorePair(a, b);
        if (match && match.score >= minScore) out.push(match);
        if (out.length >= maxPairs) break;
      }
    }
  }

  return out.sort((x, y) => y.score - x.score);
}
