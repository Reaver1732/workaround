/**
 * The week, with four visually distinct states:
 *
 *   class    solid indigo
 *   buffer   amber diagonal hatch, the commute
 *   usable   solid emerald, a shift you could actually take
 *   sliver   rose counter-hatch, free time too short to be worth anything
 *
 * The sliver tooltip is the point of the whole picture: it says how long the
 * gap is and why it is worth nothing.
 */

import { DAY_NAMES } from '../model';
import type { Band, DayBands } from '../model';

interface Props {
  days: DayBands[];
  minShiftMinutes: number;
}

// Drawn window: 7:00 AM to 10:00 PM.
const WINDOW_START = 420;
const WINDOW_END = 1320;
const WINDOW_SPAN = WINDOW_END - WINDOW_START;

// Painting order, so classes end up on top of their own buffers.
const LAYER_ORDER: Record<string, number> = {
  usable: 0,
  sliver: 1,
  buffer: 2,
  class: 3,
};

const BAND_CLASS: Record<string, string> = {
  class: 'bg-indigo-600 text-white border border-indigo-700',
  buffer: 'band-buffer border border-amber-400/70 text-amber-900',
  usable: 'bg-emerald-500 text-white border border-emerald-600',
  sliver: 'band-sliver border border-dashed border-rose-400 text-rose-900',
};

function percent(value: number): string {
  return `${(value * 100).toFixed(3)}%`;
}

function renderBand(band: Band, key: string) {
  const top = (band.start - WINDOW_START) / WINDOW_SPAN;
  const height = (band.end - band.start) / WINDOW_SPAN;
  const tall = band.end - band.start >= 45;

  let label = null;
  if (tall === true) {
    label = <span className="px-1 text-[10px] leading-tight font-medium">{band.label}</span>;
  }

  return (
    <div
      key={key}
      title={band.tooltip}
      style={{ top: percent(top), height: percent(height), zIndex: LAYER_ORDER[band.kind] }}
      className={`absolute right-0.5 left-0.5 overflow-hidden rounded-sm ${BAND_CLASS[band.kind]}`}
    >
      {label}
    </div>
  );
}

export default function WeekGrid(props: Props) {
  const hourLines = [];
  for (let minute = WINDOW_START; minute <= WINDOW_END; minute += 60) {
    const top = (minute - WINDOW_START) / WINDOW_SPAN;
    const hour24 = Math.floor(minute / 60);
    let label = `${hour24 % 12}`;
    if (hour24 % 12 === 0) {
      label = '12';
    }
    let suffix = 'am';
    if (hour24 >= 12) {
      suffix = 'pm';
    }

    hourLines.push(
      <div key={minute} className="absolute right-0 left-0" style={{ top: percent(top) }}>
        <div className="border-t border-slate-100" />
        <span className="absolute -top-2 -left-11 w-10 text-right text-[10px] text-slate-400">
          {label}
          {suffix}
        </span>
      </div>
    );
  }

  const columns = [];
  for (let i = 0; i < props.days.length; i++) {
    const day = props.days[i];
    const sorted = day.bands.slice().sort((a, b) => LAYER_ORDER[a.kind] - LAYER_ORDER[b.kind]);
    const bandNodes = [];
    for (let j = 0; j < sorted.length; j++) {
      bandNodes.push(renderBand(sorted[j], `${day.day}-${j}`));
    }

    columns.push(
      <div key={day.day} className="flex-1">
        <div className="mb-1 text-center text-xs font-medium text-slate-600">
          {DAY_NAMES[day.day].slice(0, 3)}
        </div>
        <div className="relative h-[520px] rounded border border-slate-200 bg-slate-50">
          {bandNodes}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide whitespace-nowrap text-slate-700 uppercase">
          The week
        </h2>
        <div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm border border-indigo-700 bg-indigo-600" />
            class
          </span>
          <span className="flex items-center gap-1">
            <span className="band-buffer inline-block h-3 w-3 rounded-sm border border-amber-400" />
            commute buffer
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm border border-emerald-600 bg-emerald-500" />
            workable shift
          </span>
          <span className="flex items-center gap-1">
            <span className="band-sliver inline-block h-3 w-3 rounded-sm border border-dashed border-rose-400" />
            wasted sliver
          </span>
        </div>
      </div>
      <div className="relative pl-11">
        <div className="relative">
          <div className="pointer-events-none absolute inset-0 top-6">{hourLines}</div>
          <div className="flex gap-1">{columns}</div>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Hover any band for detail. Slivers are free time under {props.minShiftMinutes} minutes,
        which counts as zero.
      </p>
    </div>
  );
}
