/**
 * Dependency-free tests. Run with: npx tsx src/lib/lib.test.ts
 *
 * These are here because interval math is exactly the kind of code that
 * looks right and is off by one minute. Every case below is a real format
 * or a real edge case, not a toy.
 */

import {
  merge, overlaps, parseTime, subtract, subtractMany,
} from './time';
import { parseDayCodes, parseMeetingPattern } from './parseMeetingPattern';
import { computeWorkHours } from './workHours';

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

// -- parseTime -------------------------------------------------------------
eq('9:30AM', parseTime('9:30AM'), 570);
eq('9:30 am spaced', parseTime('9:30 am'), 570);
eq('1:00 PM', parseTime('1:00 PM'), 780);
eq('12:00 PM is noon', parseTime('12:00 PM'), 720);
eq('12:00 AM is midnight', parseTime('12:00 AM'), 0);
eq('12:30 AM', parseTime('12:30 AM'), 30);
eq('24h 13:00', parseTime('13:00'), 780);
eq('military 1415', parseTime('1415'), 855);
eq('bare hour 9am', parseTime('9am'), 540);
eq('garbage rejected', parseTime('banana'), null);
eq('25:00 rejected', parseTime('25:00'), null);
eq('9:75 rejected', parseTime('9:75'), null);

// -- parseDayCodes ---------------------------------------------------------
eq('MWF', parseDayCodes('MWF').days, ['MO', 'WE', 'FR']);
eq('TuTh', parseDayCodes('TuTh').days, ['TU', 'TH']);
eq('TR is Tue/Thu', parseDayCodes('TR').days, ['TU', 'TH']);
eq('MTWRF', parseDayCodes('MTWRF').days, ['MO', 'TU', 'WE', 'TH', 'FR']);
eq('M/W/F slashes', parseDayCodes('M/W/F').days, ['MO', 'WE', 'FR']);
eq('Mon Wed', parseDayCodes('Mon Wed').days, ['MO', 'WE']);
eq('TH beats T+H', parseDayCodes('TH').days, ['TH']);
eq('duplicate warns', parseDayCodes('MTWTF').warnings.length > 0, true);

// -- parseMeetingPattern ---------------------------------------------------
eq('MWF lecture', parseMeetingPattern('MWF 9:30AM-10:20AM').time, { start: 570, end: 620 });
eq('MWF lecture days', parseMeetingPattern('MWF 9:30AM-10:20AM').days, ['MO', 'WE', 'FR']);
eq('TuTh spaced dashes',
  parseMeetingPattern('TuTh 1:00 PM - 2:20 PM').time, { start: 780, end: 860 });
eq('en dash separator',
  parseMeetingPattern('MW 9:30 AM – 10:50 AM').time, { start: 570, end: 650 });
eq('military range',
  parseMeetingPattern('TR 1300-1415').time, { start: 780, end: 855 });
eq('meridiem inherited from end',
  parseMeetingPattern('MW 1:00-2:20 PM').time, { start: 780, end: 860 });
eq('crossing noon without meridiem',
  parseMeetingPattern('F 11:00-1:20 PM').time, { start: 660, end: 800 });
eq('online is async', parseMeetingPattern('ONLINE').async, true);
eq('TBA is async', parseMeetingPattern('TBA').async, true);
eq('async has no days', parseMeetingPattern('ASYNC').days, []);
eq('empty is async', parseMeetingPattern('').async, true);
eq('unreadable warns', parseMeetingPattern('MWF potato').warnings.length > 0, true);

// -- interval algebra ------------------------------------------------------
eq('touching is not overlap',
  overlaps({ start: 540, end: 650 }, { start: 650, end: 700 }), false);
eq('real overlap',
  overlaps({ start: 540, end: 660 }, { start: 650, end: 700 }), true);
