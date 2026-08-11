/**
 * What to show when the ranking is empty.
 *
 * "No valid schedule" is not an answer a student can act on. This names the
 * pair of courses doing the damage and how many combinations they killed, so
 * the next click is obvious.
 */

import type { GeneratorDiagnostics } from '@lib/generateSchedules';

interface Props {
  diagnostics: GeneratorDiagnostics;
  // Course labels keyed by nothing; passed through only for the empty case.
  hasSchedules: boolean;
}

export default function Diagnostics(props: Props) {
  const d = props.diagnostics;

  if (props.hasSchedules === true && d.refused === false) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <span className="font-medium text-slate-700">
          {d.combinationsEvaluated.toLocaleString()} combinations checked.
        </span>{' '}
        {d.eliminatedByOverlap.toLocaleString()} dropped for overlapping classes,{' '}
        {d.survivors.toLocaleString()} workable.
        {d.worstOverlapPair !== null && (
          <>
            {' '}
            Most collisions: <span className="font-medium">{d.worstOverlapPair.courseA}</span> vs{' '}
            <span className="font-medium">{d.worstOverlapPair.courseB}</span> (
            {d.worstOverlapPair.eliminations}).
          </>
        )}
      </div>
    );
  }

  let headline = 'No schedule works with these sections.';
  if (d.refused === true) {
    headline = 'Too many combinations to check.';
  }

  let advice = null;
  if (d.worstOverlapPair !== null) {
    advice = (
      <p className="mt-2 text-sm text-rose-900">
        <span className="font-semibold">{d.worstOverlapPair.courseA}</span> and{' '}
        <span className="font-semibold">{d.worstOverlapPair.courseB}</span> clash in{' '}
        <span className="font-semibold tabular-nums">{d.worstOverlapPair.eliminations}</span> of the{' '}
        <span className="tabular-nums">{d.combinationsEvaluated.toLocaleString()}</span> combinations
        checked, more than any other pair. Tick another section of either one and this
        opens up.
      </p>
    );
  }

  const otherPairs = [];
  for (let i = 1; i < d.overlapPairs.length && i < 5; i++) {
    const pair = d.overlapPairs[i];
    otherPairs.push(
      <li key={i} className="tabular-nums">
        {pair.courseA} vs {pair.courseB}: {pair.eliminations}
      </li>
    );
  }

  let otherList = null;
  if (otherPairs.length > 0) {
    otherList = (
      <div className="mt-2 text-xs text-rose-800">
        <div className="font-medium">Also colliding:</div>
        <ul className="list-inside list-disc">{otherPairs}</ul>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-4">
      <h2 className="text-base font-bold text-rose-900">{headline}</h2>
      {d.reason !== null && <p className="mt-1 text-sm text-rose-800">{d.reason}</p>}
      {advice}
      {otherList}
    </div>
  );
}
