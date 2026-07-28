import { describe, expect, it } from 'vitest';
import {
  buildGraph,
  extractRegistration,
  findDuplicates,
  inbreedingCoefficient,
  nameSimilarity,
  parseCsvPedigree,
  parseDogLine,
  parseIndentedPedigree,
  scorePair,
  splitCsvLine,
} from '../src/index.js';

describe('parseDogLine', () => {
  it('separates prefix titles, suffix titles, name and registration', () => {
    const r = parseDogLine("GCH CH Blackwater's Ranger Of The Marsh MH NA SR91234501");
    expect(r.titlesPrefix).toBe('GCH CH');
    expect(r.registeredName).toBe("Blackwater's Ranger Of The Marsh");
    expect(r.titlesSuffix).toBe('MH NA');
    expect(r.registrationNumber).toBe('SR91234501');
    expect(r.registryBody).toBe('AKC');
  });

  it('leaves a plain name alone', () => {
    const r = parseDogLine('Marshland Drake');
    expect(r.registeredName).toBe('Marshland Drake');
    expect(r.titlesPrefix).toBeNull();
    expect(r.titlesSuffix).toBeNull();
    expect(r.registrationNumber).toBeNull();
  });

  it('never eats the whole name when it looks like a title', () => {
    const r = parseDogLine('CH');
    expect(r.registeredName).toBe('CH');
  });

  it('strips a parenthesised trailing registration', () => {
    const r = parseDogLine('Cedar Run Atlas (AKC SS12009944)');
    expect(r.registrationNumber).toBe('SS12009944');
    expect(r.registeredName).toBe('Cedar Run Atlas');
  });

  it('recognises registry number shapes', () => {
    expect(extractRegistration('SR91234501')).toEqual({ number: 'SR91234501', body: 'AKC' });
    expect(extractRegistration('P123456789')).toEqual({ number: 'P123456789', body: 'UKC' });
    expect(extractRegistration('NA-2023-4417')).toEqual({ number: 'NA-2023-4417', body: 'NAVHDA' });
    expect(extractRegistration('just a name')).toBeNull();
  });
});

describe('parseIndentedPedigree', () => {
  const text = `Blackwater's Ranger Of The Marsh SR91234501
  Sire: CH Blackwater's Storm SR75110203
    Sire: FC Marshland Drake SR51002288
    Dam: Blackwater's Wren SR52883101
  Dam: Blackwater's Juniper Wind SR88451102
    Sire: FC Marshland Drake SR51002288
    Dam: Rivergate Thistle SR53001177`;

  it('reads the hierarchy and assigns generations', () => {
    const r = parseIndentedPedigree(text);
    expect(r.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(r.dogs).toHaveLength(7);

    const subject = r.dogs.find((d) => d.key === r.subjectKey)!;
    expect(subject.registeredName).toBe("Blackwater's Ranger Of The Marsh");
    expect(subject.generation).toBe(0);

    const sire = r.dogs.find((d) => d.key === subject.sireKey)!;
    expect(sire.registeredName).toBe("Blackwater's Storm");
    expect(sire.titlesPrefix).toBe('CH');
    expect(sire.sex).toBe('MALE');
    expect(sire.generation).toBe(1);

    const grandsire = r.dogs.find((d) => d.key === sire.sireKey)!;
    expect(grandsire.registeredName).toBe('Marshland Drake');
    expect(grandsire.generation).toBe(2);
  });

  it('infers sire/dam from position when labels are missing', () => {
    const r = parseIndentedPedigree(`Subject Dog\n  First Parent\n  Second Parent`);
    const subject = r.dogs.find((d) => d.key === r.subjectKey)!;
    expect(r.dogs.find((d) => d.key === subject.sireKey)!.registeredName).toBe('First Parent');
    expect(r.dogs.find((d) => d.key === subject.damKey)!.registeredName).toBe('Second Parent');
  });

  it('handles tab indentation', () => {
    const r = parseIndentedPedigree('Subject\n\tSire: Papa\n\tDam: Mama');
    const subject = r.dogs.find((d) => d.key === r.subjectKey)!;
    expect(subject.sireKey).toBeTruthy();
    expect(subject.damKey).toBeTruthy();
  });

  it('warns rather than silently dropping a third parent', () => {
    const r = parseIndentedPedigree('Subject\n  Sire: A\n  Dam: B\n  Extra: C');
    expect(r.issues.some((i) => /already has both parents/.test(i.message))).toBe(true);
  });

  it('warns when nothing can be verified', () => {
    const r = parseIndentedPedigree('Subject\n  Sire: Papa\n  Dam: Mama');
    expect(r.issues.some((i) => /registration numbers/i.test(i.message))).toBe(true);
  });

  it('errors on empty input instead of returning an empty success', () => {
    const r = parseIndentedPedigree('   \n  \n');
    expect(r.issues[0]!.severity).toBe('error');
    expect(r.dogs).toHaveLength(0);
  });

  it('produces a graph whose COI can be computed', () => {
    // Marshland Drake appears on both sides — a real half-sib-style loop.
    const r = parseIndentedPedigree(text);
    const byName = new Map<string, string>();
    for (const d of r.dogs) {
      const existing = byName.get(d.registeredName!);
      byName.set(d.registeredName!, existing ?? d.key);
    }
    // Collapse the duplicate ancestor the way the merge tool would.
    const canonical = (key: string | null | undefined) => {
      if (!key) return null;
      const dog = r.dogs.find((d) => d.key === key)!;
      return byName.get(dog.registeredName!)!;
    };
    const nodes = r.dogs
      .filter((d) => byName.get(d.registeredName!) === d.key)
      .map((d) => ({ id: d.key, sireId: canonical(d.sireKey), damId: canonical(d.damKey), name: d.registeredName }));

    const g = buildGraph(nodes);
    // Ranger's parents share exactly one parent (Drake) → half-sib mating.
    expect(inbreedingCoefficient(g, r.subjectKey!)).toBeCloseTo(0.125, 10);
  });
});

describe('splitCsvLine', () => {
  it('respects quoted fields containing the delimiter', () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
  });
  it('handles escaped quotes', () => {
    expect(splitCsvLine('a,"say ""hi""",c')).toEqual(['a', 'say "hi"', 'c']);
  });
  it('keeps empty trailing fields', () => {
    expect(splitCsvLine('a,b,')).toEqual(['a', 'b', '']);
  });
});

