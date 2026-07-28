/**
 * Registry adapter — registration validity, registered name, and titles.
 *
 * Registries (AKC, UKC, CKC) publish title records and registration status.
 * Coverage varies wildly: some expose a public lookup, some publish only
 * event results, some publish nothing machine-readable at all.
 *
 * Where a registry is closed, claims stay REPORTED until a document is
 * reviewed. That is stated plainly on the public /verification page rather
 * than papered over — an honest gap is worth more than a badge that means
 * different things for different registries.
 *
 * Like the OFA adapter, live lookups are gated. See docs/verification-sources.md.
 */

import { normalizeIdentifier, normalizeResult } from '../normalize.js';
import {
  type ClaimType,
  type LookupInput,
  type LookupResult,
  type SourceAdapter,
  type SourceFinding,
  type SourceId,
  type SourceMeta,
} from '../types.js';

const REGISTRY_CLAIM_TYPES: readonly ClaimType[] = [
  'REGISTRATION', 'DNA_PROFILE',
  'TITLE_CONFORMATION', 'TITLE_FIELD', 'TITLE_HUNT_TEST', 'TITLE_OBEDIENCE',
  'TITLE_RALLY', 'TITLE_AGILITY', 'TITLE_TRACKING', 'TITLE_HERDING',
  'TITLE_WORKING', 'TITLE_SERVICE', 'TITLE_TEMPERAMENT',
];

export const REGISTRY_META: Record<string, SourceMeta> = {
  AKC: {
    id: 'AKC',
    label: 'AKC',
    homepage: 'https://www.akc.org',
    claimTypes: REGISTRY_CLAIM_TYPES,
    freshnessDays: 30,
    mode: 'machine',
  },
  UKC: {
    id: 'UKC',
    label: 'UKC',
    homepage: 'https://www.ukcdogs.com',
    claimTypes: REGISTRY_CLAIM_TYPES,
    freshnessDays: 30,
    mode: 'machine',
  },
  CKC: {
    id: 'CKC',
    label: 'Canadian Kennel Club',
    homepage: 'https://www.ckc.ca',
    claimTypes: REGISTRY_CLAIM_TYPES,
    freshnessDays: 45,
    mode: 'machine',
  },
};

/**
 * Title abbreviation → claim type.
 *
 * Ordered longest-first at match time so `GCHB` is not read as `CH`, and
 * `MACH` is not read as `CH` either — a mistake that would quietly promote an
 * agility dog to a conformation champion.
 */
