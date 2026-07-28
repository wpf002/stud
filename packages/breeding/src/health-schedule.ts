/**
 * Care schedules — the calendar a litter actually runs on.
 *
 * From whelp to go-home there are roughly thirty dated things a breeder must
 * not forget, most of them repeating, several of them legally required. This
 * generates that calendar from a whelp date so nobody is maintaining it in a
 * notebook.
 *
 * IMPORTANT: these are the widely-used reference protocols (AAHA-aligned for
 * core vaccines), not veterinary instructions. Products, intervals and legal
 * requirements vary by jurisdiction and by vet. Every generated task is
 * editable and the UI says where the schedule came from.
 *
 * Pure module. No clock, no I/O.
 */

import { addDays, daysBetween, startOfDay } from './dates.js';

export type CareTaskKind =
  | 'VACCINATION'
  | 'DEWORMING'
  | 'VET_CHECK'
  | 'MICROCHIP'
  | 'MILESTONE'
  | 'WEIGHING'
  | 'REGISTRATION'
  | 'PLACEMENT';

export interface CareTaskSpec {
  /** Days after whelp. */
  day: number;
  kind: CareTaskKind;
  title: string;
  detail: string;
  /** Applies to the whole litter, or to each puppy individually. */
  scope: 'LITTER' | 'PUPPY';
  /** Repeats every N days until `repeatUntilDay`. */
  repeatEveryDays?: number;
  repeatUntilDay?: number;
  /** Blocks go-home if incomplete. */
  required?: boolean;
}

/**
 * The standard puppy protocol.
 *
 * Deworming starts at two weeks and repeats fortnightly; core vaccination
 * starts at six to eight weeks and repeats every two to four weeks until
 * sixteen. Rabies timing is jurisdictional, which is why it is marked as such
 * rather than given a confident date.
 */
export const PUPPY_PROTOCOL: CareTaskSpec[] = [
  {
    day: 0,
    kind: 'MILESTONE',
    title: 'Whelped',
    detail: 'Record birth order, sex, weight and markings for each puppy.',
    scope: 'LITTER',
  },
  {
    day: 0,
    kind: 'WEIGHING',
    title: 'Weigh twice daily',
    detail:
      'Through the first two weeks. A puppy that stops gaining is in trouble hours before it looks like it.',
    scope: 'PUPPY',
    repeatEveryDays: 1,
    repeatUntilDay: 14,
    required: true,
  },
  {
    day: 3,
    kind: 'VET_CHECK',
    title: 'Dewclaw removal window closes',
    detail: 'If it is being done at all, days 3–5. Ask your vet; many breeds and owners now skip it.',
    scope: 'LITTER',
  },
  {
    day: 12,
    kind: 'MILESTONE',
    title: 'Eyes and ears opening',
    detail: 'Eyes usually open days 10–14, ears follow. Note any that lag.',
    scope: 'LITTER',
  },
  {
    day: 14,
    kind: 'DEWORMING',
    title: 'Deworming',
    detail: 'First dose at two weeks, then every two weeks until eight. Product and dose per your vet.',
    scope: 'PUPPY',
    repeatEveryDays: 14,
    repeatUntilDay: 56,
    required: true,
  },
  {
    day: 21,
    kind: 'MILESTONE',
    title: 'Weaning begins',
    detail: 'Introduce softened food. Weigh weekly from here rather than daily.',
    scope: 'LITTER',
  },
  {
    day: 28,
    kind: 'MILESTONE',
    title: 'Socialisation window opens',
    detail:
      'Weeks 4–12 shape temperament more than anything else you will do. Novel surfaces, sounds, handling, people.',
    scope: 'LITTER',
  },
  {
    day: 42,
    kind: 'VACCINATION',
    title: 'First core vaccination (DHPP)',
    detail:
      'Distemper, hepatitis, parvovirus, parainfluenza. Six to eight weeks, then every 2–4 weeks to sixteen weeks.',
    scope: 'PUPPY',
    required: true,
  },
  {
    day: 42,
    kind: 'VET_CHECK',
    title: 'Litter vet check',
    detail: 'General exam, heart check, hernia and palate check.',
    scope: 'PUPPY',
    required: true,
  },
  {
    day: 49,
    kind: 'MICROCHIP',
    title: 'Microchip',
    detail: 'Chip and record the number against each puppy. Required for transfer in many jurisdictions.',
    scope: 'PUPPY',
    required: true,
  },
  {
    day: 49,
    kind: 'REGISTRATION',
    title: 'Register the litter',
    detail: 'Submit the litter registration so papers are ready before the puppies leave.',
    scope: 'LITTER',
  },
  {
    day: 56,
    kind: 'PLACEMENT',
    title: 'Earliest go-home',
    detail:
      'Eight weeks is the legal minimum in many jurisdictions and the ethical floor everywhere. Check your local rule before setting pickup dates.',
    scope: 'PUPPY',
    required: true,
  },
  {
    day: 70,
    kind: 'VACCINATION',
    title: 'Second core vaccination',
    detail: 'Usually given by the new owner. Note it on the puppy record so it travels with them.',
    scope: 'PUPPY',
  },
  {
    day: 84,
    kind: 'VACCINATION',
    title: 'Rabies (jurisdictional)',
    detail:
      'Timing and legal minimum age vary by state and country — commonly 12–16 weeks. Confirm your local requirement.',
    scope: 'PUPPY',
  },
];

