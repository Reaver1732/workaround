/**
 * Fall 2026 seed dataset.
 *
 * Meeting times are declared here the way a student information system prints
 * them ("MW 9:30AM-11:20AM") and run through parseMeetingPattern to produce
 * days/startMin/endMin. Two reasons:
 *
 *   1. Seed rows come out byte-identical to what the CSV importer will later
 *      produce from the same string, so the two paths cannot drift.
 *   2. It keeps the seed honest about what the parser actually does.
 *
 * Note the deliberate asymmetry with the importer. Per CLAUDE.md the importer
 * NEVER guesses: it surfaces warnings to the user and carries on with its best
 * reading. This seed does the opposite and throws on the first warning,
 * because a warning here means a hand-written seed string is wrong and a
 * developer should fix it now rather than ship a silently wrong dataset.
 *
 * TWO KINDS OF DATA LIVE HERE:
 *
 *   REAL      Five sections actually registered for fall 2026. They carry a
 *             real classNbr and a numeric sectionCode ("0002").
 *   SAMPLE    Alternates invented to give the solver a search space. They
 *             carry classNbr = null and a sectionCode prefixed "ALT".
 *             They are NOT real UWGB offerings. Do not show them to anyone
 *             as if they were.
 *
 * The schema has no boolean column for this, so `classNbr IS NULL` and the
 * "ALT" prefix are the only in-database markers.
 *
 * Run (after prisma generate + migrate): npx tsx prisma/seed.ts
 */

import { PrismaClient, Mode, MeetingKind } from '@prisma/client';
import { parseMeetingPattern } from '../src/lib/parseMeetingPattern';
import { computeWorkHours } from '../src/lib/workHours';
import { formatDuration } from '../src/lib/time';
// Type-only: esbuild cannot tell these are types, and a value import of them
// would fail at runtime with "does not provide an export named ...".
import type { ClassBlock, WorkBlock } from '../src/lib/workHours';
import type { WorkHoursResult } from '../src/lib/workHours';
import type { Day } from '../src/lib/time';

// The one term this dataset covers.
const TERM = 'FALL2026';

// Prefix that marks a section as invented sample data rather than a real
// fall 2026 offering.
const SAMPLE_PREFIX = 'ALT';

// --------------------------------------------------------------------------
// Seed data shapes
// --------------------------------------------------------------------------

interface SeedMeeting {
  // Meeting pattern exactly as an SIS would print it.
  pattern: string;
  // Lecture, lab, discussion, seminar.
  kind: MeetingKind;
  // Building name, or null when unknown or not applicable.
  building: string | null;
  // Room number, or null when unknown or not applicable.
  room: string | null;
}

interface SeedSection {
  // Registration code shown to students. Real ones are numeric and
  // zero-padded; sample ones start with SAMPLE_PREFIX.
  sectionCode: string;
  // SIS class number. Set only on the five really-registered sections.
  classNbr: string | null;
  // Instructor of record, or null for "Staff".
  instructor: string | null;
  // Delivery mode. ONLINE_ASYNC must carry zero meetings.
  mode: Mode;
  // Every meeting pattern for this section. A lecture plus a lab is two entries.
  meetings: SeedMeeting[];
}

interface SeedCourse {
  // Subject code as the SIS prints it.
  subject: string;
  // Catalog number, as a string.
  number: string;
  // Full catalog title.
  title: string;
  // Credit hours awarded.
  credits: number;
  // Every offered section: one real, three sample.
  sections: SeedSection[];
}

// --------------------------------------------------------------------------
// The catalog
// --------------------------------------------------------------------------