describe('parseCsvPedigree', () => {
  const csv = `id,name,sex,breed,dob,registration,sire,dam
1,Ranger,M,German Shorthaired Pointer,2022-03-14,SR91234501,2,3
2,Storm,M,German Shorthaired Pointer,2018-01-02,SR75110203,4,5
3,Juniper,F,German Shorthaired Pointer,2019-06-11,SR88451102,4,6
4,Drake,M,German Shorthaired Pointer,2015-04-01,SR51002288,,
5,Wren,F,German Shorthaired Pointer,2015-09-09,SR52883101,,
6,Thistle,F,German Shorthaired Pointer,2016-02-20,SR53001177,,`;

  it('resolves parent references by id', () => {
    const r = parseCsvPedigree(csv);
    expect(r.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(r.dogs).toHaveLength(6);

    const ranger = r.dogs.find((d) => d.registeredName === 'Ranger')!;
    expect(r.subjectKey).toBe(ranger.key);
    expect(ranger.sex).toBe('MALE');
    expect(ranger.birthYear).toBe(2022);
    expect(ranger.registrationNumber).toBe('SR91234501');

    const storm = r.dogs.find((d) => d.registeredName === 'Storm')!;
    expect(ranger.sireKey).toBe(storm.key);
    expect(storm.generation).toBe(1);
    expect(r.dogs.find((d) => d.registeredName === 'Drake')!.generation).toBe(2);
  });

  it('computes the right COI once loaded into a graph', () => {
    const r = parseCsvPedigree(csv);
    const g = buildGraph(
      r.dogs.map((d) => ({ id: d.key, sireId: d.sireKey, damId: d.damKey, name: d.registeredName })),
    );
    // Storm and Juniper share sire Drake → half-sib mating → 0.125.
    expect(inbreedingCoefficient(g, r.subjectKey!)).toBeCloseTo(0.125, 10);
  });

  it('resolves parents given by name instead of id', () => {
    const byName = `name,sex,sire,dam
Pup,M,Papa,Mama
Papa,M,,
Mama,F,,`;
    const r = parseCsvPedigree(byName);
    const pup = r.dogs.find((d) => d.registeredName === 'Pup')!;
    expect(r.dogs.find((d) => d.key === pup.sireKey)!.registeredName).toBe('Papa');
    expect(r.dogs.find((d) => d.key === pup.damKey)!.registeredName).toBe('Mama');
  });

  it('creates stub ancestors for named parents with no row of their own', () => {
    const r = parseCsvPedigree(`name,sex,sire,dam\nPup,M,Ghost Sire,Ghost Dam`);
    expect(r.dogs).toHaveLength(3);
    expect(r.issues.some((i) => /no matching row/.test(i.message))).toBe(true);
    const pup = r.dogs.find((d) => d.registeredName === 'Pup')!;
    expect(r.dogs.find((d) => d.key === pup.sireKey)!.registeredName).toBe('Ghost Sire');
  });

  it('accepts tab-separated input', () => {
    const r = parseCsvPedigree('name\tsex\tsire\nPup\tM\tPapa\nPapa\tM\t');
    expect(r.dogs.find((d) => d.registeredName === 'Pup')).toBeTruthy();
  });

  it('refuses a file with no name column', () => {
    const r = parseCsvPedigree('foo,bar\n1,2');
    expect(r.issues[0]!.severity).toBe('error');
    expect(r.dogs).toHaveLength(0);
  });

  it('rejects a dog listed as its own parent', () => {
    const r = parseCsvPedigree('id,name,sire\n1,Loop,1');
    expect(r.issues.some((i) => i.severity === 'error' && /its own sire/.test(i.message))).toBe(true);
    expect(r.dogs[0]!.sireKey).toBeNull();
  });

  it('parses titles out of the name column', () => {
    const r = parseCsvPedigree('name,sex\nCH Cedar Run Atlas MH SS12009944,M');
    expect(r.dogs[0]!.registeredName).toBe('Cedar Run Atlas');
    expect(r.dogs[0]!.titlesPrefix).toBe('CH');
    expect(r.dogs[0]!.registrationNumber).toBe('SS12009944');
  });
});

describe('duplicate detection', () => {
  it('scores an identical registration number as certain', () => {
    const m = scorePair(
      { id: 'a', registeredName: "Blackwater's Storm", registrationNumber: 'SR75110203', registryBody: 'AKC' },
      { id: 'b', registeredName: 'Blackwaters Storm', registrationNumber: 'SR-75110203', registryBody: 'AKC' },
    )!;
    expect(m.confidence).toBe('certain');
    expect(m.reasons).toContain('Same AKC number');
  });

  it('matches a dropped kennel prefix', () => {
    const m = scorePair(
      { id: 'a', registeredName: "Blackwater's Ranger Of The Marsh", sex: 'MALE', birthYear: 2022 },
      { id: 'b', registeredName: 'Ranger Of The Marsh', sex: 'MALE', birthYear: 2022 },
    )!;
    expect(m).toBeTruthy();
    expect(m.score).toBeGreaterThan(0.6);
  });

  it('refuses to match different registration numbers on the same registry', () => {
    const m = scorePair(
      { id: 'a', registeredName: 'Marshland Drake', registrationNumber: 'SR51002288', registryBody: 'AKC' },
      { id: 'b', registeredName: 'Marshland Drake', registrationNumber: 'SR99999999', registryBody: 'AKC' },
    );
    expect(m).toBeNull();
  });

  it('surfaces conflicts even on a strong name match', () => {
    const m = scorePair(
      { id: 'a', registeredName: 'Marshland Drake', sex: 'MALE', birthYear: 2015 },
      { id: 'b', registeredName: 'Marshland Drake', sex: 'FEMALE', birthYear: 2015 },
    );
    // Opposite sexes should sink it below threshold.
    expect(m).toBeNull();
  });

  it('flags a birth-year gap as a conflict', () => {
    const m = scorePair(
      { id: 'a', registeredName: 'Marshland Drake', microchip: '985141001234567' },
      { id: 'b', registeredName: 'Marshland Drake', microchip: '985141001234567', birthYear: 2015 },
    )!;
    expect(m.confidence).toBe('certain');
  });

  it('ignores unrelated names', () => {
    expect(
      scorePair({ id: 'a', registeredName: 'Marshland Drake' }, { id: 'b', registeredName: 'Cedar Run Atlas' }),
    ).toBeNull();
  });

  it('finds duplicates across a set without comparing everything to everything', () => {
    const matches = findDuplicates([
      { id: '1', registeredName: "Blackwater's Storm", registrationNumber: 'SR75110203', registryBody: 'AKC', sex: 'MALE' },
      { id: '2', registeredName: 'Blackwaters Storm', registrationNumber: 'SR75110203', registryBody: 'AKC', sex: 'MALE' },
      { id: '3', registeredName: 'Cedar Run Atlas', sex: 'MALE' },
      { id: '4', registeredName: 'Rivergate Thistle', sex: 'FEMALE' },
    ]);
    expect(matches).toHaveLength(1);
    expect([matches[0]!.a, matches[0]!.b].sort()).toEqual(['1', '2']);
  });

  it('never matches a record against itself', () => {
    expect(scorePair({ id: 'a', registeredName: 'X' }, { id: 'a', registeredName: 'X' })).toBeNull();
  });

  it('scores name similarity sensibly', () => {
    expect(nameSimilarity('Marshland Drake', 'Marshland Drake')).toBe(1);
    expect(nameSimilarity('Marshland Drake', 'Marshland Drakke')).toBeGreaterThan(0.9);
    expect(nameSimilarity('Marshland Drake', 'Cedar Run Atlas')).toBeLessThan(0.4);
  });
});
