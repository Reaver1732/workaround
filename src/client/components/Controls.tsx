/**
 * Everything the student can change. The drive time slider is deliberately the
 * largest control on the page: it is the one number every other planner
 * pretends is zero.
 *
 * Both sliders carry a number box beside them. The slider track is sized for
 * the range people actually drag through, and the box takes the values past
 * the end of it without stretching the track and ruining fine control where it
 * matters.
 */

import type { FocusEvent } from 'react';

import type { ApiCourse } from '../api';
import {
  DAY_NAMES,
  WEEKDAYS,
  courseLabel,
  fromTimeValue,
  sectionLabel,
  sectionWhen,
  toTimeValue,
} from '../model';
import type { AvailabilityMap } from '../model';

interface Props {
  commuteMinutes: number;
  onCommuteChange: (value: number) => void;
  minShiftMinutes: number;
  onMinShiftChange: (value: number) => void;
  availability: AvailabilityMap;
  onAvailabilityChange: (next: AvailabilityMap) => void;
  // Raw text, so the field can be emptied while it is being edited.
  targetHoursPerWeek: string;
  onTargetChange: (value: string) => void;
  hourlyWage: string;
  onWageChange: (value: string) => void;
  courses: ApiCourse[];
  selection: Record<string, string[]>;
  onSelectionChange: (next: Record<string, string[]>) => void;
}

/** step= on <input type="time"> is in seconds, so 15 minutes is 900. */
const QUARTER_HOUR_SECONDS = 900;

// How far each slider track runs, and how far the box beside it will go.
const COMMUTE_SLIDER_MAX = 60;
const COMMUTE_MAX = 120;
const MIN_SHIFT_SLIDER_MAX = 180;
const MIN_SHIFT_MAX = 240;

function clampMinutes(value: number, max: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > max) {
    return max;
  }
  return value;
}

/** Parsed minutes, or null when the box holds something we cannot use yet. */
function parseMinutes(text: string, max: number): number | null {
  if (text.trim() === '') {
    return null;
  }

  const value = Number(text);
  if (Number.isFinite(value) === false) {
    return null;
  }

  return clampMinutes(Math.round(value), max);
}

