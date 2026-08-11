# WorkAround

## What this is
A class schedule builder that plans around a student's job instead of ignoring it.

The student enters their work availability, target hours per week, and commute
time. The app generates every valid course schedule from their candidate
sections, then ranks them by how many work hours each one preserves.

Existing degree planners treat a job as invisible. This one treats it as a
hard constraint.

Built for the Stellic Pathfinders Challenge. Category: Overcome Obstacles.
Submission deadline is August 21, 2026. Prefer finished and narrow over
broad and half-working.

## Stack
- TypeScript throughout
- PostgreSQL + Prisma
- Express API
- React + Vite + Tailwind
- Deployed on Railway

## Layout
Single package at repo root. src/lib (shared), src/server (Express),
src/client (React + Vite). Express serves the built client and /api/*.
One Railway app service, plus two Postgres instances (dev and prod).

## Data model
Course   id, subject, number, title, credits
Section  id, courseId, sectionCode, classNbr?, term, instructor, mode
Meeting  id, sectionId, days[], startMin, endMin, kind, building, room

`number` is a String ("245L" exists). `classNbr` is an OPTIONAL String,
because hand-pasted schedules often lack it and leading zeros are real.

Natural uniqueness is (subject, number) on Course and
(term, courseId, sectionCode) on Section.

mode is an enum: IN_PERSON | HYBRID | ONLINE_SYNC | ONLINE_ASYNC
kind is an enum: LECTURE | LAB | DISCUSSION | SEMINAR | OTHER

A Section has MANY Meetings. A lecture on Mon/Wed plus a lab on Friday is one
Section with two Meeting rows. Never collapse this.

ONLINE_ASYNC sections carry ZERO Meeting rows, not rows with null times. This
keeps startMin/endMin non-nullable so the solver never null-checks integer
math. An ONLINE_SYNC section still gets a real Meeting, just with null
building and room.

User input (not persisted to a user account, see "Out of scope"):
WorkBlock    day, startMin, endMin        // windows the student can work
Constraints  targetHoursPerWeek, hourlyWage?, commuteMinutes, minShiftMinutes,
             minCredits, maxCredits, earliestStartMin, latestEndMin

## Conventions
- Store all times as integer MINUTES SINCE MIDNIGHT (startMin/endMin), never
  as Date objects or strings. All scheduling logic is integer interval math.
  No timezones anywhere in the domain layer.
- Days are an enum array: ["MO","WE","FR"]
- Intervals are half-open: [start, end). Two blocks touching at the same
  minute do not overlap.

## Core algorithm
1. Student supplies N courses, each with a handful of candidate sections.
2. Brute-force the Cartesian product of section choices (hundreds to a few
   thousand combinations, not millions). Do NOT reach for a CSP solver.
3. Drop any combination where two Meetings overlap.
4. For each survivor, compute work hours preserved: subtract every class
   Meeting, plus commuteMinutes of buffer on BOTH sides of it, from the
   student's WorkBlocks. Sum the remaining intervals.

   Class blocks are padded by the commute BEFORE they are merged. Two classes
   twenty minutes apart with a fifteen-minute commute become one continuous
   unavailable block. You are not driving to work and back in that gap.

   Fragments shorter than minShiftMinutes (default 90) are DISCARDED, not
   counted. Nobody schedules a 25-minute shift. computeWorkHours returns them
   separately as discardedFragments, and the UI must show them. A schedule
   that leaves four unusable slivers instead of two real shifts is exactly
   the failure this app exists to surface.
5. Rank by hours preserved. If hourlyWage is given, also show dollars.
6. When no schedule is valid, report WHICH constraint eliminated the last
   candidates. "Nothing works" is a useless answer.

The commute buffer is the whole point of this app. A class ending at 10:50
means work cannot start until 10:50 + commuteMinutes.

## The demo scenario
The seed data must contain two schedule combinations that look nearly
identical on a calendar but differ by 90+ minutes of usable work time, caused
by commute buffers and the minimum shift floor. Same courses, different
sections. One leaves two real shifts, the other leaves four useless slivers.

This is the video. Do not let a refactor break it.

## src/lib is settled
time.ts, parseMeetingPattern.ts, and workHours.ts are complete and covered by
lib.test.ts (47 tests). Do not rewrite or refactor them. Build on top.
If a test fails, the new code is wrong, not the test.

Run tests with:      npm test
Run a typecheck with: npm run typecheck

## Databases
Two Railway Postgres instances. Local .env points at the DEV instance only.
Never run `prisma migrate dev` against production. After first deploy,
production uses `prisma migrate deploy` only.

Never read, echo, or copy the contents of .env into any file, commit message,
or chat response.

## Parser warnings
The SEED throws on any parser warning. The IMPORTER never does. A real CSV
will contain one weird row and rejecting the whole file is unacceptable. The
importer surfaces warnings per-row and imports everything else.

## Commits
Small and frequent. Never commit with failing tests.
Do not rewrite, squash, or amend history. The commit log is competition
evidence that the project was built inside the entry window.

## Out of scope. Do not build these. Do not suggest them.
- User accounts or authentication. The demo must be openable by a judge with
  zero friction. Persist to localStorage and shareable URL state.
- Prerequisite validation, degree audit, graduation planning
- Live seat availability
- Any AI chat interface
- Scraping sis.uwgb.edu. Its robots.txt disallows automated access. Section
  data comes from a CSV/paste importer plus a hand-collected fall 2026 seed
  dataset.
- Mobile app
- Multi-campus travel time. UWGB has branch campuses, but modeling
  campus-to-campus commute is not in the 12-day scope. Commute is a single
  number: campus to work.
- Part-of-term date ranges. 8-week and second-half sections are real and
  would matter, but Meeting has no start or end date and will not get one.

## Second view (build only after the core works)
An institutional read-only screen: given the full section dataset, surface
which required courses are offered ONLY in blocks that collide with common
work shifts. No user input needed.

## .gitignore
Verified correct via `git check-ignore -v .env` (matches .gitignore:4).
If a tool reports it as empty, that read is stale. Do not act on it.

## Deploy
railway.json: build = `prisma generate`, start = `prisma migrate deploy`
then `tsx src/server/index.ts`. Healthcheck /api/health.
Never `migrate dev` in production.

Railway services: the app service, plus Postgres instances named
`workaround-db` (prod) and `workaround-db-dev`. The app service sets
DATABASE_URL = ${{workaround-db.DATABASE_URL}} — the reference must match
the real service name, not `Postgres`.

Known tradeoff: the server runs through tsx rather than compiled JS,
because src/lib uses extensionless relative imports and src/lib is settled.
tsx and prisma are therefore runtime dependencies, not dev. Optional later
cleanup: bundle the server with esbuild, which resolves the imports at build
time and removes both from production. Not a priority before Aug 18.