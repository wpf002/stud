import { describe, expect, it } from 'vitest';
import {
  AUTO_FILL_THRESHOLD,
  IllegalTransitionError,
  VerificationEngine,
  allowedTriggers,
  createFixtureAdapter,
  createOfaAdapter,
  createRegistryAdapter,
  detectLab,
  extractOfaRows,
  extractTitles,
  hasDiverged,
  isConcerning,
  isStale,
  lookupTitle,
  mapApplicationToClaim,
  normalizeResult,
  parseNavhdaResults,
  parseOfaRows,
  parseRegistryRecord,
  suggestFromOcr,
  transition,
  triggerForLookup,
  type VerificationState,
} from '../src/index.js';

// ── Normalisation ───────────────────────────────────────────────────────────

describe('result normalisation', () => {
  it('treats Excellent, Good and Fair hips as normal', () => {
    for (const r of ['Excellent', 'Good', 'Fair']) {
      expect(normalizeResult('HIP', r)).toBe('NORMAL');
    }
  });

  it('treats Borderline hips as inconclusive, not a pass', () => {
    expect(normalizeResult('HIP', 'Borderline')).toBe('INCONCLUSIVE');
  });

  it('treats dysplastic hip grades as abnormal', () => {
    for (const r of ['Mild', 'Moderate', 'Severe']) {
      expect(normalizeResult('HIP', r)).toBe('ABNORMAL');
    }
  });

  it('refuses to grade a PennHIP distraction index', () => {
    // There is no universal cutoff — it is breed-relative — so grading it
    // would be inventing a judgement the source did not make.
    expect(normalizeResult('HIP', 'DI 0.42')).toBe('INFORMATIONAL');
  });

  it('grades elbows', () => {
    expect(normalizeResult('ELBOW', 'Normal')).toBe('NORMAL');
    expect(normalizeResult('ELBOW', 'Grade I')).toBe('ABNORMAL');
    expect(normalizeResult('ELBOW', 'Grade III')).toBe('ABNORMAL');
  });

  it('does not pass an equivocal cardiac', () => {
    expect(normalizeResult('CARDIAC', 'Equivocal')).toBe('INCONCLUSIVE');
    expect(normalizeResult('CARDIAC', 'Normal - Advanced')).toBe('NORMAL');
    expect(normalizeResult('CARDIAC', 'Abnormal - murmur')).toBe('ABNORMAL');
  });

  it('keeps a breeder-option eye finding visible without grading it', () => {
    expect(normalizeResult('EYE_CAER', 'Normal')).toBe('NORMAL');
    expect(normalizeResult('EYE_CAER', 'Breeder Option - distichiasis')).toBe('INFORMATIONAL');
    expect(normalizeResult('EYE_CAER', 'Abnormal - cataract')).toBe('ABNORMAL');
  });

  it('gives carrier status its own outcome, distinct from affected', () => {
    // A carrier bred to a clear dog produces no affected puppies. Treating
    // carriers as failures is how breeds lose genetic diversity.
    expect(normalizeResult('DNA_MARKER', 'Carrier')).toBe('CARRIER');
    expect(normalizeResult('DNA_MARKER', 'N/M')).toBe('CARRIER');
    expect(normalizeResult('DNA_MARKER', 'Clear')).toBe('NORMAL');
    expect(normalizeResult('DNA_MARKER', 'At Risk')).toBe('AT_RISK');
    expect(normalizeResult('DNA_MARKER', 'M/M')).toBe('AT_RISK');
  });

  it('does not flag a carrier as concerning', () => {
    expect(isConcerning('CARRIER')).toBe(false);
    expect(isConcerning('AT_RISK')).toBe(true);
    expect(isConcerning('ABNORMAL')).toBe(true);
    expect(isConcerning('NORMAL')).toBe(false);
  });

  it('treats titles as facts of record, not grades', () => {
    expect(normalizeResult('TITLE_HUNT_TEST', 'MH')).toBe('INFORMATIONAL');
    expect(normalizeResult('NAVHDA_UT', 'Prize I')).toBe('INFORMATIONAL');
  });

  it('falls back to inconclusive rather than guessing', () => {
    expect(normalizeResult('HIP', 'something nobody expected')).toBe('INCONCLUSIVE');
    expect(normalizeResult('HIP', '')).toBe('INCONCLUSIVE');
  });
});

