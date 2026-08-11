/**
 * Dependency-free tests. Run with: npx tsx src/lib/generateSchedules.test.ts
 *
 * Same shape as lib.test.ts. The last block is the important one: it feeds the
 * generator the real fall 2026 sections plus their seeded alternates and
 * checks it independently rediscovers the A/B/C ranking the seed asserts.
 */

import { parseMeetingPattern } from './parseMeetingPattern';
import {
  CandidateCourse,
  CandidateMeeting,
  CandidateSection,
  GenerateResult,
  generateSchedules,
} from './generateSchedules';
import { WorkBlock } from './workHours';

let passed = 0;
let failed = 0;

function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.log(`FAIL  ${label}\n      expected ${e}\n      got      ${a}`);
  }
}

/** Build a section from SIS-style patterns, the same way the seed does. */
function section(id: string, sectionCode: string, patterns: string[]): CandidateSection {
  const meetings: CandidateMeeting[] = [];

  for (let i = 0; i < patterns.length; i++) {
    const parsed = parseMeetingPattern(patterns[i]);
    if (parsed.warnings.length > 0 || parsed.time === null) {
      throw new Error(`test data "${patterns[i]}" did not parse cleanly`);
    }
    meetings.push({
      days: parsed.days,
      startMin: parsed.time.start,
      endMin: parsed.time.end,
    });
  }

  return { id, sectionCode, meetings };
}

function course(
  id: string,
  subject: string,
  number: string,
  sections: CandidateSection[]
): CandidateCourse {
  return { id, subject, number, sections };
}

/** Where a schedule made of exactly these section ids landed in the ranking. */
function rankOf(result: GenerateResult, sectionIds: string[]): number {
  for (let i = 0; i < result.schedules.length; i++) {
    const candidate = result.schedules[i];
    let matches = true;

    for (let j = 0; j < sectionIds.length; j++) {
      let found = false;
      for (let k = 0; k < candidate.sections.length; k++) {
        if (candidate.sections[k].section.id === sectionIds[j]) {
          found = true;
        }
      }
      if (found === false) {
        matches = false;
      }
    }

    if (matches === true && candidate.sections.length === sectionIds.length) {
      return i;
    }
  }

  return -1;
}

const WEEKDAYS: WorkBlock[] = [
  { day: 'MO', start: 480, end: 1080 },
  { day: 'TU', start: 480, end: 1080 },
  { day: 'WE', start: 480, end: 1080 },
  { day: 'TH', start: 480, end: 1080 },
  { day: 'FR', start: 480, end: 1080 },
];

// -- product size ----------------------------------------------------------
const twoByThree = generateSchedules(
  [
    course('c1', 'AAA', '100', [
      section('a1', '001', ['MO 8:00AM-8:50AM']),
      section('a2', '002', ['MO 9:00AM-9:50AM']),
    ]),
    course('c2', 'BBB', '200', [
      section('b1', '001', ['TU 8:00AM-8:50AM']),
      section('b2', '002', ['TU 9:00AM-9:50AM']),
      section('b3', '003', ['TU 10:00AM-10:50AM']),
    ]),
  ],
  { workBlocks: WEEKDAYS, commuteMinutes: 0 }
);
eq('2x3 product', twoByThree.diagnostics.combinationsPossible, 6);
eq('2x3 all evaluated', twoByThree.diagnostics.combinationsEvaluated, 6);
eq('2x3 none collide', twoByThree.diagnostics.eliminatedByOverlap, 0);
eq('2x3 survivors', twoByThree.diagnostics.survivors, 6);
eq('2x3 one section per course', twoByThree.schedules[0].sections.length, 2);

// -- overlap elimination and half-open boundaries --------------------------
const clashing = generateSchedules(
  [
    course('c1', 'AAA', '100', [
      section('a1', '001', ['MW 9:00AM-10:00AM']),
      section('a2', '002', ['MW 1:00PM-2:00PM']),
    ]),
    course('c2', 'BBB', '200', [
      // Starts exactly when a1 ends. Half-open, so NOT a collision.
      section('b1', '001', ['MW 10:00AM-11:00AM']),
      // Straddles a1.
      section('b2', '002', ['MW 9:30AM-10:30AM']),
    ]),
  ],
  { workBlocks: WEEKDAYS, commuteMinutes: 0 }
);
eq('touching endpoints do not collide', rankOf(clashing, ['a1', 'b1']) >= 0, true);
eq('straddling meetings collide', rankOf(clashing, ['a1', 'b2']), -1);
eq('one combination died', clashing.diagnostics.eliminatedByOverlap, 1);
eq('three survived', clashing.diagnostics.survivors, 3);

