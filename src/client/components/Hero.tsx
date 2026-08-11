/**
 * The number that has to move when the commute slider moves, and directly
 * underneath it the number that makes the point.
 *
 * The gap between "best available" and "what you actually registered for" IS
 * the product. Both recompute on every slider change, so the gap is never a
 * stale figure from some earlier setting.
 *
 * The commute cost line scores the SAME schedule at a zero-minute commute, so
 * it is like-for-like and not a comparison against a different schedule.
 */

import { humanMinutes } from '../model';
import type { WorkHoursResult } from '@lib/workHours';

interface Props {
  // Scoring of the top-ranked schedule at the current settings.
  best: WorkHoursResult | null;
  // The top-ranked schedule scored with no commute at all.
  bestWithoutCommute: WorkHoursResult | null;
  // The real registered sections, scored at the same current settings.
  registered: WorkHoursResult | null;
  commuteMinutes: number;
  hourlyWage: number | undefined;
  targetHoursPerWeek: number;
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

export default function Hero(props: Props) {
  if (props.best === null || props.bestWithoutCommute === null) {
    return (
      <div className="rounded-xl bg-slate-900 p-6 text-slate-100">
        <div className="text-sm text-slate-400">Usable work</div>
        <div className="text-6xl font-bold tabular-nums">--</div>
        <div className="mt-1 text-sm text-slate-400">No workable schedule yet.</div>
      </div>
    );
  }

  const hours = props.best.totalHours;
  const lostMinutes = props.bestWithoutCommute.totalMinutes - props.best.totalMinutes;

  let targetBadge = null;
  if (hours >= props.targetHoursPerWeek) {
    targetBadge = (
      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300">
        clears your {props.targetHoursPerWeek}h target
      </span>
    );
  } else {
    const short = Math.round((props.targetHoursPerWeek - hours) * 10) / 10;
    targetBadge = (
      <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs font-medium text-rose-300">
        {short}h short of your {props.targetHoursPerWeek}h target
      </span>
    );
  }

  let payLine = null;
  if (props.hourlyWage !== undefined && props.best.estimatedWeeklyPay !== undefined) {
    payLine = (
      <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-400">
        {money(props.best.estimatedWeeklyPay)}
        <span className="ml-1 text-sm font-normal text-slate-400">/ week</span>
      </div>
    );
  }

  // --- the comparison ----------------------------------------------------
  let comparison = null;
  if (props.registered !== null) {
    const registeredHours = props.registered.totalHours;
    const gapMinutes = props.best.totalMinutes - props.registered.totalMinutes;

    let registeredPay = null;
    if (props.hourlyWage !== undefined && props.registered.estimatedWeeklyPay !== undefined) {
      registeredPay = (
        <span className="ml-2 tabular-nums text-slate-400">
          ({money(props.registered.estimatedWeeklyPay)}/wk)
        </span>
      );
    }

    let verdict = null;
    if (gapMinutes > 0) {
      let gapPay = null;
      if (props.hourlyWage !== undefined) {
        gapPay = (
          <span className="tabular-nums">
            {' '}and {money((gapMinutes / 60) * props.hourlyWage)} a week
          </span>
        );
      }
      verdict = (
        <div className="mt-2 rounded-lg bg-amber-400/15 px-3 py-2 text-sm text-amber-200">
          Changing sections would give you{' '}
          <span className="font-bold tabular-nums text-amber-100">
            {humanMinutes(gapMinutes)}
          </span>{' '}
          more work a week{gapPay}. Same five courses.
        </div>
      );
    } else if (gapMinutes === 0) {
      verdict = (
        <div className="mt-2 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">
          Your registered schedule is already the best available here.
        </div>
      );
    } else {
      verdict = (
        <div className="mt-2 rounded-lg bg-slate-700/40 px-3 py-2 text-sm text-slate-300">
          Your registered schedule beats everything currently ticked, by{' '}
          <span className="font-bold tabular-nums">{humanMinutes(-gapMinutes)}</span>. Tick
          more sections to widen the search.
        </div>
      );
    }

    comparison = (
      <div className="mt-4 border-t border-slate-700 pt-3 xl:mt-0 xl:border-t-0 xl:pt-0">
        {/* Stacked in the narrower right-hand column, side by side when the
            card is one column and there is room for both on a line. */}
        <div className="flex items-baseline justify-between gap-3 xl:block">
          <span className="text-sm text-slate-400">Your registered schedule</span>
          <span className="text-2xl font-semibold tabular-nums text-slate-200 xl:block">
            {registeredHours.toFixed(2)}
            <span className="ml-1 text-sm font-normal text-slate-400">h / week</span>
            {registeredPay}
          </span>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {humanMinutes(props.registered.fragmentedMinutes)} of it wasted in slivers too
          short to work.
        </div>
        {verdict}
      </div>
    );
  }

  let costLine = null;
  if (props.commuteMinutes > 0 && lostMinutes > 0) {
    costLine = (
      <div className="mt-4 rounded-lg bg-rose-950/60 px-3 py-2 text-sm text-rose-200">
        A {props.commuteMinutes} minute commute is costing you{' '}
        <span className="font-bold tabular-nums">{humanMinutes(lostMinutes)}</span> of work a
        week, even on the best schedule.
      </div>
    );
  }

  // Two columns from xl up: headline left, the comparison that makes the point
  // right. Stacked, this card runs 450px tall and starves the week grid on a
  // 768px-high laptop. Below xl it is one column, in the original order.
  return (
    <div className="rounded-xl bg-slate-900 p-6 text-slate-100 xl:grid xl:grid-cols-2 xl:items-start xl:gap-6 xl:p-5">
      <div>
        <div className="text-sm tracking-wide text-slate-400 uppercase">
          Best available schedule
        </div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-6xl font-bold tabular-nums tracking-tight">
            {hours.toFixed(2)}
          </span>
          <span className="text-xl text-slate-400">hours / week</span>
        </div>
        {payLine}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {targetBadge}
          <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-xs text-slate-300">
            {humanMinutes(props.best.fragmentedMinutes)} wasted in slivers
          </span>
        </div>
      </div>

      <div className="xl:border-l xl:border-slate-700 xl:pl-6">
        {comparison}
        {costLine}
      </div>
    </div>
  );
}
