/**
 * The combination generator.
 *
 * Takes N courses with a handful of candidate sections each, builds every
 * one-section-per-course combination, throws away the ones that collide, and
 * ranks what is left by how many work hours it preserves.
 *
 * Brute force is the right tool here on purpose. A student picks 4-6 courses
 * with 2-6 sections apiece, which is hundreds to a few thousand combinations.
 * A CSP solver would be slower to write, harder to explain, and no faster.
 *
 * The diagnostics are not an afterthought. When nothing survives, "no valid
 * schedule" is a useless answer: the student needs to know that COMP SCI 120
 * and MATH 202 knocked out 340 of the 360 combinations between them, because
 * that tells them which course to move.
 */

import { Day, overlaps } from './time';
import {
  ClassBlock,
  WorkBlock,
  WorkHoursResult,
  computeWorkHours,
  meetsTarget,
} from './workHours';

/** Refuse to brute-force more than this unless the caller says otherwise. */
export const DEFAULT_MAX_COMBINATIONS = 50_000;

// --------------------------------------------------------------------------
// Input
// --------------------------------------------------------------------------

export interface CandidateMeeting {
  // Days this meeting recurs on.
  days: Day[];
  // Start, minutes since midnight, inclusive.
  startMin: number;
  // End, minutes since midnight, exclusive.
  endMin: number;
}

export interface CandidateSection {
  // Stable identifier, echoed back in the results.
  id: string;
  // Registration code shown to students, e.g. "0002".
  sectionCode: string;
  // Every meeting pattern. A lecture plus its lab is two entries, one section.
  // Empty for a fully asynchronous section, which can never collide.
  meetings: CandidateMeeting[];
}

export interface CandidateCourse {
  // Stable identifier, echoed back in the results.
  id: string;
  // Subject code, e.g. "COMP SCI".
  subject: string;
  // Catalog number, e.g. "120".
  number: string;
  // The sections the student is willing to take. One of these ends up in
  // every generated combination.
  sections: CandidateSection[];
}

export interface GenerateOptions {
  // Windows the student is able to work.
  workBlocks: WorkBlock[];
  // One-way travel between campus and the job.
  commuteMinutes: number;
  // Shortest usable shift. Defaults to the workHours default of 90.
  minShiftMinutes?: number;
  // When set, results carry an estimated weekly wage.
  hourlyWage?: number;
  // When set, schedules are flagged against this target and the shortfall is
  // reported. Schedules below it are still returned, just marked.
  targetHoursPerWeek?: number;
  // Safety valve. Above this the generator refuses instead of hanging.
  maxCombinations?: number;
}

// --------------------------------------------------------------------------
// Output
// --------------------------------------------------------------------------

export interface ScheduledSection {
  // The course this section belongs to.
  courseId: string;
  // Display label, e.g. "COMP SCI 120".
  courseLabel: string;
  // The chosen section.
  section: CandidateSection;
}

export interface ScheduleCandidate {
  // One section per course, in the order the courses were supplied.
  sections: ScheduledSection[];
  // Full scoring breakdown from computeWorkHours.
  work: WorkHoursResult;
  // Usable work minutes preserved. This is the ranking key.
  usableMinutes: number;
  // True when usable hours reach targetHoursPerWeek. True when no target set.
  meetsTarget: boolean;
  // Hours short of the target. Zero when the target is met or unset.
  shortfallHours: number;
}

export interface OverlapPair {
  // Label of the first course in the pair.
  courseA: string;
  // Label of the second course in the pair.
  courseB: string;
  // Combinations this pair collided in. Pair counts can sum to more than
  // eliminatedByOverlap, because one dead combination can have several
  // colliding pairs in it.
  eliminations: number;
}

export interface GeneratorDiagnostics {
  // Size of the Cartesian product implied by the inputs.
  combinationsPossible: number;
  // Combinations actually built and checked. Zero when the generator refused.
  combinationsEvaluated: number;
  // Combinations dropped because two meetings collided.
  eliminatedByOverlap: number;
  // Valid schedules that landed under targetHoursPerWeek. They are still
  // returned; this is a count, not a filter.
  belowTarget: number;
  // Valid schedules returned.
  survivors: number;
  // The course pair responsible for the most overlap eliminations, or null.
  worstOverlapPair: OverlapPair | null;
  // Every colliding pair, worst first.
  overlapPairs: OverlapPair[];
  // True when the generator declined to run.
  refused: boolean;
  // Why it declined, or why zero schedules came back. Null when all is well.
  reason: string | null;
}

export interface GenerateResult {
  // Valid schedules, best first.
  schedules: ScheduleCandidate[];
  // Why the result looks the way it does.
  diagnostics: GeneratorDiagnostics;
}

// --------------------------------------------------------------------------
// Internals
// --------------------------------------------------------------------------

