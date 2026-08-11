/**
 * The only network call the app makes.
 *
 * Sections are fetched once. Everything after that, including every slider
 * drag, is solved in the browser against src/lib. POST /api/schedules still
 * exists server-side, but putting a round trip in front of a slider would
 * make the commute control feel dead.
 */

export interface ApiMeeting {
  // Row id.
  id: string;
  // Day codes: "MO", "WE", and so on.
  days: string[];
  // Start, minutes since midnight.
  startMin: number;
  // End, minutes since midnight.
  endMin: number;
  // LECTURE, LAB, DISCUSSION, SEMINAR, OTHER.
  kind: string;
  // Building name, null when online.
  building: string | null;
  // Room number, null when online.
  room: string | null;
}

export interface ApiSection {
  // Row id, used as the candidate section id by the solver.
  id: string;
  // Registration code shown to students.
  sectionCode: string;
  // SIS class number, null on invented sample data.
  classNbr: string | null;
  // Instructor of record, null for "Staff".
  instructor: string | null;
  // IN_PERSON, HYBRID, ONLINE_SYNC, ONLINE_ASYNC.
  mode: string;
  // True for invented demo alternates.
  isSample: boolean;
  // Meeting patterns. Empty for fully asynchronous sections.
  meetings: ApiMeeting[];
}

export interface ApiCourse {
  // Row id.
  id: string;
  // Subject code, e.g. "COMP SCI".
  subject: string;
  // Catalog number, e.g. "120".
  number: string;
  // Catalog title.
  title: string;
  // Credit hours.
  credits: number;
  // Every section offered in the requested term.
  sections: ApiSection[];
}

export interface CoursesResponse {
  term: string;
  courses: ApiCourse[];
}

export async function fetchCourses(term: string): Promise<CoursesResponse> {
  const response = await fetch(`/api/courses?term=${encodeURIComponent(term)}`);

  if (response.ok === false) {
    throw new Error(`The section list could not be loaded (HTTP ${response.status}).`);
  }

  return (await response.json()) as CoursesResponse;
}
