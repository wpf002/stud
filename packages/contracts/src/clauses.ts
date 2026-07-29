/**
 * Contract clause library.
 *
 * Clauses are composable, versioned, and carry their own variables. A contract
 * is an ordered list of clause instances with values bound — never a blob of
 * text someone edited, because a blob cannot be diffed, cannot be reasoned
 * about by the refund logic, and cannot tell you what changed between the
 * version a party read and the version they signed.
 *
 * ── Not legal advice ──────────────────────────────────────────────────────
 * These are drafting starting points, reviewed by nobody. Every template says
 * so in the UI, and `REQUIRES_LEGAL_REVIEW` is on the templates rather than
 * buried in a footer. Breeding contracts are governed by state law that varies
 * enormously, and some jurisdictions treat live-animal sales under commercial
 * codes with their own implied warranties.
 *
 * Pure module. No I/O.
 */

export type ClauseCategory =
  | 'PARTIES'
  | 'CONSIDERATION'
  | 'PERFORMANCE'
  | 'HEALTH'
  | 'GUARANTEE'
  | 'REMEDY'
  | 'OWNERSHIP'
  | 'GENERAL';

export type VariableKind = 'TEXT' | 'MONEY_CENTS' | 'INTEGER' | 'DATE' | 'BOOLEAN' | 'CHOICE';

/**
 * One option on a CHOICE variable.
 *
 * Three fields because they answer three different questions, and collapsing
 * any two of them has already caused a bug:
 *
 *   `value` — what the LOGIC reads. For most options this is also the wording,
 *             but where a machine token is needed (a payment trigger the
 *             schedule builder switches on) it is that token.
 *   `label` — the short text on the drafter's picker. Never printed.
 *   `text`  — exactly what appears IN THE DOCUMENT. Defaults to `value`.
 *
 * Set `text` whenever `value` is a machine token, or the contract will read
 * "the balance falls due ON_CONFIRMED_PREGNANCY".
 */
export interface ClauseOption {
  value: string;
  label: string;
  text?: string;
}

export interface ClauseVariable {
  key: string;
  label: string;
  kind: VariableKind;
  required: boolean;
  /** For CHOICE. */
  options?: ClauseOption[];
  help?: string;
  defaultValue?: string | number | boolean | null;
}

export interface Clause {
  id: string;
  version: number;
  category: ClauseCategory;
  title: string;
  /** Body with `{{variable}}` placeholders. */
  body: string;
  variables: ClauseVariable[];
  /**
   * Machine-readable meaning, for logic that must not parse prose.
   * The refund engine reads these, never the body text.
   */
  effects?: {
    /** Marks this clause as defining a repeat-breeding right. */
    grantsRepeatBreeding?: boolean;
    /** Marks this clause as defining when the balance falls due. */
    definesBalanceTrigger?:
      | 'ON_SIGNING'
      | 'ON_TIE'
      | 'ON_CONFIRMED_PREGNANCY'
      | 'ON_WHELP'
      | 'ON_PICK'
      | 'ON_PICKUP';
    /** Marks this clause as defining the refund position if no litter results. */
    definesNoLitterRemedy?: 'REPEAT_ONLY' | 'REFUND_BALANCE' | 'REFUND_ALL' | 'NO_REMEDY';

    // ── Puppy sale ──
    /**
     * Whether the deposit survives a buyer who changes their mind.
     *
     * Read by the refund logic, never parsed from the sentence. `UNTIL_PICK`
     * is the position most breeders actually take and almost none write down.
     */
    definesDepositRefund?: 'NON_REFUNDABLE' | 'REFUNDABLE_UNTIL_PICK' | 'FULLY_REFUNDABLE';
    /** Marks this clause as the health guarantee, and how long it runs. */
    definesHealthGuaranteeDays?: number;
    /** What the buyer gets if the guarantee is invoked. */
    definesHealthRemedy?: 'REPLACEMENT_PUPPY' | 'PARTIAL_REFUND' | 'FULL_REFUND' | 'PURCHASE_PRICE_CREDIT';
    /** Marks this clause as requiring the dog back rather than rehomed. */
    requiresReturnToBreeder?: boolean;
    /** What registration the buyer receives. Decides what Phase 8 can transfer. */
    definesRegistrationType?: 'FULL' | 'LIMITED' | 'NONE';
    /** Marks this clause as imposing a spay/neuter obligation. */
    requiresAlteration?: boolean;
  };
  /** Shown to the drafter, not printed in the contract. */
  drafterNote?: string;
}