// ── State machine ───────────────────────────────────────────────────────────

describe('verification state machine', () => {
  const base = { actor: { id: 'u1', type: 'user' as const }, at: new Date('2026-07-28') };

  it('moves a submitted claim through to verified', () => {
    expect(transition({ ...base, from: 'UNVERIFIED', trigger: 'SUBMIT' }).to).toBe('PENDING');
    expect(transition({ ...base, from: 'PENDING', trigger: 'SOURCE_CONFIRMED' }).to).toBe('VERIFIED');
  });

  it('returns an empty source result to UNVERIFIED, not to a failure state', () => {
    const r = transition({ ...base, from: 'PENDING', trigger: 'SOURCE_EMPTY', source: 'OFA' });
    expect(r.to).toBe('UNVERIFIED');
    expect(r.reason).toMatch(/no record/i);
  });

  it('never demotes a verified claim because a source was unreachable', () => {
    const r = transition({ ...base, from: 'VERIFIED', trigger: 'SOURCE_UNAVAILABLE', source: 'OFA' });
    expect(r.to).toBe('VERIFIED');
    expect(r.changed).toBe(false);
    expect(r.reason).toMatch(/not a negative result/i);
  });

  it('ages a verified claim into STALE', () => {
    expect(transition({ ...base, from: 'VERIFIED', trigger: 'AGED_OUT' }).to).toBe('STALE');
  });

  it('conflicts when a source diverges', () => {
    const r = transition({
      ...base,
      from: 'VERIFIED',
      trigger: 'SOURCE_DIVERGED',
      source: 'OFA',
      previous: { rawResult: 'Good' },
      observed: { rawResult: 'Fair' },
    });
    expect(r.to).toBe('CONFLICTED');
    expect(r.requiresReview).toBe(true);
    expect(r.reason).toContain('Good');
    expect(r.reason).toContain('Fair');
  });

  it('conflicts when a source loses a record it previously had', () => {
    const r = transition({ ...base, from: 'VERIFIED', trigger: 'SOURCE_EMPTY', source: 'OFA' });
    expect(r.to).toBe('CONFLICTED');
    expect(r.reason).toMatch(/no longer lists/i);
  });

  it('does not let a conflict clear itself', () => {
    // A flapping source must not silently launder a discrepancy nobody saw.
    expect(transition({ ...base, from: 'CONFLICTED', trigger: 'SOURCE_CONFIRMED' }).to).toBe('CONFLICTED');
    expect(transition({ ...base, from: 'CONFLICTED', trigger: 'AGED_OUT' }).to).toBe('CONFLICTED');
  });

  it('lets an admin close a conflict either way', () => {
    expect(transition({ ...base, from: 'CONFLICTED', trigger: 'ADMIN_ACCEPTED_SOURCE' }).to).toBe('VERIFIED');
    expect(transition({ ...base, from: 'CONFLICTED', trigger: 'ADMIN_KEPT_RECORD' }).to).toBe('VERIFIED');
    expect(transition({ ...base, from: 'CONFLICTED', trigger: 'ADMIN_REVOKED' }).to).toBe('UNVERIFIED');
  });

  it('refuses an illegal transition instead of silently holding state', () => {
    // Falling through to "keep current state" would hide a bug behind a badge
    // that still reads "Verified".
    expect(() => transition({ ...base, from: 'VERIFIED', trigger: 'SUBMIT' })).toThrow(
      IllegalTransitionError,
    );
    expect(() => transition({ ...base, from: 'UNVERIFIED', trigger: 'ADMIN_ACCEPTED_SOURCE' })).toThrow(
      IllegalTransitionError,
    );
  });

  it('exposes the legal triggers for every state', () => {
    const states: VerificationState[] = ['UNVERIFIED', 'PENDING', 'VERIFIED', 'STALE', 'CONFLICTED'];
    for (const s of states) {
      const triggers = allowedTriggers(s);
      expect(triggers.length).toBeGreaterThan(0);
      for (const t of triggers) {
        expect(() => transition({ ...base, from: s, trigger: t })).not.toThrow();
      }
    }
  });
});

