/**
 * Glue between the API payload, the solver in src/lib, and what the week grid
 * needs to draw. Nothing in src/lib is modified; this only composes it.
 */

import { DAYS, merge, pad, subtractMany } from '@lib/time';
import type { Day, Interval } from '@lib/time';
import type { CandidateCourse, CandidateSection, ScheduleCandidate } from '@lib/generateSchedules';
import type { ClassBlock, WorkBlock, WorkHoursResult } from '@lib/workHours';
import type { ApiCourse, ApiSection } from './api';

/** Weekdays the UI offers. Saturday and Sunday are not in the demo dataset. */
export const WEEKDAYS: Day[] = ['MO', 'TU', 'WE', 'TH', 'FR'];

export const DAY_NAMES: Record<Day, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
};

/** One editable row of work availability. */
export interface Availability {
  // Whether the student can work this day at all.
  enabled: boolean;
  // Start of the window, minutes since midnight.
  start: number;
  // End of the window, minutes since midnight.
  end: number;
}

export type AvailabilityMap = Record<string, Availability>;

// --------------------------------------------------------------------------
// Formatting
// --------------------------------------------------------------------------

/** 570 -> "09:30", the value an <input type="time"> wants. */
export function toTimeValue(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/** "09:30" -> 570. Null when the browser hands back something unusable. */
export function fromTimeValue(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (match === null) {
    return null;
  }

  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) {
    return null;
  }

  return hours * 60 + mins;
}

/** 95 -> "1h 35m". Kept local so src/lib stays untouched. */
export function humanMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) {
    return `${mins}m`;
  }
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

export function humanHours(minutes: number): string {
  return `${(Math.round((minutes / 60) * 10) / 10).toFixed(1)}`;
}

export function courseLabel(course: ApiCourse): string {
  return `${course.subject} ${course.number}`;
}

export function sectionLabel(section: ApiSection): string {
  if (section.isSample === true) {
    return `${section.sectionCode} (sample)`;
  }
  return section.sectionCode;
}

/** A one-line description of when a section meets. */
export function sectionWhen(section: ApiSection): string {
  if (section.meetings.length === 0) {
    return 'no fixed meetings';
  }

  const parts: string[] = [];
  for (let i = 0; i < section.meetings.length; i++) {
    const meeting = section.meetings[i];
    parts.push(
      `${meeting.days.join('')} ${toTimeValue(meeting.startMin)}-${toTimeValue(meeting.endMin)}`
    );
  }

  return parts.join(', ');
}

// --------------------------------------------------------------------------
// Building solver input
// --------------------------------------------------------------------------

/**
 * Which sections to tick on first load.
 *
 * Everything that actually meets somewhere. Fully asynchronous sections are
 * left unticked on purpose: a schedule with no meetings trivially preserves
 * every work hour, would top the ranking, and would make the commute slider
 * do nothing. They stay one click away.
 */
export function defaultSelection(courses: ApiCourse[]): Record<string, string[]> {
  const selection: Record<string, string[]> = {};

  for (let i = 0; i < courses.length; i++) {
    const course = courses[i];
    const ids: string[] = [];

    for (let j = 0; j < course.sections.length; j++) {
      const section = course.sections[j];
      if (section.meetings.length > 0) {
        ids.push(section.id);
      }
    }

    selection[course.id] = ids;
  }

  return selection;
}

export function toCandidateCourses(
  courses: ApiCourse[],
  selection: Record<string, string[]>
): CandidateCourse[] {
  const candidates: CandidateCourse[] = [];

  for (let i = 0; i < courses.length; i++) {
    const course = courses[i];
    const chosen = selection[course.id] ?? [];
    const sections: CandidateSection[] = [];

    for (let j = 0; j < course.sections.length; j++) {
      const section = course.sections[j];
      if (chosen.includes(section.id) === true) {
        const meetings = [];
        for (let k = 0; k < section.meetings.length; k++) {
          const meeting = section.meetings[k];
          meetings.push({
            days: meeting.days as Day[],
            startMin: meeting.startMin,
            endMin: meeting.endMin,
          });
        }
        sections.push({ id: section.id, sectionCode: section.sectionCode, meetings });
      }
    }

    candidates.push({
      id: course.id,
      subject: course.subject,
      number: course.number,
      sections,
    });
  }

  return candidates;
}

/**
 * The sections the student is actually registered for: the real ones, as
 * opposed to the invented alternates. There is exactly one per course.
 *
 * This is deliberately independent of what is ticked in the course picker.
 * It is a fixed reference point, so the comparison against it survives the
 * student unticking things while exploring.
 */
export function registeredSections(courses: ApiCourse[]): ApiSection[] {
  const out: ApiSection[] = [];

  for (let i = 0; i < courses.length; i++) {
    const course = courses[i];
    for (let j = 0; j < course.sections.length; j++) {
      if (course.sections[j].isSample === false) {
        out.push(course.sections[j]);
      }
    }
  }

  return out;
}

export function sectionsToClassBlocks(sections: ApiSection[]): ClassBlock[] {
  const blocks: ClassBlock[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    for (let j = 0; j < section.meetings.length; j++) {
      const meeting = section.meetings[j];
      for (let k = 0; k < meeting.days.length; k++) {
        blocks.push({
          day: meeting.days[k] as Day,
          start: meeting.startMin,
          end: meeting.endMin,
        });
      }
    }
  }

  return blocks;
}

export function toWorkBlocks(availability: AvailabilityMap): WorkBlock[] {
  const blocks: WorkBlock[] = [];

  for (let i = 0; i < WEEKDAYS.length; i++) {
    const day = WEEKDAYS[i];
    const row = availability[day];
    if (row !== undefined && row.enabled === true && row.start < row.end) {
      blocks.push({ day, start: row.start, end: row.end });
    }
  }

  return blocks;
}

