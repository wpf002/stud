import { describe, expect, it } from 'vitest';
import {
  PedigreeCycleError,
  ancestors,
  buildGraph,
  coiBand,
  commonAncestors,
  completeness,
  evaluatePairing,
  inbreedingCoefficient,
  kinship,
  pathContributions,
  projectedLitterCoi,
  rankSires,
  relatedness,
  RELATIONSHIP_COPY,
} from '../src/index.js';
import {
  doubledFullSib,
  firstCousins,
  fiveGenerationGsp,
  fullSibMating,
  halfFirstCousins,
  halfSibMating,
  inbredCommonAncestor,
  parentOffspring,
  unrelated,
} from './fixtures.js';

const close = (actual: number, expected: number, tol = 1e-9) =>
  expect(Math.abs(actual - expected)).toBeLessThan(tol);

describe("Wright's coefficient of inbreeding", () => {
  it('is 0 for unrelated parents', () => {
    const g = buildGraph(unrelated);
    close(inbreedingCoefficient(g, 'X'), 0);
  });

  it('is 0.25 for a full-sibling mating', () => {
    const g = buildGraph(fullSibMating);
    close(inbreedingCoefficient(g, 'X'), 0.25);
  });

  it('is 0.125 for a half-sibling mating', () => {
    const g = buildGraph(halfSibMating);
    close(inbreedingCoefficient(g, 'X'), 0.125);
  });

  it('is 0.25 for a parent-offspring mating', () => {
    const g = buildGraph(parentOffspring);
    close(inbreedingCoefficient(g, 'X'), 0.25);
  });

  it('is 0.0625 for a first-cousin mating', () => {
    const g = buildGraph(firstCousins);
    close(inbreedingCoefficient(g, 'X'), 0.0625);
  });

  it('is 0.03125 for a half-first-cousin mating', () => {
    const g = buildGraph(halfFirstCousins);
    close(inbreedingCoefficient(g, 'X'), 0.03125);
  });

  it('accounts for the common ancestor being inbred itself', () => {
    const g = buildGraph(inbredCommonAncestor);
    // F_A = 0.25 (A is a full-sib product)
    close(inbreedingCoefficient(g, 'A'), 0.25);
    // F_X = (1/2)^3 * (1 + 0.25) = 0.15625 — NOT 0.125.
    close(inbreedingCoefficient(g, 'X'), 0.15625);
  });

  it('compounds across two generations of full-sib mating', () => {
    const g = buildGraph(doubledFullSib);
    close(inbreedingCoefficient(g, 'S2'), 0.25);
    close(inbreedingCoefficient(g, 'D2'), 0.25);
    close(inbreedingCoefficient(g, 'X'), 0.375);
  });

  it('returns 0 when either parent is unknown', () => {
    const g = buildGraph([{ id: 'X', sireId: 'S' }, { id: 'S' }]);
    close(inbreedingCoefficient(g, 'X'), 0);
  });
});

describe('coancestry', () => {
  it('is 0.5 for an animal with itself when not inbred', () => {
    const g = buildGraph(unrelated);
    close(kinship(g, 'X', 'X'), 0.5);
  });

  it('rises above 0.5 with itself when inbred', () => {
    const g = buildGraph(fullSibMating);
    // f(X,X) = 1/2 (1 + F_X) = 1/2 (1.25) = 0.625
    close(kinship(g, 'X', 'X'), 0.625);
  });

  it('is 0.25 between a parent and its offspring', () => {
    const g = buildGraph(unrelated);
    close(kinship(g, 'A', 'X'), 0.25);
  });

  it('is symmetric', () => {
    const g = buildGraph(firstCousins);
    close(kinship(g, 'S', 'D'), kinship(g, 'D', 'S'));
  });

  it('is 0 against an animal not in the graph', () => {
    const g = buildGraph(unrelated);
    close(kinship(g, 'X', 'nobody'), 0);
    close(kinship(g, 'X', null), 0);
  });
});

describe('relatedness', () => {
  it('is 0.5 for full siblings', () => {
    const g = buildGraph(fullSibMating);
    close(relatedness(g, 'S', 'D'), 0.5);
  });

  it('is 0.25 for half siblings', () => {
    const g = buildGraph(halfSibMating);
    close(relatedness(g, 'S', 'D'), 0.25);
  });

  it('is 0.5 for parent and offspring', () => {
    const g = buildGraph(unrelated);
    close(relatedness(g, 'A', 'X'), 0.5);
  });

  it('is 0.125 for first cousins', () => {
    const g = buildGraph(firstCousins);
    close(relatedness(g, 'S', 'D'), 0.125);
  });
});

/**
 * Wright's theorem: the path method and the tabular method must agree.
 * Two independent implementations checking each other is worth more than
 * either checking a hand-computed constant.
 */