describe('divergence detection', () => {
  it('sees a changed grade', () => {
    expect(hasDiverged({ rawResult: 'Good', outcome: 'NORMAL' }, { rawResult: 'Fair', outcome: 'NORMAL' })).toBe(true);
  });

  it('sees a changed outcome even when the wording is similar', () => {
    expect(hasDiverged({ rawResult: 'Normal', outcome: 'NORMAL' }, { rawResult: 'Normal ', outcome: 'ABNORMAL' })).toBe(true);
  });

  it('ignores case and whitespace churn', () => {
    // Crying wolf on formatting would train admins to clear the queue blind.
    expect(hasDiverged({ rawResult: 'Excellent' }, { rawResult: '  EXCELLENT ' })).toBe(false);
  });

  it('is not a divergence when there was nothing held before', () => {
    expect(hasDiverged(null, { rawResult: 'Good' })).toBe(false);
  });
});

describe('freshness', () => {
  const now = new Date('2026-07-28T00:00:00Z');
  it('is stale when never checked', () => {
    expect(isStale(null, 30, now)).toBe(true);
  });
  it('is fresh inside the window', () => {
    expect(isStale(new Date('2026-07-10T00:00:00Z'), 30, now)).toBe(false);
  });
  it('is stale outside the window', () => {
    expect(isStale(new Date('2026-05-01T00:00:00Z'), 30, now)).toBe(true);
  });
});

describe('triggerForLookup', () => {
  it('confirms on a matching find', () => {
    expect(
      triggerForLookup({ status: 'FOUND', previous: { rawResult: 'Good' }, observed: { rawResult: 'Good' } }),
    ).toBe('SOURCE_CONFIRMED');
  });
  it('diverges on a changed find', () => {
    expect(
      triggerForLookup({ status: 'FOUND', previous: { rawResult: 'Good' }, observed: { rawResult: 'Fair' } }),
    ).toBe('SOURCE_DIVERGED');
  });
  it('maps a miss to empty', () => {
    expect(triggerForLookup({ status: 'NOT_FOUND' })).toBe('SOURCE_EMPTY');
  });
  it('never turns "could not ask" into "the answer is no"', () => {
    expect(triggerForLookup({ status: 'UNAVAILABLE' })).toBe('SOURCE_UNAVAILABLE');
    expect(triggerForLookup({ status: 'DISABLED' })).toBe('SOURCE_UNAVAILABLE');
    expect(triggerForLookup({ status: 'UNSUPPORTED_IDENTIFIER' })).toBe('SOURCE_UNAVAILABLE');
  });
});

// ── OFA adapter ─────────────────────────────────────────────────────────────

