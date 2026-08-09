/**
 * The scoring core of WorkAround.
 *
 * Given a candidate schedule and a student's work availability, how many
 * hours can they actually still work?
 *
 * Two things here are the whole product:
 *
 *  1. COMMUTE BUFFER. A class ending at 10:50 does not free you at 10:50.
 *     Every class block is padded by commuteMinutes on BOTH sides before it
 *     is subtracted from work availability.
 *
 *  2. MINIMUM SHIFT LENGTH. A 25-minute gap between two classes is not a
 *     work opportunity. Nobody schedules a 25-minute shift. Fragments
 *     shorter than minShiftMinutes are discarded, not counted.
 *
 * Every degree planner on the market gets both of these wrong by ignoring
 * the job entirely.
 */

import { Day, Interval, merge, subtractMany, totalMinutes } from './time';

export interface DayInterval extends Interval {
  day: Day;
}

/** A window the student is able to work, e.g. Mon 15:00-21:00. */
export type WorkBlock = DayInterval;

/** A single class meeting occurrence on one day. */
export type ClassBlock = DayInterval;

export interface WorkHoursOptions {
  /** Travel time between campus and work, one way, in minutes. */
  commuteMinutes: number;
  /** Shortest usable shift. Gaps shorter than this are worthless. Default 90. */
  minShiftMinutes?: number;
  /** Optional. When set, results include an estimated weekly wage. */
  hourlyWage?: number;
}

export interface DayResult {
  day: Day;
  /** Usable work windows left after classes and commute. */
  usable: Interval[];
  /** Windows that survived the class subtraction but are too short to work. */
  discardedFragments: Interval[];
  minutes: number;
}

export interface WorkHoursResult {
  byDay: DayResult[];
  totalMinutes: number;
  totalHours: number;
  /** Minutes lost purely to fragments being too short to be a real shift. */
  fragmentedMinutes: number;
  estimatedWeeklyPay?: number;
}

/**
 * How many work hours does this schedule preserve?
 *
 * Note the asymmetry with a naive implementation: we merge class blocks
 * AFTER padding them. Two classes 20 minutes apart with a 15-minute commute
 * become one continuous unavailable block, which is correct. You are not
 * driving to work and back in that gap.
 */
export function computeWorkHours(
  workBlocks: WorkBlock[],
  classBlocks: ClassBlock[],
  options: WorkHoursOptions
): WorkHoursResult {
  const commute = Math.max(0, options.commuteMinutes);
  const minShift = options.minShiftMinutes ?? 90;

  const byDay: DayResult[] = [];
  let fragmentedMinutes = 0;

  const days = Array.from(new Set(workBlocks.map((b) => b.day)));

  for (const day of days) {
    const windows = workBlocks.filter((b) => b.day === day);

    // Pad each class by the commute on both sides, THEN merge.
    const busy = merge(
      classBlocks
        .filter((c) => c.day === day)
        .map((c) => ({
          start: Math.max(0, c.start - commute),
          end: Math.min(24 * 60, c.end + commute),
        }))
    );

    const remaining = windows.flatMap((w) => subtractMany(w, busy));

    const usable = remaining.filter((iv) => iv.end - iv.start >= minShift);
    const discardedFragments = remaining.filter((iv) => iv.end - iv.start < minShift);

    fragmentedMinutes += totalMinutes(discardedFragments);

    byDay.push({
      day,
      usable,
      discardedFragments,
      minutes: totalMinutes(usable),
    });
  }

  const total = byDay.reduce((sum, d) => sum + d.minutes, 0);

  const result: WorkHoursResult = {
    byDay,
    totalMinutes: total,
    totalHours: Math.round((total / 60) * 100) / 100,
    fragmentedMinutes,
  };

  if (options.hourlyWage != null) {
    result.estimatedWeeklyPay =
      Math.round((total / 60) * options.hourlyWage * 100) / 100;
  }

  return result;
}

/**
 * Does this schedule clear the student's target hours?
 * Used to rank and to explain failures, which matters more than it sounds:
 * "nothing works" is a useless answer. "You are 4.5 hours short on Tuesday"
 * is actionable.
 */
export function meetsTarget(
  result: WorkHoursResult,
  targetHoursPerWeek: number
): { ok: boolean; shortfallHours: number } {
  const shortfall = targetHoursPerWeek - result.totalHours;
  return {
    ok: shortfall <= 0,
    shortfallHours: Math.max(0, Math.round(shortfall * 100) / 100),
  };
}
