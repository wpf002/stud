'use client';

import { AlertTriangle, Link2 } from 'lucide-react';
import * as React from 'react';
import { cn } from './cn';
import { Tooltip } from './overlays';

/**
 * THE PEDIGREE RENDERER
 * ═════════════════════
 * Treated as a design object, not a table (roadmap §Phase 1).
 *
 * A pedigree chart is the one artefact every breeder already knows how to
 * read, so the layout stays conventional — sire above dam, generations left
 * to right. What we add is the thing paper cannot do:
 *
 *   · Repeated ancestors are marked and colour-linked, because a repeat IS
 *     the story on a line-bred pedigree.
 *   · Ancestors driving the COI carry their contribution, ranked.
 *   · Empty slots RENDER. A gap in a pedigree is information — it is the
 *     reason the COI below it is a floor rather than a measurement.
 *
 * Layout maths lives in @stud/pedigree's `buildChart` so this component, the
 * PDF export and the printed certificate cannot drift apart.
 */

export interface ChartCellNode {
  id: string;
  name?: string | null;
  sex?: 'MALE' | 'FEMALE' | null;
  breed?: string | null;
  birthYear?: number | null;
}

export interface ChartCell {
  node: ChartCellNode | null;
  generation: number;
  slot: number;
  path: ('S' | 'D')[];
  y: number;
  height: number;
  duplicateOf?: { generation: number; slot: number } | null;
  contributionRank?: number | null;
  contribution?: number | null;
}

export interface ChartData {
  generations: number;
  rows: number;
  columns: ChartCell[][];
  repeats: { id: string; name?: string | null; positions: { generation: number; slot: number }[] }[];
  knownSlots: number;
  totalSlots: number;
}

/** Distinct hues for repeated ancestors. Only ever applied to repeats. */
const REPEAT_TONES = [
  { ring: 'ring-clay-400', bg: 'bg-clay-50', text: 'text-clay-700', dot: 'bg-clay-500' },
  { ring: 'ring-brand-400', bg: 'bg-brand-50', text: 'text-brand-700', dot: 'bg-brand-500' },
  { ring: 'ring-warning', bg: 'bg-warning-bg', text: 'text-warning-fg', dot: 'bg-warning' },
  { ring: 'ring-info', bg: 'bg-info-bg', text: 'text-info-fg', dot: 'bg-info' },
];

export function PedigreeChart({
  chart,
  subjectName,
  onSelect,
  className,
  rowHeight = 46,
  compact = false,
}: {
  chart: ChartData;
  subjectName?: string;
  onSelect?: (dogId: string) => void;
  className?: string;
  rowHeight?: number;
  compact?: boolean;
}) {
  // Assign a tone per repeated ancestor so the same dog reads as the same dog
  // wherever it appears.
  const toneById = React.useMemo(() => {
    const map = new Map<string, (typeof REPEAT_TONES)[number]>();
    chart.repeats.forEach((r, i) => map.set(r.id, REPEAT_TONES[i % REPEAT_TONES.length]!));
    return map;
  }, [chart.repeats]);

  const height = chart.rows * rowHeight;
  const columnWidth = compact ? 160 : 200;

  return (
    <div className={cn('w-full', className)}>
      <div className="overflow-x-auto pb-2">
        <div
          className="relative flex gap-3"
          style={{ height, minWidth: (chart.generations + 1) * (columnWidth + 12) }}
        >
          {chart.columns.map((column, gen) => (
            <div key={gen} className="relative shrink-0" style={{ width: columnWidth }}>
              {gen === 0 && (
                <ColumnLabel>{subjectName ? 'Subject' : 'Dog'}</ColumnLabel>
              )}
              {gen > 0 && <ColumnLabel>{generationLabel(gen)}</ColumnLabel>}

              {column.map((cell) => (
                <div
                  key={`${cell.generation}-${cell.slot}`}
                  className="absolute inset-x-0 flex items-center px-0.5"
                  style={{
                    top: (cell.y - cell.height / 2) * rowHeight,
                    height: cell.height * rowHeight,
                  }}
                >
                  {/*
                    The box is a fixed height, vertically centred in its
                    bracket span. Letting it stretch to fill the span is
                    technically "correct" but produces a chart where the
                    subject is a 700px-tall rectangle — the bracket lines
                    carry the hierarchy, the boxes carry the names.
                  */}
                  <div
                    className="w-full"
                    style={{ height: Math.min(cell.height * rowHeight - 4, compact ? 40 : 52) }}
                  >
                    <Cell
                      cell={cell}
                      tone={cell.node ? toneById.get(cell.node.id) : undefined}
                      onSelect={onSelect}
                      compact={compact}
                    />
                  </div>
                </div>
              ))}

              {/* Bracket connectors between this column and the next. */}
              {gen < chart.generations && (
                <Connectors column={column} rowHeight={rowHeight} width={12} />
              )}
            </div>
          ))}
        </div>
      </div>

      <ChartLegend chart={chart} toneById={toneById} />
    </div>
  );
}

function ColumnLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="absolute -top-6 left-0.5 text-2xs font-semibold uppercase tracking-widest text-ink-400">
      {children}
    </p>
  );
}

function generationLabel(gen: number): string {
  return (
    { 1: 'Parents', 2: 'Grandparents', 3: 'Great-grand', 4: '3× Great', 5: '4× Great' }[gen] ??
    `Gen ${gen}`
  );
}

function Cell({
  cell,
  tone,
  onSelect,
  compact,
}: {
  cell: ChartCell;
  tone?: (typeof REPEAT_TONES)[number];
  onSelect?: (id: string) => void;
  compact: boolean;
}) {
  const isSire = cell.path[cell.path.length - 1] === 'S';

  // ── Empty slot. Rendered, never hidden. ────────────────────────────────
  if (!cell.node) {
    return (
      <div
        className={cn(
          'flex h-full w-full items-center justify-center rounded-md border border-dashed border-bone-400 bg-bone-100/50',
          'text-2xs text-ink-300',
        )}
      >
        Unknown
      </div>
    );
  }

  const { node } = cell;
  const interactive = Boolean(onSelect);
  const Tag = interactive ? 'button' : 'div';

  const body = (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={interactive ? () => onSelect!(node.id) : undefined}
      className={cn(
        'group flex h-full w-full flex-col justify-center overflow-hidden rounded-md border px-2.5 py-1.5 text-left transition-all duration-200',
        'ring-1 ring-inset',
        tone
          ? cn(tone.bg, tone.ring, 'border-transparent')
          : 'border-bone-300 bg-bone-50 ring-transparent',
        interactive && 'hover:border-brand-400 hover:shadow-sm focus-visible:shadow-focus',
        cell.contributionRank && 'shadow-sm',
      )}
    >
      <div className="flex items-center gap-1">
        {/* Sire/dam marker — the fastest way to read a chart at a glance. */}
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            isSire ? 'bg-brand-500' : 'bg-clay-400',
          )}
          aria-hidden
        />
        <p
          className={cn(
            'truncate font-medium leading-tight',
            compact ? 'text-2xs' : 'text-xs',
            tone ? tone.text : 'text-ink-900',
          )}
        >
          {node.name ?? 'Unnamed'}
        </p>
        {cell.duplicateOf && <Link2 className="h-3 w-3 shrink-0 text-ink-400" aria-hidden />}
      </div>

      {!compact && cell.height >= 1 && (
        <p className="mt-0.5 truncate text-2xs text-ink-400">
          {node.birthYear ? `b. ${node.birthYear}` : (node.breed ?? '')}
          {cell.contribution ? (
            <span className="ml-1 font-mono text-clay-600">
              +{(cell.contribution * 100).toFixed(2)}%
            </span>
          ) : null}
        </p>
      )}
    </Tag>
  );

  if (!cell.duplicateOf && !cell.contributionRank) return body;

  return (
    <Tooltip
      content={
        <span className="block space-y-1">
          <span className="block font-semibold">{node.name}</span>
          {cell.duplicateOf && (
            <span className="block">
              Also appears at generation {cell.duplicateOf.generation}. A repeated ancestor is what
              creates inbreeding.
            </span>
          )}
          {cell.contribution ? (
            <span className="block">
              Contributes {(cell.contribution * 100).toFixed(3)}% to this dog&rsquo;s COI
              {cell.contributionRank ? ` (ranked #${cell.contributionRank})` : ''}.
            </span>
          ) : null}
        </span>
      }
    >
      {body}
    </Tooltip>
  );
}

/** The bracket lines joining a cell to its two parents in the next column. */
function Connectors({
  column,
  rowHeight,
  width,
}: {
  column: ChartCell[];
  rowHeight: number;
  width: number;
}) {
  return (
    <svg
      className="pointer-events-none absolute top-0 h-full text-bone-400"
      style={{ left: '100%', width }}
      aria-hidden
    >
      {column.map((cell) => {
        const y = cell.y * rowHeight;
        const quarter = (cell.height * rowHeight) / 4;
        return (
          <path
            key={`${cell.generation}-${cell.slot}`}
            d={`M0 ${y} H${width / 2} M${width / 2} ${y - quarter} V${y + quarter} M${width / 2} ${y - quarter} H${width} M${width / 2} ${y + quarter} H${width}`}
            stroke="currentColor"
            strokeWidth="1"
            fill="none"
          />
        );
      })}
    </svg>
  );
}

