// gameEngine.js — Practice mode logic, answer validation, payout calculation

import { PRACTICE_QUESTIONS } from './questions.js';

// Pick a practice question, avoiding recently used ones.
// B91 poolSize (2026-08-22 CJ "practice mode should be videos as well"): when set,
// only the first N bank questions are eligible — N=20 is the set with server video
// clips (videos/<idx>.mp4), so every practice round gets a clip. Widen/remove when
// more clips exist. Mirrors the server's own VIDEO-ONLY picker for paid rounds.
export function getPracticeQuestion(usedIndices, poolSize = null) {
  const cap = poolSize && poolSize > 0 ? Math.min(poolSize, PRACTICE_QUESTIONS.length) : PRACTICE_QUESTIONS.length;
  let available = PRACTICE_QUESTIONS.slice(0, cap).map((_, i) => i).filter(i => !usedIndices.includes(i));
  if (available.length === 0) available = PRACTICE_QUESTIONS.slice(0, cap).map((_, i) => i); // reset pool
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
  const difficulty = getPracticeDifficulty(practiceHistory);

  // Computer correctness: ~60% base, harder when player winning
  const correctChance = 0.5 + (difficulty * 0.1); // 0.5 to 0.8
  const isCorrect = Math.random() < correctChance;
  const answer = isCorrect ? correctIdx : getWrongAnswer(correctIdx, optionCount);

  // Computer speed: 1.5s to 6s, faster when difficulty is higher
  const minTime = 1500 - (difficulty * 200);
  const maxTime = 6000 - (difficulty * 500);
  const time = Math.round(minTime + Math.random() * (maxTime - minTime));

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

  // Both correct — faster wins (with 50ms tie threshold)
  const diff = Math.abs(playerTime - computerTime);
  if (diff < 50) return { result: 'draw', reason: 'same_speed' };
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
