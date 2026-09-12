// gameEngine.js — Practice mode logic, answer validation, payout calculation

import { PRACTICE_QUESTIONS } from './questions.js';

// Pick a practice question, avoiding recently used ones.
// B91 poolSize (2026-08-22 CJ "practice mode should be videos as well"): when set,
// only the first N bank questions are eligible — N=20 is the set with server video
// clips (videos/<idx>.mp4), so every practice round gets a clip. Widen/remove when
// more clips exist. Mirrors the server's own VIDEO-ONLY picker for paid rounds.
export function getPracticeQuestion(usedIndices, pool = null) {
  // B92: pool may be an ARRAY of eligible question indices (video-backed set is no
  // longer contiguous) or a number meaning "first N" (legacy B91 behavior).
  let eligible;
  if (Array.isArray(pool)) eligible = pool.filter(i => i >= 0 && i < PRACTICE_QUESTIONS.length);
  else if (pool && pool > 0) eligible = PRACTICE_QUESTIONS.slice(0, Math.min(pool, PRACTICE_QUESTIONS.length)).map((_, i) => i);
  else eligible = PRACTICE_QUESTIONS.map((_, i) => i);
  let available = eligible.filter(i => !usedIndices.includes(i));
  if (available.length === 0) available = eligible; // reset pool
  const idx = available[Math.floor(Math.random() * available.length)];
  const q = PRACTICE_QUESTIONS[idx];

  // Shuffle options (keep track of where correct answer lands)
  const shuffled = q.options.map((opt, i) => ({ opt, isCorrect: i === q.correct }));
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const correctIdx = shuffled.findIndex(s => s.isCorrect);

  return {
    questionIdx: idx,
    text: q.text,
    image: q.image,
    options: shuffled.map(s => s.opt),
    correctIdx,
  };
}

// Generate computer opponent answer based on difficulty
export function getComputerAnswer(correctIdx, optionCount, practiceHistory) {
  // CJ 2026-09-12: the computer is right 80% of the time, flat — no difficulty ramp — and when the
  // player is ALSO right the player should win about 80% of those. Its answer time is drawn 1.2–6.0 s
  // with a bias to the slow end: a player who answers in ~2 s beats it ~80% of the time.
  const correctChance = 0.8;
  const isCorrect = Math.random() < correctChance;
  const answer = isCorrect ? correctIdx : getWrongAnswer(correctIdx, optionCount);
  const u = Math.random();
  const time = Math.round(1200 + Math.sqrt(u) * 4800); // sqrt skews toward the slow end (median ≈ 4.6 s)

  return { answer, time, isCorrect };
}

function getWrongAnswer(correctIdx, count) {
  let idx;
  do { idx = Math.floor(Math.random() * count); } while (idx === correctIdx);
  return idx;
}

function getPracticeDifficulty(history) {
  if (history.length < 3) return 1;
  const recent = history.slice(-5);
  const winRate = recent.filter(r => r).length / recent.length;
  if (winRate >= 0.8) return 3; // player dominating
  if (winRate >= 0.6) return 2;
  return 1; // player struggling
}

// Determine practice result
export function determinePracticeResult(playerAnswer, playerTime, computerAnswer, computerTime, correctIdx) {
  const playerCorrect = playerAnswer === correctIdx;
  const computerCorrect = computerAnswer === correctIdx;

  if (playerCorrect && !computerCorrect) return { result: 'win', reason: 'correct_answer' };
  if (!playerCorrect && computerCorrect) return { result: 'loss', reason: 'wrong_answer' };
  if (!playerCorrect && !computerCorrect) return { result: 'draw', reason: 'both_wrong' };

  // Both correct — faster wins. CJ 2026-09-12: 1 ms faster wins (was a 50 ms tie window); only an exact tie draws.
  if (playerTime < computerTime) return { result: 'win', reason: 'faster' };
  if (computerTime < playerTime) return { result: 'loss', reason: 'slower' };
  return { result: 'draw', reason: 'same_speed' };
}

// Calculate payout for display
export function calculatePayout(result, wager) {
  if (result === 'win') return ((wager * 2) * 0.95).toFixed(2);
  if (result === 'draw') return wager.toFixed(2);
  return '0.00';
}

// Format time in seconds
export function formatTime(ms) {
  return (ms / 1000).toFixed(2) + 's';
}

// Get human-readable reason text
export function getReasonText(reason) {
  const map = {
    correct_answer: 'Correct answer',
    wrong_answer: 'Wrong answer',
    faster: 'Faster answer',
    slower: 'Slower answer',
    both_wrong: 'Both wrong',
    same_speed: 'Same speed',
    timeout: 'Time expired',
  };
  return map[reason] || reason || '';
}

// Generate a random player name
export function generatePlayerName() {
  const adj = ['Swift', 'Quick', 'Sharp', 'Bold', 'Cool', 'Wild', 'Fast', 'Keen'];
  const animals = ['Fox', 'Hawk', 'Wolf', 'Bear', 'Lion', 'Eagle', 'Tiger', 'Lynx'];
  return adj[Math.floor(Math.random() * adj.length)] +
    animals[Math.floor(Math.random() * animals.length)] +
    Math.floor(Math.random() * 100);
}

// Sanitize user-supplied strings (prevent XSS)
export function sanitize(str) {
  if (!str) return '';
  return String(str).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}