const TITLE_CLAIMS: { code: string; claim: ClaimType; label: string }[] = [
  // Conformation
  { code: 'GCHP', claim: 'TITLE_CONFORMATION', label: 'Grand Champion Platinum' },
  { code: 'GCHG', claim: 'TITLE_CONFORMATION', label: 'Grand Champion Gold' },
  { code: 'GCHS', claim: 'TITLE_CONFORMATION', label: 'Grand Champion Silver' },
  { code: 'GCHB', claim: 'TITLE_CONFORMATION', label: 'Grand Champion Bronze' },
  { code: 'GCH', claim: 'TITLE_CONFORMATION', label: 'Grand Champion' },
  { code: 'CH', claim: 'TITLE_CONFORMATION', label: 'Champion' },
  // Field
  { code: 'NAFC', claim: 'TITLE_FIELD', label: 'National Amateur Field Champion' },
  { code: 'NFC', claim: 'TITLE_FIELD', label: 'National Field Champion' },
  { code: 'AFC', claim: 'TITLE_FIELD', label: 'Amateur Field Champion' },
  { code: 'FC', claim: 'TITLE_FIELD', label: 'Field Champion' },
  { code: 'DC', claim: 'TITLE_FIELD', label: 'Dual Champion' },
  { code: 'TC', claim: 'TITLE_FIELD', label: 'Triple Champion' },
  // Hunt tests
  { code: 'MH', claim: 'TITLE_HUNT_TEST', label: 'Master Hunter' },
  { code: 'SH', claim: 'TITLE_HUNT_TEST', label: 'Senior Hunter' },
  { code: 'JH', claim: 'TITLE_HUNT_TEST', label: 'Junior Hunter' },
  // Obedience
  { code: 'OTCH', claim: 'TITLE_OBEDIENCE', label: 'Obedience Trial Champion' },
  { code: 'UDX', claim: 'TITLE_OBEDIENCE', label: 'Utility Dog Excellent' },
  { code: 'UD', claim: 'TITLE_OBEDIENCE', label: 'Utility Dog' },
  { code: 'CDX', claim: 'TITLE_OBEDIENCE', label: 'Companion Dog Excellent' },
  { code: 'CD', claim: 'TITLE_OBEDIENCE', label: 'Companion Dog' },
  { code: 'BN', claim: 'TITLE_OBEDIENCE', label: 'Beginner Novice' },
  // Rally
  { code: 'RACH', claim: 'TITLE_RALLY', label: 'Rally Champion' },
  { code: 'RAE', claim: 'TITLE_RALLY', label: 'Rally Advanced Excellent' },
  { code: 'RE', claim: 'TITLE_RALLY', label: 'Rally Excellent' },
  { code: 'RA', claim: 'TITLE_RALLY', label: 'Rally Advanced' },
  { code: 'RN', claim: 'TITLE_RALLY', label: 'Rally Novice' },
  // Agility
  { code: 'PACH', claim: 'TITLE_AGILITY', label: 'Preferred Agility Champion' },
  { code: 'MACH', claim: 'TITLE_AGILITY', label: 'Master Agility Champion' },
  { code: 'MXJ', claim: 'TITLE_AGILITY', label: 'Master Excellent Jumper' },
  { code: 'MX', claim: 'TITLE_AGILITY', label: 'Master Agility Excellent' },
  { code: 'AXJ', claim: 'TITLE_AGILITY', label: 'Excellent Agility Jumper' },
  { code: 'AX', claim: 'TITLE_AGILITY', label: 'Agility Excellent' },
  { code: 'OAJ', claim: 'TITLE_AGILITY', label: 'Open Agility Jumper' },
  { code: 'OA', claim: 'TITLE_AGILITY', label: 'Open Agility' },
  { code: 'NAJ', claim: 'TITLE_AGILITY', label: 'Novice Agility Jumper' },
  // Tracking
  { code: 'VST', claim: 'TITLE_TRACKING', label: 'Variable Surface Tracker' },
  { code: 'TDX', claim: 'TITLE_TRACKING', label: 'Tracking Dog Excellent' },
  { code: 'TD', claim: 'TITLE_TRACKING', label: 'Tracking Dog' },
  // Herding / working
  { code: 'HC', claim: 'TITLE_HERDING', label: 'Herding Champion' },
  { code: 'WCX', claim: 'TITLE_WORKING', label: 'Working Certificate Excellent' },
  { code: 'WC', claim: 'TITLE_WORKING', label: 'Working Certificate' },
  // Temperament / good citizen
  { code: 'CGCA', claim: 'TITLE_TEMPERAMENT', label: 'Canine Good Citizen Advanced' },
  { code: 'CGCU', claim: 'TITLE_TEMPERAMENT', label: 'Canine Good Citizen Urban' },
  { code: 'CGC', claim: 'TITLE_TEMPERAMENT', label: 'Canine Good Citizen' },
  { code: 'THD', claim: 'TITLE_SERVICE', label: 'Therapy Dog' },
];

// Longest code first — `GCHB` must win over `GCH`, and `MACH` over `CH`.
const TITLE_CLAIMS_SORTED = [...TITLE_CLAIMS].sort((a, b) => b.code.length - a.code.length);

export function lookupTitle(code: string): { claim: ClaimType; label: string } | null {
  const target = code.trim().toUpperCase().replace(/[.,]/g, '');
  const hit = TITLE_CLAIMS_SORTED.find((t) => t.code === target);
  return hit ? { claim: hit.claim, label: hit.label } : null;
}

/**
 * Split a registered name into its title tokens.
 *
 * NOTE: this reads titles a *registry record* carries, not titles an owner
 * typed into a form. A title parsed out of an owner-entered name is a
 * REPORTED claim and must never enter the verified table (invariant 5).
 */
