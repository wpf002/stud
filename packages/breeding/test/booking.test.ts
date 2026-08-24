import { describe, expect, it } from 'vitest';
import {
  MAX_WINDOW_DAYS,
  bookedThrough,
  findConflicts,
  validateWindow,
  windowDays,
  windowsOverlap,
} from '../src/booking.js';

const d = (s: string) => new Date(`${s}T12:00:00Z`);
const NOW = d('2026-08-24');

describe('window length', () => {
  it('counts inclusively — a single day is one day, not zero', () => {
    expect(windowDays({ start: d('2026-09-01'), end: d('2026-09-01') })).toBe(1);
    expect(windowDays({ start: d('2026-09-01'), end: d('2026-09-05') })).toBe(5);
  });
});

describe('validateWindow', () => {
  it('accepts a normal five-day season window', () => {
    expect(validateWindow({ start: d('2026-09-01'), end: d('2026-09-05') }, NOW)).toEqual([]);
  });

  it('rejects an end before the start, and says only that', () => {
    const issues = validateWindow({ start: d('2026-09-05'), end: d('2026-09-01') }, NOW);
    expect(issues.map((i) => i.code)).toEqual(['END_BEFORE_START']);
  });

  it('rejects a window that has already passed', () => {
    const issues = validateWindow({ start: d('2026-07-01'), end: d('2026-07-05') }, NOW);
    expect(issues.map((i) => i.code)).toContain('IN_THE_PAST');
  });

  it('allows a window that started but has not ended', () => {
    expect(validateWindow({ start: d('2026-08-22'), end: d('2026-08-27') }, NOW)).toEqual([]);
  });

  /**
   * The cap is what stops a booking being used to hold a stud open forever,
   * which the public booked-through date would then advertise as unavailable.
   */
  it('rejects a window longer than a season', () => {
    const issues = validateWindow(
      { start: d('2026-09-01'), end: d('2026-10-15') },
      NOW,
    );
    expect(issues.map((i) => i.code)).toContain('TOO_LONG');
    expect(MAX_WINDOW_DAYS).toBeLessThanOrEqual(31);
  });
});

describe('overlap', () => {
  it('treats a single shared day as a conflict', () => {
    expect(
      windowsOverlap(
        { start: d('2026-09-01'), end: d('2026-09-05') },
        { start: d('2026-09-05'), end: d('2026-09-09') },
      ),
    ).toBe(true);
  });

  it('does not flag windows that merely touch end to start on different days', () => {
    expect(
      windowsOverlap(
        { start: d('2026-09-01'), end: d('2026-09-04') },
        { start: d('2026-09-05'), end: d('2026-09-09') },
      ),
    ).toBe(false);
  });

  it('finds every accepted booking a request collides with', () => {
    const held = [
      { id: 'a', start: d('2026-09-03'), end: d('2026-09-07') },
      { id: 'b', start: d('2026-09-20'), end: d('2026-09-24') },
    ];
    const hits = findConflicts({ start: d('2026-09-06'), end: d('2026-09-21') }, held);
    expect(hits.map((h) => h.id)).toEqual(['a', 'b']);
  });
});

describe('bookedThrough', () => {
  it('is null when nothing is accepted', () => {
    expect(bookedThrough([], NOW)).toBeNull();
  });

  it('is the furthest future end date', () => {
    const got = bookedThrough(
      [
        { start: d('2026-09-01'), end: d('2026-09-05') },
        { start: d('2026-10-01'), end: d('2026-10-09') },
      ],
      NOW,
    );
    expect(got?.toISOString().slice(0, 10)).toBe('2026-10-09');
  });

  /** A finished booking must not keep a stud looking unavailable. */
  it('ignores bookings that have already ended', () => {
    expect(bookedThrough([{ start: d('2026-07-01'), end: d('2026-07-05') }], NOW)).toBeNull();
  });

  it('still counts a booking that is running today', () => {
    const got = bookedThrough([{ start: d('2026-08-20'), end: d('2026-08-24') }], NOW);
    expect(got?.toISOString().slice(0, 10)).toBe('2026-08-24');
  });
});