function courseLabel(course: CandidateCourse): string {
  return `${course.subject} ${course.number}`;
}

/**
 * Expand meeting patterns into one block per day, which is both what
 * computeWorkHours consumes and the granularity overlap is decided at.
 */
function expandMeetings(meetings: CandidateMeeting[]): ClassBlock[] {
  const blocks: ClassBlock[] = [];

  for (let i = 0; i < meetings.length; i++) {
    const meeting = meetings[i];
    for (let j = 0; j < meeting.days.length; j++) {
      blocks.push({
        day: meeting.days[j],
        start: meeting.startMin,
        end: meeting.endMin,
      });
    }
  }

  return blocks;
}

/**
 * Do two sections collide? Only blocks on the same day can, and the interval
 * test is time.ts's overlaps(), so half-open semantics stay in one place:
 * a class ending at 10:50 does not collide with one starting at 10:50.
 */
function sectionsCollide(a: ClassBlock[], b: ClassBlock[]): boolean {
  // Set once a colliding pair of blocks is found. No early break so the
  // function stays a simple scan; these arrays are tiny.
  let collides = false;

  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (a[i].day === b[j].day && overlaps(a[i], b[j]) === true) {
        collides = true;
      }
    }
  }

  return collides;
}

function emptyDiagnostics(possible: number, reason: string): GeneratorDiagnostics {
  return {
    combinationsPossible: possible,
    combinationsEvaluated: 0,
    eliminatedByOverlap: 0,
    belowTarget: 0,
    survivors: 0,
    worstOverlapPair: null,
    overlapPairs: [],
    refused: true,
    reason,
  };
}

// --------------------------------------------------------------------------

