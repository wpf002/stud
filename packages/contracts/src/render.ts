/**
 * Contract composition, rendering and integrity hashing.
 *
 * A contract is an ordered list of clause instances with bound values. This
 * module turns that into a document, validates that nothing required is
 * missing, and produces a content hash.
 *
 * The hash is the important part. A signature binds to the hash of the exact
 * text the signer saw, so editing a contract after signature invalidates the
 * signature rather than silently changing what somebody agreed to. That single
 * property is most of what separates a signature from a checkbox.
 *
 * Pure module. No I/O, no clock.
 */

import { type Clause, type ClauseVariable, getClause } from './clauses.js';

export type ClauseValue = string | number | boolean | null;

export interface ClauseInstance {
  clauseId: string;
  clauseVersion: number;
  order: number;
  values: Record<string, ClauseValue>;
}

export interface ContractDraft {
  title: string;
  instances: ClauseInstance[];
  /** Rendered into the document but not part of any clause. */
  preamble?: string;
  /** The health schedule referenced by `health.verified_testing`. */
  healthSchedule?: HealthScheduleEntry[];
}

export interface HealthScheduleEntry {
  animal: 'SIRE' | 'DAM';
  claimLabel: string;
  result: string;
  /** VERIFIED vs REPORTED, rendered distinctly (invariant 5). */
  tier: 'VERIFIED' | 'REPORTED';
  source?: string | null;
  testedOn?: string | null;
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface ValidationIssue {
  clauseId: string;
  variableKey?: string;
  severity: 'error' | 'warning';
  message: string;
}

export function validateDraft(draft: ContractDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (draft.instances.length === 0) {
    issues.push({ clauseId: '', severity: 'error', message: 'A contract needs at least one clause.' });
  }

  const seen = new Set<string>();
  for (const instance of draft.instances) {
    const clause = getClause(instance.clauseId, instance.clauseVersion);
    if (!clause) {
      issues.push({
        clauseId: instance.clauseId,
        severity: 'error',
        message: `Clause ${instance.clauseId} v${instance.clauseVersion} is not in the library. It may have been revised since this draft was started.`,
      });
      continue;
    }

    if (seen.has(clause.id)) {
      issues.push({
        clauseId: clause.id,
        severity: 'warning',
        message: `"${clause.title}" appears more than once.`,
      });
    }
    seen.add(clause.id);

    for (const v of clause.variables) {
      const value = instance.values[v.key];
      const empty = value === undefined || value === null || value === '';
      if (v.required && empty) {
        issues.push({
          clauseId: clause.id,
          variableKey: v.key,
          severity: 'error',
          message: `"${v.label}" is required in "${clause.title}".`,
        });
      }
      if (!empty && v.kind === 'MONEY_CENTS' && !Number.isInteger(value)) {
        // Invariant 2. A float here means someone did dollars-to-cents wrong.
        issues.push({
          clauseId: clause.id,
          variableKey: v.key,
          severity: 'error',
          message: `"${v.label}" must be a whole number of cents.`,
        });
      }
      if (!empty && v.kind === 'CHOICE' && v.options && !v.options.some((o) => o.value === value)) {
        issues.push({
          clauseId: clause.id,
          variableKey: v.key,
          severity: 'error',
          message: `"${value}" is not a valid option for "${v.label}".`,
        });
      }
    }
  }

  // Consistency across clauses, which is where real contract bugs live.
  const fee = findValue(draft, 'fee.deposit_and_balance', 'feeTotal');
  const deposit = findValue(draft, 'fee.deposit_and_balance', 'depositAmount');
  const balance = findValue(draft, 'fee.deposit_and_balance', 'balanceAmount');
  if (
    typeof fee === 'number' &&
    typeof deposit === 'number' &&
    typeof balance === 'number' &&
    deposit + balance !== fee
  ) {
    issues.push({
      clauseId: 'fee.deposit_and_balance',
      severity: 'error',
      message: `Deposit and balance add up to ${deposit + balance} cents, but the stud fee is ${fee}. They must reconcile.`,
    });
  }

  const hasRepeat = draft.instances.some((i) => i.clauseId === 'remedy.repeat_breeding');
  const hasRefund = draft.instances.some((i) => i.clauseId === 'remedy.refund_no_conception');
  if (hasRepeat && hasRefund) {
    issues.push({
      clauseId: 'remedy.refund_no_conception',
      severity: 'warning',
      message:
        'This contract contains both a repeat-breeding remedy and a refund remedy. Both say they are the sole remedy, which is exactly the ambiguity that ends up in front of a judge. Pick one.',
    });
  }

  return issues;
}

function findValue(draft: ContractDraft, clauseId: string, key: string): ClauseValue | undefined {
  return draft.instances.find((i) => i.clauseId === clauseId)?.values[key];
}

// ── Rendering ───────────────────────────────────────────────────────────────

export interface RenderedClause {
  clauseId: string;
  clauseVersion: number;
  title: string;
  body: string;
  order: number;
}

export interface RenderedContract {
  title: string;
  preamble?: string;
  clauses: RenderedClause[];
  healthSchedule: HealthScheduleEntry[];
  /** Plain text of the whole document. What the hash is taken over. */
  plainText: string;
  contentHash: string;
}

function formatValue(value: ClauseValue, variable: ClauseVariable): string {
  if (value === null || value === undefined || value === '') {
    // A required field left blank is a drafting hole, and showing it is how it
    // gets filled. An OPTIONAL one left blank is simply not part of this
    // agreement — printing "[Additional detail]" into a signed document reads
    // like a mistake, because it is one.
    return variable.required ? `[${variable.label}]` : '';
  }
  switch (variable.kind) {
    case 'MONEY_CENTS':
      return typeof value === 'number'
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100)
        : String(value);
    case 'DATE': {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime())
        ? String(value)
        : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    case 'CHOICE': {
      // `text` when the option defines its own wording, otherwise the value.
      // Never `label` — that is the drafter's picker text, and printing it
      // produces "borne by bitch owner" and a bare "not refundable" where a
      // full sentence belongs, in a document somebody signs.
      const option = variable.options?.find((o) => o.value === value);
      return option?.text ?? String(value);
    }
    case 'BOOLEAN':
      return value ? 'yes' : 'no';
    default:
      return String(value);
  }
}