// -- worst offending pair --------------------------------------------------
// BBB collides with AAA on every combination; CCC never collides with anyone.
const blamed = generateSchedules(
  [
    course('c1', 'AAA', '100', [
      section('a1', '001', ['MO 9:00AM-10:00AM']),
      section('a2', '002', ['MO 9:15AM-10:15AM']),
    ]),
    course('c2', 'BBB', '200', [
      section('b1', '001', ['MO 9:30AM-10:30AM']),
      section('b2', '002', ['MO 9:45AM-10:45AM']),
    ]),
    course('c3', 'CCC', '300', [
      section('x1', '001', ['FR 8:00AM-8:50AM']),
      section('x2', '002', ['FR 9:00AM-9:50AM']),
    ]),
  ],
  { workBlocks: WEEKDAYS, commuteMinutes: 0 }
);
eq('everything died', blamed.diagnostics.survivors, 0);
eq('all eight eliminated', blamed.diagnostics.eliminatedByOverlap, 8);
eq('blamed pair', blamed.diagnostics.worstOverlapPair,
  { courseA: 'AAA 100', courseB: 'BBB 200', eliminations: 8 });
eq('only one pair ever collided', blamed.diagnostics.overlapPairs.length, 1);
eq('failure is explained', blamed.diagnostics.reason !== null, true);
eq('explanation names both courses',
  blamed.diagnostics.reason!.includes('AAA 100') &&
  blamed.diagnostics.reason!.includes('BBB 200'), true);

// -- async sections never collide ------------------------------------------
const withAsync = generateSchedules(
  [
    course('c1', 'AAA', '100', [section('a1', '001', ['MW 9:00AM-10:00AM'])]),
    course('c2', 'BBB', '200', [{ id: 'b1', sectionCode: 'ALT3', meetings: [] }]),
  ],
  { workBlocks: WEEKDAYS, commuteMinutes: 0 }
);
eq('async never collides', withAsync.diagnostics.eliminatedByOverlap, 0);
eq('async survives', withAsync.diagnostics.survivors, 1);

// -- the 50,000 guard ------------------------------------------------------
const many: CandidateCourse[] = [];
for (let i = 0; i < 8; i++) {
  const sections: CandidateSection[] = [];
  for (let j = 0; j < 7; j++) {
    sections.push(section(`s${i}_${j}`, `00${j}`, [`MO ${8 + j}:00-${8 + j}:50`]));
  }
  many.push(course(`c${i}`, 'SUB', String(100 + i), sections));
}
const refused = generateSchedules(many, { workBlocks: WEEKDAYS, commuteMinutes: 0 });
eq('7^8 product', refused.diagnostics.combinationsPossible, 5764801);
eq('refused to run', refused.diagnostics.refused, true);
eq('nothing evaluated', refused.diagnostics.combinationsEvaluated, 0);
eq('no schedules returned', refused.schedules.length, 0);
eq('refusal is explained', refused.diagnostics.reason !== null, true);

// A raised ceiling lets the same shape through.
const raised = generateSchedules(
  [
    course('c1', 'AAA', '100', [
      section('a1', '001', ['MO 8:00AM-8:50AM']),
      section('a2', '002', ['MO 9:00AM-9:50AM']),
    ]),
  ],
  { workBlocks: WEEKDAYS, commuteMinutes: 0, maxCombinations: 1 }
);
eq('custom ceiling refuses', raised.diagnostics.refused, true);

// -- missing input ---------------------------------------------------------
const noCourses = generateSchedules([], { workBlocks: WEEKDAYS, commuteMinutes: 0 });
eq('no courses refuses', noCourses.diagnostics.refused, true);

const noSections = generateSchedules(
  [
    course('c1', 'AAA', '100', [section('a1', '001', ['MO 8:00AM-8:50AM'])]),
    course('c2', 'BBB', '200', []),
  ],
  { workBlocks: WEEKDAYS, commuteMinutes: 0 }
);
eq('empty course refuses', noSections.diagnostics.refused, true);
eq('empty course is named', noSections.diagnostics.reason!.includes('BBB 200'), true);

// -- ranking and target ----------------------------------------------------
// With a commute in play the three placements separate cleanly:
//   early  8:00-9:00  -> padded 7:40-9:20, leaves 9:20-18:00      = 520 usable
//   mid   12:00-13:00 -> padded 11:40-13:20, two blocks 220 + 280 = 500 usable
//   sliver 9:00-10:00 -> padded 8:40-10:20, strands a 40-min scrap = 460 usable
// Note it is NOT enough to be early: an 8:00 and a 9:00 class look equally
// harmless on a calendar, and one of them quietly destroys 40 minutes.
const RANKING_COURSE = [
  course('c1', 'AAA', '100', [
    section('mid', '001', ['MO 12:00PM-1:00PM']),
    section('sliver', '002', ['MO 9:00AM-10:00AM']),
    section('early', '003', ['MO 8:00AM-9:00AM']),
  ]),
];
const RANKING_DAY: WorkBlock[] = [{ day: 'MO', start: 480, end: 1080 }];

const ranked = generateSchedules(RANKING_COURSE, {
  workBlocks: RANKING_DAY,
  commuteMinutes: 20,
  minShiftMinutes: 90,
});
eq('best is the early class', ranked.schedules[0].sections[0].section.id, 'early');
eq('worst is the one that strands a scrap',
  ranked.schedules[2].sections[0].section.id, 'sliver');
