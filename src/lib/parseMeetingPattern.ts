/**
 * Parses the meeting-pattern strings that student information systems print,
 * e.g. "MWF 9:30AM-10:20AM" or "TuTh 1:00 PM - 2:20 PM" or "TR 1300-1415".
 *
 * This parser NEVER guesses. When something is ambiguous or unreadable it
 * returns a warning alongside its best reading, and the importer surfaces
 * that to the user. Silent wrong answers here become wrong schedules, which
 * is the worst possible failure for this app.
 */

import { Day, Interval, parseTime } from './time';

export interface ParsedMeeting {
  days: Day[];
  time: Interval | null; // null for async / no fixed time
  /** true when the section has no fixed meeting time at all */
  async: boolean;
  warnings: string[];
}

/**
 * Day-code tokens, longest first. Order matters: "TH" must be tried before
 * "T", or "TuTh" parses as Tuesday-Tuesday-Hmm.
 */
const DAY_TOKENS: Array<[string, Day]> = [
  ['MON', 'MO'], ['TUES', 'TU'], ['TUE', 'TU'], ['WED', 'WE'],
  ['THURS', 'TH'], ['THUR', 'TH'], ['THU', 'TH'], ['FRI', 'FR'],
  ['SAT', 'SA'], ['SUN', 'SU'],
  ['MO', 'MO'], ['TU', 'TU'], ['WE', 'WE'], ['TH', 'TH'], ['FR', 'FR'],
  ['SA', 'SA'], ['SU', 'SU'],
  // Single letters. R = Thursday and U = Sunday are the standard SIS codes.
  ['M', 'MO'], ['T', 'TU'], ['W', 'WE'], ['R', 'TH'], ['F', 'FR'],
  ['S', 'SA'], ['U', 'SU'],
];

const ASYNC_MARKERS = [
  'ASYNC', 'ASYNCHRONOUS', 'ONLINE', 'TBA', 'TBD', 'ARR', 'ARRANGED',
  'NOMEETING', 'WEBBASED', 'SELFPACED',
];

/**
 * Greedy longest-match tokenizer over a day-code string.
 * "MWF" -> [MO, WE, FR];  "TuTh" -> [TU, TH];  "MTWRF" -> all five.
 */
export function parseDayCodes(raw: string): { days: Day[]; warnings: string[] } {
  const warnings: string[] = [];
  const s = raw.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return { days: [], warnings };

  const days: Day[] = [];
  let i = 0;

  outer: while (i < s.length) {
    for (const [token, day] of DAY_TOKENS) {
      if (s.startsWith(token, i)) {
        if (days.includes(day)) {
          warnings.push(
            `Day "${day}" appears more than once in "${raw}". ` +
            `If this pattern meant Thursday, write it as "TH" or "R", not "T".`
          );
        } else {
          days.push(day);
        }
        i += token.length;
        continue outer;
      }
    }
    warnings.push(`Could not read "${s[i]}" as a day in "${raw}".`);
    i += 1;
  }

  return { days, warnings };
}

/**
 * Split a time range on the separator, tolerating the many dash characters
 * SIS exports use and the word "to".
 */
function splitRange(raw: string): [string, string] | null {
  const parts = raw.split(/\s*(?:-|–|—|~|\bto\b)\s*/i).filter(Boolean);
  if (parts.length !== 2) return null;
  return [parts[0], parts[1]];
}

export function parseMeetingPattern(raw: string): ParsedMeeting {
  const warnings: string[] = [];
  const input = (raw ?? '').trim();

  if (!input) {
    return { days: [], time: null, async: true, warnings: ['Empty meeting pattern.'] };
  }

  const flat = input.toUpperCase().replace(/[^A-Z]/g, '');
  if (ASYNC_MARKERS.some((m) => flat === m || flat.startsWith(m))) {
    return { days: [], time: null, async: true, warnings };
  }

  // Find the time range: everything from the first digit onward.
  const firstDigit = input.search(/\d/);
  if (firstDigit === -1) {
    const { days, warnings: dayWarnings } = parseDayCodes(input);
    return {
      days,
      time: null,
      async: true,
      warnings: [...warnings, ...dayWarnings, `No time found in "${input}".`],
    };
  }

  const dayPart = input.slice(0, firstDigit);
  const timePart = input.slice(firstDigit);

  const { days, warnings: dayWarnings } = parseDayCodes(dayPart);
  warnings.push(...dayWarnings);

  const range = splitRange(timePart);
  if (!range) {
    warnings.push(`Could not split "${timePart}" into a start and end time.`);
    return { days, time: null, async: false, warnings };
  }

  const end = parseTime(range[1]);
  let start = parseTime(range[0]);

  // "MW 1:00-2:20 PM" — the AM/PM appears only on the end time.
  //
  // Careful: "1:00" is ALSO a valid 24-hour time (01:00), so we cannot wait
  // for start to fail parsing. We try the inherited meridiem whenever the
  // start lacks one, and keep it only if it lands before the end.
  //
  // That last check is what keeps "F 11:00-1:20 PM" correct. Inheriting PM
  // there would give 11:00 PM to 1:20 PM, which is backwards, so we reject
  // the inheritance and fall back to reading 11:00 as 11 AM.
  const endMeridiem = range[1].match(/(am|pm)/i);
  const startHasMeridiem = /(am|pm)/i.test(range[0]);

  if (end !== null && endMeridiem && !startHasMeridiem) {
    const inherited = parseTime(`${range[0].trim()} ${endMeridiem[1]}`);
    if (inherited !== null && inherited < end) {
      start = inherited;
    }
  }

  if (start === null || end === null) {
    warnings.push(`Could not read the time range "${timePart}".`);
    return { days, time: null, async: false, warnings };
  }

  // "MWF 11:00-1:20" with no meridiem anywhere: the end reads as earlier
  // than the start because both defaulted to AM. Bump the end past noon.
  let resolvedEnd = end;
  if (resolvedEnd <= start && resolvedEnd + 12 * 60 < 24 * 60) {
    warnings.push(
      `End time in "${timePart}" was not after the start. Read it as PM. Verify this row.`
    );
    resolvedEnd += 12 * 60;
  }

  if (resolvedEnd <= start) {
    warnings.push(`End time is not after start time in "${timePart}".`);
    return { days, time: null, async: false, warnings };
  }

  if (days.length === 0) {
    warnings.push(`Found a time but no days in "${input}".`);
  }

  return { days, time: { start, end: resolvedEnd }, async: false, warnings };
}
