'use client';

import * as React from 'react';
import { cn } from './cn';
import { seriesPalette } from './tokens';

/**
 * Puppy growth chart.
 *
 * Hand-drawn SVG rather than a chart library, for three reasons: it has to
 * render server-side for the printable health report, it has to stay legible
 * at phone width in a whelping box, and the reference band needs to sit
 * *behind* the lines rather than being a fourth series in a legend.
 *
 * The band is the point. A breeder is not reading absolute grams — they are
 * checking whether a line has fallen off its own trajectory.
 */

export interface GrowthSeries {
  puppyId: string;
  label: string;
  /** Day since whelp → grams. */
  points: { day: number; grams: number }[];
  /** Drawn heavier, with its own colour. */
  highlighted?: boolean;
  /** Drawn in the danger colour with a dashed line. */
  atRisk?: boolean;
}

export interface ReferencePoint {
  day: number;
  grams: number;
  lowGrams: number;
  highGrams: number;
}

export function GrowthChart({
  series,
  reference = [],
  height = 260,
  maxDay,
  className,
  showLegend = true,
}: {
  series: GrowthSeries[];
  reference?: ReferencePoint[];
  height?: number;
  maxDay?: number;
  className?: string;
  showLegend?: boolean;
}) {
  const allPoints = series.flatMap((s) => s.points);
  const hasData = allPoints.length > 0;

  const lastDay =
    maxDay ??
    Math.max(
      14,
      ...allPoints.map((p) => p.day),
      // Only extend the band as far as there is data, plus a week of headroom.
      0,
    ) + 3;

  const bandInRange = reference.filter((r) => r.day <= lastDay);
  const maxGrams = Math.max(
    ...allPoints.map((p) => p.grams),
    ...bandInRange.map((r) => r.highGrams),
    100,
  );

  // Padded plot area. Left gutter carries the gram axis, bottom the day axis.
  const W = 720;
  const H = height;
  const pad = { top: 12, right: 12, bottom: 28, left: 46 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const x = (day: number) => pad.left + (day / Math.max(1, lastDay)) * plotW;
  const y = (grams: number) => pad.top + plotH - (grams / maxGrams) * plotH;

  const line = (points: { day: number; grams: number }[]) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day).toFixed(1)} ${y(p.grams).toFixed(1)}`).join(' ');

  const bandPath =
    bandInRange.length > 1
      ? `${bandInRange.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(r.day).toFixed(1)} ${y(r.highGrams).toFixed(1)}`).join(' ')} ` +
        `${[...bandInRange].reverse().map((r) => `L${x(r.day).toFixed(1)} ${y(r.lowGrams).toFixed(1)}`).join(' ')} Z`
      : '';

  // Gridlines at round gram values, and weekly day ticks.
  const gramStep = niceStep(maxGrams / 4);
  const gramTicks: number[] = [];
  for (let g = 0; g <= maxGrams; g += gramStep) gramTicks.push(g);
  const dayTicks: number[] = [];
  for (let d = 0; d <= lastDay; d += 7) dayTicks.push(d);

  if (!hasData) {
    return (
      <div className={cn('rounded-md border border-dashed border-bone-400 bg-bone-100/60 px-4 py-10 text-center', className)}>
        <p className="text-sm text-ink-500">No weights recorded yet.</p>
        <p className="mt-1 text-2xs text-ink-400">
          Weigh twice daily for the first two weeks — a puppy that stops gaining is in trouble hours
          before it looks like it.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`Growth chart for ${series.length} ${series.length === 1 ? 'puppy' : 'puppies'}`}
      >
        {/* Reference band, behind everything */}
        {bandPath && <path d={bandPath} className="fill-brand-100/60" />}

        {/* Gridlines */}
        {gramTicks.map((g) => (
          <g key={`g${g}`}>
            <line x1={pad.left} x2={W - pad.right} y1={y(g)} y2={y(g)} className="stroke-bone-300" strokeWidth="1" />
            <text x={pad.left - 6} y={y(g) + 3.5} textAnchor="end" className="fill-ink-400 text-[10px]">
              {g >= 1000 ? `${(g / 1000).toFixed(1)}kg` : g}
            </text>
          </g>
        ))}
        {dayTicks.map((d) => (
          <g key={`d${d}`}>
            <line x1={x(d)} x2={x(d)} y1={pad.top} y2={pad.top + plotH} className="stroke-bone-200" strokeWidth="1" />
            <text x={x(d)} y={H - 8} textAnchor="middle" className="fill-ink-400 text-[10px]">
              {d === 0 ? 'birth' : `d${d}`}
            </text>
          </g>
        ))}

        {/* Series */}
        {series.map((s, i) => {
          if (s.points.length === 0) return null;
          const color = s.atRisk ? '#B3261E' : seriesPalette[i % seriesPalette.length]!;
          return (
            <g key={s.puppyId}>
              <path
                d={line(s.points)}
                fill="none"
                stroke={color}
                strokeWidth={s.highlighted ? 2.5 : 1.6}
                strokeDasharray={s.atRisk ? '5 3' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={s.highlighted === false ? 0.45 : 1}
              />
              {s.points.map((p) => (
                <circle
                  key={`${s.puppyId}-${p.day}`}
                  cx={x(p.day)}
                  cy={y(p.grams)}
                  r={s.highlighted ? 3 : 2}
                  fill={color}
                />
              ))}
            </g>
          );
        })}
      </svg>

      {showLegend && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs">
          <span className="flex items-center gap-1.5 text-ink-500">
            <span className="h-2.5 w-4 rounded-sm bg-brand-100" /> Expected range (±20%)
          </span>
          {series.map((s, i) => (
            <span key={s.puppyId} className="flex items-center gap-1.5 text-ink-600">
              <span
                className="h-0.5 w-4 rounded-pill"
                style={{ background: s.atRisk ? '#B3261E' : seriesPalette[i % seriesPalette.length] }}
              />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function niceStep(raw: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

/**
 * A single puppy's sparkline, for a dense list.
 * Small enough to sit inside a row, legible enough to spot a flat line.
 */
export function WeightSparkline({
  points,
  atRisk,
  width = 72,
  height = 22,
}: {
  points: { day: number; grams: number }[];
  atRisk?: boolean;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) {
    return <span className="inline-block text-2xs text-ink-300" style={{ width }}>—</span>;
  }
  const maxG = Math.max(...points.map((p) => p.grams));
  const minG = Math.min(...points.map((p) => p.grams));
  const maxD = Math.max(...points.map((p) => p.day));
  const span = Math.max(1, maxG - minG);

  const d = points
    .map((p, i) => {
      const px = (p.day / Math.max(1, maxD)) * (width - 2) + 1;
      const py = height - 2 - ((p.grams - minG) / span) * (height - 4);
      return `${i === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden>
      <path
        d={d}
        fill="none"
        stroke={atRisk ? '#B3261E' : '#0057DE'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
