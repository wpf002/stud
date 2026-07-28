import { describe, expect, it } from 'vitest';
import {
  CLAUSES,
  CONSENT_TEXT_V1,
  SignatureError,
  contentHash,
  createSignature,
  draftFromTemplate,
  getClause,
  isEditable,
  renderClause,
  renderContract,
  statusFromSignatures,
  validateDraft,
  verifyIntegrity,
  type ContractDraft,
} from '../src/index.js';

const ctx = {
  userId: 'u1',
  legalName: 'Jordan Hale',
  email: 'jordan@example.com',
  ipAddress: '203.0.113.5',
  userAgent: 'Mozilla/5.0',
  signedAt: new Date('2026-07-29T12:00:00Z'),
};

function goodDraft(): ContractDraft {
  const draft = draftFromTemplate('STUD_SERVICE', {
    'parties.stud_service': {
      agreementDate: '2026-07-29',
      studOwnerName: 'Jordan Hale',
      sireName: "Blackwater's Ranger Of The Marsh",
      sireRegistration: 'SR91234501',
      bitchOwnerName: 'Casey Lindqvist',
      damName: "Cedar Run's Marigold",
      damRegistration: 'SS14883201',
    },
    'fee.deposit_and_balance': {
      feeTotal: 220000,
      depositAmount: 60000,
      balanceAmount: 160000,
    },
    'service.method': { method: 'natural service' },
    'general.governing_law': { jurisdiction: 'the State of Texas' },
  })!;
  return draft;
}

describe('clause library', () => {
  it('resolves a clause by id and version', () => {
    expect(getClause('fee.deposit_and_balance', 1)?.title).toBe('Stud fee — deposit and balance');
  });

  it('refuses a version mismatch rather than silently upgrading', () => {
    // Improving a clause must never change what somebody already agreed to.
    expect(getClause('fee.deposit_and_balance', 99)).toBeNull();
  });

  it('carries machine-readable effects so logic never parses prose', () => {
    const repeat = getClause('remedy.repeat_breeding')!;
    expect(repeat.effects?.grantsRepeatBreeding).toBe(true);
    expect(repeat.effects?.definesNoLitterRemedy).toBe('REPEAT_ONLY');
  });
});

describe('templates', () => {
  it('builds a draft with clause defaults applied', () => {
    const draft = draftFromTemplate('STUD_SERVICE')!;
    expect(draft.instances.length).toBeGreaterThan(5);
    const fee = draft.instances.find((i) => i.clauseId === 'fee.deposit_and_balance')!;
    expect(fee.values.balanceTrigger).toBe('ON_CONFIRMED_PREGNANCY');
  });

  it('returns null for an unknown template', () => {
    expect(draftFromTemplate('NOPE' as never)).toBeNull();
  });
});