export function generateSchedules(
  courses: CandidateCourse[],
  options: GenerateOptions
): GenerateResult {
  const maxCombinations = options.maxCombinations ?? DEFAULT_MAX_COMBINATIONS;

  if (courses.length === 0) {
    return {
      schedules: [],
      diagnostics: emptyDiagnostics(0, 'No courses were supplied.'),
    };
  }

  // Courses the student left without any candidate section. Nothing can be
  // built until one is chosen, so name them instead of returning an empty list.
  const emptyCourses: string[] = [];
  for (let i = 0; i < courses.length; i++) {
    if (courses[i].sections.length === 0) {
      emptyCourses.push(courseLabel(courses[i]));
    }
  }

  if (emptyCourses.length > 0) {
    return {
      schedules: [],
      diagnostics: emptyDiagnostics(
        0,
        `No sections were supplied for ${emptyCourses.join(', ')}. ` +
        `Every course needs at least one candidate section.`
      ),
    };
  }

  // Size of the Cartesian product.
  let combinationsPossible = 1;
  for (let i = 0; i < courses.length; i++) {
    combinationsPossible = combinationsPossible * courses[i].sections.length;
  }

  if (combinationsPossible > maxCombinations) {
    return {
      schedules: [],
      diagnostics: emptyDiagnostics(
        combinationsPossible,
        `${combinationsPossible.toLocaleString()} combinations exceeds the limit of ` +
        `${maxCombinations.toLocaleString()}. Narrow the candidate sections on the ` +
        `courses with the most options, then try again.`
      ),
    };
  }

  // Day-expanded blocks for every section, indexed the same way as
  // courses[i].sections[j].
  const blocksByCourse: ClassBlock[][][] = [];
  for (let i = 0; i < courses.length; i++) {
    const perSection: ClassBlock[][] = [];
    for (let j = 0; j < courses[i].sections.length; j++) {
      perSection.push(expandMeetings(courses[i].sections[j].meetings));
    }
    blocksByCourse.push(perSection);
  }

  // Precomputed collision answers, keyed "courseA:sectionA|courseB:sectionB".
  // Sections are compared once here rather than once per combination, which
  // is what keeps the brute force cheap.
  const collisionCache = new Map<string, boolean>();
  for (let a = 0; a < courses.length; a++) {
    for (let b = a + 1; b < courses.length; b++) {
      for (let i = 0; i < courses[a].sections.length; i++) {
        for (let j = 0; j < courses[b].sections.length; j++) {
          collisionCache.set(
            `${a}:${i}|${b}:${j}`,
            sectionsCollide(blocksByCourse[a][i], blocksByCourse[b][j])
          );
        }
      }
    }
  }

  // Overlap eliminations per course pair, keyed "courseA|courseB".
  const pairEliminations = new Map<string, number>();
  const schedules: ScheduleCandidate[] = [];

  // Which section index is currently chosen for each course.
  const chosen: number[] = new Array(courses.length).fill(0);
  let combinationsEvaluated = 0;
  let eliminatedByOverlap = 0;
  let belowTarget = 0;
  let done = false;

  while (done === false) {
    combinationsEvaluated = combinationsEvaluated + 1;

    // Every course pair that collides in this combination. Collected in full
    // rather than stopping at the first, so the diagnostics can say which
    // pair is the real troublemaker.
    const collidingPairs: string[] = [];

    for (let a = 0; a < courses.length; a++) {
      for (let b = a + 1; b < courses.length; b++) {
        const collides = collisionCache.get(`${a}:${chosen[a]}|${b}:${chosen[b]}`);
        if (collides === true) {
          collidingPairs.push(`${a}|${b}`);
        }
      }
    }

    if (collidingPairs.length > 0) {
      eliminatedByOverlap = eliminatedByOverlap + 1;
      for (let i = 0; i < collidingPairs.length; i++) {
        const key = collidingPairs[i];
        pairEliminations.set(key, (pairEliminations.get(key) ?? 0) + 1);
      }
    } else {
      const sections: ScheduledSection[] = [];
      const classBlocks: ClassBlock[] = [];

      for (let i = 0; i < courses.length; i++) {
        sections.push({
          courseId: courses[i].id,
          courseLabel: courseLabel(courses[i]),
          section: courses[i].sections[chosen[i]],
        });

        const blocks = blocksByCourse[i][chosen[i]];
        for (let j = 0; j < blocks.length; j++) {
          classBlocks.push(blocks[j]);
        }
      }

      const work = computeWorkHours(options.workBlocks, classBlocks, {
        commuteMinutes: options.commuteMinutes,
        minShiftMinutes: options.minShiftMinutes,
        hourlyWage: options.hourlyWage,
      });

      let hitsTarget = true;
      let shortfallHours = 0;
      if (options.targetHoursPerWeek !== undefined) {
        const verdict = meetsTarget(work, options.targetHoursPerWeek);
        hitsTarget = verdict.ok;
        shortfallHours = verdict.shortfallHours;
        if (hitsTarget === false) {
          belowTarget = belowTarget + 1;
        }
      }

      schedules.push({
        sections,
        work,
        usableMinutes: work.totalMinutes,
        meetsTarget: hitsTarget,
        shortfallHours,
      });
    }

    // Advance the odometer: rightmost course first, carrying left.
    let position = courses.length - 1;
    let carrying = true;
    while (position >= 0 && carrying === true) {
      chosen[position] = chosen[position] + 1;
      if (chosen[position] < courses[position].sections.length) {
        carrying = false;
      } else {
        chosen[position] = 0;
        position = position - 1;
      }
    }
    if (carrying === true) {
      done = true;
    }
  }

  // Best first. Ties break on less fragmentation, then on course-order so the
  // ranking is stable run to run.
  schedules.sort((x, y) => {
    if (y.usableMinutes !== x.usableMinutes) {
      return y.usableMinutes - x.usableMinutes;
    }
    return x.work.fragmentedMinutes - y.work.fragmentedMinutes;
  });

  const overlapPairs: OverlapPair[] = [];
  pairEliminations.forEach((count, key) => {
    const parts = key.split('|');
    overlapPairs.push({
      courseA: courseLabel(courses[Number(parts[0])]),
      courseB: courseLabel(courses[Number(parts[1])]),
      eliminations: count,
    });
  });
  overlapPairs.sort((x, y) => {
    if (y.eliminations !== x.eliminations) {
      return y.eliminations - x.eliminations;
    }
    return x.courseA.localeCompare(y.courseA) || x.courseB.localeCompare(y.courseB);
  });

  let worstOverlapPair: OverlapPair | null = null;
  if (overlapPairs.length > 0) {
    worstOverlapPair = overlapPairs[0];
  }

  // Explain an empty or disappointing result rather than leaving the caller
  // to guess. This is the whole reason diagnostics exist.
  let reason: string | null = null;
  if (schedules.length === 0) {
    reason =
      `All ${combinationsEvaluated} combinations were eliminated by overlapping meetings.`;
    if (worstOverlapPair !== null) {
      reason =
        reason +
        ` ${worstOverlapPair.courseA} and ${worstOverlapPair.courseB} collided in ` +
        `${worstOverlapPair.eliminations} of them, more than any other pair. ` +
        `Adding another section of either is the fastest way to open this up.`;
    }
  } else if (options.targetHoursPerWeek !== undefined && belowTarget === schedules.length) {
    reason =
      `${schedules.length} schedules are possible but none reach ` +
      `${options.targetHoursPerWeek} work hours per week. The best is short by ` +
      `${schedules[0].shortfallHours} hours.`;
  }

  return {
    schedules,
    diagnostics: {
      combinationsPossible,
      combinationsEvaluated,
      eliminatedByOverlap,
      belowTarget,
      survivors: schedules.length,
      worstOverlapPair,
      overlapPairs,
      refused: false,
      reason,
    },
  };
}
