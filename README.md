# WorkAround

A class schedule builder that plans around your job instead of ignoring it.

**Live:** https://workaround-production.up.railway.app

---

## The finding that started this

I registered for five classes at UW-Green Bay for fall 2026 and work an IT job
around them. I picked sections the way everyone does: checked that nothing
overlapped, enrolled.

Then I built this to check my work.

My schedule ranks **201st out of 246** valid arrangements of those same five
courses. Switching sections is worth 13 more hours of workable time a week.
Nothing in the registration system told me that, and nothing was going to.

Around 40% of full-time and 74% of part-time undergraduates are employed while
enrolled. Every degree planner I could find treats that job as invisible.

## What it does

You give it your work availability, your one-way drive time, and the shortest
shift you would realistically be scheduled for. It generates every valid
combination of your candidate sections and ranks them by the work hours each
one preserves.

Two rules make the numbers real, and both are things a naive free-time
calculator gets wrong.

**Drive time pads both sides of every class.** A class ending at 10:50 does not
free you at 10:50. Classes are padded by the commute *before* they are merged,
so two classes twenty minutes apart with a fifteen-minute drive become one
continuous unavailable block. You are not driving to work and back in that gap.

**Gaps shorter than your minimum shift count as zero.** A 45-minute window
between classes is not a work opportunity. Nobody gets scheduled for 45
minutes. Those fragments are tracked separately and shown, not silently
counted as free time.

Together these produce the result the app exists to surface: a 20-minute drive costs 11h20m 
of workable time a week on the schedule I actually registered for, while only 3h20m of that 
is actual driving The other 8 hours disappear because the drive chops gaps below shift length.

The seed data contains two schedules with **identical free time to the minute**
(27h40m each). One is worth 27h40m of work. The other is worth 14h20m. Same
courses, same free time, different section numbers. A tool that counts free
time ranks them equal.

## Design decisions

The parts of this worth explaining are the ones where an obvious approach was
available and rejected.

### Times are integers, not dates

Every time in the domain layer is minutes since midnight. No `Date` objects, no
timezones, no strings. Overlap detection becomes one comparison and commute
buffers become addition. Every scheduling bug I did not have came from this
choice.

Intervals are half-open: `[start, end)`. A class ending at 10:50 and a shift
starting at 10:50 do not overlap. Getting this backwards silently discards
valid schedules.

### Brute force, not a constraint solver

A student picks five courses with a handful of sections each. That is hundreds
to a few thousand combinations, not millions. I generate the full Cartesian
product, drop the ones with overlaps, and score the rest.

Measured at the 50,000-combination ceiling: **350ms**, about 7 microseconds per
combination. A realistic request is single-digit milliseconds. A CSP library
would have added a dependency, a translation layer, and worse error messages to
solve a problem that does not exist at this scale.

Section-vs-section collisions are computed once into a cache rather than
per-combination, which is what keeps the ceiling cheap.

### The solver runs in the browser

The core interaction is dragging the drive-time slider and watching the week
change. That has to be instant. An API round-trip on every input change would
need debouncing and would feel like a form instead of a tool.

So the client fetches sections once from `/api/courses` and then imports
`generateSchedules` directly from `src/lib`. `POST /api/schedules` still exists
and runs the identical code path server-side. The single-package layout is what
makes sharing that code possible.

### No authentication

Deliberate. Anyone with the link gets a working app with sample data already
loaded. A login screen is a wall between a new user and the point of the tool.

### The course data is not scraped

UW-Green Bay's course system disallows automated access in its `robots.txt`. I
did not scrape it.

Sections come from a paste-in importer plus a hand-collected fall 2026 dataset.
This turned out to be the better design anyway: a school can load its own
sections from a file it already exports, which is how this would actually be
deployed anywhere.

The five real registered sections carry their true class numbers and are
flagged `isSample: false`. Every alternate section is clearly marked sample
data.

### Async sections start unticked

