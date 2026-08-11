/**
 * Request-body validation for POST /api/schedules.
 *
 * Every rejection carries a message that names the offending field and says
 * what was expected. A student who mistypes a work block should not get a
 * stack trace, and neither should the UI developer.
 */

import { DAYS, Day } from '../lib/time';
import { WorkBlock } from '../lib/workHours';

/** One course and the sections the student is willing to take for it. */
export interface CourseSelection {
  // Course id, as returned by GET /api/courses.
  courseId: string;
  // Candidate section ids for that course. At least one.
  sectionIds: string[];
}

export interface ScheduleRequest {
  // Term to resolve the section ids in.
  term: string;
  // One entry per course the student is taking.
  courses: CourseSelection[];
  // Windows the student can work.
  workBlocks: WorkBlock[];
  // One-way travel between campus and the job.
  commuteMinutes: number;
  // Shortest usable shift. Undefined lets workHours apply its own default.
  minShiftMinutes: number | undefined;
  // Weekly hours the student is aiming for.
  targetHoursPerWeek: number | undefined;
  // Used only to put a dollar figure on the result.
  hourlyWage: number | undefined;
  // Override for the combination ceiling.
  maxCombinations: number | undefined;
}

export type ValidationResult =
  | { ok: true; value: ScheduleRequest }
  | { ok: false; message: string };

const MINUTES_IN_DAY = 24 * 60;

function fail(message: string): ValidationResult {
  return { ok: false, message };
}

function isPlainObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && Array.isArray(value) === false;
}

/**
 * Read an optional non-negative number. Returns a message instead of a value
 * when the field is present but unusable.
 */
function optionalNumber(
  raw: unknown,
  field: string
): { ok: true; value: number | undefined } | { ok: false; message: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, value: undefined };
  }
  if (typeof raw !== 'number' || Number.isFinite(raw) === false) {
    return { ok: false, message: `"${field}" must be a number.` };
  }
  if (raw < 0) {
    return { ok: false, message: `"${field}" must not be negative.` };
  }
  return { ok: true, value: raw };
}

function validateWorkBlocks(raw: unknown): { ok: true; value: WorkBlock[] } | { ok: false; message: string } {
  if (Array.isArray(raw) === false) {
    return { ok: false, message: '"workBlocks" must be an array.' };
  }

  const blocks = raw as unknown[];
  if (blocks.length === 0) {
    return {
      ok: false,
      message:
        '"workBlocks" is empty. Without at least one window the student can work, ' +
        'every schedule scores zero and the ranking is meaningless.',
    };
  }

  const value: WorkBlock[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const where = `workBlocks[${i}]`;

    if (isPlainObject(block) === false) {
      return { ok: false, message: `${where} must be an object.` };
    }

    const candidate = block as Record<string, unknown>;
    const day = candidate.day;
    const start = candidate.start;
    const end = candidate.end;

    if (typeof day !== 'string' || DAYS.includes(day as Day) === false) {
      return {
        ok: false,
        message: `${where}.day must be one of ${DAYS.join(', ')}. Got ${JSON.stringify(day)}.`,
      };
    }
    if (Number.isInteger(start) === false || Number.isInteger(end) === false) {
      return {
        ok: false,
        message: `${where}.start and .end must be whole minutes since midnight, not times or strings.`,
      };
    }

    const startMin = start as number;
    const endMin = end as number;

    if (startMin < 0 || endMin > MINUTES_IN_DAY) {
      return {
        ok: false,
        message: `${where} must fall inside a single day, between 0 and ${MINUTES_IN_DAY}.`,
      };
    }
    if (startMin >= endMin) {
      return {
        ok: false,
        message: `${where}.start (${startMin}) must be before .end (${endMin}).`,
      };
    }

    value.push({ day: day as Day, start: startMin, end: endMin });
  }

  return { ok: true, value };
}

