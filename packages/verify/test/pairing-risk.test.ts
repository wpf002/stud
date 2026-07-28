import { describe, expect, it } from 'vitest';
import {
  assessPairingRisk,
  inheritanceModeFor,
  zygosityFromOutcome,
  type GeneticClaimInput,
} from '../src/index.js';

const claim = (markerName: string, outcome: GeneticClaimInput['outcome']): GeneticClaimInput => ({
  claimType: 'DNA_MARKER',
  markerName,
  outcome,
  state: 'VERIFIED',
});

describe('zygosity mapping', () => {
  it('maps verified outcomes to genotypes', () => {
    expect(zygosityFromOutcome('NORMAL')).toBe('CLEAR');
    expect(zygosityFromOutcome('CARRIER')).toBe('CARRIER');
    expect(zygosityFromOutcome('AT_RISK')).toBe('AFFECTED');
    expect(zygosityFromOutcome('ABNORMAL')).toBe('AFFECTED');
  });

  it('treats anything unreadable as UNKNOWN rather than clear', () => {
    // Silence is not a clear result.
    expect(zygosityFromOutcome('INCONCLUSIVE')).toBe('UNKNOWN');
    expect(zygosityFromOutcome('INFORMATIONAL')).toBe('UNKNOWN');
    expect(zygosityFromOutcome(null)).toBe('UNKNOWN');
    expect(zygosityFromOutcome(undefined)).toBe('UNKNOWN');
  });
});

describe('autosomal recessive Punnett arithmetic', () => {
  it('clear × clear produces nothing', () => {
    const r = assessPairingRisk([claim('prcd-PRA', 'NORMAL')], [claim('prcd-PRA', 'NORMAL')]);
    expect(r.worst).toBe('NONE');
    expect(r.markers[0]!.outcome).toEqual({ affected: 0, carrier: 0, clear: 1 });
  });

  it('clear × carrier produces carriers but no affected puppies', () => {
    // The whole reason CARRIER is not treated as a failure.
    const r = assessPairingRisk([claim('prcd-PRA', 'NORMAL')], [claim('prcd-PRA', 'CARRIER')]);
    expect(r.atRisk).toHaveLength(0);
    expect(r.markers[0]!.level).toBe('CARRIERS_PRODUCED');
    expect(r.markers[0]!.outcome).toEqual({ affected: 0, carrier: 0.5, clear: 0.5 });
    expect(r.markers[0]!.message).toMatch(/no affected puppies/i);
  });

  it('CARRIER × CARRIER is 25% affected — the finding that matters', () => {
    const r = assessPairingRisk([claim('prcd-PRA', 'CARRIER')], [claim('prcd-PRA', 'CARRIER')]);
    expect(r.worst).toBe('AT_RISK');
    expect(r.atRisk).toHaveLength(1);
    expect(r.markers[0]!.outcome).toEqual({ affected: 0.25, carrier: 0.5, clear: 0.25 });
    expect(r.markers[0]!.message).toMatch(/both dogs are carriers/i);
    expect(r.markers[0]!.message).toMatch(/25%/);
  });

  it('carrier × affected is 50% affected', () => {
    const r = assessPairingRisk([claim('DM', 'CARRIER')], [claim('DM', 'AT_RISK')]);
    expect(r.markers[0]!.outcome!.affected).toBe(0.5);
  });

  it('affected × affected is 100% affected', () => {
    const r = assessPairingRisk([claim('DM', 'AT_RISK')], [claim('DM', 'AT_RISK')]);
    expect(r.markers[0]!.outcome!.affected).toBe(1);
  });

  it('clear × affected produces obligate carriers, no affected', () => {
    const r = assessPairingRisk([claim('DM', 'NORMAL')], [claim('DM', 'AT_RISK')]);
    expect(r.markers[0]!.outcome).toEqual({ affected: 0, carrier: 1, clear: 0 });
  });
});

describe('unknowns are never treated as clear', () => {
  it('flags a marker tested on one side only', () => {
    const r = assessPairingRisk([claim('prcd-PRA', 'CARRIER')], []);
    expect(r.worst).toBe('UNKNOWN');
    expect(r.markers[0]!.untestedSide).toBe('DAM');
    expect(r.markers[0]!.message).toMatch(/test the dam/i);
    expect(r.markers[0]!.outcome).toBeNull();
  });

  it('flags a marker tested on neither side', () => {
    const r = assessPairingRisk(
      [claim('CD', 'INCONCLUSIVE')],
      [claim('CD', 'INCONCLUSIVE')],
    );
    expect(r.markers[0]!.untestedSide).toBe('BOTH');
    expect(r.markers[0]!.level).toBe('UNKNOWN');
  });

  it('says nothing can be ruled out when neither dog is tested at all', () => {
    const r = assessPairingRisk([], []);
    expect(r.markers).toHaveLength(0);
    expect(r.worst).toBe('UNKNOWN');
    expect(r.summary).toMatch(/nothing can be ruled in or out/i);
  });
});

