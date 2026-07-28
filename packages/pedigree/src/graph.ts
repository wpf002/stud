/**
 * The ancestry graph.
 *
 * A pedigree is a directed acyclic graph where every node has at most one sire
 * and one dam. It is NOT a tree — the whole point of computing inbreeding is
 * that the same ancestor appears on more than one path.
 *
 * This module is pure. No network, no database, no clock. (Invariant 1.)
 */

export type DogId = string;

/** The minimum an animal needs for the maths to work. */
export interface PedigreeNode {
  id: DogId;
  sireId?: DogId | null;
  damId?: DogId | null;
  /** Optional, used only for presentation and duplicate detection. */
  name?: string | null;
  sex?: 'MALE' | 'FEMALE' | null;
  breed?: string | null;
  birthYear?: number | null;
}

export interface PedigreeGraph {
  nodes: ReadonlyMap<DogId, PedigreeNode>;
  /**
   * Topological rank. Every animal ranks strictly higher than both parents,
   * so `rank[child] > rank[parent]` always holds. The kinship recursion
   * relies on this to stay well-founded.
   */
  rank: ReadonlyMap<DogId, number>;
}

export class PedigreeCycleError extends Error {
  constructor(public cycle: DogId[]) {
    super(
      `Pedigree contains a cycle: ${cycle.join(' → ')}. An animal cannot be its own ancestor.`,
    );
    this.name = 'PedigreeCycleError';
  }
}

/**
 * Build a graph from a flat node list.
 *
 * Parent references that point outside the supplied set are dropped rather
 * than throwing: a partially-loaded pedigree is the normal case, and treating
 * a missing ancestor as unknown is exactly right. Callers who care can check
 * `completeness()`.
 */
export function buildGraph(input: readonly PedigreeNode[]): PedigreeGraph {
  const nodes = new Map<DogId, PedigreeNode>();
  for (const n of input) {
    nodes.set(n.id, {
      ...n,
      sireId: n.sireId ?? null,
      damId: n.damId ?? null,
    });
  }

  // Drop dangling parent pointers so downstream code never has to null-check
  // against the map.
  for (const [id, n] of nodes) {
    const sireId = n.sireId && nodes.has(n.sireId) ? n.sireId : null;
    const damId = n.damId && nodes.has(n.damId) ? n.damId : null;
    if (sireId !== n.sireId || damId !== n.damId) nodes.set(id, { ...n, sireId, damId });
  }

  return { nodes, rank: topologicalRank(nodes) };
}

/**
 * Assign each node a rank greater than both parents' ranks.
 * Detects cycles on the way; a cycle means someone typed a dog in as its own
 * grandfather, which happens more often than you would hope.
 */
function topologicalRank(nodes: ReadonlyMap<DogId, PedigreeNode>): Map<DogId, number> {
  const rank = new Map<DogId, number>();
  const state = new Map<DogId, 'visiting' | 'done'>();
  const stack: DogId[] = [];

  const visit = (id: DogId): number => {
    const cached = rank.get(id);
    if (cached !== undefined) return cached;

    if (state.get(id) === 'visiting') {
      const start = stack.indexOf(id);
      throw new PedigreeCycleError([...stack.slice(start === -1 ? 0 : start), id]);
    }

    state.set(id, 'visiting');
    stack.push(id);

    const node = nodes.get(id);
    let r = 0;
    if (node?.sireId) r = Math.max(r, visit(node.sireId) + 1);
    if (node?.damId) r = Math.max(r, visit(node.damId) + 1);

    stack.pop();
    state.set(id, 'done');
    rank.set(id, r);
    return r;
  };

  for (const id of nodes.keys()) visit(id);
  return rank;
}

export function getNode(graph: PedigreeGraph, id: DogId | null | undefined): PedigreeNode | null {
  if (!id) return null;
  return graph.nodes.get(id) ?? null;
}

export function parentsOf(graph: PedigreeGraph, id: DogId): { sireId: DogId | null; damId: DogId | null } {
  const n = graph.nodes.get(id);
  return { sireId: n?.sireId ?? null, damId: n?.damId ?? null };
}

/**
 * Every ancestor of `id`, with the shortest number of generations back to it.
 *
 * `maxGenerations` bounds the walk. 0 means "the animal itself only"; the
 * animal is never included in its own ancestor set.
 */
export function ancestors(
  graph: PedigreeGraph,
  id: DogId,
  maxGenerations = Number.POSITIVE_INFINITY,
): Map<DogId, number> {
  const found = new Map<DogId, number>();
  if (!graph.nodes.has(id)) return found;

  let frontier: DogId[] = [id];
  for (let gen = 1; gen <= maxGenerations && frontier.length > 0; gen++) {
    const next: DogId[] = [];
    for (const cur of frontier) {
      const { sireId, damId } = parentsOf(graph, cur);
      for (const parent of [sireId, damId]) {
        if (!parent) continue;
        // Keep the SHORTEST distance — a dog can appear at several depths.
        if (!found.has(parent)) {
          found.set(parent, gen);
          next.push(parent);
        } else {
          next.push(parent);
        }
      }
    }
    // Deduplicate the frontier or a densely looped pedigree explodes.
    frontier = [...new Set(next)];
  }
  return found;
}

/** Ancestors shared by two animals, with each one's depth from either side. */
export interface CommonAncestor {
  id: DogId;
  name?: string | null;
  /** Shortest generations back from `a`. */
  depthFromA: number;
  /** Shortest generations back from `b`. */
  depthFromB: number;
}

export function commonAncestors(
  graph: PedigreeGraph,
  a: DogId,
  b: DogId,
  maxGenerations = Number.POSITIVE_INFINITY,
): CommonAncestor[] {
  // An animal that IS an ancestor of the other counts as common ground —
  // a father/daughter pairing has to surface the father.
  const ancA = ancestors(graph, a, maxGenerations);
  const ancB = ancestors(graph, b, maxGenerations);
  if (ancB.has(a)) ancA.set(a, 0);
  if (ancA.has(b)) ancB.set(b, 0);

  const out: CommonAncestor[] = [];
  for (const [id, depthFromA] of ancA) {
    const depthFromB = ancB.get(id);
    if (depthFromB === undefined) continue;
    out.push({ id, name: graph.nodes.get(id)?.name ?? null, depthFromA, depthFromB });
  }

  // Closest first — that is the order a breeder reads them in.
  return out.sort(
    (x, y) => x.depthFromA + x.depthFromB - (y.depthFromA + y.depthFromB) || x.id.localeCompare(y.id),
  );
}

/** Does `ancestorId` appear anywhere above `id`? */
export function isAncestorOf(graph: PedigreeGraph, ancestorId: DogId, id: DogId): boolean {
  return ancestors(graph, id).has(ancestorId);
}