function validateCourses(raw: unknown): { ok: true; value: CourseSelection[] } | { ok: false; message: string } {
  if (Array.isArray(raw) === false) {
    return { ok: false, message: '"courses" must be an array.' };
  }

  const entries = raw as unknown[];
  if (entries.length === 0) {
    return { ok: false, message: '"courses" is empty. Supply at least one course.' };
  }

  const value: CourseSelection[] = [];
  // Course ids already seen, so a duplicated course is rejected rather than
  // silently multiplying the combination count.
  const seen = new Set<string>();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const where = `courses[${i}]`;

    if (isPlainObject(entry) === false) {
      return { ok: false, message: `${where} must be an object.` };
    }

    const candidate = entry as Record<string, unknown>;
    const courseId = candidate.courseId;
    const sectionIds = candidate.sectionIds;

    if (typeof courseId !== 'string' || courseId.length === 0) {
      return { ok: false, message: `${where}.courseId must be a non-empty string.` };
    }
    if (seen.has(courseId) === true) {
      return { ok: false, message: `${where}.courseId "${courseId}" appears more than once.` };
    }
    seen.add(courseId);

    if (Array.isArray(sectionIds) === false) {
      return { ok: false, message: `${where}.sectionIds must be an array.` };
    }

    const ids = sectionIds as unknown[];
    if (ids.length === 0) {
      return {
        ok: false,
        message:
          `${where}.sectionIds is empty. A course with no candidate sections makes ` +
          `every schedule impossible.`,
      };
    }

    const cleaned: string[] = [];
    for (let j = 0; j < ids.length; j++) {
      if (typeof ids[j] !== 'string' || (ids[j] as string).length === 0) {
        return { ok: false, message: `${where}.sectionIds[${j}] must be a non-empty string.` };
      }
      cleaned.push(ids[j] as string);
    }

    value.push({ courseId, sectionIds: cleaned });
  }

  return { ok: true, value };
}

export function parseScheduleRequest(body: unknown, defaultTerm: string): ValidationResult {
  if (isPlainObject(body) === false) {
    return fail('Request body must be a JSON object.');
  }

  const raw = body as Record<string, unknown>;

  let term = defaultTerm;
  if (raw.term !== undefined && raw.term !== null) {
    if (typeof raw.term !== 'string' || raw.term.length === 0) {
      return fail('"term" must be a non-empty string when supplied.');
    }
    term = raw.term;
  }

  const courses = validateCourses(raw.courses);
  if (courses.ok === false) {
    return fail(courses.message);
  }

  const workBlocks = validateWorkBlocks(raw.workBlocks);
  if (workBlocks.ok === false) {
    return fail(workBlocks.message);
  }

  if (Number.isInteger(raw.commuteMinutes) === false) {
    return fail('"commuteMinutes" is required and must be a whole number of minutes.');
  }
  const commuteMinutes = raw.commuteMinutes as number;
  if (commuteMinutes < 0) {
    return fail('"commuteMinutes" must not be negative.');
  }

  const minShift = optionalNumber(raw.minShiftMinutes, 'minShiftMinutes');
  if (minShift.ok === false) {
    return fail(minShift.message);
  }

  const target = optionalNumber(raw.targetHoursPerWeek, 'targetHoursPerWeek');
  if (target.ok === false) {
    return fail(target.message);
  }

  const wage = optionalNumber(raw.hourlyWage, 'hourlyWage');
  if (wage.ok === false) {
    return fail(wage.message);
  }

  const ceiling = optionalNumber(raw.maxCombinations, 'maxCombinations');
  if (ceiling.ok === false) {
    return fail(ceiling.message);
  }

  return {
    ok: true,
    value: {
      term,
      courses: courses.value,
      workBlocks: workBlocks.value,
      commuteMinutes,
      minShiftMinutes: minShift.value,
      targetHoursPerWeek: target.value,
      hourlyWage: wage.value,
      maxCombinations: ceiling.value,
    },
  };
}