const CATALOG: SeedCourse[] = [
  {
    subject: 'COMP SCI',
    number: '120',
    title: 'Web Programming',
    credits: 3,
    sections: [
      {
        // REAL. As registered.
        sectionCode: '0002',
        classNbr: '2675',
        instructor: null,
        mode: Mode.IN_PERSON,
        meetings: [
          { pattern: 'MW 9:30AM-11:20AM', kind: MeetingKind.LECTURE, building: 'MAC', room: '122' },
        ],
      },
      {
        // SAMPLE. Both alternate schedules below take this one, so it is the
        // fixed point that makes their calendars look so similar.
        sectionCode: `${SAMPLE_PREFIX}1`,
        classNbr: null,
        instructor: null,
        mode: Mode.IN_PERSON,
        meetings: [
          { pattern: 'MW 8:00AM-9:50AM', kind: MeetingKind.LECTURE, building: 'MAC', room: '122' },
        ],
      },
      {
        // SAMPLE. Lecture plus a separate Friday lab on one section.
        sectionCode: `${SAMPLE_PREFIX}2`,
        classNbr: null,
        instructor: null,
        mode: Mode.IN_PERSON,
        meetings: [
          { pattern: 'TuTh 2:00PM-3:20PM', kind: MeetingKind.LECTURE, building: 'MAC', room: '122' },
          { pattern: 'F 1:00PM-2:50PM', kind: MeetingKind.LAB, building: 'MAC', room: '118' },
        ],
      },
      {
        // SAMPLE. Fully asynchronous, so zero meetings by design.
        sectionCode: `${SAMPLE_PREFIX}3`,
        classNbr: null,
        instructor: null,
        mode: Mode.ONLINE_ASYNC,
        meetings: [],
      },
    ],
  },

  {
    subject: 'COMM',
    number: '133',
    title: 'Fundamentals of Public Address',
    credits: 3,
    sections: [
      {
        // REAL. As registered.
        sectionCode: '0002',
        classNbr: '1250',
        instructor: null,
        mode: Mode.IN_PERSON,
        meetings: [
          { pattern: 'TuTh 9:30AM-10:50AM', kind: MeetingKind.LECTURE, building: 'MAC', room: '221' },
        ],
      },
      {
        // SAMPLE. Fifteen minutes earlier than ALT2 and that is the whole
        // difference between a workable Tuesday and a shredded one.
        sectionCode: `${SAMPLE_PREFIX}1`,
        classNbr: null,
        instructor: null,
        mode: Mode.IN_PERSON,
        meetings: [
          { pattern: 'TuTh 9:45AM-11:05AM', kind: MeetingKind.LECTURE, building: 'MAC', room: '221' },
        ],
      },
      {
        // SAMPLE.
        sectionCode: `${SAMPLE_PREFIX}2`,
        classNbr: null,
        instructor: null,
        mode: Mode.IN_PERSON,
        meetings: [
          { pattern: 'TuTh 10:00AM-11:20AM', kind: MeetingKind.LECTURE, building: 'MAC', room: '221' },
        ],
      },
      {
        // SAMPLE.
        sectionCode: `${SAMPLE_PREFIX}3`,
        classNbr: null,
        instructor: null,
        mode: Mode.ONLINE_ASYNC,
        meetings: [],
      },
    ],
  },

  {
    subject: 'MATH',
    number: '202',
    title: 'Calculus and Analytic Geometry I',
    credits: 4,
    sections: [
      {
        // REAL. As registered.
        sectionCode: '0003',
        classNbr: '1769',
        instructor: null,
        mode: Mode.IN_PERSON,
        meetings: [
          { pattern: 'MWF 12:45PM-2:05PM', kind: MeetingKind.LECTURE, building: 'MAC', room: '217' },
        ],
      },
      {
        // SAMPLE.
        sectionCode: `${SAMPLE_PREFIX}1`,
        classNbr: null,
        instructor: null,
        mode: Mode.IN_PERSON,
        meetings: [
          { pattern: 'MWF 11:45AM-1:05PM', kind: MeetingKind.LECTURE, building: 'MAC', room: '217' },
        ],
      },
      {
        // SAMPLE.
        sectionCode: `${SAMPLE_PREFIX}2`,
        classNbr: null,
        instructor: null,
        mode: Mode.IN_PERSON,
        meetings: [
          { pattern: 'MWF 12:00PM-1:20PM', kind: MeetingKind.LECTURE, building: 'MAC', room: '217' },
        ],
      },
      {
        // SAMPLE. Meets live online: a real time block, but no room.
        sectionCode: `${SAMPLE_PREFIX}3`,
        classNbr: null,
        instructor: null,
        mode: Mode.ONLINE_SYNC,
        meetings: [
          { pattern: 'TuTh 6:00PM-7:50PM', kind: MeetingKind.LECTURE, building: null, room: null },
        ],
      },
    ],
  },

  {
    subject: 'WF',
    number: '100',
    title: 'First Year Writing',
    credits: 3,
    sections: [
      {
        // REAL. As registered.
        sectionCode: '0008',
        classNbr: '2387',
        instructor: null,
        mode: Mode.IN_PERSON,
        meetings: [
          { pattern: 'TuTh 12:30PM-1:50PM', kind: MeetingKind.LECTURE, building: 'MAC', room: '224' },
        ],
      },
      {
        // SAMPLE.
        sectionCode: `${SAMPLE_PREFIX}1`,
        classNbr: null,
        instructor: null,
        mode: Mode.IN_PERSON,
        meetings: [
          { pattern: 'TuTh 1:10PM-2:30PM', kind: MeetingKind.LECTURE, building: 'MAC', room: '224' },
        ],
      },
      {
        // SAMPLE.
        sectionCode: `${SAMPLE_PREFIX}2`,
        classNbr: null,
        instructor: null,
        mode: Mode.IN_PERSON,
        meetings: [
          { pattern: 'TuTh 1:30PM-2:50PM', kind: MeetingKind.LECTURE, building: 'MAC', room: '224' },
        ],
      },
      {
        // SAMPLE.
        sectionCode: `${SAMPLE_PREFIX}3`,
        classNbr: null,
        instructor: null,
        mode: Mode.ONLINE_ASYNC,
        meetings: [],
      },
    ],
  },

  {
    subject: 'HUM STUD',
    number: '198',
    title: 'First Year Seminar',
    credits: 3,
    sections: [
      {
        // REAL. As registered.
        sectionCode: '0002',
        classNbr: '2230',
        instructor: null,
        mode: Mode.IN_PERSON,
        meetings: [
          { pattern: 'MW 2:15PM-3:35PM', kind: MeetingKind.LECTURE, building: 'MAC', room: '225' },
        ],
      },
      {
        // SAMPLE.
        sectionCode: `${SAMPLE_PREFIX}1`,
        classNbr: null,
        instructor: null,
        mode: Mode.IN_PERSON,
        meetings: [
          { pattern: 'MW 3:00PM-4:20PM', kind: MeetingKind.SEMINAR, building: 'MAC', room: '225' },
        ],
      },
      {
        // SAMPLE.
        sectionCode: `${SAMPLE_PREFIX}2`,
        classNbr: null,
        instructor: null,
        mode: Mode.IN_PERSON,
        meetings: [
          { pattern: 'MW 2:00PM-3:20PM', kind: MeetingKind.SEMINAR, building: 'MAC', room: '225' },
        ],
      },
      {
        // SAMPLE. Lecture plus a short Friday discussion on one section.
        sectionCode: `${SAMPLE_PREFIX}3`,
        classNbr: null,
        instructor: null,
        mode: Mode.HYBRID,
        meetings: [
          { pattern: 'MW 8:00AM-9:20AM', kind: MeetingKind.LECTURE, building: 'MAC', room: '225' },
          { pattern: 'F 9:00AM-9:50AM', kind: MeetingKind.DISCUSSION, building: 'MAC', room: '225' },
        ],
      },
    ],
  },
];

