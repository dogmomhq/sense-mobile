// questions.js — SNAPSHOT PLACEHOLDER ONLY. Contains no real questions and no real answers.
//
// 2026-08-24 (CJ: "45 videos in both, no images"). This file used to hold the entire
// 85-question bank: text, options, a PUBLIC image URL whose filename named the animal
// (e.g. 01_raccoon_surgeon.jpg — verified reachable), and the CORRECT ANSWER INDEX. Every
// entry was identical to the server's PAID bank at the same index, so anyone who extracted
// the app bundle held a complete answer key for every paid question. That was a larger
// exposure than anything the security audit found — the clip bank was merely one way to
// build such a table; this file handed it over.
//
// It existed because practice ran offline. Practice has not been offline since clips shipped
// (every round downloads video), so shipping answers bought nothing. Practice now asks the
// server for a question, and the server keeps the answer and grades the response —
// /api/practice/question and /api/practice/answer. Both modes draw from the same video-backed
// pool, so the clips serve practice and paid alike and the pool grows on its own as more ship.
// Nothing needs to change in this file when questions are added.
//
// The only remaining consumer is the web `?test` snapshot hook (window.__sense), which needs
// *a* question shape to render a screenshot. These placeholders exist purely for that.
// NEVER put a real question or a real answer in this file again.

export const PRACTICE_QUESTIONS = [
  { text: 'What animal is this?', options: ['Placeholder A', 'Placeholder B', 'Placeholder C', 'Placeholder D'], correct: 0 },
  { text: 'What animal is this?', options: ['Sample One', 'Sample Two', 'Sample Three', 'Sample Four'], correct: 1 },
  { text: 'What animal is this?', options: ['Example W', 'Example X', 'Example Y', 'Example Z'], correct: 2 },
  { text: 'What animal is this?', options: ['Demo Red', 'Demo Blue', 'Demo Green', 'Demo Gold'], correct: 3 },
];
