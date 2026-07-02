// protocol.ts — THE WebSocket protocol contract for Sense (TypeScript).
// Single source of truth for every message between client and the live server (dogmomhq/sense-server).
// Grounded in the line-by-line server audit (2026-05-31). Web + mobile both import THIS — change here, both stay in sync.
//
// GOTCHAS baked in (these silently break the client if ignored):
//  * `tier` in queue/create is the BARE number (1..4). The server prepends paymentMode to build its pool key
//    (e.g. "none:1"). Do NOT send "none:1" yourself.
//  * Free mode (mobile) sends paymentMode:'none' — bypasses ALL Solana/on-chain code on the server.
//  * Player name must be UNIQUE — matchmaking keys on it; duplicate names ghost each other.
//  * The result message for online matchmaking is `async-result` (NOT `result`, the challenge-room shape).
//  * Server times (answer-ack.serverTime, async-result *.serverTime) are ALREADY countdown- and RTT-adjusted
//    display values — show them directly. Your own displayed time stays LOCAL (freeze-on-tap).
//  * answerIndex === -1 means "timed out".

// ---------- TIMING CONSTANTS (mirror server) ----------
export const TIME_LIMIT_MS = 10000;
export const COUNTDOWN_MS = 2400;            // 3 ticks x 800ms
export const ANSWER_TIMEOUT_GRACE_MS = 500;  // safety-net auto-submit at ~10.5s

export type PaymentMode = 'none' | 'solana';
export type ResultKind = 'win' | 'loss' | 'draw';
export type ResultReason = 'correct_answer' | 'both_wrong' | 'faster' | 'same_speed';

// ---------- CLIENT -> SERVER ----------
export interface QueueMsg { type: 'queue'; name: string; tier: number; paymentMode: PaymentMode; wallet: string | null; onChainGameId: number | null; }
export interface AsyncAnswerMsg { type: 'async-answer'; matchId: string; answerIndex: number; clientTime: number; name?: string | null; token?: string | null; supabaseToken?: string | null; }
export interface CancelMatchMsg { type: 'cancel-match'; matchId: string; name?: string | null; token?: string | null; supabaseToken?: string | null; }
export interface RttPongMsg { type: 'rtt-pong'; nonce: number; }
export interface KeepaliveMsg { type: 'keepalive'; }
export interface CreateRoomMsg { type: 'create'; name: string; tier: number; paymentMode: PaymentMode; wallet: string | null; onChainGameId: number | null; }
export interface JoinRoomMsg { type: 'join'; gameId: string; name: string; wallet: string | null; }
export interface AnswerMsg { type: 'answer'; answerIndex: number; clientTime: number; }
export interface PongMsg { type: 'pong'; nonce: number; }
export interface RematchMsg { type: 'rematch'; }
export interface VerifyWalletMsg { type: 'verify-wallet'; wallet: string; signature: string; message: string; }

export type ClientMessage =
  | QueueMsg | AsyncAnswerMsg | CancelMatchMsg | RttPongMsg | KeepaliveMsg
  | CreateRoomMsg | JoinRoomMsg | AnswerMsg | PongMsg | RematchMsg | VerifyWalletMsg;

// Builders (free-mode / online — what mobile uses):
export const queue = (name: string, tier = 1, opts: { wallet?: string | null; onChainGameId?: number | null; paymentMode?: PaymentMode } = {}): QueueMsg =>
  ({ type: 'queue', name, tier, paymentMode: opts.paymentMode ?? 'none', wallet: opts.wallet ?? null, onChainGameId: opts.onChainGameId ?? null });
/** answerIndex: 0..3, or -1 for timeout. clientTime: ms since GO (local).
 *  Optional identity (name/token/supabaseToken) lets the server verify the sender
 *  on a fresh socket after a reconnect (server recovers ws._asyncName from it). */
export const asyncAnswer = (matchId: string, answerIndex: number, clientTime: number, identity: { name?: string | null; token?: string | null; supabaseToken?: string | null } = {}): AsyncAnswerMsg =>
  ({ type: 'async-answer', matchId, answerIndex, clientTime, ...identity });
export const cancelMatch = (matchId: string, identity: { name?: string | null; token?: string | null; supabaseToken?: string | null } = {}): CancelMatchMsg => ({ type: 'cancel-match', matchId, ...identity });
export const rttPong = (nonce: number): RttPongMsg => ({ type: 'rtt-pong', nonce });
export const keepalive = (): KeepaliveMsg => ({ type: 'keepalive' });
// Challenge room (Phase 4):
export const createRoom = (name: string, tier = 1, opts: { wallet?: string | null; onChainGameId?: number | null; paymentMode?: PaymentMode } = {}): CreateRoomMsg =>
  ({ type: 'create', name, tier, paymentMode: opts.paymentMode ?? 'none', wallet: opts.wallet ?? null, onChainGameId: opts.onChainGameId ?? null });