// --------------------------------------------------------------------------
// The demo student
// --------------------------------------------------------------------------

// When the student is able to be at work: 8:00 AM to 6:00 PM, Monday to Friday.
const WORK_BLOCKS: WorkBlock[] = [
  { day: 'MO', start: 480, end: 1080 },
  { day: 'TU', start: 480, end: 1080 },
  { day: 'WE', start: 480, end: 1080 },
  { day: 'TH', start: 480, end: 1080 },
  { day: 'FR', start: 480, end: 1080 },
];

// Shortest block the employer will actually put on the schedule.
const MIN_SHIFT_MINUTES = 90;

// The commute the headline finding is stated at.
const HEADLINE_COMMUTE_MINUTES = 20;

interface Pick {
  // Subject of the course being picked.
  subject: string;
  // Catalog number of the course being picked.
  number: string;
  // Which section of it this schedule takes.
  sectionCode: string;
}

interface DemoSchedule {
  // Short label used in the printed comparison.
  label: string;
  // One line of explanation for the printed comparison.
  note: string;
  // One section per course.
  picks: Pick[];
}

/**
 * Schedule A is what the student actually registered for. B and C are built
 * from sample alternates.
 *
 * B and C are the point of the whole app. They free up exactly the same amount
 * of raw time, to the minute. B chops it into pieces just under the shift
 * floor and it is worth nothing; C leaves it in blocks that clear the floor.
 * A calendar cannot tell them apart. A paycheck can.
 */
