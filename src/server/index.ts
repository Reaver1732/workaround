/**
 * The WorkAround API.
 *
 * Three endpoints, no auth, no sessions, no cookies. A judge opening the demo
 * should hit zero friction, so there is nothing to sign into and nothing is
 * persisted per user. All student input arrives in the POST body.
 *
 * This process also serves the built client from dist/ when it exists, so one
 * Railway service covers both.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';

import { prisma } from './db';
import { parseScheduleRequest } from './validate';
import {
  CandidateCourse,
  CandidateMeeting,
  CandidateSection,
  generateSchedules,
} from '../lib/generateSchedules';
import { Day } from '../lib/time';

const app = express();

// The term used when a request does not name one.
const DEFAULT_TERM = 'FALL2026';

// Ranked schedules returned per request. Diagnostics are never truncated, and
// diagnostics.survivors still reports the true total.
const MAX_SCHEDULES_RETURNED = 50;

// Where Vite will put the built client. Absent until the UI is built.
const CLIENT_DIR = path.resolve('dist');

app.use(express.json({ limit: '1mb' }));

// --------------------------------------------------------------------------
// GET /api/health
// --------------------------------------------------------------------------

app.get('/api/health', async (_req: Request, res: Response) => {
  // False until a query actually succeeds; a reachable process with an
  // unreachable database is exactly the state worth reporting.
  let dbConnected = false;
  let sectionCount = 0;

  try {
    sectionCount = await prisma.section.count();
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  res.json({ ok: true, dbConnected, sectionCount });
});

// --------------------------------------------------------------------------
// GET /api/courses
// --------------------------------------------------------------------------

app.get('/api/courses', async (req: Request, res: Response, next: NextFunction) => {
  let term = DEFAULT_TERM;
  if (typeof req.query.term === 'string' && req.query.term.length > 0) {
    term = req.query.term;
  }

  try {
    const courses = await prisma.course.findMany({
      where: { sections: { some: { term } } },
      orderBy: [{ subject: 'asc' }, { number: 'asc' }],
      include: {
        sections: {
          where: { term },
          orderBy: [{ sectionCode: 'asc' }],
          include: { meetings: { orderBy: [{ startMin: 'asc' }] } },
        },
      },
    });

    res.json({ term, courses });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------------------------------
// POST /api/schedules
// --------------------------------------------------------------------------

app.post('/api/schedules', async (req: Request, res: Response, next: NextFunction) => {
  const parsed = parseScheduleRequest(req.body, DEFAULT_TERM);

  if (parsed.ok === false) {
    res.status(400).json({ error: parsed.message });
    return;
  }

  const request = parsed.value;

  try {
    // Every section id the request asked for, across all courses.
    const requestedIds: string[] = [];
    for (let i = 0; i < request.courses.length; i++) {
      const ids = request.courses[i].sectionIds;
      for (let j = 0; j < ids.length; j++) {
        requestedIds.push(ids[j]);
      }
    }

    const rows = await prisma.section.findMany({
      where: { id: { in: requestedIds }, term: request.term },
      include: { meetings: true, course: true },
    });

    const byId = new Map<string, (typeof rows)[number]>();
    for (let i = 0; i < rows.length; i++) {
      byId.set(rows[i].id, rows[i]);
    }

    // Ids that matched no section in this term.
    const unknownIds: string[] = [];
    for (let i = 0; i < requestedIds.length; i++) {
      if (byId.has(requestedIds[i]) === false) {
        unknownIds.push(requestedIds[i]);
      }
    }

    if (unknownIds.length > 0) {
      res.status(400).json({
        error:
          `${unknownIds.length} section id(s) do not exist in term ${request.term}: ` +
          `${unknownIds.join(', ')}.`,
      });
      return;
    }

    // Sections whose course does not match the course they were listed under.
    const misfiled: string[] = [];
    const courses: CandidateCourse[] = [];

    for (let i = 0; i < request.courses.length; i++) {
      const selection = request.courses[i];
      const sections: CandidateSection[] = [];
      // Filled from the first section, since all of them share this course.
      let subject = '';
      let number = '';

      for (let j = 0; j < selection.sectionIds.length; j++) {
        // Guaranteed present: unknown ids were rejected above. The check is
        // here to satisfy the type, not because it can fire.
        const row = byId.get(selection.sectionIds[j]);
        if (row !== undefined) {
          if (row.courseId !== selection.courseId) {
            misfiled.push(
              `${row.id} belongs to ${row.course.subject} ${row.course.number}, ` +
              `not to course ${selection.courseId}`
            );
          }

          subject = row.course.subject;
          number = row.course.number;

          const meetings: CandidateMeeting[] = [];
          for (let k = 0; k < row.meetings.length; k++) {
            const meeting = row.meetings[k];
            meetings.push({
              days: meeting.days as Day[],
              startMin: meeting.startMin,
              endMin: meeting.endMin,
            });
          }

          sections.push({
            id: row.id,
            sectionCode: row.sectionCode,
            meetings,
          });
        }
      }

      courses.push({
        id: selection.courseId,
        subject,
        number,
        sections,
      });
    }

    if (misfiled.length > 0) {
      res.status(400).json({
        error: `Section ids grouped under the wrong course: ${misfiled.join('; ')}.`,
      });
      return;
    }

    const result = generateSchedules(courses, {
      workBlocks: request.workBlocks,
      commuteMinutes: request.commuteMinutes,
      minShiftMinutes: request.minShiftMinutes,
      hourlyWage: request.hourlyWage,
      targetHoursPerWeek: request.targetHoursPerWeek,
      maxCombinations: request.maxCombinations,
    });

    res.json({
      schedules: result.schedules.slice(0, MAX_SCHEDULES_RETURNED),
      diagnostics: result.diagnostics,
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------------------------------
// Static client, when it has been built
// --------------------------------------------------------------------------

if (existsSync(CLIENT_DIR) === true) {
  app.use(express.static(CLIENT_DIR));
}

// Anything not under /api is the client's business. Falling back to
// index.html keeps client-side routing and shareable URL state working.
// Written as middleware rather than a wildcard route because Express 5
// rejects the old "*" path syntax.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/') === true) {
    next();
    return;
  }
  if (req.method !== 'GET') {
    next();
    return;
  }

  const indexFile = path.join(CLIENT_DIR, 'index.html');
  if (existsSync(indexFile) === false) {
    res.status(503).json({
      error: 'The client has not been built yet. The API is up: try /api/health.',
    });
    return;
  }

  res.sendFile(indexFile);
});

// Unmatched /api routes.
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}.` });
});

// Last stop. Never leak a stack trace to the client.
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);

  // Body-parser marks malformed JSON with a 400 status on the error itself.
  let status = 500;
  let message = 'Something went wrong on the server.';
  if (isPlainObject(error) === true) {
    const candidate = error as { status?: unknown; type?: unknown };
    if (candidate.status === 400 || candidate.type === 'entity.parse.failed') {
      status = 400;
      message = 'Request body is not valid JSON.';
    }
  }

  res.status(status).json({ error: message });
});

function isPlainObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null;
}

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`WorkAround API listening on ${port}`);
  if (existsSync(CLIENT_DIR) === false) {
    console.log(`No client build at ${CLIENT_DIR}; serving the API only.`);
  }
});