export const joinRoom = (gameId: string, name: string, opts: { wallet?: string | null } = {}): JoinRoomMsg =>
  ({ type: 'join', gameId, name, wallet: opts.wallet ?? null });
export const answer = (answerIndex: number, clientTime: number): AnswerMsg => ({ type: 'answer', answerIndex, clientTime });
export const pong = (nonce: number): PongMsg => ({ type: 'pong', nonce });
export const rematch = (): RematchMsg => ({ type: 'rematch' });
// Solana / paid only (WEB-ONLY):
export const verifyWallet = (wallet: string, signature: string, message: string): VerifyWalletMsg =>
  ({ type: 'verify-wallet', wallet, signature, message });

// ---------- SERVER -> CLIENT ----------
export const SERVER_MSG = {
  ASYNC_OPPONENT_FOUND: 'async-opponent-found',
  ASYNC_QUESTION: 'async-question',
  ASYNC_WAITING: 'async-waiting',
  ANSWER_ACK: 'answer-ack',
  ASYNC_RESULT: 'async-result',
  GAME_EXPIRED: 'game-expired',
  QUEUE_FAILED: 'queue-failed',
  MATCH_CANCELLED: 'match-cancelled',
  CANCEL_DENIED: 'cancel-denied',
  MATCH_UNAVAILABLE: 'match-unavailable',  // CANCEL pass: answered a match that's gone (cancelled/reverted) -> client re-queues cleanly
  RTT_PING: 'rtt-ping',
  RTT_RESULT: 'rtt-result',
  PING: 'ping',
  CREATED: 'created',
  JOINED: 'joined',
  OPPONENT_JOINED: 'opponent-joined',
  ROUND_START: 'round-start',
  ROUND_GO: 'round-go',
  OPPONENT_ANSWERED: 'opponent-answered',
  RESULT: 'result',
  OPPONENT_WANTS_REMATCH: 'opponent-wants-rematch',
  OPPONENT_DISCONNECTED: 'opponent-disconnected',
  REMATCH_CHAIN_SETUP: 'rematch-chain-setup',
  ERROR: 'error',
  // Solana / paid (WEB-ONLY — mobile ignores):
  VERIFY_WALLET_RESULT: 'verify-wallet-result',
  CHAIN_CREATED: 'chain-created',
  CHAIN_JOINED: 'chain-joined',
  CHAIN_JOINING: 'chain-joining',
  CHAIN_COMPLETE: 'chain-complete',
  CHAIN_ERROR: 'chain-error',
  SETTLE_TX: 'settle-tx',
} as const;
export type ServerMsgType = typeof SERVER_MSG[keyof typeof SERVER_MSG];

export interface AsyncQuestion { matchId: string; question: { text: string; imageToken: string; options: string[]; questionIdx?: number }; }
export interface AsyncSide { answer: number; answerText: string; time: number; serverTime: number; result: ResultKind; name?: string; }
export interface AsyncResult { matchId: string; tier: number; you: AsyncSide; opponent: AsyncSide; correctIdx: number; correctAnswer: string; options: string[]; reason: ResultReason; }
export interface AnswerAck { matchId: string; serverTime: number; }
export interface MatchCancelled { matchId: string; wager: number; txSignature: string | null; alreadyGone?: boolean; }
// matchStarted=true => the cancel lost the race to an opponent join; the match is now live and will
// resolve via async-result (so the client should stop suppressing it, not boot). Otherwise it's the
// 2-min anti-abuse lockout.
export interface CancelDenied { matchId: string; message: string; remainingMs: number; matchStarted?: boolean; }
export interface MatchUnavailable { matchId: string; message: string; }

// Types the mobile FREE/ONLINE client handles (everything else is web/solana):
export const MOBILE_ONLINE_INBOUND: ServerMsgType[] = [
  SERVER_MSG.ASYNC_OPPONENT_FOUND, SERVER_MSG.ASYNC_QUESTION, SERVER_MSG.ASYNC_WAITING,
  SERVER_MSG.ANSWER_ACK, SERVER_MSG.ASYNC_RESULT, SERVER_MSG.GAME_EXPIRED,
  SERVER_MSG.QUEUE_FAILED, SERVER_MSG.MATCH_CANCELLED, SERVER_MSG.CANCEL_DENIED,
  SERVER_MSG.MATCH_UNAVAILABLE,
  SERVER_MSG.RTT_PING, SERVER_MSG.RTT_RESULT,
];

// Animal image URL from a token (server serves from memory, 120s TTL):
export const imageUrl = (serverHttpBase: string, imageToken: string): string => `${serverHttpBase}/img/${imageToken}`;

// Free-mode server (preview). Mobile sets this; do not hardcode elsewhere.
export const PREVIEW_SERVER_WS = 'wss://web-production-c6ec6.up.railway.app';