A fully asynchronous section has no meeting times, so it trivially preserves
every work hour and would always top the ranking. That would make the drive
slider do nothing. They are one click away with a note explaining why.

### Below-target schedules are shown, not hidden

If nothing clears your target hours, the app reports the best available option
and how far short it falls, plus which pair of courses caused the most
eliminations. "Nothing works" is a useless answer to give someone picking
classes.

### A Section has many Meetings

A lecture on Mon/Wed plus a lab on Friday is one section with two meeting rows,
not two sections. Most naive schedule models collapse this and then cannot
represent half a real course catalog.

Fully async sections carry **zero** meeting rows rather than rows with null
times, which keeps `startMin`/`endMin` non-nullable so the solver never
null-checks integer math.

## Known limitations

Named honestly, because each one is a real constraint on who this helps today.

- **Fixed shifts are not modeled.** A work block means "I *can* work here," not
  "I *must* be here." A student with a 9-to-5 needs classes excluded from that
  window entirely. That is different solver logic and it is the most valuable
  next thing to build.
- **One commute number.** Campus-to-work only. Multi-campus students and
  variable commutes are not represented.
- **No part-of-term dates.** Eight-week and second-half sections are real and
  this treats every section as running the full term.
- **No prerequisite validation, degree audit, or live seat availability.** This
  answers one question and does not pretend to be a degree planner.
- **The server runs TypeScript through `tsx` in production** rather than
  compiled JavaScript, because `src/lib` uses extensionless relative imports and
  I froze that directory once it was tested. Bundling with esbuild would resolve
  them at build time and remove the TypeScript toolchain from production. It is
  a known cost, not an oversight.

## Testing

```
npm test         # 95 tests across the interval math and the solver
npm run typecheck
```

The interval math is exactly the kind of code that looks right and is off by
one minute, so the test suite covers real SIS meeting-pattern formats (`MWF
9:30AM-10:20AM`, `TuTh 1:00 PM - 2:20 PM`, `TR 1300-1415`), meridiem
inheritance (`MW 1:00-2:20 PM`), half-open boundaries, and commute-buffer
merging.

Two bugs it caught during development, both of which would have produced
confidently wrong schedules with no error:

- `"MW 1:00-2:20 PM"` parsed as 1:00 **AM** to 2:20 PM, because `1:00` is also
  a valid 24-hour time so the meridiem-inheritance fallback never fired.
- An 8:00 class and a 9:00 class look equally harmless. With a commute, one of
  them strands 40 minutes below the shift floor.

The A/B/C comparison is asserted in two independent places: the seed against
live Postgres, and the solver's own test suite. Both produce identical minute
counts. The full HTTP path was verified manually against the same figures but
is not covered by an automated test.

## Stack

TypeScript throughout. PostgreSQL with Prisma 7, Express 5, React with Vite and
Tailwind, deployed on Railway.

## Running locally

```bash
npm install
cp .env.example .env        # add a Postgres connection string
npx prisma migrate deploy
npm run db:seed
npm run build && npm start  # http://localhost:3000
```

For hot reload, run `npm run dev` (API) and `npm run dev:client` (Vite) in
separate terminals.

## User testing

Five students used this before submission. The drive-time slider was the first
thing most of them touched, unprompted, which is the main reason I trust the
core idea reads without explanation.

Three things they changed:

- One read the main number as a bill he owed. The hero was rewritten to lead
  with hours and label the dollar figure explicitly as potential earnings.
- Two asked me to remove the wasted-time warnings entirely. The data was right
  and the tone was wrong, so every string was rewritten to state the fact
  without editorializing.
- Setting a night shift pushed the usable-work band off the bottom of the week
  grid. The grid's range now derives from the data instead of a fixed 7am-10pm window.

---

Built for the [Stellic Pathfinders Challenge](https://www.stellic.com/pathfinders),
July 20 to August 21, 2026. Category: Overcome Obstacles.