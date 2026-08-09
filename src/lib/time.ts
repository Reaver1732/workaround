/**
 * Time and interval primitives for WorkAround.
 *
 * Every time in the domain layer is an integer number of minutes since
 * midnight, local to the campus. No Date objects, no timezones, no strings.
 * Overlap detection becomes a comparison and commute buffers become addition.
 *
 * Intervals are HALF-OPEN: [start, end). A class ending at 10:50 and a shift
 * starting at 10:50 do NOT overlap. Get this wrong and the solver silently
 * throws away valid schedules.
 */

export const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type Day = (typeof DAYS)[number];

export interface Interval {
  /** minutes since midnight, inclusive */
  start: number;
  /** minutes since midnight, exclusive */
  end: number;
}

// --------------------------------------------------------------------------
// Formatting and parsing single clock times
// --------------------------------------------------------------------------

/** 570 -> "9:30 AM" */
export function formatTime(min: number): string {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const period = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** 150 -> "2h 30m" */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Parse a single clock time into minutes since midnight.
 * Handles: "9:30AM", "9:30 am", "09:30", "1:00 PM", "13:00", "1300", "12 PM".
 * Returns null if it can't be understood. Never guesses.
 */
export function parseTime(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\./g, '');
  if (!s) return null;

  // "9:30am" / "9:30 am" / "9am" / "12 pm"
  const meridiem = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (meridiem) {
    let h = parseInt(meridiem[1], 10);
    const m = meridiem[2] ? parseInt(meridiem[2], 10) : 0;
    const isPm = meridiem[3] === 'pm';
    if (h < 1 || h > 12 || m > 59) return null;
    if (h === 12) h = 0; // 12 AM -> 0, 12 PM -> 12 after the += below
    return (isPm ? h + 12 : h) * 60 + m;
  }

  // "13:00" / "09:30"
  const colon24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (colon24) {
    const h = parseInt(colon24[1], 10);
    const m = parseInt(colon24[2], 10);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }

  // "1300" / "0930" — military, 4 digits only. 3 digits is too ambiguous.
  const military = s.match(/^(\d{2})(\d{2})$/);
  if (military) {
    const h = parseInt(military[1], 10);
    const m = parseInt(military[2], 10);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }

  return null;
}

// --------------------------------------------------------------------------
// Interval algebra
// --------------------------------------------------------------------------

export function isValidInterval(iv: Interval): boolean {
  return Number.isInteger(iv.start) && Number.isInteger(iv.end) && iv.start < iv.end;
}

export function duration(iv: Interval): number {
  return Math.max(0, iv.end - iv.start);
}

export function totalMinutes(list: Interval[]): number {
  return list.reduce((sum, iv) => sum + duration(iv), 0);
}

/** Half-open overlap. Touching endpoints are NOT an overlap. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Grow an interval outward by `pad` minutes on both sides, clamped to the day. */
export function pad(iv: Interval, padMinutes: number): Interval {
  return {
    start: Math.max(0, iv.start - padMinutes),
    end: Math.min(24 * 60, iv.end + padMinutes),
  };
}

/**
 * Sort, merge overlapping AND adjacent intervals.
 * Adjacent is deliberate: [9:00,10:00) and [10:00,11:00) become one busy
 * block, because you can't work in the zero minutes between them.
 */
export function merge(list: Interval[]): Interval[] {
  const sorted = list
    .filter(isValidInterval)
    .slice()
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end);
    } else {
      out.push({ ...iv });
    }
  }
  return out;
}

/** base minus cut. Returns 0, 1, or 2 pieces. */
export function subtract(base: Interval, cut: Interval): Interval[] {
  if (!overlaps(base, cut)) return [{ ...base }];
  const out: Interval[] = [];
  if (cut.start > base.start) out.push({ start: base.start, end: cut.start });
  if (cut.end < base.end) out.push({ start: cut.end, end: base.end });
  return out;
}

/** base minus every cut. Cuts do not need to be sorted or disjoint. */
export function subtractMany(base: Interval, cuts: Interval[]): Interval[] {
  let pieces: Interval[] = [{ ...base }];
  for (const cut of merge(cuts)) {
    pieces = pieces.flatMap((p) => subtract(p, cut));
  }
  return pieces;
}