const DEMO_SCHEDULES: DemoSchedule[] = [
  {
    label: 'A  as registered',
    note: 'the five real fall 2026 sections',
    picks: [
      { subject: 'COMP SCI', number: '120', sectionCode: '0002' },
      { subject: 'COMM', number: '133', sectionCode: '0002' },
      { subject: 'MATH', number: '202', sectionCode: '0003' },
      { subject: 'WF', number: '100', sectionCode: '0008' },
      { subject: 'HUM STUD', number: '198', sectionCode: '0002' },
    ],
  },
  {
    label: 'B  sample, fragmented',
    note: 'same free time as C, sliced just below the 90-minute floor',
    picks: [
      { subject: 'COMP SCI', number: '120', sectionCode: `${SAMPLE_PREFIX}1` },
      { subject: 'COMM', number: '133', sectionCode: `${SAMPLE_PREFIX}1` },
      { subject: 'MATH', number: '202', sectionCode: `${SAMPLE_PREFIX}1` },
      { subject: 'WF', number: '100', sectionCode: `${SAMPLE_PREFIX}1` },
      { subject: 'HUM STUD', number: '198', sectionCode: `${SAMPLE_PREFIX}1` },
    ],
  },
  {
    label: 'C  sample, consolidated',
    note: 'same free time as B, in blocks long enough to be shifts',
    picks: [
      { subject: 'COMP SCI', number: '120', sectionCode: `${SAMPLE_PREFIX}1` },
      { subject: 'COMM', number: '133', sectionCode: `${SAMPLE_PREFIX}2` },
      { subject: 'MATH', number: '202', sectionCode: `${SAMPLE_PREFIX}2` },
      { subject: 'WF', number: '100', sectionCode: `${SAMPLE_PREFIX}2` },
      { subject: 'HUM STUD', number: '198', sectionCode: `${SAMPLE_PREFIX}2` },
    ],
  },
];

// --------------------------------------------------------------------------
// Asserted facts
//
// These are measured values, not guesses. If a refactor of src/lib moves any
// of them the seed fails instead of quietly reporting different numbers.
// --------------------------------------------------------------------------

interface BaselineExpectation {
  // Commute to evaluate the as-registered schedule at.
  commuteMinutes: number;
  // Exact usable minutes expected at that commute.
  usableMinutes: number;
  // The same figure in hours, as computeWorkHours rounds it.
  usableHours: number;
}

const BASELINE_EXPECTATIONS: BaselineExpectation[] = [
  { commuteMinutes: 0, usableMinutes: 1870, usableHours: 31.17 },
  { commuteMinutes: 15, usableMinutes: 1220, usableHours: 20.33 },
  { commuteMinutes: 20, usableMinutes: 1190, usableHours: 19.83 },
  { commuteMinutes: 30, usableMinutes: 1130, usableHours: 18.83 },
];

