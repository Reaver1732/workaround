/**
 * The week, with four visually distinct states:
 *
 *   class    solid indigo
 *   buffer   amber diagonal hatch, the drive
 *   usable   solid emerald, a shift you could actually take
 *   sliver   rose counter-hatch, free time under the minimum shift
 *
 * The short-block tooltip says how long the gap is and which minimum it fell
 * under.
 */

import { DAY_NAMES } from '../model';
import type { Band, DayBands } from '../model';

interface Props {
  days: DayBands[];
  minShiftMinutes: number;
}

// Fallback window, 7:00 AM to 10:00 PM, used only when there is nothing to
// draw. The real window comes from the data, see windowFor.
const DEFAULT_START = 420;
const DEFAULT_END = 1320;

// Below this the grid is all label and no picture.
const MIN_SPAN = 240;

/**
 * The drawn range, from the union of every band on the grid.
 *
 * A fixed window silently drops work windows that fall outside it: an evening
 * shift ending at 11pm rendered off the bottom of a grid that stopped at 10.
 * Rounded out to whole hours so the hour lines still land on the hour.
 */
function windowFor(days: DayBands[]): { start: number; end: number } {
  let earliest = -1;
  let latest = -1;

  for (let i = 0; i < days.length; i++) {
    const bands = days[i].bands;
    for (let j = 0; j < bands.length; j++) {
      if (earliest === -1 || bands[j].start < earliest) {
        earliest = bands[j].start;
      }
      if (latest === -1 || bands[j].end > latest) {
        latest = bands[j].end;
      }
    }
  }

  if (earliest === -1 || latest === -1) {
    return { start: DEFAULT_START, end: DEFAULT_END };
  }

  const start = Math.floor(earliest / 60) * 60;
  let end = Math.ceil(latest / 60) * 60;

  if (end - start < MIN_SPAN) {
    end = start + MIN_SPAN;
  }

  return { start, end };
}

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

function renderBand(band: Band, key: string, windowStart: number, windowSpan: number) {
  const top = (band.start - windowStart) / windowSpan;
  const height = (band.end - band.start) / windowSpan;
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
  const window = windowFor(props.days);
  const windowSpan = window.end - window.start;

  const hourLines = [];
  for (let minute = window.start; minute <= window.end; minute += 60) {
    const top = (minute - window.start) / windowSpan;
    // Modulo 24 so a grid that runs to midnight labels it 12am, not 12pm.
    const hour24 = Math.floor(minute / 60) % 24;
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
      bandNodes.push(renderBand(sorted[j], `${day.day}-${j}`, window.start, windowSpan));
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
            drive time
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm border border-emerald-600 bg-emerald-500" />
            workable shift
          </span>
          <span className="flex items-center gap-1">
            <span className="band-sliver inline-block h-3 w-3 rounded-sm border border-dashed border-rose-400" />
            too short to work
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
        Hover any band for detail. Free time under {props.minShiftMinutes} minutes is not
        counted as workable.
      </p>
    </div>
  );
}
