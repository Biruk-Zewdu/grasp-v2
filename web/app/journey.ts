"use client";

// The learner's JOURNEY through a document — tracked client-side (localStorage,
// per version). It is SECTION-KEYED memory: for each First Principles section the
// learner visits, we remember what they actually did there — the key idea they
// read, the reasoning operators they applied (with results), and the questions
// they asked (with answers). The study sheet is then LITERALLY their journey
// through First Principles: section by section, their own work, not a generic
// summary. A section the learner never touched stays empty — the sheet shows what
// THEY built, and nudges the gaps.

export type OpMemory = { op: string; title: string; body: string };
export type QAMemory = { q: string; a: string };

export type SectionMemory = {
  subtopicId: number;
  title: string;
  headline?: string; // the lesson's headline (the key idea)
  recap?: string; // a one-line takeaway of the section's lesson
  operators: OpMemory[]; // reasoning moves the learner ran here
  questions: QAMemory[]; // follow-ups the learner asked here
  visitedAt: number; // ordering
};

export type Journey = {
  preMisses: string[];
  preScore?: { correct: number; total: number };
  sections: Record<number, SectionMemory>; // keyed by subtopicId
  order: number[]; // subtopicIds in the order first visited
  _seq: number; // monotonic counter for visitedAt (Date.now is fine client-side)
};

const KEY = (v: number) => `grasp.journey.${v}`;

function read(v: number): Journey {
  if (typeof window === "undefined") return blank();
  try {
    const raw = localStorage.getItem(KEY(v));
    return raw ? { ...blank(), ...JSON.parse(raw) } : blank();
  } catch {
    return blank();
  }
}
function write(v: number, j: Journey) {
  try {
    localStorage.setItem(KEY(v), JSON.stringify(j));
  } catch {
    /* best-effort */
  }
}
function blank(): Journey {
  return { preMisses: [], sections: {}, order: [], _seq: 0 };
}

function ensureSection(j: Journey, subtopicId: number, title: string): SectionMemory {
  if (!j.sections[subtopicId]) {
    j.sections[subtopicId] = { subtopicId, title, operators: [], questions: [], visitedAt: ++j._seq };
    j.order.push(subtopicId);
  }
  return j.sections[subtopicId];
}

export function getJourney(v: number): Journey {
  return read(v);
}

export function recordPreQuiz(v: number, misses: string[], correct: number, total: number) {
  const j = read(v);
  j.preMisses = misses;
  j.preScore = { correct, total };
  write(v, j);
}

/** The learner opened a section and read its lesson — remember the key idea. */
export function recordSectionVisit(
  v: number,
  subtopicId: number,
  title: string,
  headline?: string,
  recap?: string,
) {
  const j = read(v);
  const s = ensureSection(j, subtopicId, title);
  if (headline) s.headline = headline;
  if (recap) s.recap = recap;
  write(v, j);
}

/** The learner applied a reasoning operator in a section — remember the result. */
export function recordOperator(
  v: number,
  subtopicId: number,
  title: string,
  op: string,
  opTitle: string,
  body: string,
) {
  const j = read(v);
  const s = ensureSection(j, subtopicId, title);
  s.operators.push({ op, title: opTitle, body });
  write(v, j);
}

/** The learner asked a question in a section — remember the exchange. */
export function recordQA(v: number, subtopicId: number, title: string, q: string, a: string) {
  const j = read(v);
  const s = ensureSection(j, subtopicId, title);
  s.questions.push({ q, a });
  write(v, j);
}

export function sectionList(j: Journey): SectionMemory[] {
  return j.order.map((id) => j.sections[id]).filter(Boolean);
}

/** How much the learner has actually built — gates the "earn your sheet" prompt. */
export function engagementScore(j: Journey): number {
  const secs = sectionList(j);
  const interactions = secs.reduce((n, s) => n + s.operators.length + s.questions.length, 0);
  return secs.length + interactions + (j.preScore ? 1 : 0);
}
