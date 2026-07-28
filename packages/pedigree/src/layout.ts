/**
 * Pedigree chart layout.
 *
 * Turns a graph into positioned cells for the classic bracket chart every
 * breeder already knows how to read. Kept here rather than in the React
 * component so the same layout drives the web renderer, the PDF export and
 * the printed certificate without three implementations drifting apart.
 *
 * Pure module. (Invariant 1.)
 */

import { type DogId, type PedigreeGraph, type PedigreeNode } from './graph.js';

export interface PedigreeCell {
  /** Null when the ancestor slot is empty — we render the gap, not hide it. */
  node: PedigreeNode | null;
  /** 0 = the subject, 1 = parents, 2 = grandparents … */
  generation: number;
  /**
   * Index within the generation, top to bottom. Generation g has 2^g slots.
   * Slot 0 of generation 1 is the sire; slot 1 is the dam.
   */
  slot: number;
  /** Sire-side/dam-side chain from the subject: e.g. ['S','D'] = sire's dam. */
  path: ('S' | 'D')[];
  /** Vertical centre in row units, for drawing connectors. */
  y: number;
  /** Height in row units of the block this cell spans. */
  height: number;
  /**
   * Set when this same animal already appears elsewhere in the chart. The
   * repeat is the whole story on an inbred pedigree, so it gets marked
   * rather than quietly drawn twice.
   */
  duplicateOf?: { generation: number; slot: number } | null;
  /** Ranked marker (1 = largest COI contributor) when contributions are supplied. */
  contributionRank?: number | null;
  /** This ancestor's share of the subject's COI, when supplied. */
  contribution?: number | null;
}

export interface PedigreeChart {
  generations: number;
  /** Total leaf rows — generation `g` has `2^generations / 2^g` rows per cell. */
  rows: number;
  cells: PedigreeCell[];
  /** Cells grouped by generation, in slot order. Convenience for column layout. */
  columns: PedigreeCell[][];
  /** Distinct animals appearing more than once, with every position they hold. */
  repeats: { id: DogId; name?: string | null; positions: { generation: number; slot: number }[] }[];
  knownSlots: number;
  totalSlots: number;
}

/**
 * Build the chart.
 *
 * `contributions` is optional; when supplied (from `pathContributions`) the
 * cells carry a rank so the renderer can highlight the ancestors actually
 * driving the COI instead of colouring every repeat identically.
 */
export function buildChart(
  graph: PedigreeGraph,
  subjectId: DogId,
  opts: {
    generations?: number;
    contributions?: readonly { id: DogId; contribution: number }[];
  } = {},
): PedigreeChart {
  const generations = Math.max(1, Math.min(opts.generations ?? 4, 10));
  const rows = Math.pow(2, generations);

  const rankById = new Map<DogId, { rank: number; contribution: number }>();
  opts.contributions?.forEach((c, i) => rankById.set(c.id, { rank: i + 1, contribution: c.contribution }));

  const cells: PedigreeCell[] = [];
  const seen = new Map<DogId, { generation: number; slot: number }[]>();

  // Walk breadth-first so slot indices line up with the classic chart order.
  type Frame = { id: DogId | null; generation: number; slot: number; path: ('S' | 'D')[] };
  let frontier: Frame[] = [{ id: subjectId, generation: 0, slot: 0, path: [] }];

  for (let gen = 0; gen <= generations; gen++) {
    const next: Frame[] = [];
    const cellHeight = rows / Math.pow(2, gen);

    for (const frame of frontier) {
      const node = frame.id ? (graph.nodes.get(frame.id) ?? null) : null;
      const positions = frame.id ? (seen.get(frame.id) ?? []) : [];
      const duplicateOf = positions.length > 0 ? positions[0]! : null;
      if (frame.id) seen.set(frame.id, [...positions, { generation: gen, slot: frame.slot }]);

      const marked = frame.id ? rankById.get(frame.id) : undefined;

      cells.push({
        node,
        generation: gen,
        slot: frame.slot,
        path: frame.path,
        y: frame.slot * cellHeight + cellHeight / 2,
        height: cellHeight,
        duplicateOf,
        contributionRank: marked?.rank ?? null,
        contribution: marked?.contribution ?? null,
      });

      if (gen === generations) continue;
      next.push(
        { id: node?.sireId ?? null, generation: gen + 1, slot: frame.slot * 2, path: [...frame.path, 'S'] },
        { id: node?.damId ?? null, generation: gen + 1, slot: frame.slot * 2 + 1, path: [...frame.path, 'D'] },
      );
    }
    frontier = next;
  }

  const columns: PedigreeCell[][] = Array.from({ length: generations + 1 }, () => []);
  for (const c of cells) columns[c.generation]!.push(c);
  for (const col of columns) col.sort((a, b) => a.slot - b.slot);

  const repeats = [...seen.entries()]
    .filter(([, positions]) => positions.length > 1)
    .map(([id, positions]) => ({
      id,
      name: graph.nodes.get(id)?.name ?? null,
      positions,
    }))
    .sort((a, b) => b.positions.length - a.positions.length);

  // Ancestor slots only — the subject itself is not an ancestor of itself.
  const ancestorCells = cells.filter((c) => c.generation > 0);

  return {
    generations,
    rows,
    cells,
    columns,
    repeats,
    knownSlots: ancestorCells.filter((c) => c.node).length,
    totalSlots: ancestorCells.length,
  };
}

/** Sire's dam's sire → "Sire · Dam · Sire". Used for accessible labels. */
export function describePath(path: readonly ('S' | 'D')[]): string {
  if (path.length === 0) return 'Subject';
  return path.map((p) => (p === 'S' ? 'Sire' : 'Dam')).join(' · ');
}

/**
 * The name a breeder would use for a slot: "Sire", "Dam", "Paternal
 * grandsire", and past three generations, "3rd gen (sire's dam's sire)".
 */
export function slotTitle(path: readonly ('S' | 'D')[]): string {
  const key = path.join('');
  const named: Record<string, string> = {
    S: 'Sire',
    D: 'Dam',
    SS: 'Paternal grandsire',
    SD: 'Paternal granddam',
    DS: 'Maternal grandsire',
    DD: 'Maternal granddam',
    SSS: 'Paternal great-grandsire',
    SSD: 'Paternal great-granddam',
    SDS: 'Paternal great-grandsire',
    SDD: 'Paternal great-granddam',
    DSS: 'Maternal great-grandsire',
    DSD: 'Maternal great-granddam',
    DDS: 'Maternal great-grandsire',
    DDD: 'Maternal great-granddam',
  };
  return named[key] ?? `Gen ${path.length} (${describePath(path).toLowerCase()})`;
}