describe('path method agrees with the tabular method', () => {
  const cases: [string, ReturnType<typeof fiveGenerationGsp>, string, string][] = [
    ['full sibs', fullSibMating, 'S', 'D'],
    ['half sibs', halfSibMating, 'S', 'D'],
    ['parent/offspring', parentOffspring, 'S', 'D'],
    ['first cousins', firstCousins, 'S', 'D'],
    ['half first cousins', halfFirstCousins, 'S', 'D'],
    ['inbred common ancestor', inbredCommonAncestor, 'S', 'D'],
    ['doubled full sib', doubledFullSib, 'S2', 'D2'],
    ['five-generation GSP', fiveGenerationGsp(), 'SIRE', 'DAM'],
  ];

  for (const [name, nodes, sire, dam] of cases) {
    it(name, () => {
      const g = buildGraph(nodes);
      const tabular = projectedLitterCoi(g, sire, dam);
      const paths = pathContributions(g, sire, dam, { maxGenerations: 12 });
      expect(paths.truncated).toBe(false);
      close(paths.total, tabular, 1e-9);
    });
  }
});

describe('path contributions', () => {
  it('splits a full-sib mating evenly between the two shared parents', () => {
    const g = buildGraph(fullSibMating);
    const { contributions } = pathContributions(g, 'S', 'D');
    expect(contributions.map((c) => c.id).sort()).toEqual(['A', 'B']);
    for (const c of contributions) close(c.contribution, 0.125);
  });

  it('attributes the whole thing to the single shared ancestor for half sibs', () => {
    const g = buildGraph(halfSibMating);
    const { contributions } = pathContributions(g, 'S', 'D');
    expect(contributions).toHaveLength(1);
    expect(contributions[0]!.id).toBe('A');
    close(contributions[0]!.contribution, 0.125);
  });

  it("carries the ancestor's own COI into its contribution", () => {
    const g = buildGraph(inbredCommonAncestor);
    const { contributions } = pathContributions(g, 'S', 'D');
    const a = contributions.find((c) => c.id === 'A')!;
    close(a.ownCoi, 0.25);
    close(a.contribution, 0.15625);
  });

  it('excludes path pairs that overlap anywhere but the common ancestor', () => {
    // Father × daughter: GG ancestors of S also sit on D's path through S.
    const g = buildGraph(parentOffspring);
    const { contributions, total } = pathContributions(g, 'S', 'D');
    expect(contributions.map((c) => c.id)).toEqual(['S']);
    close(total, 0.25);
  });

  it('ranks the largest contributor first', () => {
    const g = buildGraph(fiveGenerationGsp());
    const { contributions } = pathContributions(g, 'SIRE', 'DAM');
    expect(contributions.length).toBeGreaterThan(0);
    for (let i = 1; i < contributions.length; i++) {
      expect(contributions[i - 1]!.contribution).toBeGreaterThanOrEqual(contributions[i]!.contribution);
    }
  });
});

describe('graph traversal', () => {
  it('records the shortest depth to each ancestor', () => {
    const g = buildGraph(parentOffspring);
    const anc = ancestors(g, 'X');
    // S is both X's sire (depth 1) and X's dam's sire (depth 2). Shortest wins.
    expect(anc.get('S')).toBe(1);
    expect(anc.get('D')).toBe(1);
    expect(anc.get('M')).toBe(2);
  });

  it('honours the generation bound', () => {
    const g = buildGraph(firstCousins);
    expect([...ancestors(g, 'X', 1).keys()].sort()).toEqual(['D', 'S']);
    expect(ancestors(g, 'X', 2).size).toBe(6);
  });

  it('never includes the subject in its own ancestor set', () => {
    const g = buildGraph(fullSibMating);
    expect(ancestors(g, 'X').has('X')).toBe(false);
  });

  it('finds common ancestors closest-first', () => {
    const g = buildGraph(fiveGenerationGsp());
    const shared = commonAncestors(g, 'SIRE', 'DAM');
    expect(shared.map((s) => s.id)).toContain('MARSHKING');
    const depths = shared.map((s) => s.depthFromA + s.depthFromB);
    expect([...depths].sort((a, b) => a - b)).toEqual(depths);
  });

  it('treats an animal that is an ancestor of the other as common ground', () => {
    const g = buildGraph(parentOffspring);
    expect(commonAncestors(g, 'S', 'D').map((c) => c.id)).toEqual(['S']);
  });

  it('drops parent references that point outside the supplied set', () => {
    const g = buildGraph([{ id: 'X', sireId: 'missing', damId: 'D' }, { id: 'D' }]);
    expect(g.nodes.get('X')!.sireId).toBeNull();
    expect(g.nodes.get('X')!.damId).toBe('D');
  });

  it('rejects a cycle instead of hanging', () => {
    expect(() => buildGraph([{ id: 'A', sireId: 'B' }, { id: 'B', sireId: 'A' }])).toThrow(
      PedigreeCycleError,
    );
  });

  it('rejects an animal that is its own sire', () => {
    expect(() => buildGraph([{ id: 'A', sireId: 'A' }])).toThrow(PedigreeCycleError);
  });
});