function ChartLegend({
  chart,
  toneById,
}: {
  chart: ChartData;
  toneById: Map<string, (typeof REPEAT_TONES)[number]>;
}) {
  const missing = chart.totalSlots - chart.knownSlots;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-bone-200 pt-3 text-xs">
      <span className="flex items-center gap-1.5 text-ink-500">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Sire line
      </span>
      <span className="flex items-center gap-1.5 text-ink-500">
        <span className="h-1.5 w-1.5 rounded-full bg-clay-400" /> Dam line
      </span>

      <span className="font-mono tabular-nums text-ink-500">
        {chart.knownSlots}/{chart.totalSlots} slots known
      </span>

      {missing > 0 && (
        <span className="flex items-center gap-1.5 text-warning-fg">
          <AlertTriangle className="h-3.5 w-3.5" />
          {missing} unknown — the COI below is a floor, not a measurement
        </span>
      )}

      {chart.repeats.length > 0 && (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-ink-400">Repeated:</span>
          {chart.repeats.slice(0, 4).map((r) => (
            <span key={r.id} className="flex items-center gap-1 text-ink-600">
              <span className={cn('h-2 w-2 rounded-full', toneById.get(r.id)?.dot ?? 'bg-ink-400')} />
              {r.name} ×{r.positions.length}
            </span>
          ))}
          {chart.repeats.length > 4 && (
            <span className="text-ink-400">+{chart.repeats.length - 4} more</span>
          )}
        </span>
      )}
    </div>
  );
}

// ── COI display ─────────────────────────────────────────────────────────────

export type CoiBandName = 'MINIMAL' | 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';

const BAND_STYLE: Record<CoiBandName, { text: string; bg: string; label: string }> = {
  MINIMAL: { text: 'text-brand-700', bg: 'bg-brand-100', label: 'Minimal' },
  LOW: { text: 'text-brand-700', bg: 'bg-brand-100', label: 'Low' },
  MODERATE: { text: 'text-warning-fg', bg: 'bg-warning-bg', label: 'Moderate' },
  HIGH: { text: 'text-clay-700', bg: 'bg-clay-100', label: 'High' },
  VERY_HIGH: { text: 'text-danger-fg', bg: 'bg-danger-bg', label: 'Very high' },
};

/**
 * The COI figure, never shown alone.
 *
 * A COI without its pedigree completeness is a number pretending to be a
 * measurement. The two are rendered as one component so it is not possible to
 * ship one without the other.
 */
export function CoiReadout({
  coi,
  band,
  completeness,
  generations,
  confidence,
  note,
  size = 'md',
  className,
}: {
  coi: number;
  band: CoiBandName;
  completeness: { ratio: number; generationEquivalent: number; deepestGeneration: number };
  generations: number;
  confidence?: 'HIGH' | 'MODERATE' | 'LOW' | 'INSUFFICIENT';
  note?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const style = BAND_STYLE[band];
  const insufficient = confidence === 'INSUFFICIENT';

  return (
    <div className={cn('rounded-card border border-bone-300 bg-bone-50 p-4', className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
            Coefficient of inbreeding · {generations} gen
          </p>
          <p
            className={cn(
              'mt-1 font-mono tabular-nums leading-none',
              size === 'lg' ? 'text-4xl' : size === 'sm' ? 'text-xl' : 'text-3xl',
              insufficient ? 'text-ink-300' : style.text,
            )}
          >
            {insufficient ? '—' : `${(coi * 100).toFixed(2)}%`}
          </p>
        </div>
        {!insufficient && (
          <span
            className={cn(
              'rounded-pill px-2.5 py-1 text-xs font-semibold',
              style.bg,
              style.text,
            )}
          >
            {style.label}
          </span>
        )}
      </div>

      <div className="mt-4 space-y-2 border-t border-bone-200 pt-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-ink-500">Pedigree complete</span>
          <span className="font-mono tabular-nums text-ink-700">
            {(completeness.ratio * 100).toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-pill bg-bone-300">
          <div
            className={cn(
              'h-full rounded-pill transition-[width] duration-500 ease-editorial',
              completeness.ratio >= 0.8
                ? 'bg-brand-600'
                : completeness.ratio >= 0.5
                  ? 'bg-warning'
                  : 'bg-clay-500',
            )}
            style={{ width: `${Math.max(2, completeness.ratio * 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-3 text-2xs text-ink-400">
          <span>{completeness.generationEquivalent.toFixed(2)} complete generations</span>
          <span>deepest: gen {completeness.deepestGeneration}</span>
        </div>
      </div>

      {note && (
        <p
          className={cn(
            'mt-3 rounded-md px-3 py-2 text-xs leading-relaxed',
            confidence === 'HIGH'
              ? 'bg-brand-50 text-brand-800'
              : confidence === 'INSUFFICIENT'
                ? 'bg-danger-bg text-danger-fg'
                : 'bg-warning-bg text-warning-fg',
          )}
        >
          {note}
        </p>
      )}
    </div>
  );
}