export default function Controls(props: Props) {
  // Typing over a number box should replace it, not append to it.
  function selectOnFocus(event: FocusEvent<HTMLInputElement>) {
    event.target.select();
  }

  function setDay(day: string, patch: Partial<{ enabled: boolean; start: number; end: number }>) {
    const next: AvailabilityMap = { ...props.availability };
    next[day] = { ...next[day], ...patch };
    props.onAvailabilityChange(next);
  }

  function toggleSection(courseId: string, sectionId: string) {
    const current = props.selection[courseId] ?? [];
    const next: string[] = [];
    let removed = false;

    for (let i = 0; i < current.length; i++) {
      if (current[i] === sectionId) {
        removed = true;
      } else {
        next.push(current[i]);
      }
    }

    if (removed === false) {
      next.push(sectionId);
    }

    props.onSelectionChange({ ...props.selection, [courseId]: next });
  }

  const availabilityRows = [];
  for (let i = 0; i < WEEKDAYS.length; i++) {
    const day = WEEKDAYS[i];
    const row = props.availability[day];

    availabilityRows.push(
      <div key={day} className="flex items-center gap-2 text-sm">
        <label className="flex w-28 items-center gap-2">
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(event) => setDay(day, { enabled: event.target.checked })}
            className="h-4 w-4 accent-emerald-600"
          />
          <span className="text-slate-700">{DAY_NAMES[day]}</span>
        </label>
        <input
          type="time"
          step={QUARTER_HOUR_SECONDS}
          value={toTimeValue(row.start)}
          disabled={row.enabled === false}
          onChange={(event) => {
            const parsed = fromTimeValue(event.target.value);
            if (parsed !== null) {
              setDay(day, { start: parsed });
            }
          }}
          className="rounded border border-slate-300 px-2 py-1 disabled:bg-slate-100 disabled:text-slate-400"
        />
        <span className="text-slate-400">to</span>
        <input
          type="time"
          step={QUARTER_HOUR_SECONDS}
          value={toTimeValue(row.end)}
          disabled={row.enabled === false}
          onChange={(event) => {
            const parsed = fromTimeValue(event.target.value);
            if (parsed !== null) {
              setDay(day, { end: parsed });
            }
          }}
          className="rounded border border-slate-300 px-2 py-1 disabled:bg-slate-100 disabled:text-slate-400"
        />
      </div>
    );
  }

  const courseBlocks = [];
  for (let i = 0; i < props.courses.length; i++) {
    const course = props.courses[i];
    const chosen = props.selection[course.id] ?? [];
    const sectionRows = [];

    for (let j = 0; j < course.sections.length; j++) {
      const section = course.sections[j];
      const isChecked = chosen.includes(section.id);

      sectionRows.push(
        <label
          key={section.id}
          className="flex cursor-pointer items-start gap-2 rounded px-2 py-1 hover:bg-slate-50"
        >
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => toggleSection(course.id, section.id)}
            className="mt-1 h-4 w-4 accent-emerald-600"
          />
          <span className="text-xs leading-tight">
            <span className="font-medium text-slate-800">{sectionLabel(section)}</span>
            <span className="text-slate-500"> - {sectionWhen(section)}</span>
          </span>
        </label>
      );
    }

    courseBlocks.push(
      <div key={course.id} className="rounded-lg border border-slate-200 p-3">
        <div className="mb-1 text-sm font-semibold text-slate-800">{courseLabel(course)}</div>
        <div className="mb-2 text-xs text-slate-500">
          {course.title} - {course.credits} cr - {chosen.length} of {course.sections.length} considered
        </div>
        <div className="space-y-0.5">{sectionRows}</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* The hero control. */}
      <div className="rounded-xl border-2 border-emerald-600 bg-emerald-50 p-4">
        <div className="flex items-baseline justify-between">
          <label htmlFor="commute" className="text-sm font-semibold tracking-wide text-emerald-900 uppercase">
            Drive time, one way
          </label>
          <span className="text-3xl font-bold tabular-nums text-emerald-800">
            {props.commuteMinutes}
            <span className="ml-1 text-base font-medium">min</span>
          </span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1">
            <input
              id="commute"
              type="range"
              min={0}
              max={COMMUTE_SLIDER_MAX}
              step={1}
              value={clampMinutes(props.commuteMinutes, COMMUTE_SLIDER_MAX)}
              onChange={(event) => props.onCommuteChange(Number(event.target.value))}
              className="h-3 w-full cursor-pointer accent-emerald-600"
            />
            <div className="mt-1 flex justify-between text-xs text-emerald-700">
              <span>0 (work on campus)</span>
              <span>{COMMUTE_SLIDER_MAX} min</span>
            </div>
          </div>
          <input
            type="number"
            min={0}
            max={COMMUTE_MAX}
            step={1}
            aria-label="Drive time in minutes"
            value={props.commuteMinutes}
            onFocus={selectOnFocus}
            onChange={(event) => {
              const parsed = parseMinutes(event.target.value, COMMUTE_MAX);
              if (parsed !== null) {
                props.onCommuteChange(parsed);
              }
            }}
            className="w-16 rounded border border-emerald-400 bg-white px-2 py-1 text-sm tabular-nums"
          />
        </div>
        <p className="mt-2 text-xs text-emerald-900/80">
          Each class is padded by this on both sides, before and after. The box
          takes up to {COMMUTE_MAX} minutes.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 p-4">
        <div className="flex items-baseline justify-between">
          <label htmlFor="minshift" className="text-sm font-medium text-slate-700">
            Shortest shift worth taking
          </label>
          <span className="text-lg font-semibold tabular-nums text-slate-800">
            {props.minShiftMinutes} min
          </span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <input
            id="minshift"
            type="range"
            min={30}
            max={MIN_SHIFT_SLIDER_MAX}
            step={5}
            value={clampMinutes(props.minShiftMinutes, MIN_SHIFT_SLIDER_MAX)}
            onChange={(event) => props.onMinShiftChange(Number(event.target.value))}
            className="flex-1 cursor-pointer accent-slate-600"
          />
          <input
            type="number"
            min={0}
            max={MIN_SHIFT_MAX}
            step={5}
            aria-label="Shortest shift in minutes"
            value={props.minShiftMinutes}
            onFocus={selectOnFocus}
            onChange={(event) => {
              const parsed = parseMinutes(event.target.value, MIN_SHIFT_MAX);
              if (parsed !== null) {
                props.onMinShiftChange(parsed);
              }
            }}
            className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-sm tabular-nums"
          />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Free time shorter than this is not counted as workable. The box takes
          up to {MIN_SHIFT_MAX} minutes.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 p-4">
        <div className="mb-2 text-sm font-medium text-slate-700">When you can work</div>
        <div className="space-y-1.5">{availabilityRows}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-200 p-4">
          <label htmlFor="target" className="text-sm font-medium text-slate-700">
            Target hours / week
          </label>
          <input
            id="target"
            type="number"
            min={0}
            max={60}
            placeholder="clear to hide target"
            value={props.targetHoursPerWeek}
            onChange={(event) => props.onTargetChange(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
          />
          <p className="mt-1 text-xs text-slate-500">Clear it to rank without a target.</p>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <label htmlFor="wage" className="text-sm font-medium text-slate-700">
            Hourly wage
          </label>
          <input
            id="wage"
            type="number"
            min={0}
            step="0.25"
            placeholder="clear to hide dollars"
            value={props.hourlyWage}
            onChange={(event) => props.onWageChange(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
          />
          <p className="mt-1 text-xs text-slate-500">Sample value. Edit or clear it.</p>
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-medium text-slate-700">
          Sections to consider
        </div>
        <p className="mb-2 text-xs text-slate-500">
          Fully asynchronous sections start unticked: with no meetings they always
          win, which hides the tradeoff. Tick them to include them.
        </p>
        <div className="space-y-2">{courseBlocks}</div>
      </div>
    </div>
  );
}