describe('OFA adapter', () => {
  it('maps OFA application names onto claim types', () => {
    expect(mapApplicationToClaim('Hip')).toBe('HIP');
    expect(mapApplicationToClaim('Advanced Cardiac')).toBe('CARDIAC');
    expect(mapApplicationToClaim('Eyes')).toBe('EYE_CAER');
    expect(mapApplicationToClaim('prcd-PRA')).toBe('DNA_MARKER');
    expect(mapApplicationToClaim('something unrelated')).toBeNull();
  });

  it('parses rows into findings and lifts CHIC out as its own claim', () => {
    const findings = parseOfaRows(
      [
        { application: 'Hip', result: 'Excellent', reportDate: '04/2023', ofaNumber: 'GS-1234E24M-VPI', chicNumber: '187432' },
        { application: 'Elbow', result: 'Normal', reportDate: '04/2023' },
      ],
      'SR91234501',
    );
    expect(findings.map((f) => f.claimType).sort()).toEqual(['CHIC', 'ELBOW', 'HIP']);
    const hip = findings.find((f) => f.claimType === 'HIP')!;
    expect(hip.outcome).toBe('NORMAL');
    expect(hip.rawResult).toBe('Excellent');
    expect(hip.testedAt?.getUTCFullYear()).toBe(2023);
    expect(hip.sourceUrl).toContain('ofa.org');
  });

  it('does not emit a CHIC claim twice', () => {
    const findings = parseOfaRows(
      [
        { application: 'Hip', result: 'Good', chicNumber: '111' },
        { application: 'Elbow', result: 'Normal', chicNumber: '111' },
      ],
      'X',
    );
    expect(findings.filter((f) => f.claimType === 'CHIC')).toHaveLength(1);
  });

  it('returns nothing rather than guessing when the markup is unfamiliar', () => {
    expect(extractOfaRows('<html><body><p>Nothing here</p></body></html>')).toEqual([]);
    expect(extractOfaRows('<table><tr><td>a</td><td>b</td></tr></table>')).toEqual([]);
  });

  it('extracts rows from a results table', () => {
    const html = `
      <table><tbody>
        <tr><td>SR91234501</td><td>Blackwater's Ranger</td><td>Hip</td><td>Excellent</td><td>04/2023</td><td>GS-1234E24M-VPI</td></tr>
        <tr><td>SR91234501</td><td>Blackwater's Ranger</td><td>Elbow</td><td>Normal</td><td>04/2023</td><td>GS-EL999M24-VPI</td></tr>
      </tbody></table>`;
    const rows = extractOfaRows(html);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.application).toBe('Hip');
    expect(rows[0]!.result).toBe('Excellent');
  });

  it('is switched off by default and says so without pretending to have looked', () => {
    const adapter = createOfaAdapter();
    return adapter.lookup({ identifier: 'SR91234501' }).then((r) => {
      expect(r.status).toBe('DISABLED');
      expect(r.findings).toEqual([]);
      expect(r.error).toMatch(/switched off/i);
    });
  });

  it('reports a transport failure as UNAVAILABLE, never as NOT_FOUND', async () => {
    const adapter = createOfaAdapter({
      fetchRows: async () => {
        throw new Error('socket hang up');
      },
    });
    const r = await adapter.lookup({ identifier: 'SR91234501' });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.error).toContain('socket hang up');
  });

  it('reports an empty result set as NOT_FOUND', async () => {
    const adapter = createOfaAdapter({ fetchRows: async () => [] });
    const r = await adapter.lookup({ identifier: 'SR00000000' });
    expect(r.status).toBe('NOT_FOUND');
  });

  it('rejects an empty identifier', async () => {
    const adapter = createOfaAdapter({ fetchRows: async () => [] });
    expect((await adapter.lookup({ identifier: '  ' })).status).toBe('UNSUPPORTED_IDENTIFIER');
  });
});

// ── Registry adapter ────────────────────────────────────────────────────────

describe('registry adapter', () => {
  it('reads the longest title code first', () => {
    // GCHB must not be read as CH, and MACH must not be read as CH.
    expect(lookupTitle('GCHB')?.label).toBe('Grand Champion Bronze');
    expect(lookupTitle('MACH')?.claim).toBe('TITLE_AGILITY');
    expect(lookupTitle('CH')?.claim).toBe('TITLE_CONFORMATION');
  });

  it('extracts titles from a registered name', () => {
    const titles = extractTitles("GCH CH Blackwater's Ranger Of The Marsh MH RN");
    expect(titles.map((t) => t.code)).toEqual(['GCH', 'CH', 'MH', 'RN']);
    expect(titles.find((t) => t.code === 'MH')!.claim).toBe('TITLE_HUNT_TEST');
  });

  it('does not invent titles from ordinary words', () => {
    expect(extractTitles('Marshland Drake Of The Marsh')).toEqual([]);
  });

  it('builds findings from a registry record', () => {
    const findings = parseRegistryRecord(
      {
        registrationNumber: 'SR91234501',
        registeredName: "CH Blackwater's Ranger Of The Marsh MH",
        status: 'Active',
        dnaProfileId: 'V1234567',
      },
      'https://akc.org',
    );
    const types = findings.map((f) => f.claimType);
    expect(types).toContain('REGISTRATION');
    expect(types).toContain('DNA_PROFILE');
    expect(types).toContain('TITLE_CONFORMATION');
    expect(types).toContain('TITLE_HUNT_TEST');
    expect(findings.find((f) => f.claimType === 'REGISTRATION')!.outcome).toBe('NORMAL');
  });

  it('refuses an identifier belonging to another registry', async () => {
    const adapter = createRegistryAdapter({ body: 'AKC', fetchRecord: async () => null });
    const r = await adapter.lookup({ identifier: 'P123456789', registryBody: 'UKC' });
    expect(r.status).toBe('UNSUPPORTED_IDENTIFIER');
    expect(r.error).toContain('UKC');
  });
});