export function renderClause(clause: Clause, values: Record<string, ClauseValue>): string {
  const body = clause.body.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const variable = clause.variables.find((v) => v.key === key);
    // An unknown placeholder is a drafting bug, and rendering it visibly is
    // better than rendering an empty string that nobody notices.
    if (!variable) return `[[unknown: ${key}]]`;
    return formatValue(values[key] ?? null, variable);
  });

  // An omitted optional paragraph leaves a hole in the text. Close it, so the
  // document does not carry a blank gap where a clause used to look like it
  // was missing something.
  return body
    .split('\n')
    .filter((line, i, all) => line.trim() !== '' || (all[i - 1] ?? '').trim() !== '' )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function renderContract(draft: ContractDraft): RenderedContract {
  const clauses: RenderedClause[] = [...draft.instances]
    .sort((a, b) => a.order - b.order)
    .map((instance) => {
      const clause = getClause(instance.clauseId, instance.clauseVersion);
      if (!clause) {
        return {
          clauseId: instance.clauseId,
          clauseVersion: instance.clauseVersion,
          title: 'Unavailable clause',
          body: `[This clause (${instance.clauseId} v${instance.clauseVersion}) could not be resolved and must be replaced before signing.]`,
          order: instance.order,
        };
      }
      return {
        clauseId: clause.id,
        clauseVersion: clause.version,
        title: clause.title,
        body: renderClause(clause, instance.values),
        order: instance.order,
      };
    });

  const healthSchedule = draft.healthSchedule ?? [];

  const parts: string[] = [draft.title];
  if (draft.preamble) parts.push(draft.preamble);
  clauses.forEach((c, i) => parts.push(`${i + 1}. ${c.title}\n\n${c.body}`));

  if (healthSchedule.length > 0) {
    const lines = healthSchedule.map(
      (h) =>
        `${h.animal === 'SIRE' ? 'Sire' : 'Dam'} — ${h.claimLabel}: ${h.result} (${h.tier === 'VERIFIED' ? `verified via ${h.source ?? 'source'}` : 'reported by owner, not verified'}${h.testedOn ? `, tested ${h.testedOn}` : ''})`,
    );
    parts.push(`SCHEDULE — HEALTH TESTING ON RECORD\n\n${lines.join('\n')}`);
  }

  const plainText = parts.join('\n\n');

  return {
    title: draft.title,
    preamble: draft.preamble,
    clauses,
    healthSchedule,
    plainText,
    contentHash: contentHash(plainText),
  };
}

/**
 * Content hash — FNV-1a, 128-bit, rendered as hex.
 *
 * Deliberately a plain function rather than a crypto import, so this module
 * stays dependency-free and runs identically in Node, the browser and any
 * future native client. This is an INTEGRITY check, not a security primitive:
 * its job is to prove a document changed, not to resist an attacker who
 * controls both the document and the hash. The server also stores the full
 * text, which is what an actual dispute would turn on.
 */
export function contentHash(text: string): string {
  const normalised = text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let h3 = 0x9e3779b9;
  let h4 = 0x85ebca6b;

  for (let i = 0; i < normalised.length; i++) {
    const c = normalised.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x01000193) >>> 0;
    h3 = Math.imul(h3 ^ (c * 31), 0x85ebca6b) >>> 0;
    h4 = Math.imul(h4 ^ (c + normalised.length), 0xc2b2ae35) >>> 0;
  }

  return [h1, h2, h3, h4].map((h) => h.toString(16).padStart(8, '0')).join('');
}

/** Does a signed hash still match the document? */
export function verifyIntegrity(signedHash: string, current: RenderedContract): boolean {
  return signedHash === current.contentHash;
}
