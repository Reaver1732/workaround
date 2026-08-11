/**
 * The ranked list.
 *
 * Below-target schedules stay visible with their shortfall spelled out, and
 * the student's real registered schedule is always findable: badged in place
 * when it lands in the visible rows, pinned above the list when it does not.
 * Losing track of your own schedule in a list of invented alternates would
 * make the comparison meaningless.
 */

import type { ScheduleCandidate } from '@lib/generateSchedules';
import { humanMinutes, rankReason } from '../model';

/** Where the as-registered combination ended up relative to the visible rows. */
export type RegisteredPin =
  | { kind: 'in-list'; index: number }
  | { kind: 'below-cut'; index: number }
  | { kind: 'not-considered' };

interface Props {
  schedules: ScheduleCandidate[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  targetHoursPerWeek: number | undefined;
  sectionNames: Map<string, string>;
  registeredPin: RegisteredPin;
}

const MAX_ROWS = 50;

function RegisteredBadge() {
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-300">
      as registered
    </span>
  );
}

export default function ScheduleList(props: Props) {
  if (props.schedules.length === 0) {
    return null;
  }

  const best = props.schedules[0];

  function renderRow(index: number, isPinned: boolean) {
    const candidate = props.schedules[index];
    const isSelected = index === props.selectedIndex;
    let isRegistered = false;
    if (props.registeredPin.kind !== 'not-considered') {
      isRegistered = props.registeredPin.index === index;
    }

    const chips = [];
    for (let j = 0; j < candidate.sections.length; j++) {
      const chosen = candidate.sections[j];
      const name = props.sectionNames.get(chosen.section.id) ?? chosen.courseLabel;
      chips.push(
        <span
          key={chosen.section.id}
          className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600"
        >
          {name}
        </span>
      );
    }

    let rowClass = 'w-full rounded-lg border p-3 text-left transition hover:border-emerald-400 ';
    if (isSelected === true) {
      rowClass = rowClass + 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600';
    } else if (isRegistered === true) {
      rowClass = rowClass + 'border-amber-400 bg-amber-50';
    } else {
      rowClass = rowClass + 'border-slate-200 bg-white';
    }
    if (isPinned === true) {
      rowClass = rowClass + ' border-dashed';
    }

    let targetBadge = null;
    if (props.targetHoursPerWeek !== undefined && candidate.meetsTarget === false) {
      targetBadge = (
        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">
          {candidate.shortfallHours}h short
        </span>
      );
    }

    let registeredBadge = null;
    if (isRegistered === true) {
      registeredBadge = <RegisteredBadge />;
    }

    return (
      <button
        key={`${index}-${isPinned}`}
        type="button"
        onClick={() => props.onSelect(index)}
        className={rowClass}
      >
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-slate-400 tabular-nums">#{index + 1}</span>
            <span className="text-lg font-bold tabular-nums text-slate-900">
              {candidate.work.totalHours.toFixed(2)}h
            </span>
            <span className="text-xs text-slate-500">usable</span>
            {registeredBadge}
          </div>
          <div className="flex items-center gap-2">
            {targetBadge}
            <span className="text-xs text-rose-600 tabular-nums">
              {humanMinutes(candidate.work.fragmentedMinutes)} wasted
            </span>
          </div>
        </div>
        <div className="mt-1 text-xs text-slate-600">
          {rankReason(candidate, best, index, props.targetHoursPerWeek)}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">{chips}</div>
      </button>
    );
  }

  const rows = [];
  const limit = Math.min(props.schedules.length, MAX_ROWS);
  for (let i = 0; i < limit; i++) {
    rows.push(renderRow(i, false));
  }

  // The registered schedule pinned above the list, when it is not visible.
  let pinned = null;
  if (props.registeredPin.kind === 'below-cut') {
    pinned = (
      <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-2">
        <div className="mb-1.5 px-1 text-[11px] font-semibold tracking-wide text-amber-800 uppercase">
          Your registered schedule, ranked #{props.registeredPin.index + 1} of{' '}
          {props.schedules.length}
        </div>
        {renderRow(props.registeredPin.index, true)}
      </div>
    );
  } else if (props.registeredPin.kind === 'not-considered') {
    pinned = (
      <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-xs text-amber-900">
        <span className="font-semibold">Your registered schedule is not in this list.</span> You
        have unticked at least one of the sections you are actually registered for, so it is not
        among the combinations being ranked. The comparison above still tracks it.
      </div>
    );
  }

  let truncationNote = null;
  if (props.schedules.length > MAX_ROWS) {
    truncationNote = (
      <p className="text-xs text-slate-500">
        Showing the top {MAX_ROWS} of {props.schedules.length} workable schedules.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-slate-700 uppercase">
          Ranked schedules
        </h2>
        <span className="text-xs text-slate-500">{props.schedules.length} workable</span>
      </div>
      {truncationNote}
      {pinned}
      <div className="space-y-2">{rows}</div>
    </div>
  );
}
