'use client';

import { AlertTriangle, ChevronRight, FileText, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { cn } from './cn';
import { VerificationBadge, type VerificationState } from './verification-badge';

/**
 * The health and titles panel.
 *
 * Its whole job is to keep two tiers of claim visually separate while showing
 * them on the same page (invariant 5). They arrive as separate arrays from the
 * API and they render in separate blocks with separate treatments — there is
 * no prop on this component that would let a caller mix them.
 */

export type ClaimOutcome =
  | 'NORMAL'
  | 'CARRIER'
  | 'AT_RISK'
  | 'ABNORMAL'
  | 'INCONCLUSIVE'
  | 'INFORMATIONAL';

export interface VerifiedClaimView {
  id: string;
  claimType: string;
  markerName?: string | null;
  category: string;
  state: VerificationState;
  source: string;
  outcome: ClaimOutcome | null;
  rawResult: string | null;
  sourceUrl: string | null;
  detail: string | null;
  testedAt: string | Date | null;
  lastCheckedAt: string | Date | null;
  matchedIdentifier: string | null;
  conflictRawResult?: string | null;
  conflictNote?: string | null;
}

export interface ReportedClaimView {
  id: string;
  claimType: string;
  markerName?: string | null;
  category: string;
  statedResult: string;
  statedTestedAt: string | Date | null;
  note: string | null;
}

/**
 * Outcome colour.
 *
 * CARRIER is deliberately neutral, NOT a warning. A carrier bred to a clear
 * dog produces no affected puppies; colouring it like a failure would push
 * breeders to cull genetic diversity for no reason. This is a design decision
 * with population-genetics consequences, so it lives here as a comment rather
 * than in a spec nobody reads.
 */
const OUTCOME_STYLE: Record<ClaimOutcome, { chip: string; label: string }> = {
  NORMAL: { chip: 'bg-brand-100 text-brand-800', label: 'Normal' },
  CARRIER: { chip: 'bg-bone-200 text-ink-700', label: 'Carrier' },
  AT_RISK: { chip: 'bg-danger-bg text-danger-fg', label: 'At risk' },
  ABNORMAL: { chip: 'bg-danger-bg text-danger-fg', label: 'Abnormal' },
  INCONCLUSIVE: { chip: 'bg-warning-bg text-warning-fg', label: 'Inconclusive' },
  INFORMATIONAL: { chip: 'bg-bone-200 text-ink-600', label: 'On record' },
};

const CLAIM_LABELS: Record<string, string> = {
  HIP: 'Hips', ELBOW: 'Elbows', PATELLA: 'Patellas', SHOULDER: 'Shoulders',
  LEGG_CALVE_PERTHES: 'Legg-Calve-Perthes', CARDIAC: 'Cardiac', EYE_CAER: 'Eyes (CAER)',
  THYROID: 'Thyroid', DENTITION: 'Dentition', TRACHEA: 'Trachea', HEARING_BAER: 'Hearing (BAER)',
  DNA_PANEL: 'Genetic panel', DNA_MARKER: 'Genetic marker', GENETIC_COI: 'Genetic COI',
  REGISTRATION: 'Registration', CHIC: 'CHIC', DNA_PROFILE: 'DNA profile',
  TITLE_CONFORMATION: 'Conformation', TITLE_FIELD: 'Field trial', TITLE_HUNT_TEST: 'Hunt test',
  TITLE_OBEDIENCE: 'Obedience', TITLE_RALLY: 'Rally', TITLE_AGILITY: 'Agility',
  TITLE_TRACKING: 'Tracking', TITLE_HERDING: 'Herding', TITLE_WORKING: 'Working',
  TITLE_SERVICE: 'Service', TITLE_TEMPERAMENT: 'Temperament',
  NAVHDA_NA: 'NAVHDA Natural Ability', NAVHDA_UT: 'NAVHDA Utility',
  NAVHDA_INVITATIONAL: 'NAVHDA Invitational',
};

export function claimLabel(claimType: string, markerName?: string | null): string {
  const base = CLAIM_LABELS[claimType] ?? claimType.replace(/_/g, ' ').toLowerCase();
  return markerName ? `${markerName}` : base;
}

const CATEGORY_ORDER = ['HEALTH', 'GENETIC', 'TITLE', 'PERFORMANCE', 'REGISTRATION'];
const CATEGORY_LABEL: Record<string, string> = {
  HEALTH: 'Health',
  GENETIC: 'Genetic',
  TITLE: 'Titles',
  PERFORMANCE: 'Field & performance',
  REGISTRATION: 'Registration',
};

function fmt(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === 'string' ? new Date(d) : d;
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function ClaimPanel({
  verified,
  reported,
  /** Claims we expect for this breed that nobody has submitted. */
  expected = [],
  onClaimClick,
  className,
}: {
  verified: VerifiedClaimView[];
  reported: ReportedClaimView[];
  expected?: string[];
  onClaimClick?: (claimId: string) => void;
  className?: string;
}) {
  const byCategory = React.useMemo(() => {
    const map = new Map<string, VerifiedClaimView[]>();
    for (const c of verified) {
      const list = map.get(c.category) ?? [];
      list.push(c);
      map.set(c.category, list);
    }
    return map;
  }, [verified]);

  const covered = new Set(verified.map((c) => c.claimType));
  const reportedCovered = new Set(reported.map((c) => c.claimType));
  const missing = expected.filter((t) => !covered.has(t) && !reportedCovered.has(t));

  const conflicted = verified.filter((c) => c.state === 'CONFLICTED');

  return (
    <div className={cn('space-y-6', className)}>
      {conflicted.length > 0 && (
        <div className="rounded-md bg-danger-bg px-4 py-3 ring-1 ring-inset ring-danger/20">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger-fg">
            <AlertTriangle className="h-4 w-4" />
            {conflicted.length} claim{conflicted.length === 1 ? '' : 's'} under review
          </p>
          <p className="mt-1 text-xs leading-relaxed text-danger-fg/90">
            The source now says something different from what we recorded. Until an admin resolves
            it, do not rely on {conflicted.length === 1 ? 'this claim' : 'these claims'}.
          </p>
        </div>
      )}

      {/* ── Verified tier ────────────────────────────────────────────── */}
      {CATEGORY_ORDER.filter((cat) => byCategory.has(cat)).map((cat) => (
        <section key={cat}>
          <h3 className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-widest text-ink-400">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-600" />
            {CATEGORY_LABEL[cat] ?? cat} — verified
          </h3>
          <ul className="mt-2.5 divide-y divide-bone-200 rounded-md border border-bone-300 bg-bone-50">
            {byCategory.get(cat)!.map((claim) => (
              <ClaimRow key={claim.id} claim={claim} onClick={onClaimClick} />
            ))}
          </ul>
        </section>
      ))}

      {/* ── Reported tier — a different block, a different treatment ─── */}
      {reported.length > 0 && (
        <section>
          <h3 className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-widest text-ink-400">
            <FileText className="h-3.5 w-3.5 text-verify-reported" />
            Reported by the owner — not verified
          </h3>
          <ul className="mt-2.5 divide-y divide-bone-300 rounded-md border border-dashed border-bone-400 bg-bone-100/60">
            {reported.map((claim) => (
              <li key={claim.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink-700">
                      {claimLabel(claim.claimType, claim.markerName)}
                    </span>
                    <VerificationBadge state="REPORTED" size="sm" />
                  </p>
                  <p className="mt-0.5 text-sm text-ink-600">{claim.statedResult}</p>
                  {claim.note && <p className="mt-1 text-2xs text-ink-400">{claim.note}</p>}
                </div>
                <span className="shrink-0 text-2xs text-ink-400">{fmt(claim.statedTestedAt) ?? ''}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-2xs leading-relaxed text-ink-400">
            Entered by the owner and not independently confirmed. Stored separately from verified
            results and never presented as one.
          </p>
        </section>
      )}

      {/* ── Absence, rendered ────────────────────────────────────────── */}
      {missing.length > 0 && (
        <section>
          <h3 className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
            Not submitted
          </h3>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {missing.map((t) => (
              <VerificationBadge key={t} state="UNVERIFIED" claim={CLAIM_LABELS[t] ?? t} size="sm" />
            ))}
          </div>
          <p className="mt-2 text-2xs leading-relaxed text-ink-400">
            Nothing has been submitted for these. Absence of a result is not a passing result.
          </p>
        </section>
      )}

      {verified.length === 0 && reported.length === 0 && missing.length === 0 && (
        <p className="rounded-md border border-dashed border-bone-400 bg-bone-100/60 px-4 py-6 text-center text-sm text-ink-500">
          Nothing on file yet.
        </p>
      )}
    </div>
  );
}

function ClaimRow({
  claim,
  onClick,
}: {
  claim: VerifiedClaimView;
  onClick?: (id: string) => void;
}) {
  const style = claim.outcome ? OUTCOME_STYLE[claim.outcome] : null;
  const interactive = Boolean(onClick);

  const content = (
    <>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink-800">
            {claimLabel(claim.claimType, claim.markerName)}
          </span>
          <VerificationBadge
            state={claim.state}
            size="sm"
            evidence={{
              source: claim.source,
              sourceUrl: claim.sourceUrl,
              result: claim.rawResult,
              identifier: claim.matchedIdentifier,
              testedAt: claim.testedAt,
              checkedAt: claim.lastCheckedAt,
              conflictNote: claim.conflictNote ?? null,
            }}
          />
        </p>

        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className={cn('font-medium', claim.state === 'CONFLICTED' ? 'text-ink-400 line-through' : 'text-ink-800')}>
            {claim.rawResult ?? '—'}
          </span>
          {claim.state === 'CONFLICTED' && claim.conflictRawResult && (
            <span className="text-danger-fg">
              source now says <span className="font-semibold">{claim.conflictRawResult}</span>
            </span>
          )}
          {style && claim.outcome !== 'INFORMATIONAL' && (
            <span className={cn('rounded-pill px-1.5 py-0.5 text-2xs font-medium', style.chip)}>
              {style.label}
            </span>
          )}
        </p>

        <p className="mt-1 flex flex-wrap gap-x-3 text-2xs text-ink-400">
          <span>{claim.source}</span>
          {fmt(claim.testedAt) && <span>tested {fmt(claim.testedAt)}</span>}
          {fmt(claim.lastCheckedAt) && <span>checked {fmt(claim.lastCheckedAt)}</span>}
          {claim.detail && <span className="text-ink-500">{claim.detail}</span>}
        </p>
      </div>
      {interactive && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-300" />}
    </>
  );

  return (
    <li>
      {interactive ? (
        <button
          type="button"
          onClick={() => onClick!(claim.id)}
          className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-bone-100"
        >
          {content}
        </button>
      ) : (
        <div className="flex items-start gap-3 px-4 py-3">{content}</div>
      )}
    </li>
  );
}

/**
 * The density figure that drives breeder tiering (Phase 9).
 *
 * Deliberately shows the denominator. "6 of 8 verified" is a far more honest
 * signal than a single tick, and it is the number that cannot be gamed by
 * simply claiming less.
 */
export function VerificationDensity({
  summary,
  className,
}: {
  summary: {
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
  } | null;
  className?: string;
}) {
  if (!summary) return null;
  const total =
    summary.verifiedCount +
    summary.reportedCount +
    summary.unverifiedCount +
    summary.staleCount +
    summary.conflictedCount;

  return (
    <div className={cn('rounded-card border border-bone-300 bg-bone-50 p-4', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
          Verification density
        </p>
        {summary.hasChic && (
          <span className="rounded-pill bg-brand-100 px-2 py-0.5 text-2xs font-semibold text-brand-800">
            CHIC
          </span>
        )}
      </div>

      <p className="mt-1 font-mono text-3xl tabular-nums leading-none text-ink-900">
        {Math.round(summary.density * 100)}%
      </p>
      <p className="mt-1 text-xs text-ink-500">
        {summary.verifiedCount} of {total} claims verified against a source
      </p>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-pill bg-bone-300">
        <div
          className="h-full rounded-pill bg-brand-600 transition-[width] duration-500 ease-editorial"
          style={{ width: `${Math.max(2, summary.density * 100)}%` }}
        />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-bone-200 pt-3 text-xs">
        <Stat label="Health normal" value={summary.healthNormalCount} />
        <Stat label="Verified titles" value={summary.verifiedTitleCount} />
        <Stat label="Owner-reported" value={summary.reportedCount} muted />
        <Stat label="Needs recheck" value={summary.staleCount} muted />
        {/* Concerning findings are counted, never hidden. */}
        {summary.concerningCount > 0 && (
          <Stat label="Concerning" value={summary.concerningCount} tone="danger" />
        )}
        {summary.conflictedCount > 0 && (
          <Stat label="Under review" value={summary.conflictedCount} tone="danger" />
        )}
      </dl>
    </div>
  );
}

function Stat({
  label,
  value,
  muted,
  tone,
}: {
  label: string;
  value: number;
  muted?: boolean;
  tone?: 'danger';
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className={cn(muted ? 'text-ink-400' : 'text-ink-500')}>{label}</dt>
      <dd
        className={cn(
          'font-mono tabular-nums',
          tone === 'danger' ? 'text-danger-fg' : muted ? 'text-ink-400' : 'text-ink-800',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