describe('completeness', () => {
  it('is 100% for a fully known 3-generation pedigree', () => {
    const g = buildGraph(firstCousins);
    const c = completeness(g, 'X', 2);
    expect(c.ratio).toBe(1);
    expect(c.perGeneration[0]).toMatchObject({ generation: 1, known: 2, possible: 2 });
    expect(c.perGeneration[1]).toMatchObject({ generation: 2, known: 4, possible: 4 });
  });

  it('counts unknown ancestors as unknown slots, not as absent rows', () => {
    const g = buildGraph([{ id: 'X', sireId: 'S', damId: 'D' }, { id: 'S' }, { id: 'D' }]);
    const c = completeness(g, 'X', 3);
    // Gen 1: 2/2. Gen 2: 0/4. Gen 3: 0/8. → 2/14
    expect(c.perGeneration.map((p) => p.possible)).toEqual([2, 4, 8]);
    close(c.ratio, 2 / 14);
    expect(c.deepestGeneration).toBe(1);
  });

  it('computes the complete generation equivalent', () => {
    const g = buildGraph(firstCousins);
    // 2 parents at ½ + 4 grandparents at ¼ = 1 + 1 = 2
    close(completeness(g, 'X', 2).generationEquivalent, 2);
  });

  it('reports ancestor loss when the same dog fills several slots', () => {
    const g = buildGraph(fullSibMating);
    const c = completeness(g, 'X', 2);
    // Gen 2 is A,B,A,B — 4 slots, 2 distinct. Plus S,D at gen 1.
    expect(c.totalSlots).toBe(6);
    expect(c.distinctAncestors).toBe(4);
    close(c.ancestorLossRatio, 4 / 6);
  });
});

describe('trial pairing', () => {
  it('projects the COI of a litter that does not exist', () => {
    const g = buildGraph(fiveGenerationGsp());
    const result = evaluatePairing(g, 'SIRE', 'DAM');
    close(result.projectedCoi, kinship(g, 'SIRE', 'DAM'));
    expect(result.contributions.length).toBeGreaterThan(0);
  });

  it('names the relationship', () => {
    expect(evaluatePairing(buildGraph(fullSibMating), 'S', 'D').relationship).toBe('FULL_SIBLINGS');
    expect(evaluatePairing(buildGraph(halfSibMating), 'S', 'D').relationship).toBe('HALF_SIBLINGS');
    expect(evaluatePairing(buildGraph(parentOffspring), 'S', 'D').relationship).toBe('PARENT_OFFSPRING');
    expect(evaluatePairing(buildGraph(unrelated), 'A', 'B').relationship).toBe('UNRELATED');
  });

  it('refuses to imply confidence it does not have', () => {
    const g = buildGraph([{ id: 'S' }, { id: 'D' }]);
    const result = evaluatePairing(g, 'S', 'D');
    close(result.projectedCoi, 0);
    expect(result.confidence).toBe('INSUFFICIENT');
    expect(result.confidenceNote).toMatch(/unknown/i);
  });

  it('reports high confidence only on a genuinely deep, complete pedigree', () => {
    // The GSP fixture bottoms out in founders at generation 3 on the sire
    // side, so it is honestly LOW — depth matters regardless of how many
    // generations the caller asked us to walk.
    const gsp = buildGraph(fiveGenerationGsp());
    expect(evaluatePairing(gsp, 'SIRE', 'DAM', { generations: 3 }).confidence).toBe('LOW');

    // A fully-populated 6-generation binary pedigree on both sides.
    const nodes: { id: string; sireId: string | null; damId: string | null }[] = [];
    const total = Math.pow(2, 7) - 1;
    for (let i = 1; i <= total; i++) {
      const sire = i * 2;
      const dam = i * 2 + 1;
      nodes.push({
        id: `n${i}`,
        sireId: sire <= total ? `n${sire}` : null,
        damId: dam <= total ? `n${dam}` : null,
      });
    }
    const deep = buildGraph(nodes);
    // n2 and n3 each carry five complete generations beneath them.
    expect(evaluatePairing(deep, 'n2', 'n3', { generations: 5 }).confidence).toBe('HIGH');
  });

  it('takes confidence from the weaker of the two pedigrees', () => {
    const nodes = [...fiveGenerationGsp(), { id: 'STRANGER', sireId: null, damId: null }];
    const g = buildGraph(nodes);
    expect(evaluatePairing(g, 'SIRE', 'STRANGER').confidence).toBe('INSUFFICIENT');
  });

  it('bands the COI against breeding conventions', () => {
    expect(coiBand(0.0)).toBe('MINIMAL');
    expect(coiBand(0.05)).toBe('LOW');
    expect(coiBand(0.0625)).toBe('MODERATE');
    expect(coiBand(0.124)).toBe('MODERATE');
    expect(coiBand(0.125)).toBe('HIGH');
    expect(coiBand(0.25)).toBe('VERY_HIGH');
  });
});