// A 20-minute commute has to cost at least this many hours MORE than the
// driving itself, or the headline finding has stopped being true.
const MIN_CLIFF_GAP_HOURS = 7;

// C may free up at most this many more raw minutes per day than B. The claim
// is that they are near-identical on a calendar, so this stays small.
const MAX_RAW_SPREAD_PER_DAY = 15;

// C has to convert that identical raw time into at least this many more
// usable minutes per day than B.
const MIN_USABLE_GAIN_PER_DAY = 150;

// On Mon and Wed the as-registered schedule leaves exactly this window free
// between COMP SCI 120 (ends 11:20 AM) and MATH 202 (starts 12:45 PM). It is
// 85 minutes: five minutes under the 90-minute shift floor, at a ZERO-minute
// commute. Before a single mile is driven, that time is already worthless.
const KNOWN_SLIVER = { day: 'MO', start: 680, end: 765 };

// --------------------------------------------------------------------------
// Validation helpers
// --------------------------------------------------------------------------

function assertSame(label: string, actual: number, expected: number): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, measured ${actual}`);
  }
}

/**
 * Turn one SIS-style pattern string into the columns Meeting stores.
 * Throws on anything the parser is not completely sure about.
 */
function toMeetingRow(sectionLabel: string, meeting: SeedMeeting) {
  const parsed = parseMeetingPattern(meeting.pattern);

  if (parsed.warnings.length > 0) {
    throw new Error(
      `${sectionLabel}: pattern "${meeting.pattern}" produced warnings: ` +
      parsed.warnings.join(' | ')
    );
  }
  if (parsed.async === true || parsed.time === null) {
    throw new Error(
      `${sectionLabel}: pattern "${meeting.pattern}" has no fixed time. ` +
      `A section with no fixed time must declare zero meetings instead.`
    );
  }
  if (parsed.days.length === 0) {
    throw new Error(`${sectionLabel}: pattern "${meeting.pattern}" produced no days.`);
  }

  return {
    days: parsed.days,
    startMin: parsed.time.start,
    endMin: parsed.time.end,
    kind: meeting.kind,
    building: meeting.building,
    room: meeting.room,
  };
}

/**
 * Enforce two invariants the schema cannot express: ONLINE_ASYNC means zero
 * Meeting rows, and only really-registered sections carry a classNbr.
 */
function assertSectionSane(sectionLabel: string, section: SeedSection): void {
  if (section.mode === Mode.ONLINE_ASYNC && section.meetings.length > 0) {
    throw new Error(`${sectionLabel}: ONLINE_ASYNC sections must have zero meetings.`);
  }
  if (section.mode !== Mode.ONLINE_ASYNC && section.meetings.length === 0) {
    throw new Error(`${sectionLabel}: only ONLINE_ASYNC sections may have zero meetings.`);
  }

  const isSample = section.sectionCode.startsWith(SAMPLE_PREFIX);
  if (isSample === true && section.classNbr !== null) {
    throw new Error(
      `${sectionLabel}: sample sections must have classNbr = null. ` +
      `A class number implies this is a real offering.`
    );
  }
  if (isSample === false && section.classNbr === null) {
    throw new Error(
      `${sectionLabel}: real sections must carry their classNbr. ` +
      `If this is invented data, prefix the section code with "${SAMPLE_PREFIX}".`
    );
  }
}

// --------------------------------------------------------------------------
// Seeding
// --------------------------------------------------------------------------

async function seedCatalog(client: PrismaClient): Promise<void> {
  for (let i = 0; i < CATALOG.length; i++) {
    const courseSeed = CATALOG[i];

    const course = await client.course.upsert({
      where: { subject_number: { subject: courseSeed.subject, number: courseSeed.number } },
      update: { title: courseSeed.title, credits: courseSeed.credits },
      create: {
        subject: courseSeed.subject,
        number: courseSeed.number,
        title: courseSeed.title,
        credits: courseSeed.credits,
      },
    });

    for (let j = 0; j < courseSeed.sections.length; j++) {
      const sectionSeed = courseSeed.sections[j];
      const sectionLabel =
        `${courseSeed.subject} ${courseSeed.number} ${sectionSeed.sectionCode}`;

      assertSectionSane(sectionLabel, sectionSeed);

      const rows = [];
      for (let k = 0; k < sectionSeed.meetings.length; k++) {
        rows.push(toMeetingRow(sectionLabel, sectionSeed.meetings[k]));
      }

      const section = await client.section.upsert({
        where: {
          term_courseId_sectionCode: {
            term: TERM,
            courseId: course.id,
            sectionCode: sectionSeed.sectionCode,
          },
        },
        update: {
          classNbr: sectionSeed.classNbr,
          instructor: sectionSeed.instructor,
          mode: sectionSeed.mode,
        },
        create: {
          courseId: course.id,
          sectionCode: sectionSeed.sectionCode,
          classNbr: sectionSeed.classNbr,
          term: TERM,
          instructor: sectionSeed.instructor,
          mode: sectionSeed.mode,
        },
      });

      // Meetings have no natural key, so replace them wholesale. This is what
      // keeps the seed safe to re-run.
      await client.meeting.deleteMany({ where: { sectionId: section.id } });

      for (let k = 0; k < rows.length; k++) {
        await client.meeting.create({ data: { sectionId: section.id, ...rows[k] } });
      }

      let origin = 'SAMPLE';
      if (sectionSeed.classNbr !== null) {
        origin = 'REAL  ';
      }
      console.log(
        `  ${origin}  ${sectionLabel.padEnd(22)} ${sectionSeed.mode.padEnd(13)} ` +
        `${rows.length} meeting(s)`
      );
    }
  }
}

// --------------------------------------------------------------------------
// Reading schedules back out
// --------------------------------------------------------------------------

/**
 * Expand stored Meeting rows into one ClassBlock per day, which is the shape
 * computeWorkHours consumes.
 */
function toClassBlocks(
  meetings: Array<{ days: string[]; startMin: number; endMin: number }>
): ClassBlock[] {
  const blocks: ClassBlock[] = [];

  for (let i = 0; i < meetings.length; i++) {
    const meeting = meetings[i];
    for (let j = 0; j < meeting.days.length; j++) {
      blocks.push({
        day: meeting.days[j] as Day,
        start: meeting.startMin,
        end: meeting.endMin,
      });
    }
  }

  return blocks;
}

async function loadSchedule(client: PrismaClient, picks: Pick[]): Promise<ClassBlock[]> {
  const blocks: ClassBlock[] = [];

  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i];

    const section = await client.section.findFirst({
      where: {
        term: TERM,
        sectionCode: pick.sectionCode,
        course: { subject: pick.subject, number: pick.number },
      },
      include: { meetings: true },
    });

    if (section === null) {
      throw new Error(
        `Demo references a section that was not seeded: ` +
        `${pick.subject} ${pick.number} ${pick.sectionCode}`
      );
    }

    const expanded = toClassBlocks(section.meetings);
    for (let j = 0; j < expanded.length; j++) {
      blocks.push(expanded[j]);
    }
  }

  return blocks;
}

function score(classBlocks: ClassBlock[], commuteMinutes: number): WorkHoursResult {
  return computeWorkHours(WORK_BLOCKS, classBlocks, {
    commuteMinutes,
    minShiftMinutes: MIN_SHIFT_MINUTES,
  });
}

/**
 * Free minutes before the shift floor is applied: what a calendar would show
 * as empty. The gap between this and totalMinutes is the app's entire thesis.
 */
function rawFreeMinutes(result: WorkHoursResult): number {
  return result.totalMinutes + result.fragmentedMinutes;
}

// --------------------------------------------------------------------------
// 1. The as-registered baseline, by commute
// --------------------------------------------------------------------------

function verifyBaselineByCommute(baseline: ClassBlock[]): void {
  console.log('\nAS REGISTERED, by commute (work Mon-Fri 8:00 AM - 6:00 PM, 90-min floor)');
  console.log('  commute   usable        raw free   lost to slivers');

  for (let i = 0; i < BASELINE_EXPECTATIONS.length; i++) {
    const expected = BASELINE_EXPECTATIONS[i];
    const result = score(baseline, expected.commuteMinutes);

    console.log(
      `  ${String(expected.commuteMinutes).padStart(2)} min` +
      `    ${String(result.totalHours).padStart(5)} h` +
      `     ${formatDuration(rawFreeMinutes(result)).padStart(8)}` +
      `   ${formatDuration(result.fragmentedMinutes).padStart(8)}`
    );

    assertSame(
      `baseline usable minutes at commute ${expected.commuteMinutes}`,
      result.totalMinutes,
      expected.usableMinutes
    );
    assertSame(
      `baseline usable hours at commute ${expected.commuteMinutes}`,
      result.totalHours,
      expected.usableHours
    );
  }
}

// --------------------------------------------------------------------------
// 2. The commute cliff
// --------------------------------------------------------------------------

/**
 * The headline finding. A 20-minute commute costs far more usable work time
 * than it costs driving time, because every buffer it inserts can push a
 * surviving block under the shift floor and delete it outright.
 */
function verifyCommuteCliff(baseline: ClassBlock[]): void {
  const withoutCommute = score(baseline, 0);
  const withCommute = score(baseline, HEADLINE_COMMUTE_MINUTES);

  // Days the student sets foot on campus, and therefore drives.
  const campusDays = new Set<Day>();
  for (let i = 0; i < baseline.length; i++) {
    campusDays.add(baseline[i].day);
  }

  // Round trips are two commutes per campus day.
  const drivingMinutes = campusDays.size * 2 * HEADLINE_COMMUTE_MINUTES;
  const lostMinutes = withoutCommute.totalMinutes - withCommute.totalMinutes;
  const gapMinutes = lostMinutes - drivingMinutes;

  console.log(`\nTHE COMMUTE CLIFF at ${HEADLINE_COMMUTE_MINUTES} minutes`);
  console.log(`  usable work lost      ${formatDuration(lostMinutes)}`);
  console.log(`  actually spent driving ${formatDuration(drivingMinutes)}` +
    `  (${campusDays.size} campus days, round trip)`);
  console.log(`  unexplained by driving ${formatDuration(gapMinutes)}`);
  console.log(`  A 20-minute drive deletes ${Math.round((lostMinutes / drivingMinutes) * 10) / 10}x`);
  console.log(`  its own length in work time.`);

  if (gapMinutes / 60 <= MIN_CLIFF_GAP_HOURS) {
    throw new Error(
      `The commute cliff has flattened. Lost ${lostMinutes} min against ` +
      `${drivingMinutes} min of driving is a gap of ${gapMinutes / 60} h, ` +
      `and it needs to stay above ${MIN_CLIFF_GAP_HOURS} h.`
    );
  }
}

// --------------------------------------------------------------------------
// 4. The 85-minute sliver that exists before anyone drives anywhere
// --------------------------------------------------------------------------

function verifyKnownSliver(baseline: ClassBlock[]): void {
  const result = score(baseline, 0);
  // Days on which the known sliver was found in discardedFragments.
  const found: Day[] = [];

  for (let i = 0; i < result.byDay.length; i++) {
    const day = result.byDay[i];
    for (let j = 0; j < day.discardedFragments.length; j++) {
      const fragment = day.discardedFragments[j];
      if (fragment.start === KNOWN_SLIVER.start && fragment.end === KNOWN_SLIVER.end) {
        found.push(day.day);
      }
    }
  }

  console.log(`\nTHE GAP THAT WAS NEVER USABLE`);
  console.log(
    `  COMP SCI 120 ends 11:20 AM, MATH 202 starts 12:45 PM: ` +
    `${KNOWN_SLIVER.end - KNOWN_SLIVER.start} minutes.`
  );
  console.log(
    `  At a ZERO-minute commute that is still 5 minutes under the ` +
    `${MIN_SHIFT_MINUTES}-minute floor,`
  );
  console.log(`  and it is discarded on ${found.join(' and ')}.`);

  if (found.length < 2) {
    throw new Error(
      `Expected the 85-minute gap to be discarded on both Mon and Wed at zero ` +
      `commute. Found it on: ${JSON.stringify(found)}`
    );
  }
}

// --------------------------------------------------------------------------
// 3. A / B / C
// --------------------------------------------------------------------------

async function verifyAlternates(client: PrismaClient): Promise<void> {
  // Scored result for each demo schedule, in declaration order.
  const results: WorkHoursResult[] = [];

  console.log(`\nSECTION SWAPS at a ${HEADLINE_COMMUTE_MINUTES}-minute commute`);

  for (let i = 0; i < DEMO_SCHEDULES.length; i++) {
    const schedule = DEMO_SCHEDULES[i];
    const blocks = await loadSchedule(client, schedule.picks);
    const result = score(blocks, HEADLINE_COMMUTE_MINUTES);
    results.push(result);

    console.log(`\n  ${schedule.label}`);
    console.log(`  ${schedule.note}`);
    console.log(
      `    raw free ${formatDuration(rawFreeMinutes(result))}` +
      `   usable ${formatDuration(result.totalMinutes)}` +
      `   thrown away ${formatDuration(result.fragmentedMinutes)}`
    );

    for (let j = 0; j < result.byDay.length; j++) {
      const day = result.byDay[j];
      console.log(
        `      ${day.day}  ${String(day.usable.length)} shift(s) ` +
        `${formatDuration(day.minutes).padStart(7)}   ` +
        `${String(day.discardedFragments.length)} sliver(s)`
      );
    }
  }

  const b = results[1];
  const c = results[2];
  const days = WORK_BLOCKS.length;
  const rawSpreadPerDay = Math.abs(rawFreeMinutes(c) - rawFreeMinutes(b)) / days;
  const usableGainPerDay = (c.totalMinutes - b.totalMinutes) / days;

  console.log(`\n  B and C free up the same time and are worth wildly different amounts:`);
  console.log(`    raw free time apart   ${rawSpreadPerDay} min/day  (limit ${MAX_RAW_SPREAD_PER_DAY})`);
  console.log(`    usable time C gains   ${usableGainPerDay} min/day  (need ${MIN_USABLE_GAIN_PER_DAY}+)`);
  console.log(
    `    over a week that is ${formatDuration(c.totalMinutes - b.totalMinutes)} ` +
    `of work, from five dropdowns.`
  );

  if (rawSpreadPerDay > MAX_RAW_SPREAD_PER_DAY) {
    throw new Error(
      `B and C no longer look alike: their raw free time differs by ` +
      `${rawSpreadPerDay} min/day, over the ${MAX_RAW_SPREAD_PER_DAY} limit.`
    );
  }
  if (usableGainPerDay < MIN_USABLE_GAIN_PER_DAY) {
    throw new Error(
      `C only beats B by ${usableGainPerDay} min/day of usable work, ` +
      `under the ${MIN_USABLE_GAIN_PER_DAY} needed to make the point.`
    );
  }
}

// --------------------------------------------------------------------------

async function main(): Promise<void> {
  const client = new PrismaClient();

  try {
    console.log(`Seeding ${TERM}...`);
    await seedCatalog(client);

    const baseline = await loadSchedule(client, DEMO_SCHEDULES[0].picks);

    verifyBaselineByCommute(baseline);
    verifyCommuteCliff(baseline);
    verifyKnownSliver(baseline);
    await verifyAlternates(client);

    console.log('\nDone. Every asserted figure above was measured, not assumed.');
  } finally {
    await client.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