/**
 * The clause library.
 *
 * Versioned individually. A contract records the clause id AND version it was
 * signed with, so improving a clause never silently changes what somebody
 * already agreed to.
 */
export const CLAUSES: Clause[] = [
  // ── Parties ─────────────────────────────────────────────────────────────
  {
    id: 'parties.stud_service',
    version: 1,
    category: 'PARTIES',
    title: 'Parties and animals',
    body: `This agreement is made on {{agreementDate}} between {{studOwnerName}} ("Stud Owner"), owner of {{sireName}} ({{sireRegistration}}), and {{bitchOwnerName}} ("Bitch Owner"), owner of {{damName}} ({{damRegistration}}).

Both parties confirm that the animals named above are the animals to be bred, and that each has the authority to enter this agreement in respect of their animal.`,
    variables: [
      { key: 'agreementDate', label: 'Agreement date', kind: 'DATE', required: true },
      { key: 'studOwnerName', label: 'Stud owner', kind: 'TEXT', required: true },
      { key: 'sireName', label: 'Sire', kind: 'TEXT', required: true },
      { key: 'sireRegistration', label: 'Sire registration', kind: 'TEXT', required: false },
      { key: 'bitchOwnerName', label: 'Bitch owner', kind: 'TEXT', required: true },
      { key: 'damName', label: 'Dam', kind: 'TEXT', required: true },
      { key: 'damRegistration', label: 'Dam registration', kind: 'TEXT', required: false },
    ],
  },

  // ── Consideration ───────────────────────────────────────────────────────
  {
    id: 'fee.deposit_and_balance',
    version: 1,
    category: 'CONSIDERATION',
    title: 'Stud fee — deposit and balance',
    body: `The stud fee is {{feeTotal}}.

A deposit of {{depositAmount}} is payable on signing and is non-refundable except as provided in the remedy clauses below.

The balance of {{balanceAmount}} falls due {{balanceTrigger}}.`,
    variables: [
      { key: 'feeTotal', label: 'Total stud fee', kind: 'MONEY_CENTS', required: true },
      { key: 'depositAmount', label: 'Deposit', kind: 'MONEY_CENTS', required: true },
      { key: 'balanceAmount', label: 'Balance', kind: 'MONEY_CENTS', required: true },
      {
        key: 'balanceTrigger',
        label: 'Balance falls due',
        kind: 'CHOICE',
        required: true,
        defaultValue: 'ON_CONFIRMED_PREGNANCY',
        // The only options in the library whose value is a machine token —
        // `extractScheduleTerms` switches on it — so each carries its own
        // document wording.
        options: [
          { value: 'ON_TIE', label: 'On tie', text: 'on a successful tie or insemination' },
          { value: 'ON_CONFIRMED_PREGNANCY', label: 'On confirmed pregnancy', text: 'on confirmed pregnancy' },
          { value: 'ON_WHELP', label: 'On whelping', text: 'on whelping of a live litter' },
        ],
      },
    ],
    effects: { definesBalanceTrigger: 'ON_CONFIRMED_PREGNANCY' },
    drafterNote:
      'Confirmed pregnancy is the most common trigger and the fairest to both sides — the stud owner is paid once the service has evidently worked, and the bitch owner is not paying in full for a breeding that did not take.',
  },
  {
    id: 'fee.pick_of_litter',
    version: 1,
    category: 'CONSIDERATION',
    title: 'Pick of litter in lieu of fee',
    body: `In place of {{replacesFee}} of the stud fee, the Stud Owner shall receive {{pickPosition}} pick of the resulting litter.

Selection shall be made by {{selectionDeadline}}. If the Stud Owner does not make a selection by that date, the right lapses and {{lapseRemedy}}.

The puppy shall transfer with full registration and all health records held for it at the time of transfer.`,
    variables: [
      {
        key: 'replacesFee',
        label: 'Replaces',
        kind: 'CHOICE',
        required: true,
        options: [
          { value: 'all', label: 'the whole fee' },
          { value: 'part', label: 'part of the fee' },
        ],
      },
      {
        key: 'pickPosition',
        label: 'Pick position',
        kind: 'CHOICE',
        required: true,
        options: [
          { value: 'first', label: 'first' },
          { value: 'second', label: 'second' },
          { value: 'third', label: 'third' },
        ],
      },
      { key: 'selectionDeadline', label: 'Selection deadline', kind: 'TEXT', required: true, defaultValue: 'seven weeks of age' },
      {
        key: 'lapseRemedy',
        label: 'If the pick lapses',
        kind: 'TEXT',
        required: true,
        defaultValue: 'the cash stud fee becomes payable in full',
      },
    ],
    drafterNote:
      'Pick-of-litter terms cause more disputes than any other clause in dog breeding. Name a deadline and say plainly what happens if it passes.',
  },

  // ── Performance ─────────────────────────────────────────────────────────
  {
    id: 'service.method',
    version: 1,
    category: 'PERFORMANCE',
    title: 'Method of service',
    body: `The service shall be by {{method}}.

{{methodDetail}}

Costs of collection, shipping, storage and insemination are borne by {{costBearer}} unless otherwise agreed in writing.`,
    variables: [
      {
        key: 'method',
        label: 'Method',
        kind: 'CHOICE',
        required: true,
        options: [
          { value: 'natural service', label: 'Natural' },
          { value: 'artificial insemination with fresh semen', label: 'AI — fresh' },
          { value: 'artificial insemination with chilled shipped semen', label: 'AI — chilled' },
          { value: 'artificial insemination with frozen semen', label: 'AI — frozen' },
          { value: 'surgical or transcervical insemination', label: 'Surgical / TCI' },
        ],
      },
      { key: 'methodDetail', label: 'Additional detail', kind: 'TEXT', required: false },
      {
        key: 'costBearer',
        label: 'Costs borne by',
        kind: 'CHOICE',
        required: true,
        defaultValue: 'the Bitch Owner',
        options: [
          { value: 'the Bitch Owner', label: 'Bitch owner' },
          { value: 'the Stud Owner', label: 'Stud owner' },
          { value: 'the parties equally', label: 'Split equally' },
        ],
      },
    ],
  },

  // ── Health ──────────────────────────────────────────────────────────────
  {
    id: 'health.brucellosis',
    version: 1,
    category: 'HEALTH',
    title: 'Brucellosis testing',
    body: `Both parties warrant that their animal has tested negative for canine brucellosis within {{testWindow}} of the date of service, and shall provide the result on request.

Either party may decline to proceed, without penalty and with any deposit refunded, if the other cannot produce a current negative result.`,
    variables: [
      { key: 'testWindow', label: 'Test window', kind: 'TEXT', required: true, defaultValue: '30 days' },
    ],
    drafterNote:
      'Brucellosis is the one test essentially every stud contract requires. It is transmissible, it is not curable, and it ends breeding careers.',
  },
  {
    id: 'health.verified_testing',
    version: 1,
    category: 'HEALTH',
    title: 'Health testing on record',
    body: `The parties acknowledge the health testing recorded for each animal on the Stud platform as at the date of this agreement, as set out in the schedule attached.

Results shown as verified have been checked against the issuing source. Results shown as reported are statements by the owner and have not been independently confirmed. Neither party relies on any health claim not appearing in that schedule.`,
    variables: [],
    drafterNote:
      'This clause is what makes the verification engine contractually meaningful. It also states plainly that reported claims are not verified, so nobody can later argue they were led to believe otherwise.',
  },

  // ── Guarantee and remedy ────────────────────────────────────────────────
  {
    id: 'remedy.repeat_breeding',
    version: 1,
    category: 'REMEDY',
    title: 'Repeat breeding if no live litter',
    body: `If the breeding does not result in a live litter of at least {{minimumPuppies}} puppy(ies) surviving to {{survivalAge}}, the Stud Owner shall provide a repeat service at no further stud fee, on the Dam's next season or the one following, subject to the Sire being available and fertile.

The Bitch Owner shall notify the Stud Owner within {{notificationWindow}} of the expected whelping date, with veterinary confirmation that the Dam did not conceive or did not carry a live litter.

A repeat service is the Bitch Owner's sole remedy under this clause. {{feeDisposition}}`,
    variables: [
      { key: 'minimumPuppies', label: 'Minimum live puppies', kind: 'INTEGER', required: true, defaultValue: 1 },
      { key: 'survivalAge', label: 'Surviving to', kind: 'TEXT', required: true, defaultValue: '72 hours of age' },
      { key: 'notificationWindow', label: 'Notification window', kind: 'TEXT', required: true, defaultValue: '14 days' },
      {
        key: 'feeDisposition',
        label: 'The fee',
        kind: 'CHOICE',
        required: true,
        defaultValue: 'The stud fee is not refundable.',
        options: [
          { value: 'The stud fee is not refundable.', label: 'Not refundable' },
          { value: 'The balance, but not the deposit, is refundable at the Bitch Owner’s election in place of a repeat service.', label: 'Balance refundable instead' },
        ],
      },
    ],
    effects: { grantsRepeatBreeding: true, definesNoLitterRemedy: 'REPEAT_ONLY' },
    drafterNote:
      'Nearly every stud contract offers a repeat rather than a refund, because the stud owner has already provided the service. Say what happens to the money either way.',
  },
  {
    id: 'remedy.refund_no_conception',
    version: 1,
    category: 'REMEDY',
    title: 'Refund if no conception',
    body: `If the Dam does not conceive from this service, the Stud Owner shall refund {{refundAmount}} within {{refundWindow}} of receiving veterinary confirmation.

This is in place of, not in addition to, any repeat service.`,
    variables: [
      {
        key: 'refundAmount',
        label: 'Refund',
        kind: 'CHOICE',
        required: true,
        options: [
          { value: 'the balance of the stud fee', label: 'Balance only' },
          { value: 'the full stud fee including the deposit', label: 'Full fee' },
        ],
      },
      { key: 'refundWindow', label: 'Refund window', kind: 'TEXT', required: true, defaultValue: '30 days' },
    ],
    effects: { definesNoLitterRemedy: 'REFUND_BALANCE' },
  },

  // ── Ownership ───────────────────────────────────────────────────────────
  {
    id: 'ownership.registration_papers',
    version: 1,
    category: 'OWNERSHIP',
    title: 'Litter registration',
    body: `The Stud Owner shall sign and provide the registration paperwork required to register the litter within {{paperworkWindow}} of the whelping, provided the stud fee has been paid in full.

The Bitch Owner shall notify the Stud Owner of the whelping and the number of live puppies within {{whelpNotification}}.`,
    variables: [
      { key: 'paperworkWindow', label: 'Paperwork window', kind: 'TEXT', required: true, defaultValue: '14 days' },
      { key: 'whelpNotification', label: 'Whelp notification', kind: 'TEXT', required: true, defaultValue: '72 hours' },
    ],
    drafterNote:
      'Withheld litter paperwork is one of the most common disputes in the sport. Tie it explicitly to payment so both obligations are visible.',
  },
  {
    id: 'ownership.co_ownership',
    version: 1,
    category: 'OWNERSHIP',
    title: 'Co-ownership terms',
    body: `{{coOwnerA}} and {{coOwnerB}} shall hold {{dogName}} in co-ownership in the proportions {{shareSplit}}.

Decisions regarding breeding, showing, and any transfer of ownership require the written agreement of both parties. Routine veterinary care and day-to-day decisions rest with {{custodian}}, who holds physical custody.

Either party may buy out the other at {{buyoutTerms}}.`,
    variables: [
      { key: 'coOwnerA', label: 'Co-owner A', kind: 'TEXT', required: true },
      { key: 'coOwnerB', label: 'Co-owner B', kind: 'TEXT', required: true },
      { key: 'dogName', label: 'Dog', kind: 'TEXT', required: true },
      { key: 'shareSplit', label: 'Share split', kind: 'TEXT', required: true, defaultValue: '50/50' },
      { key: 'custodian', label: 'Custodian', kind: 'TEXT', required: true },
      { key: 'buyoutTerms', label: 'Buyout terms', kind: 'TEXT', required: true, defaultValue: 'a price agreed in writing at the time' },
    ],
  },

  // ── General ─────────────────────────────────────────────────────────────
  // ── Puppy sale ──────────────────────────────────────────────────────────
  //
  // A puppy contract is not a stud contract with the nouns changed. It is
  // consumer-facing, it is signed by someone who has never read one before,
  // and the clauses that matter most are the ones that decide what happens
  // when something goes wrong months later.
  {
    id: 'parties.puppy_sale',
    version: 1,
    category: 'PARTIES',
    title: 'Parties and puppy',
    body: `This agreement is made on {{agreementDate}} between {{breederName}} ("Breeder") and {{buyerName}} ("Buyer").

The Breeder sells and the Buyer purchases {{puppyDescription}}, born {{dateOfBirth}}, out of {{damName}} by {{sireName}}.

The Buyer confirms they have read the health testing recorded for both parents on the Stud platform, as set out in the schedule attached.`,
    variables: [
      { key: 'agreementDate', label: 'Agreement date', kind: 'DATE', required: true },
      { key: 'breederName', label: 'Breeder', kind: 'TEXT', required: true },
      { key: 'buyerName', label: 'Buyer', kind: 'TEXT', required: true },
      {
        key: 'puppyDescription',
        label: 'The puppy',
        kind: 'TEXT',
        required: true,
        help: 'Sex, colour and collar or name — enough that there is no doubt which puppy this is.',
      },
      { key: 'dateOfBirth', label: 'Date of birth', kind: 'DATE', required: true },
      { key: 'damName', label: 'Dam', kind: 'TEXT', required: true },
      { key: 'sireName', label: 'Sire', kind: 'TEXT', required: true },
    ],
    drafterNote:
      'Identify the puppy precisely. "A male puppy" has been litigated more than once when a breeder and a buyer each had a different one in mind.',
  },
  {
    id: 'fee.purchase_price',
    version: 1,
    category: 'CONSIDERATION',
    title: 'Purchase price and deposit',
    body: `The purchase price is {{priceTotal}}.

A deposit of {{depositAmount}} is payable on signing. {{depositTerms}}

The balance of {{balanceAmount}} falls due {{balanceTrigger}}, and the puppy does not leave the Breeder's care until it has been paid in full.`,
    variables: [
      { key: 'priceTotal', label: 'Purchase price', kind: 'MONEY_CENTS', required: true },
      { key: 'depositAmount', label: 'Deposit', kind: 'MONEY_CENTS', required: true },
      { key: 'balanceAmount', label: 'Balance', kind: 'MONEY_CENTS', required: true },
      {
        key: 'balanceTrigger',
        label: 'Balance falls due',
        kind: 'CHOICE',
        required: true,
        defaultValue: 'ON_PICKUP',
        options: [
          { value: 'ON_PICK', label: 'On choosing a puppy', text: 'when the Buyer selects their puppy' },
          { value: 'ON_PICKUP', label: 'At collection', text: 'on or before collection' },
        ],
      },
      {
        key: 'depositTerms',
        label: 'The deposit',
        kind: 'CHOICE',
        required: true,
        defaultValue: 'REFUNDABLE_UNTIL_PICK',
        options: [
          {
            value: 'NON_REFUNDABLE',
            label: 'Non-refundable',
            text: 'The deposit is not refundable if the Buyer withdraws.',
          },
          {
            value: 'REFUNDABLE_UNTIL_PICK',
            label: 'Refundable until they choose',
            text: 'The deposit is refundable in full if the Buyer withdraws before selecting a puppy, and is not refundable afterwards.',
          },
          {
            value: 'FULLY_REFUNDABLE',
            label: 'Fully refundable',
            text: 'The deposit is refundable in full at any time before collection.',
          },
        ],
      },
    ],
    effects: { definesBalanceTrigger: 'ON_PICKUP', definesDepositRefund: 'REFUNDABLE_UNTIL_PICK' },
    drafterNote:
      'Say what happens to the deposit if the buyer changes their mind. Most breeders hold a position on this and almost none write it down, which is how it ends up being argued about.',
  },
  {
    id: 'health.puppy_guarantee',
    version: 1,
    category: 'GUARANTEE',
    title: 'Health guarantee',
    body: `The Breeder warrants the puppy is in good health at collection and has been examined by a licensed veterinarian.

The Buyer shall have the puppy examined by their own veterinarian within {{initialExamWindow}} of collection. If that examination finds a pre-existing condition that materially affects the puppy's health, the Buyer may return the puppy for a full refund of the purchase price.

For {{guaranteePeriod}} from the date of birth, the Breeder guarantees the puppy against a life-threatening or life-limiting hereditary condition diagnosed by a licensed veterinarian and confirmed by a second opinion the Breeder may obtain at their own cost. The remedy is {{guaranteeRemedy}}.

This guarantee does not cover conditions arising from injury, neglect, poor nutrition, infectious disease, or a failure to follow reasonable veterinary advice.`,
    variables: [
      {
        key: 'initialExamWindow',
        label: 'Initial vet exam window',
        kind: 'TEXT',
        required: true,
        defaultValue: '72 hours',
        help: 'Short enough to be about the puppy you handed over, long enough to find a vet.',
      },
      {
        key: 'guaranteePeriod',
        label: 'Guarantee period',
        kind: 'CHOICE',
        required: true,
        defaultValue: 'TWENTY_FOUR_MONTHS',
        options: [
          { value: 'TWELVE_MONTHS', label: '12 months', text: 'twelve months' },
          { value: 'TWENTY_FOUR_MONTHS', label: '24 months', text: 'twenty-four months' },
          { value: 'THIRTY_SIX_MONTHS', label: '36 months', text: 'thirty-six months' },
        ],
      },
      {
        key: 'guaranteeRemedy',
        label: 'Remedy',
        kind: 'CHOICE',
        required: true,
        defaultValue: 'REPLACEMENT_PUPPY',
        options: [
          {
            value: 'REPLACEMENT_PUPPY',
            label: 'Replacement puppy',
            text: 'a replacement puppy from a future litter, at no further cost, with the Buyer under no obligation to return the affected dog',
          },
          {
            value: 'PARTIAL_REFUND',
            label: 'Partial refund',
            text: 'a refund of half the purchase price, with the Buyer under no obligation to return the affected dog',
          },
          {
            value: 'FULL_REFUND',
            label: 'Full refund on return',
            text: 'a full refund of the purchase price on return of the dog',
          },
          {
            value: 'PURCHASE_PRICE_CREDIT',
            label: 'Credit against a future puppy',
            text: 'a credit for the purchase price against a future puppy',
          },
        ],
      },
    ],
    effects: { definesHealthGuaranteeDays: 730, definesHealthRemedy: 'REPLACEMENT_PUPPY' },
    drafterNote:
      'A guarantee that requires the dog back to pay out is a guarantee most families will never claim, and both parties know it. Decide honestly whether you want a clause that pays or a clause that looks good.',
  },
  {
    id: 'ownership.puppy_registration',
    version: 1,
    category: 'OWNERSHIP',
    title: 'Registration',
    body: `The puppy is sold with {{registrationType}}.

The Breeder shall provide the registration paperwork within {{paperworkWindow}} of the balance being paid in full.

The puppy's microchip shall be registered to the Buyer at collection, and the Breeder shall remain listed as a secondary contact so the Buyer can be reached if the dog is ever found without them.`,
    variables: [
      {
        key: 'registrationType',
        label: 'Registration',
        kind: 'CHOICE',
        required: true,
        defaultValue: 'LIMITED',
        options: [
          {
            value: 'LIMITED',
            label: 'Limited — no breeding rights',
            text: 'limited registration, which does not permit the registration of any offspring',
          },
          {
            value: 'FULL',
            label: 'Full — breeding rights',
            text: 'full registration, which permits the registration of offspring',
          },
          { value: 'NONE', label: 'No registration', text: 'no registration paperwork' },
        ],
      },
      { key: 'paperworkWindow', label: 'Paperwork window', kind: 'TEXT', required: true, defaultValue: '14 days' },
    ],
    effects: { definesRegistrationType: 'LIMITED' },
    drafterNote:
      'Limited registration is the norm for a pet home and is not an insult — say so to the buyer, because many read it as one.',
  },
  {
    id: 'care.spay_neuter',
    version: 1,
    category: 'PERFORMANCE',
    title: 'Spay and neuter',
    body: `The Buyer shall have the puppy spayed or neutered by {{alterationDeadline}}, and shall provide the Breeder with veterinary confirmation within {{confirmationWindow}} of the procedure.

The Buyer shall not breed from this dog.`,
    variables: [
      {
        key: 'alterationDeadline',
        label: 'By when',
        kind: 'TEXT',
        required: true,
        defaultValue: 'eighteen months of age, or earlier on veterinary advice',
        help: 'Current orthopaedic evidence favours waiting past skeletal maturity in larger breeds. A blanket six-month deadline is out of step with it.',
      },
      { key: 'confirmationWindow', label: 'Confirmation window', kind: 'TEXT', required: true, defaultValue: '30 days' },
    ],
    effects: { requiresAlteration: true },
    drafterNote:
      'Naming a fixed early age can conflict with veterinary advice for the breed. Tying it to maturity, with room for the vet to move it, is both safer for the dog and more enforceable.',
  },
  {
    id: 'care.return_to_breeder',
    version: 1,
    category: 'PERFORMANCE',
    title: 'Return to breeder',
    body: `If at any point in this dog's life the Buyer cannot keep it, the Buyer shall contact the Breeder first and return the dog to the Breeder.

The Buyer shall not sell, give away, rehome, surrender to a shelter or rescue, or euthanise this dog other than on veterinary advice, without first offering it back to the Breeder.

The Breeder shall accept the dog back at any age and for any reason. {{refundOnReturn}}`,
    variables: [
      {
        key: 'refundOnReturn',
        label: 'On return',
        kind: 'CHOICE',
        required: true,
        defaultValue: 'NO_REFUND',
        options: [
          {
            value: 'NO_REFUND',
            label: 'No refund',
            text: 'No refund of the purchase price is due on a return.',
          },
          {
            value: 'PRORATED',
            label: 'Prorated in the first year',
            text: 'A return within the first year carries a refund prorated against the purchase price.',
          },
        ],
      },
    ],
    effects: { requiresReturnToBreeder: true },
    drafterNote:
      'This is the clause that keeps dogs out of shelters. Make it unconditional on your side — a take-back that depends on the buyer being blameless is one that will not be used when it is needed.',
  },
  {
    id: 'care.puppy_welfare',
    version: 1,
    category: 'PERFORMANCE',
    title: 'Care of the dog',
    body: `The Buyer shall keep this dog as a companion animal in their home, provide routine and emergency veterinary care including core vaccination and parasite prevention, and shall not keep it permanently kennelled, chained or outdoors.

The Buyer shall not sell or transfer this dog to a pet shop, dealer, laboratory, or any commercial breeding operation, in any circumstances.`,
    variables: [],
    drafterNote:
      'Unenforceable in practice against a determined buyer, but it states the expectation plainly and gives you standing if you ever need it.',
  },
  {
    id: 'general.governing_law',
    version: 1,
    category: 'GENERAL',
    title: 'Governing law and disputes',
    body: `This agreement is governed by the laws of {{jurisdiction}}.

The parties shall attempt to resolve any dispute in good faith between themselves before commencing proceedings.`,
    variables: [{ key: 'jurisdiction', label: 'Jurisdiction', kind: 'TEXT', required: true }],
  },
  {
    id: 'general.entire_agreement',
    version: 1,
    category: 'GENERAL',
    title: 'Entire agreement',
    body: `This document, together with the health schedule attached, is the entire agreement between the parties in respect of this breeding. It replaces any prior discussion or understanding.

Any variation must be in writing and agreed by both parties.`,
    variables: [],
  },
];

export const CLAUSES_BY_ID = new Map(CLAUSES.map((c) => [c.id, c]));

export function getClause(id: string, version?: number): Clause | null {
  const clause = CLAUSES_BY_ID.get(id);
  if (!clause) return null;
  // A future version registry would resolve historic versions here. For now,
  // a version mismatch is surfaced rather than silently upgraded — signing a
  // contract against a clause that has since changed must not be invisible.
  if (version != null && clause.version !== version) return null;
  return clause;
}