eq('ranked descending', [
  ranked.schedules[0].usableMinutes,
  ranked.schedules[1].usableMinutes,
  ranked.schedules[2].usableMinutes,
], [520, 500, 460]);
eq('only the loser fragments', ranked.schedules[2].work.fragmentedMinutes, 40);

const targeted = generateSchedules(RANKING_COURSE, {
  workBlocks: RANKING_DAY,
  commuteMinutes: 20,
  minShiftMinutes: 90,
  targetHoursPerWeek: 40,
});
eq('nothing reaches 40h', targeted.diagnostics.belowTarget, 3);
eq('but schedules are still returned', targeted.schedules.length, 3);
eq('shortfall is reported', targeted.schedules[0].meetsTarget, false);
eq('shortfall explained', targeted.diagnostics.reason !== null, true);

// -- the seeded A/B/C ranking ----------------------------------------------
// Real registered sections plus the seeded sample alternates. The generator
// has no idea which is which; it should still rank C above A above B.
const REAL_PLUS_ALTERNATES: CandidateCourse[] = [
  course('cs120', 'COMP SCI', '120', [
    section('cs-0002', '0002', ['MW 9:30AM-11:20AM']),
    section('cs-ALT1', 'ALT1', ['MW 8:00AM-9:50AM']),
  ]),
  course('comm133', 'COMM', '133', [
    section('comm-0002', '0002', ['TuTh 9:30AM-10:50AM']),
    section('comm-ALT1', 'ALT1', ['TuTh 9:45AM-11:05AM']),
    section('comm-ALT2', 'ALT2', ['TuTh 10:00AM-11:20AM']),
  ]),
  course('math202', 'MATH', '202', [
    section('math-0003', '0003', ['MWF 12:45PM-2:05PM']),
    section('math-ALT1', 'ALT1', ['MWF 11:45AM-1:05PM']),
    section('math-ALT2', 'ALT2', ['MWF 12:00PM-1:20PM']),
  ]),
  course('wf100', 'WF', '100', [
    section('wf-0008', '0008', ['TuTh 12:30PM-1:50PM']),
    section('wf-ALT1', 'ALT1', ['TuTh 1:10PM-2:30PM']),
    section('wf-ALT2', 'ALT2', ['TuTh 1:30PM-2:50PM']),
  ]),
  course('hum198', 'HUM STUD', '198', [
    section('hum-0002', '0002', ['MW 2:15PM-3:35PM']),
    section('hum-ALT1', 'ALT1', ['MW 3:00PM-4:20PM']),
    section('hum-ALT2', 'ALT2', ['MW 2:00PM-3:20PM']),
  ]),
];

const seeded = generateSchedules(REAL_PLUS_ALTERNATES, {
  workBlocks: WEEKDAYS,
  commuteMinutes: 20,
  minShiftMinutes: 90,
});

eq('seeded product is 2x3x3x3x3', seeded.diagnostics.combinationsPossible, 162);
eq('seeded refused nothing', seeded.diagnostics.refused, false);

const scheduleA = ['cs-0002', 'comm-0002', 'math-0003', 'wf-0008', 'hum-0002'];
const scheduleB = ['cs-ALT1', 'comm-ALT1', 'math-ALT1', 'wf-ALT1', 'hum-ALT1'];
const scheduleC = ['cs-ALT1', 'comm-ALT2', 'math-ALT2', 'wf-ALT2', 'hum-ALT2'];

const rankA = rankOf(seeded, scheduleA);
const rankB = rankOf(seeded, scheduleB);
const rankC = rankOf(seeded, scheduleC);

eq('A was generated', rankA >= 0, true);
eq('B was generated', rankB >= 0, true);
eq('C was generated', rankC >= 0, true);

// The exact figures the seed asserts against the database.
eq('A preserves 1190 min', seeded.schedules[rankA].usableMinutes, 1190);
eq('B preserves 860 min', seeded.schedules[rankB].usableMinutes, 860);
eq('C preserves 1660 min', seeded.schedules[rankC].usableMinutes, 1660);
eq('A is 19.83 h', seeded.schedules[rankA].work.totalHours, 19.83);
eq('B is 14.33 h', seeded.schedules[rankB].work.totalHours, 14.33);
eq('C is 27.67 h', seeded.schedules[rankC].work.totalHours, 27.67);

// The ordering is the point: C beats the schedule actually registered for,
// which beats B, even though B and C free up identical raw time.
eq('C outranks A', rankC < rankA, true);
eq('A outranks B', rankA < rankB, true);
eq('B and C free identical raw time',
  seeded.schedules[rankB].work.totalMinutes + seeded.schedules[rankB].work.fragmentedMinutes,
  seeded.schedules[rankC].work.totalMinutes + seeded.schedules[rankC].work.fragmentedMinutes);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