export function extractTitles(registeredName: string): { code: string; claim: ClaimType; label: string }[] {
  const out: { code: string; claim: ClaimType; label: string }[] = [];
  const seen = new Set<string>();
  for (const token of registeredName.split(/[\s,]+/)) {
    const hit = lookupTitle(token);
    if (hit && !seen.has(token.toUpperCase())) {
      seen.add(token.toUpperCase());
      out.push({ code: token.toUpperCase(), ...hit });
    }
  }
  return out;
}

export interface RegistryRecord {
  registrationNumber: string;
  registeredName: string;
  status?: string | null;
  breed?: string | null;
  dnaProfileId?: string | null;
  /** Titles the registry itself lists, separate from any in the name. */
  titles?: string[];
  issuedAt?: string | null;
}

export function parseRegistryRecord(record: RegistryRecord, sourceUrl: string | null): SourceFinding[] {
  const findings: SourceFinding[] = [];

  findings.push({
    claimType: 'REGISTRATION',
    rawResult: record.status ?? 'Registered',
    outcome: normalizeResult('REGISTRATION', record.status ?? 'Registered'),
    sourceRecordId: record.registrationNumber,
    sourceUrl,
    testedAt: record.issuedAt ? new Date(record.issuedAt) : null,
    detail: `Registered as ${record.registeredName}`,
  });

  if (record.dnaProfileId) {
    findings.push({
      claimType: 'DNA_PROFILE',
      rawResult: record.dnaProfileId,
      outcome: 'INFORMATIONAL',
      sourceRecordId: record.dnaProfileId,
      sourceUrl,
      detail: 'DNA profile on file with the registry.',
    });
  }

  const codes = new Set<string>([...(record.titles ?? []), ...extractTitles(record.registeredName).map((t) => t.code)]);
  for (const code of codes) {
    const hit = lookupTitle(code);
    if (!hit) continue;
    findings.push({
      claimType: hit.claim,
      rawResult: code.toUpperCase(),
      outcome: 'INFORMATIONAL',
      sourceUrl,
      detail: hit.label,
    });
  }

  return findings;
}

export interface RegistryAdapterOptions {
  body: 'AKC' | 'UKC' | 'CKC';
  enabled?: boolean;
  /** Override the transport. Tests and replays use this. */
  fetchRecord?: (identifier: string, signal?: AbortSignal) => Promise<RegistryRecord | null>;
}

export function createRegistryAdapter(opts: RegistryAdapterOptions): SourceAdapter {
  const meta = REGISTRY_META[opts.body]!;
  const enabled = opts.enabled ?? false;

  return {
    meta,
    async lookup(input: LookupInput): Promise<LookupResult> {
      const startedAt = Date.now();
      const identifier = normalizeIdentifier(input.identifier);
      const base = { source: meta.id as SourceId, checkedAt: new Date(), matchedIdentifier: identifier };

      if (!identifier) {
        return { ...base, status: 'UNSUPPORTED_IDENTIFIER', findings: [], durationMs: Date.now() - startedAt };
      }

      // The registry an identifier belongs to is not negotiable — an AKC
      // number looked up against UKC is a category error, not a miss.
      if (input.registryBody && input.registryBody.toUpperCase() !== opts.body) {
        return {
          ...base,
          status: 'UNSUPPORTED_IDENTIFIER',
          findings: [],
          durationMs: Date.now() - startedAt,
          error: `${identifier} is a ${input.registryBody} number; this adapter reads ${opts.body}.`,
        };
      }

      if (!enabled && !opts.fetchRecord) {
        return {
          ...base,
          status: 'DISABLED',
          findings: [],
          durationMs: Date.now() - startedAt,
          error: `Live ${opts.body} lookups are switched off pending the source review in docs/verification-sources.md.`,
        };
      }

      try {
        const record = opts.fetchRecord ? await opts.fetchRecord(identifier, input.signal) : null;
        if (!record) {
          return { ...base, status: 'NOT_FOUND', findings: [], durationMs: Date.now() - startedAt };
        }
        return {
          ...base,
          status: 'FOUND',
          findings: parseRegistryRecord(record, meta.homepage),
          matchedName: record.registeredName,
          durationMs: Date.now() - startedAt,
          raw: record,
        };
      } catch (err) {
        return {
          ...base,
          status: 'UNAVAILABLE',
          findings: [],
          durationMs: Date.now() - startedAt,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