export interface GeneratedCareTask {
  key: string;
  kind: CareTaskKind;
  title: string;
  detail: string;
  scope: 'LITTER' | 'PUPPY';
  dueOn: Date;
  ageDays: number;
  required: boolean;
  /** Occurrence number for repeating tasks, 1-based. */
  occurrence: number;
  status: 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING' | 'FUTURE';
  daysUntilDue: number;
}

/**
 * Expand the protocol into dated tasks for one litter.
 *
 * `horizonDays` bounds the expansion — the twice-daily weighing task would
 * otherwise generate an unbounded list.
 */
export function generateCareSchedule(
  whelpDate: Date,
  now: Date,
  opts: { protocol?: CareTaskSpec[]; horizonDays?: number } = {},
): GeneratedCareTask[] {
  const protocol = opts.protocol ?? PUPPY_PROTOCOL;
  const horizon = opts.horizonDays ?? 120;
  const whelp = startOfDay(whelpDate);
  const out: GeneratedCareTask[] = [];

  for (const spec of protocol) {
    const until = Math.min(spec.repeatUntilDay ?? spec.day, horizon);
    const step = spec.repeatEveryDays ?? 0;
    let occurrence = 1;

    for (let day = spec.day; day <= until; day += step || Number.POSITIVE_INFINITY) {
      const dueOn = addDays(whelp, day);
      const daysUntilDue = daysBetween(now, dueOn);
      out.push({
        key: `${spec.kind}:${spec.title}:${day}`,
        kind: spec.kind,
        title: spec.title,
        detail: spec.detail,
        scope: spec.scope,
        dueOn,
        ageDays: day,
        required: spec.required ?? false,
        occurrence: occurrence++,
        status:
          daysUntilDue < 0 ? 'OVERDUE' : daysUntilDue === 0 ? 'DUE_TODAY' : daysUntilDue <= 7 ? 'UPCOMING' : 'FUTURE',
        daysUntilDue,
      });
      if (!step) break;
    }
  }

  return out.sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime());
}

/** Whelp-day milestones a breeder wants at a glance. */
export function litterMilestones(whelpDate: Date, now: Date) {
  const whelp = startOfDay(whelpDate);
  const ageDays = daysBetween(whelp, now);
  return {
    ageDays,
    ageWeeks: Math.floor(ageDays / 7),
    eyesOpenOn: addDays(whelp, 12),
    weaningStartsOn: addDays(whelp, 21),
    socialisationOpensOn: addDays(whelp, 28),
    firstVaccinationOn: addDays(whelp, 42),
    goHomeFrom: addDays(whelp, 56),
    /** The band where a litter is at its most fragile. */
    inCriticalWindow: ageDays >= 0 && ageDays <= 14,
  };
}
