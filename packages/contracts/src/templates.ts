/**
 * Contract templates — starting points, not finished documents.
 *
 * Each template is an ordered clause list with sensible defaults. The drafter
 * edits from there.
 *
 * REQUIRES_LEGAL_REVIEW is on the template itself rather than in a footer,
 * because it needs to reach the person drafting rather than the person
 * scrolling past.
 */

import { CLAUSES_BY_ID } from './clauses.js';
import { type ClauseInstance, type ContractDraft } from './render.js';

export type TemplateId =
  | 'STUD_SERVICE'
  | 'STUD_SERVICE_PICK_OF_LITTER'
  | 'CO_OWNERSHIP'
  | 'REPEAT_BREEDING_ONLY'
  | 'PUPPY_SALE';

export interface ContractTemplate {
  id: TemplateId;
  name: string;
  description: string;
  /** Always true. Shown prominently, never as fine print. */
  requiresLegalReview: true;
  clauseIds: string[];
  guidance: string;
}

export const TEMPLATES: ContractTemplate[] = [
  {
    id: 'STUD_SERVICE',
    name: 'Stud Service — Deposit and Balance',
    description:
      'The standard arrangement: a deposit on signing, the balance on confirmed pregnancy, and a repeat service if no live litter results.',
    requiresLegalReview: true,
    clauseIds: [
      'parties.stud_service',
      'fee.deposit_and_balance',
      'service.method',
      'health.brucellosis',
      'health.verified_testing',
      'remedy.repeat_breeding',
      'ownership.registration_papers',
      'general.governing_law',
      'general.entire_agreement',
    ],
    guidance:
      'The two decisions that matter here are when the balance falls due and what happens if the breeding does not take. Everything else is boilerplate.',
  },
  {
    id: 'STUD_SERVICE_PICK_OF_LITTER',
    name: 'Stud Service — Pick of Litter',
    description:
      'The stud owner takes a puppy instead of, or as well as, a cash fee. Needs a firm selection deadline.',
    requiresLegalReview: true,
    clauseIds: [
      'parties.stud_service',
      'fee.pick_of_litter',
      'service.method',
      'health.brucellosis',
      'health.verified_testing',
      'remedy.repeat_breeding',
      'ownership.registration_papers',
      'general.governing_law',
      'general.entire_agreement',
    ],
    guidance:
      'Pick-of-litter terms cause more disputes than anything else in dog breeding. Name the deadline, name the pick position, and say plainly what happens if the deadline passes.',
  },
  {
    id: 'CO_OWNERSHIP',
    name: 'Co-ownership',
    description:
      'Two parties sharing ownership of one dog. Decision rights and a buyout path matter more than the split.',
    requiresLegalReview: true,
    clauseIds: ['ownership.co_ownership', 'health.verified_testing', 'general.governing_law', 'general.entire_agreement'],
    guidance:
      'Co-ownerships fail over decisions, not money. Be specific about who decides on breeding, showing and sale, and write the exit before you need it.',
  },
  {
    id: 'REPEAT_BREEDING_ONLY',
    name: 'Repeat Service Agreement',
    description: 'A short agreement covering a repeat service under an earlier contract.',
    requiresLegalReview: true,
    clauseIds: ['parties.stud_service', 'service.method', 'health.brucellosis', 'general.entire_agreement'],
    guidance: 'Reference the original agreement by date so it is clear this replaces nothing else.',
  },
  {
    id: 'PUPPY_SALE',
    name: 'Puppy Sale',
    description:
      'A pet-home sale: deposit and balance, a health guarantee, limited registration, spay/neuter, and a take-back for the life of the dog.',
    requiresLegalReview: true,
    clauseIds: [
      'parties.puppy_sale',
      'fee.purchase_price',
      'health.verified_testing',
      'health.puppy_guarantee',
      'ownership.puppy_registration',
      'care.spay_neuter',
      'care.return_to_breeder',
      'care.puppy_welfare',
      'general.governing_law',
      'general.entire_agreement',
    ],
    guidance:
      'This one is read by somebody who has never seen a puppy contract before. The two decisions that matter are what happens to the deposit if they change their mind, and what your health guarantee actually pays out — everything else is standard.',
  },
];

export const TEMPLATES_BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

/** Build a draft with clause defaults applied. */
export function draftFromTemplate(
  templateId: TemplateId,
  values: Record<string, Record<string, string | number | boolean | null>> = {},
): ContractDraft | null {
  const template = TEMPLATES_BY_ID.get(templateId);
  if (!template) return null;

  const instances: ClauseInstance[] = template.clauseIds.flatMap((clauseId, index) => {
    const clause = CLAUSES_BY_ID.get(clauseId);
    if (!clause) return [];
    const defaults: Record<string, string | number | boolean | null> = {};
    for (const v of clause.variables) {
      if (v.defaultValue !== undefined) defaults[v.key] = v.defaultValue;
    }
    return [
      {
        clauseId,
        clauseVersion: clause.version,
        order: index,
        values: { ...defaults, ...(values[clauseId] ?? {}) },
      },
    ];
  });

  return { title: template.name, instances };
}