// ── Performance adapter ─────────────────────────────────────────────────────

describe('performance adapter', () => {
  it('records a prize with its score out of the right maximum', () => {
    const findings = parseNavhdaResults([
      { testType: 'Utility', prize: 'Prize I', score: 204, testDate: '2024-06-08', chapter: 'North Texas' },
      { testType: 'Natural Ability', prize: 'Prize II', score: 108, testDate: '2022-09-17' },
    ]);
    expect(findings[0]!.claimType).toBe('NAVHDA_UT');
    expect(findings[0]!.rawResult).toBe('Prize I — 204/204');
    expect(findings[1]!.claimType).toBe('NAVHDA_NA');
    expect(findings[1]!.rawResult).toBe('Prize II — 108/112');
  });

  it('records a No Prize result rather than hiding it', () => {
    // A stud's full record is more informative than his highlights.
    const findings = parseNavhdaResults([{ testType: 'Utility', prize: 'No Prize' }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rawResult).toBe('No Prize');
  });

  it('skips test types it does not recognise', () => {
    expect(parseNavhdaResults([{ testType: 'Some New Test', prize: 'Prize I' }])).toEqual([]);
  });
});

// ── Document adapter ────────────────────────────────────────────────────────

describe('document adapter', () => {
  it('identifies the lab', () => {
    expect(detectLab('Embark Veterinary, Inc.')).toBe('EMBARK');
    expect(detectLab('WISDOM PANEL report')).toBe('WISDOM');
    expect(detectLab('UC Davis Veterinary Genetics Laboratory')).toBe('UC_DAVIS');
    expect(detectLab('Paw Print Genetics')).toBe('PAW_PRINT');
    expect(detectLab('Some Vet Clinic')).toBe('OTHER');
  });

  it('suggests findings from OCR text with the source line attached', () => {
    const { lab, suggestions } = suggestFromOcr(
      [
        'Embark Veterinary Genetic Health Report',
        'Progressive Retinal Atrophy (prcd-PRA) .......... Clear',
        'Cone Degeneration (CD) .......... Carrier',
        'Degenerative Myelopathy (DM) .......... At Risk',
        'This report is for informational purposes.',
      ].join('\n'),
    );
    expect(lab).toBe('EMBARK');
    expect(suggestions).toHaveLength(3);
    expect(suggestions[0]!.outcome).toBe('NORMAL');
    expect(suggestions[1]!.outcome).toBe('CARRIER');
    expect(suggestions[2]!.outcome).toBe('AT_RISK');
    expect(suggestions[1]!.markerName).toContain('Cone Degeneration');
    expect(suggestions[0]!.sourceLine).toContain('prcd-PRA');
  });

  it('lowers confidence when no marker name precedes the result', () => {
    const { suggestions } = suggestFromOcr('Clear');
    if (suggestions.length > 0) {
      expect(suggestions[0]!.confidence).toBeLessThan(AUTO_FILL_THRESHOLD);
    }
  });
});

// ── Engine ──────────────────────────────────────────────────────────────────

describe('verification engine', () => {
  it('returns fixture findings for a seeded registration', async () => {
    const engine = new VerificationEngine({ adapters: [createFixtureAdapter()] });
    const results = await engine.lookupAll({ identifier: 'SR91234501' });
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe('FOUND');
    const types = results[0]!.findings.map((f) => f.claimType);
    expect(types).toContain('HIP');
    expect(types).toContain('CHIC');
    expect(types).toContain('NAVHDA_UT');
  });

  it('returns NOT_FOUND for an unknown registration', async () => {
    const engine = new VerificationEngine({ adapters: [createFixtureAdapter()] });
    const [result] = await engine.lookupAll({ identifier: 'SR00000000' });
    expect(result!.status).toBe('NOT_FOUND');
    expect(result!.findings).toEqual([]);
  });

  it('narrows to requested claim types', async () => {
    const engine = new VerificationEngine({ adapters: [createFixtureAdapter()] });
    const [result] = await engine.lookupAll({ identifier: 'SR91234501', claimTypes: ['HIP'] });
    expect(result!.findings.map((f) => f.claimType)).toEqual(['HIP']);
  });

  it('surfaces a simulated outage without failing the whole lookup', async () => {
    const engine = new VerificationEngine({
      adapters: [createFixtureAdapter({ unavailableFor: ['SR91234501'] })],
    });
    const [result] = await engine.lookupAll({ identifier: 'SR91234501' });
    expect(result!.status).toBe('UNAVAILABLE');
  });

  it('does not let one broken adapter sink the others', async () => {
    const broken = {
      meta: { ...createFixtureAdapter().meta, id: 'OFA' as const },
      lookup: async () => {
        throw new Error('boom');
      },
    };
    const engine = new VerificationEngine({ adapters: [broken, createFixtureAdapter()] });
    const results = await engine.lookupAll({ identifier: 'SR91234501' });
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.source === 'OFA')!.status).toBe('UNAVAILABLE');
    expect(results.find((r) => r.source === 'FIXTURE')!.status).toBe('FOUND');
  });

  it('simulates a source that changed, so CONFLICTED is reachable in tests', async () => {
    const engine = new VerificationEngine({ adapters: [createFixtureAdapter()] });
    const [result] = await engine.lookupAll({ identifier: 'SS12009944', claimTypes: ['HIP'] });
    // The fixture's Atlas record diverges: Good on the original read, Fair
    // after the amendment.
    expect(result!.findings[0]!.rawResult).toBe('Fair');
    expect(hasDiverged({ rawResult: 'Good' }, result!.findings[0]!)).toBe(true);
  });

  it('lets the more authoritative source win but keeps the loser visible', () => {
    const engine = new VerificationEngine({ adapters: [] });
    const reconciled = engine.reconcile([
      {
        source: 'FIXTURE',
        status: 'FOUND',
        checkedAt: new Date(),
        durationMs: 1,
        findings: [{ claimType: 'HIP', rawResult: 'Fair', outcome: 'NORMAL' }],
      },
      {
        source: 'OFA',
        status: 'FOUND',
        checkedAt: new Date(),
        durationMs: 1,
        findings: [{ claimType: 'HIP', rawResult: 'Good', outcome: 'NORMAL' }],
      },
    ]);
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]!.source).toBe('OFA');
    expect(reconciled[0]!.finding.rawResult).toBe('Good');
    // A disagreement between sources is itself a signal; discarding it would
    // hide the thing worth seeing.
    expect(reconciled[0]!.alternates).toHaveLength(1);
    expect(reconciled[0]!.alternates[0]!.source).toBe('FIXTURE');
  });

  it('keeps genetic markers separate rather than collapsing them', () => {
    const engine = new VerificationEngine({ adapters: [] });
    const reconciled = engine.reconcile([
      {
        source: 'OFA',
        status: 'FOUND',
        checkedAt: new Date(),
        durationMs: 1,
        findings: [
          { claimType: 'DNA_MARKER', rawResult: 'Clear', outcome: 'NORMAL', markerName: 'prcd-PRA' },
          { claimType: 'DNA_MARKER', rawResult: 'Carrier', outcome: 'CARRIER', markerName: 'CD' },
        ],
      },
    ]);
    expect(reconciled).toHaveLength(2);
    expect(reconciled.map((r) => r.markerName).sort()).toEqual(['CD', 'prcd-PRA']);
  });

  it('excludes the document source from a broad sweep', async () => {
    const engine = new VerificationEngine();
    const results = await engine.lookupAll({ identifier: 'SR91234501' });
    expect(results.some((r) => r.source === 'DOCUMENT')).toBe(false);
  });

  it('answers well inside the five-second gate', async () => {
    const engine = new VerificationEngine();
    const started = Date.now();
    await engine.lookupAll({ identifier: 'SR91234501' });
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