eq('subtract middle splits in two',
  subtract({ start: 0, end: 100 }, { start: 40, end: 60 }),
  [{ start: 0, end: 40 }, { start: 60, end: 100 }]);
eq('subtract covering yields nothing',
  subtract({ start: 40, end: 60 }, { start: 0, end: 100 }), []);
eq('subtract disjoint is identity',
  subtract({ start: 0, end: 10 }, { start: 50, end: 60 }), [{ start: 0, end: 10 }]);
eq('merge joins adjacent',
  merge([{ start: 0, end: 60 }, { start: 60, end: 120 }]), [{ start: 0, end: 120 }]);
eq('merge sorts unsorted input',
  merge([{ start: 100, end: 120 }, { start: 0, end: 30 }]),
  [{ start: 0, end: 30 }, { start: 100, end: 120 }]);
eq('subtractMany handles unsorted overlapping cuts',
  subtractMany({ start: 0, end: 100 },
    [{ start: 70, end: 80 }, { start: 10, end: 20 }, { start: 15, end: 30 }]),
  [{ start: 0, end: 10 }, { start: 30, end: 70 }, { start: 80, end: 100 }]);

// -- computeWorkHours ------------------------------------------------------
// Reaver's real fall 2026 Monday: COMP SCI 9:30-10:45, MATH 202 13:00-13:55,
// HUM STUD 14:30-15:35. Available to work 8:00-18:00. 15 minute commute.
const monday = computeWorkHours(
  [{ day: 'MO', start: 480, end: 1080 }],
  [
    { day: 'MO', start: 570, end: 645 },
    { day: 'MO', start: 780, end: 835 },
    { day: 'MO', start: 870, end: 935 },
  ],
  { commuteMinutes: 15, minShiftMinutes: 90 }
);
// 8:00-9:15 is 75 min, under the 90 min floor, so it is discarded.
// 11:00-12:45 is 105 min, usable.
// 13:00-14:15 gap between MATH end+15 and HUM start-15 is 20 min, discarded.
// 15:50-18:00 is 130 min, usable.
eq('monday usable windows', monday.byDay[0].usable,
  [{ start: 660, end: 765 }, { start: 950, end: 1080 }]);
eq('monday total hours', monday.totalHours, 3.92);
eq('monday fragments discarded', monday.byDay[0].discardedFragments.length, 2);

// Same day with no commute: the morning window grows past the 90-min floor.
const noCommute = computeWorkHours(
  [{ day: 'MO', start: 480, end: 1080 }],
  [{ day: 'MO', start: 570, end: 645 }],
  { commuteMinutes: 0, minShiftMinutes: 90 }
);
eq('no commute keeps morning', noCommute.byDay[0].usable[0], { start: 480, end: 570 });

// Commute makes back-to-back classes one solid block.
const backToBack = computeWorkHours(
  [{ day: 'TU', start: 480, end: 1080 }],
  [
    { day: 'TU', start: 540, end: 600 },
    { day: 'TU', start: 620, end: 700 },
  ],
  { commuteMinutes: 15, minShiftMinutes: 60 }
);
// 9:00-10:00 padded -> 8:45-10:15;  10:20-11:40 padded -> 10:05-11:55.
// Those overlap, so they merge into one 8:45-11:55 unavailable block.
// That leaves 8:00-8:45 (45 min, under the 60 min floor, discarded) and
// 11:55-18:00 (usable). The commute is what destroys the morning shift.
eq('padded classes merge into one block', backToBack.byDay[0].usable,
  [{ start: 715, end: 1080 }]);
eq('morning fragment discarded', backToBack.byDay[0].discardedFragments,
  [{ start: 480, end: 525 }]);

// Wage math.
const paid = computeWorkHours(
  [{ day: 'WE', start: 600, end: 960 }],
  [],
  { commuteMinutes: 0, minShiftMinutes: 60, hourlyWage: 16 }
);
eq('weekly pay', paid.estimatedWeeklyPay, 96);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