describe('only verified claims count as evidence', () => {
  it('ignores a reported claim', () => {
    // A sentence someone typed into a form must not defeat the one feature
    // that prevents affected puppies.
    const reported: GeneticClaimInput = {
      claimType: 'DNA_MARKER',
      markerName: 'prcd-PRA',
      outcome: 'NORMAL',
      state: 'REPORTED',
    };
    const r = assessPairingRisk([claim('prcd-PRA', 'CARRIER')], [reported]);
    expect(r.markers[0]!.damStatus).toBe('UNKNOWN');
    expect(r.worst).toBe('UNKNOWN');
  });

  it('accepts a STALE claim as evidence, since the result itself has not changed', () => {
    const stale: GeneticClaimInput = {
      claimType: 'DNA_MARKER',
      markerName: 'prcd-PRA',
      outcome: 'NORMAL',
      state: 'STALE',
    };
    const r = assessPairingRisk([claim('prcd-PRA', 'CARRIER')], [stale]);
    expect(r.markers[0]!.damStatus).toBe('CLEAR');
  });
});

describe('marker matching', () => {
  it('matches markers across formatting differences', () => {
    const r = assessPairingRisk(
      [claim('prcd-PRA', 'CARRIER')],
      [claim('PRCD PRA', 'CARRIER')],
    );
    expect(r.markers).toHaveLength(1);
    expect(r.worst).toBe('AT_RISK');
  });

  it('keeps distinct markers separate', () => {
    const r = assessPairingRisk(
      [claim('prcd-PRA', 'CARRIER'), claim('DM', 'NORMAL')],
      [claim('prcd-PRA', 'CARRIER'), claim('DM', 'NORMAL')],
    );
    expect(r.markers).toHaveLength(2);
    expect(r.atRisk).toHaveLength(1);
    expect(r.safe).toHaveLength(1);
  });

  it('sorts the dangerous findings first', () => {
    const r = assessPairingRisk(
      [claim('AAA-clear', 'NORMAL'), claim('ZZZ-risk', 'CARRIER')],
      [claim('AAA-clear', 'NORMAL'), claim('ZZZ-risk', 'CARRIER')],
    );
    expect(r.markers[0]!.level).toBe('AT_RISK');
  });
});

describe('inheritance mode', () => {
  it('defaults to autosomal recessive', () => {
    expect(inheritanceModeFor('prcd-PRA')).toBe('AUTOSOMAL_RECESSIVE');
  });

  it('recognises known dominants and X-linked conditions', () => {
    expect(inheritanceModeFor('MDR1')).toBe('AUTOSOMAL_DOMINANT');
    expect(inheritanceModeFor('Hemophilia B')).toBe('X_LINKED');
  });

  it('says when it is assuming the mode rather than assuming silently', () => {
    const r = assessPairingRisk(
      [claim('Some Novel Variant', 'NORMAL')],
      [claim('Some Novel Variant', 'NORMAL')],
    );
    expect(r.markers[0]!.message).toMatch(/assumed autosomal recessive/i);
  });

  it('does not hedge on well-known recessives', () => {
    const r = assessPairingRisk([claim('prcd-PRA', 'NORMAL')], [claim('prcd-PRA', 'NORMAL')]);
    expect(r.markers[0]!.message).not.toMatch(/assumed/i);
  });
});

describe('summary', () => {
  it('leads with the at-risk finding', () => {
    const r = assessPairingRisk(
      [claim('prcd-PRA', 'CARRIER'), claim('DM', 'NORMAL')],
      [claim('prcd-PRA', 'CARRIER'), claim('DM', 'NORMAL')],
    );
    expect(r.summary).toMatch(/1 marker would produce affected puppies/i);
  });

  it('reports a clean pairing without overclaiming', () => {
    const r = assessPairingRisk([claim('prcd-PRA', 'NORMAL')], [claim('prcd-PRA', 'NORMAL')]);
    expect(r.summary).toMatch(/tested and clear across all 1 shared marker/i);
  });
});
