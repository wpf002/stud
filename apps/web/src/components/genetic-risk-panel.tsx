'use client';

import { AlertTriangle, Check, HelpCircle, Info } from 'lucide-react';
import { Alert, Badge, cn } from '@stud/ui';
import type { GeneticRiskDto, HealthComparisonRow, MarkerRiskDto } from '@/lib/types';

/**
 * Genetic risk for a pairing.
 *
 * The one screen in the whole product that can prevent a litter of affected
 * puppies, so it is ordered strictly by consequence: at-risk markers first,
 * untested markers second, everything clear last and collapsed.
 *
 * Carrier status is rendered neutrally throughout. A carrier bred to a clear
 * dog produces no affected puppies, and colouring carriers like failures would
 * push breeders to cull genetic diversity for nothing — which at scale would
 * do more harm than the affected puppies this screen exists to prevent.
 */

const STATUS_STYLE: Record<MarkerRiskDto['sireStatus'], { chip: string; label: string }> = {
  CLEAR: { chip: 'bg-brand-100 text-brand-800', label: 'Clear' },
  CARRIER: { chip: 'bg-bone-300 text-ink-700', label: 'Carrier' },
  AFFECTED: { chip: 'bg-danger-bg text-danger-fg', label: 'Affected' },
  UNKNOWN: { chip: 'bg-bone-200 text-ink-400', label: 'Not tested' },
};

export function GeneticRiskPanel({ risk }: { risk: GeneticRiskDto }) {
  return (
    <div className="space-y-4">
      {risk.atRisk.length > 0 ? (
        <Alert tone="danger" icon={<AlertTriangle className="h-4 w-4" />}>
          <span className="font-semibold">{risk.summary}</span>
        </Alert>
      ) : risk.unknown.length > 0 ? (
        <Alert tone="warning" icon={<HelpCircle className="h-4 w-4" />}>
          {risk.summary}
        </Alert>
      ) : risk.markers.length > 0 ? (
        <Alert tone="success" icon={<Check className="h-4 w-4" />}>
          {risk.summary}
        </Alert>
      ) : (
        <Alert tone="info" icon={<Info className="h-4 w-4" />}>
          {risk.summary}
        </Alert>
      )}

      {risk.markers.length > 0 && (
        <ul className="divide-y divide-bone-200 rounded-md border border-bone-300 bg-bone-50">
          {risk.markers.map((m) => (
            <MarkerRow key={`${m.markerName}-${m.claimType}`} marker={m} />
          ))}
        </ul>
      )}

      <p className="text-2xs leading-relaxed text-ink-400">
        Only claims verified against a source are counted. A result the owner has stated but not
        submitted is not evidence here, because the one feature that prevents affected puppies must
        not be defeated by a sentence someone typed into a form.
      </p>
    </div>
  );
}

function MarkerRow({ marker }: { marker: MarkerRiskDto }) {
  const tone =
    marker.level === 'AT_RISK'
      ? 'bg-danger-bg/40'
      : marker.level === 'UNKNOWN'
        ? 'bg-warning-bg/30'
        : '';

  return (
    <li className={cn('px-4 py-3', tone)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink-800">{marker.markerName}</span>
            {marker.level === 'AT_RISK' && (
              <Badge tone="danger" size="sm">
                <AlertTriangle /> at Risk
              </Badge>
            )}
            {marker.level === 'CARRIERS_PRODUCED' && (
              <Badge tone="neutral" size="sm">
                Carriers Produced
              </Badge>
            )}
          </p>
          <p
            className={cn(
              'mt-1 text-xs leading-relaxed',
              marker.level === 'AT_RISK'
                ? 'text-danger-fg'
                : marker.level === 'UNKNOWN'
                  ? 'text-warning-fg'
                  : 'text-ink-600',
            )}
          >
            {marker.message}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <StatusPair label="Sire" status={marker.sireStatus} />
          <StatusPair label="Dam" status={marker.damStatus} />
        </div>
      </div>

      {marker.outcome && marker.outcome.affected > 0 && (
        <div className="mt-3 flex h-2 overflow-hidden rounded-pill">
          <span
            className="bg-danger"
            style={{ width: `${marker.outcome.affected * 100}%` }}
            title={`${Math.round(marker.outcome.affected * 100)}% affected`}
          />
          <span
            className="bg-bone-400"
            style={{ width: `${marker.outcome.carrier * 100}%` }}
            title={`${Math.round(marker.outcome.carrier * 100)}% carrier`}
          />
          <span
            className="bg-brand-300"
            style={{ width: `${marker.outcome.clear * 100}%` }}
            title={`${Math.round(marker.outcome.clear * 100)}% clear`}
          />
        </div>
      )}
    </li>
  );
}

function StatusPair({ label, status }: { label: string; status: MarkerRiskDto['sireStatus'] }) {
  const style = STATUS_STYLE[status];
  return (
    <div className="text-center">
      <p className="text-2xs uppercase tracking-widest text-ink-400">{label}</p>
      <span className={cn('mt-0.5 inline-block rounded-pill px-2 py-0.5 text-2xs font-medium', style.chip)}>
        {style.label}
      </span>
    </div>
  );
}

/**
 * Side-by-side health panel.
 *
 * Shows the gaps as prominently as the results. A pairing where the sire is
 * fully panelled and the bitch is not is a real finding, and a comparison that
 * only showed what each dog HAS would flatter whichever one is being sold.
 */
export function HealthComparison({ rows }: { rows: HealthComparisonRow[] }) {
  const LABELS: Record<string, string> = {
    HIP: 'Hips',
    ELBOW: 'Elbows',
    EYE_CAER: 'Eyes (CAER)',
    CARDIAC: 'Cardiac',
    THYROID: 'Thyroid',
    PATELLA: 'Patellas',
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-sm">
        <thead>
          <tr className="border-b border-bone-300 text-left text-2xs uppercase tracking-widest text-ink-400">
            <th className="py-2 pr-4 font-semibold">Claim</th>
            <th className="py-2 pr-4 font-semibold">Sire</th>
            <th className="py-2 font-semibold">Dam</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.claimType} className="border-b border-bone-200">
              <td className="py-2.5 pr-4 text-ink-700">{LABELS[r.claimType] ?? r.claimType}</td>
              <td className="py-2.5 pr-4">
                <ResultCell value={r.sire} />
              </td>
              <td className="py-2.5">
                <ResultCell value={r.dam} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultCell({
  value,
}: {
  value: { result: string | null; outcome: string | null; state: string } | null;
}) {
  if (!value) {
    // Absence renders. It is never a blank cell.
    return <span className="text-2xs text-ink-300">Not Verified</span>;
  }
  const good = value.outcome === 'NORMAL';
  return (
    <span className={cn('text-sm', good ? 'text-ink-800' : 'text-warning-fg')}>
      {value.result ?? '—'}
      {value.state === 'STALE' && <span className="ml-1.5 text-2xs text-warning-fg">(recheck due)</span>}
    </span>
  );
}