describe('rankSires', () => {
  it('orders prospective sires by projected COI, lowest first', () => {
    const g = buildGraph([
      ...halfSibMating.filter((n) => n.id !== 'X'),
      { id: 'OUTCROSS', sireId: null, damId: null, name: 'OUTCROSS' },
    ]);
    const ranked = rankSires(g, 'D', ['S', 'OUTCROSS']);
    expect(ranked[0]!.sireId).toBe('OUTCROSS');
    close(ranked[0]!.projectedCoi, 0);
    expect(ranked[1]!.sireId).toBe('S');
    close(ranked[1]!.projectedCoi, 0.125);
    expect(ranked[1]!.sharedAncestors).toBe(1);
  });
});

describe('performance', () => {
  it('handles a 10-generation pedigree without blowing up', () => {
    // 2^11 - 1 nodes, fully populated binary pedigree.
    const nodes: { id: string; sireId: string | null; damId: string | null }[] = [];
    const total = Math.pow(2, 11) - 1;
    for (let i = 1; i <= total; i++) {
      const sire = i * 2;
      const dam = i * 2 + 1;
      nodes.push({
        id: `n${i}`,
        sireId: sire <= total ? `n${sire}` : null,
        damId: dam <= total ? `n${dam}` : null,
      });
    }
    const start = performance.now();
    const g = buildGraph(nodes);
    const coi = inbreedingCoefficient(g, 'n1');
    const elapsed = performance.now() - start;
    close(coi, 0);
    expect(elapsed).toBeLessThan(1500);
  });
});

function node(id: string, sireId: string | null = null, damId: string | null = null) {
  return { id, sireId, damId, name: id, sex: 'MALE' as const, breed: 'Test', birthYear: null };
}

describe('relationship labels', () => {
  /**
   * The classifier works from the relatedness COEFFICIENT, not from shared
   * parents. Two dogs with four different parents can be as related as
   * half-siblings through a doubled-up grandparent — and calling them "half
   * siblings" on a public page is a false statement of fact about somebody's
   * breeding program.
   */
  it('reports a half-sibling LEVEL for dogs who share no parent', () => {
    // Teal appears as the sire of one and the maternal grandsire of the other,
    // twice over, which lifts relatedness into the half-sibling band without
    // either dog sharing a parent with the other.
    const graph = buildGraph([
      node('teal'),
      node('thistle'),
      node('reed'),
      node('storm'),
      node('wren', 'teal', 'thistle'),
      node('juniper', 'teal', 'reed'),
      node('ranger', 'storm', 'wren'),
    ]);

    const pairing = evaluatePairing(graph, 'ranger', 'juniper', { generations: 6 });
    const ranger = graph.nodes.get('ranger')!;
    const juniper = graph.nodes.get('juniper')!;

    // They demonstrably do not share a parent.
    expect([ranger.sireId, ranger.damId]).not.toContain(juniper.sireId);
    expect([ranger.sireId, ranger.damId]).not.toContain(juniper.damId);

    // Whatever band it lands in, the copy must describe a LEVEL of
    // relatedness rather than assert a parentage the pedigree contradicts.
    const copy = RELATIONSHIP_COPY[pairing.relationship];
    expect(copy).toBeDefined();
    if (pairing.relationship === 'HALF_SIBLINGS' || pairing.relationship === 'FULL_SIBLINGS') {
      expect(copy).toMatch(/level/i);
      expect(copy).not.toMatch(/^(Half|Full)-siblings$/);
    }
  });

  it('has copy for every relationship it can return', () => {
    for (const kind of [
      'UNRELATED', 'DISTANT', 'COUSINS', 'HALF_SIBLINGS',
      'FULL_SIBLINGS', 'PARENT_OFFSPRING', 'GRANDPARENT_GRANDOFFSPRING',
    ] as const) {
      expect(RELATIONSHIP_COPY[kind]).toBeTruthy();
    }
  });

  it('still names a true parent-offspring pair directly', () => {
    const graph = buildGraph([node('sire'), node('dam'), node('pup', 'sire', 'dam')]);
    expect(evaluatePairing(graph, 'sire', 'pup').relationship).toBe('PARENT_OFFSPRING');
  });
});