describe('validation', () => {
  it('accepts a complete draft', () => {
    expect(validateDraft(goodDraft()).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('flags a missing required variable', () => {
    const draft = goodDraft();
    draft.instances.find((i) => i.clauseId === 'general.governing_law')!.values = {};
    const errors = validateDraft(draft).filter((i) => i.severity === 'error');
    expect(errors.some((e) => e.variableKey === 'jurisdiction')).toBe(true);
  });

  it('refuses a fee that does not reconcile', () => {
    // The bug that matters: a deposit and balance that do not add up.
    const draft = goodDraft();
    draft.instances.find((i) => i.clauseId === 'fee.deposit_and_balance')!.values.balanceAmount = 150000;
    const errors = validateDraft(draft).filter((i) => i.severity === 'error');
    expect(errors.some((e) => /must reconcile/.test(e.message))).toBe(true);
  });

  it('refuses a non-integer money value', () => {
    const draft = goodDraft();
    draft.instances.find((i) => i.clauseId === 'fee.deposit_and_balance')!.values.depositAmount = 600.5;
    expect(
      validateDraft(draft).some((e) => /whole number of cents/.test(e.message)),
    ).toBe(true);
  });

  it('rejects an invalid choice value', () => {
    const draft = goodDraft();
    draft.instances.find((i) => i.clauseId === 'service.method')!.values.method = 'telepathy';
    expect(validateDraft(draft).some((e) => e.variableKey === 'method')).toBe(true);
  });

  it('warns when two clauses each claim to be the sole remedy', () => {
    const draft = goodDraft();
    draft.instances.push({
      clauseId: 'remedy.refund_no_conception',
      clauseVersion: 1,
      order: 99,
      values: { refundAmount: 'the balance of the stud fee', refundWindow: '30 days' },
    });
    const warnings = validateDraft(draft).filter((i) => i.severity === 'warning');
    expect(warnings.some((w) => /sole remedy/.test(w.message))).toBe(true);
  });

  it('refuses an empty contract', () => {
    expect(validateDraft({ title: 'x', instances: [] })[0]!.severity).toBe('error');
  });
});

describe('rendering', () => {
  it('interpolates money as currency and choices as their document wording', () => {
    const clause = getClause('fee.deposit_and_balance')!;
    const text = renderClause(clause, {
      feeTotal: 220000,
      depositAmount: 60000,
      balanceAmount: 160000,
      balanceTrigger: 'ON_CONFIRMED_PREGNANCY',
    });
    expect(text).toContain('$2,200.00');
    expect(text).toContain('$600.00');
    expect(text).toContain('on confirmed pregnancy');
  });

  /**
   * The regression that prompted `ClauseOption.text`.
   *
   * `label` is the drafter's picker text. Printing it produced "the service
   * shall be by ai — chilled", "borne by bitch owner", and a dangling "not
   * refundable" where a whole sentence belongs — in a document people sign.
   */
  it('never prints a picker label into the document', () => {
    for (const clause of CLAUSES) {
      const values: Record<string, string | number> = {};
      for (const v of clause.variables) {
        values[v.key] = v.options ? v.options[0]!.value : v.kind === 'MONEY_CENTS' ? 100 : 'x';
      }
      const text = renderClause(clause, values);

      for (const v of clause.variables) {
        if (!v.options) continue;
        const chosen = v.options[0]!;
        // The wording that should appear.
        expect(text).toContain(chosen.text ?? chosen.value);
        // And the picker label must not, unless it happens to be the wording.
        if (chosen.label !== (chosen.text ?? chosen.value)) {
          expect(text).not.toContain(chosen.label);
        }
      }
    }
  });

  it('renders a machine-token choice as prose, never as the token', () => {
    const clause = getClause('fee.deposit_and_balance')!;
    for (const option of clause.variables.find((v) => v.key === 'balanceTrigger')!.options!) {
      const text = renderClause(clause, {
        feeTotal: 100000,
        depositAmount: 40000,
        balanceAmount: 60000,
        balanceTrigger: option.value,
      });
      // `extractScheduleTerms` switches on the value, so it stays a token —
      // but the token must never reach the page.
      expect(text).not.toContain(option.value);
      expect(text).toContain(option.text!);
    }
  });

  it('leaves an omitted optional field out entirely, with no gap', () => {
    const clause = getClause('service.method')!;
    const text = renderClause(clause, {
      method: 'natural service',
      costBearer: 'the Bitch Owner',
      // methodDetail omitted — it is optional.
    });
    expect(text).not.toContain('[Additional detail]');
    expect(text).not.toContain('[');
    // And no blank paragraph left where it would have gone.
    expect(text).not.toMatch(/\n\n\n/);
    expect(text).toContain('by natural service');
    expect(text).toContain('borne by the Bitch Owner');
  });

  it('renders a missing value visibly rather than as an empty string', () => {
    const clause = getClause('general.governing_law')!;
    expect(renderClause(clause, {})).toContain('[Jurisdiction]');
  });

  it('renders an unknown placeholder visibly', () => {
    const text = renderClause(
      { ...getClause('general.entire_agreement')!, body: 'Hello {{nope}}' },
      {},
    );
    expect(text).toContain('[[unknown: nope]]');
  });

  it('renders the health schedule with verified and reported kept distinct', () => {
    const draft = goodDraft();
    draft.healthSchedule = [
      { animal: 'SIRE', claimLabel: 'Hips', result: 'Excellent', tier: 'VERIFIED', source: 'OFA', testedOn: '2023-04-18' },
      { animal: 'DAM', claimLabel: 'Hips', result: 'Owner says good', tier: 'REPORTED' },
    ];
    const rendered = renderContract(draft);
    expect(rendered.plainText).toContain('verified via OFA');
    expect(rendered.plainText).toContain('reported by owner, not verified');
  });

  it('orders clauses by their order field', () => {
    const draft = goodDraft();
    draft.instances[0]!.order = 100;
    const rendered = renderContract(draft);
    expect(rendered.clauses[rendered.clauses.length - 1]!.clauseId).toBe('parties.stud_service');
  });

  it('renders an unresolvable clause as a visible blocker', () => {
    const rendered = renderContract({
      title: 'x',
      instances: [{ clauseId: 'nope', clauseVersion: 1, order: 0, values: {} }],
    });
    expect(rendered.clauses[0]!.body).toMatch(/must be replaced before signing/);
  });
});

describe('content hash', () => {
  it('is stable for the same content', () => {
    expect(contentHash('hello world')).toBe(contentHash('hello world'));
  });

  it('changes when a single character changes', () => {
    expect(contentHash('$2,200.00')).not.toBe(contentHash('$2,300.00'));
  });

  it('ignores trailing whitespace and line-ending differences', () => {
    expect(contentHash('a\r\nb  \n')).toBe(contentHash('a\nb'));
  });

  it('changes when a contract value changes', () => {
    const a = renderContract(goodDraft());
    const draft = goodDraft();
    draft.instances.find((i) => i.clauseId === 'fee.deposit_and_balance')!.values.feeTotal = 250000;
    const b = renderContract(draft);
    expect(a.contentHash).not.toBe(b.contentHash);
  });

  it('detects a document edited after signing', () => {
    const original = renderContract(goodDraft());
    const edited = goodDraft();
    edited.instances.find((i) => i.clauseId === 'fee.deposit_and_balance')!.values.depositAmount = 10000;
    edited.instances.find((i) => i.clauseId === 'fee.deposit_and_balance')!.values.balanceAmount = 210000;
    expect(verifyIntegrity(original.contentHash, renderContract(edited))).toBe(false);
    expect(verifyIntegrity(original.contentHash, renderContract(goodDraft()))).toBe(true);
  });
});

describe('signature', () => {
  const hash = 'abc123';

  it('records who, what, when and from where', () => {
    const sig = createSignature({
      intent: { consentText: CONSENT_TEXT_V1, typedName: 'Jordan Hale', affirmed: true },
      context: ctx,
      documentHash: hash,
    });
    expect(sig.documentHash).toBe(hash);
    expect(sig.typedName).toBe('Jordan Hale');
    expect(sig.ipAddress).toBe('203.0.113.5');
    expect(sig.consentText).toBe(CONSENT_TEXT_V1);
    expect(sig.signedAt).toEqual(ctx.signedAt);
  });

  it('refuses without the affirmation', () => {
    // A signature captured without affirmation is worse than none, because it
    // looks like one.
    expect(() =>
      createSignature({
        intent: { consentText: CONSENT_TEXT_V1, typedName: 'Jordan Hale', affirmed: false },
        context: ctx,
        documentHash: hash,
      }),
    ).toThrow(SignatureError);
  });

  it('refuses an empty name', () => {
    expect(() =>
      createSignature({
        intent: { consentText: CONSENT_TEXT_V1, typedName: '   ', affirmed: true },
        context: ctx,
        documentHash: hash,
      }),
    ).toThrow(/typed name is required/i);
  });

  it('refuses a name that does not match the account', () => {
    expect(() =>
      createSignature({
        intent: { consentText: CONSENT_TEXT_V1, typedName: 'Someone Else', affirmed: true },
        context: ctx,
        documentHash: hash,
      }),
    ).toThrow(/does not match/i);
  });

  it('tolerates middle names and punctuation', () => {
    expect(() =>
      createSignature({
        intent: { consentText: CONSENT_TEXT_V1, typedName: 'jordan t. hale', affirmed: true },
        context: ctx,
        documentHash: hash,
      }),
    ).not.toThrow();
  });

  it('refuses when the document changed under the signer', () => {
    expect(() =>
      createSignature({
        intent: { consentText: CONSENT_TEXT_V1, typedName: 'Jordan Hale', affirmed: true },
        context: ctx,
        documentHash: 'new-hash',
        hashShownToSigner: 'old-hash',
      }),
    ).toThrow(/changed while you were reading/i);
  });

  it('refuses a second signature from the same party', () => {
    expect(() =>
      createSignature({
        intent: { consentText: CONSENT_TEXT_V1, typedName: 'Jordan Hale', affirmed: true },
        context: ctx,
        documentHash: hash,
        alreadySigned: true,
      }),
    ).toThrow(/already signed/i);
  });
});

describe('contract status', () => {
  const base = { requiredSignerIds: ['a', 'b'], sent: true, voided: false, completed: false };

  it('derives status from the signatures themselves', () => {
    expect(statusFromSignatures({ ...base, signedUserIds: [] })).toBe('SENT');
    expect(statusFromSignatures({ ...base, signedUserIds: ['a'] })).toBe('PARTIALLY_SIGNED');
    expect(statusFromSignatures({ ...base, signedUserIds: ['a', 'b'] })).toBe('SIGNED');
  });

  it('reports DRAFT before sending', () => {
    expect(statusFromSignatures({ ...base, sent: false, signedUserIds: [] })).toBe('DRAFT');
  });

  it('lets voided and completed override', () => {
    expect(statusFromSignatures({ ...base, signedUserIds: ['a', 'b'], voided: true })).toBe('VOIDED');
    expect(statusFromSignatures({ ...base, signedUserIds: ['a', 'b'], completed: true })).toBe('COMPLETED');
  });

  it('freezes a contract once anyone has signed', () => {
    expect(isEditable('DRAFT')).toBe(true);
    expect(isEditable('SENT')).toBe(true);
    expect(isEditable('PARTIALLY_SIGNED')).toBe(false);
    expect(isEditable('SIGNED')).toBe(false);
  });
});
