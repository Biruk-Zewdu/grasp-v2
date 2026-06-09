"use client";

// The learner's JOURNEY through a document — tracked client-side (localStorage,
// per version). The personalized study sheet is synthesized FROM this at the end:
// what they got wrong on the pre-quiz, the sections they read, the questions they
// asked, the operators they applied. Early on it's sparse (prompt to engage);
// after real use it's rich enough to build a focused, personal sheet.

export type Journey = {
  preMisses: string[]; // question stems the learner missed on the pre-quiz
  preScore?: { correct: number; total: number };
  sectionsRead: string[]; // subtopic titles opened
  questionsAsked: string[]; // follow-ups they typed
  operatorsApplied: { op: string; section: string; title: string }[]; // reasoning moves run
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
    /* storage best-effort */
  }
}
function blank(): Journey {
  return { preMisses: [], sectionsRead: [], questionsAsked: [], operatorsApplied: [] };
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

export function recordSection(v: number, title: string) {
  const j = read(v);
  if (!j.sectionsRead.includes(title)) j.sectionsRead.push(title);
  write(v, j);
}

export function recordQuestion(v: number, q: string) {
  const j = read(v);
  j.questionsAsked.push(q);
  write(v, j);
}

export function recordOperator(v: number, op: string, section: string, title: string) {
  const j = read(v);
  j.operatorsApplied.push({ op, section, title });
  write(v, j);
}

/** A rough "how engaged are they" signal — gates the sparse vs rich study sheet. */
export function engagementScore(j: Journey): number {
  return j.sectionsRead.length + j.questionsAsked.length + j.operatorsApplied.length + (j.preScore ? 1 : 0);
}