// --------------------------------------------------------------------------
// Week grid bands
// --------------------------------------------------------------------------

export type BandKind = 'class' | 'buffer' | 'usable' | 'sliver';

export interface Band extends Interval {
  // Which of the four visual states this band is.
  kind: BandKind;
  // Short text drawn inside the band when it is tall enough.
  label: string;
  // Hover text. Slivers explain why they are worthless.
  tooltip: string;
}

export interface DayBands {
  // The day these bands belong to.
  day: Day;
  // Every band, in no particular order; they never overlap within a kind.
  bands: Band[];
}

/**
 * Turn a scored schedule into the four kinds of band the grid draws.
 *
 * Commute buffers are derived rather than stored: they are the padded class
 * blocks minus the classes themselves, which is exactly the time the commute
 * consumes and the student cannot work.
 */
export function buildDayBands(
  candidate: ScheduleCandidate,
  work: WorkHoursResult,
  commuteMinutes: number,
  minShiftMinutes: number,
  sectionNames: Map<string, string>
): DayBands[] {
  // Class blocks per day, carrying the label to draw.
  const classesByDay = new Map<string, Array<Interval & { label: string }>>();

  for (let i = 0; i < candidate.sections.length; i++) {
    const chosen = candidate.sections[i];
    const label = sectionNames.get(chosen.section.id) ?? chosen.courseLabel;

    for (let j = 0; j < chosen.section.meetings.length; j++) {
      const meeting = chosen.section.meetings[j];
      for (let k = 0; k < meeting.days.length; k++) {
        const day = meeting.days[k];
        const list = classesByDay.get(day) ?? [];
        list.push({ start: meeting.startMin, end: meeting.endMin, label });
        classesByDay.set(day, list);
      }
    }
  }

  const out: DayBands[] = [];

  for (let i = 0; i < DAYS.length; i++) {
    const day = DAYS[i];
    const classes = classesByDay.get(day) ?? [];
    const dayResult = work.byDay.find((entry) => entry.day === day);
    // A day with neither classes nor work availability is not drawn at all.
    const dayIsUsed = classes.length > 0 || dayResult !== undefined;

    const bands: Band[] = [];

    for (let j = 0; j < classes.length; j++) {
      const block = classes[j];
      bands.push({
        start: block.start,
        end: block.end,
        kind: 'class',
        label: block.label,
        tooltip:
          `${block.label}: ${toTimeValue(block.start)}-${toTimeValue(block.end)}, ` +
          `${humanMinutes(block.end - block.start)} of class.`,
      });
    }

    // Buffers: padded classes minus the classes. Zero when the commute is 0.
    if (commuteMinutes > 0 && classes.length > 0) {
      const padded = merge(classes.map((block) => pad(block, commuteMinutes)));
      const solid = merge(classes.map((block) => ({ start: block.start, end: block.end })));

      for (let j = 0; j < padded.length; j++) {
        const pieces = subtractMany(padded[j], solid);
        for (let k = 0; k < pieces.length; k++) {
          bands.push({
            start: pieces[k].start,
            end: pieces[k].end,
            kind: 'buffer',
            label: 'commute',
            tooltip:
              `${humanMinutes(pieces[k].end - pieces[k].start)} of commute buffer. ` +
              `You cannot be at work during this.`,
          });
        }
      }
    }

    if (dayResult !== undefined) {
      for (let j = 0; j < dayResult.usable.length; j++) {
        const window = dayResult.usable[j];
        bands.push({
          start: window.start,
          end: window.end,
          kind: 'usable',
          label: humanMinutes(window.end - window.start),
          tooltip:
            `Workable shift: ${toTimeValue(window.start)}-${toTimeValue(window.end)}, ` +
            `${humanMinutes(window.end - window.start)}.`,
        });
      }

      for (let j = 0; j < dayResult.discardedFragments.length; j++) {
        const scrap = dayResult.discardedFragments[j];
        const length = scrap.end - scrap.start;
        bands.push({
          start: scrap.start,
          end: scrap.end,
          kind: 'sliver',
          label: humanMinutes(length),
          tooltip:
            `Wasted: ${humanMinutes(length)} free between ${toTimeValue(scrap.start)} and ` +
            `${toTimeValue(scrap.end)}, but your shortest shift is ${minShiftMinutes} minutes. ` +
            `Nobody schedules you for ${length} minutes, so this counts as zero.`,
        });
      }
    }

    if (dayIsUsed === true) {
      out.push({ day, bands });
    }
  }

  return out;
}

/**
 * Why a schedule sits where it does in the ranking, in one short phrase.
 */
export function rankReason(
  candidate: ScheduleCandidate,
  best: ScheduleCandidate,
  index: number,
  targetHoursPerWeek: number | undefined
): string {
  const parts: string[] = [];

  if (index === 0) {
    parts.push('Best available');
  } else {
    const behind = best.usableMinutes - candidate.usableMinutes;
    if (behind === 0) {
      parts.push('Ties the best on hours');
    } else {
      parts.push(`${humanMinutes(behind)} less than the best`);
    }
  }

  if (candidate.work.fragmentedMinutes > 0) {
    parts.push(`${humanMinutes(candidate.work.fragmentedMinutes)} lost to unusable slivers`);
  } else {
    parts.push('nothing wasted on slivers');
  }

  if (targetHoursPerWeek !== undefined && candidate.meetsTarget === false) {
    parts.push(`${candidate.shortfallHours}h short of your ${targetHoursPerWeek}h target`);
  }

  return parts.join(' - ');
}
