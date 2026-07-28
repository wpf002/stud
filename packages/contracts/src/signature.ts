/**
 * Electronic signature.
 *
 * ── What this is, precisely ───────────────────────────────────────────────
 * An auditable record that a named, authenticated party affirmed intent to be
 * bound by a document whose exact content we can prove. It captures:
 *
 *   · who signed (authenticated account, not a name in a box)
 *   · what they signed (hash of the exact rendered text)
 *   · when, from where (timestamp, IP, user agent)
 *   · that they were shown and affirmed the consent language
 *   · the typed name they entered as their signature
 *
 * ── What this is NOT ──────────────────────────────────────────────────────
 * It is not a certificate-based digital signature, and it is not legal advice
 * about enforceability. US ESIGN and UETA generally recognise electronic
 * signatures with intent, consent and an associated record — which is what
 * this captures — but enforceability turns on facts and jurisdiction, and
 * live-animal contracts sit in a corner of commercial law that varies by
 * state. The UI says this in plain language rather than implying a guarantee.
 *
 * Pure module. The caller supplies the clock and the request context.
 */

export interface SignatureIntent {
  /** The exact wording the signer affirmed. Stored verbatim. */
  consentText: string;
  /** What they typed as their signature. */
  typedName: string;
  /** They ticked the affirmation. False must block the signature. */
  affirmed: boolean;
}

export interface SignatureContext {
  userId: string;
  /** Name on the account at signing time, snapshotted. */
  legalName: string;
  email: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  signedAt: Date;
}

export interface SignatureRecord {
  userId: string;
  legalName: string;
  email: string;
  typedName: string;
  consentText: string;
  /** Hash of the document as rendered when they signed it. */
  documentHash: string;
  ipAddress: string | null;
  userAgent: string | null;
  signedAt: Date;
}

/** The consent language. Versioned, because it is part of the record. */
export const CONSENT_TEXT_V1 =
  'I have read this agreement in full. By typing my name below and clicking Sign, I intend to be legally bound by it, and I agree to sign electronically. I understand this electronic signature has the same effect as a handwritten one.';

export class SignatureError extends Error {
  constructor(
    message: string,
    public code: 'NOT_AFFIRMED' | 'NAME_MISMATCH' | 'EMPTY_NAME' | 'ALREADY_SIGNED' | 'DOCUMENT_CHANGED',
  ) {
    super(message);
    this.name = 'SignatureError';
  }
}

/** Loose name comparison: case, punctuation and extra spaces ignored. */
function namesMatch(typed: string, onAccount: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
  const a = norm(typed);
  const b = norm(onAccount);
  if (!a || !b) return false;
  if (a === b) return true;
  // Accept a subset match in either direction, so "Jordan Hale" satisfies
  // "Jordan T Hale" and vice versa. Middle names and suffixes are not the
  // hill to die on; the authenticated account is the real identity check.
  const at = new Set(a.split(' '));
  const bt = new Set(b.split(' '));
  const overlap = [...at].filter((t) => bt.has(t)).length;
  return overlap >= Math.min(at.size, bt.size);
}

/**
 * Produce a signature record, or throw.
 *
 * Refuses rather than warns. A signature captured without affirmation is
 * worse than no signature, because it looks like one.
 */
export function createSignature(args: {
  intent: SignatureIntent;
  context: SignatureContext;
  documentHash: string;
  /** Hash the signer was shown. A mismatch means it changed under them. */
  hashShownToSigner?: string;
  alreadySigned?: boolean;
}): SignatureRecord {
  const { intent, context, documentHash } = args;

  if (args.alreadySigned) {
    throw new SignatureError('This party has already signed this contract.', 'ALREADY_SIGNED');
  }
  if (!intent.affirmed) {
    throw new SignatureError(
      'The consent affirmation must be accepted before signing.',
      'NOT_AFFIRMED',
    );
  }
  if (!intent.typedName.trim()) {
    throw new SignatureError('A typed name is required.', 'EMPTY_NAME');
  }
  if (!namesMatch(intent.typedName, context.legalName)) {
    throw new SignatureError(
      `The typed name does not match the name on this account (${context.legalName}). Update your account name if it is wrong.`,
      'NAME_MISMATCH',
    );
  }
  if (args.hashShownToSigner && args.hashShownToSigner !== documentHash) {
    // The document changed between rendering and submitting. Refusing is the
    // whole point of hashing it.
    throw new SignatureError(
      'This contract changed while you were reading it. Reload and review the current version before signing.',
      'DOCUMENT_CHANGED',
    );
  }

  return {
    userId: context.userId,
    legalName: context.legalName,
    email: context.email,
    typedName: intent.typedName.trim(),
    consentText: intent.consentText,
    documentHash,
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent?.slice(0, 500) ?? null,
    signedAt: context.signedAt,
  };
}

export type ContractStatus =
  | 'DRAFT'
  | 'SENT'
  | 'PARTIALLY_SIGNED'
  | 'SIGNED'
  | 'VOIDED'
  | 'COMPLETED';

/**
 * Contract status from its signatures.
 *
 * Derived rather than stored as the source of truth, so status can never
 * disagree with the signatures themselves.
 */
export function statusFromSignatures(args: {
  requiredSignerIds: readonly string[];
  signedUserIds: readonly string[];
  sent: boolean;
  voided: boolean;
  completed: boolean;
}): ContractStatus {
  if (args.voided) return 'VOIDED';
  if (args.completed) return 'COMPLETED';
  const signed = new Set(args.signedUserIds);
  const allSigned = args.requiredSignerIds.every((id) => signed.has(id));
  if (allSigned && args.requiredSignerIds.length > 0) return 'SIGNED';
  if (signed.size > 0) return 'PARTIALLY_SIGNED';
  return args.sent ? 'SENT' : 'DRAFT';
}

/** A contract that has been signed by anyone is frozen. */
export function isEditable(status: ContractStatus): boolean {
  return status === 'DRAFT' || status === 'SENT';
}
