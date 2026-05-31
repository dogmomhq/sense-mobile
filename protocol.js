// protocol.js — THE WebSocket protocol contract for Sense.
// Single source of truth for every message between client and the live server (dogmomhq/sense-server).
// Grounded in the line-by-line server audit (2026-05-31). Web + mobile both follow THIS — change here, both stay in sync.
//
// GOTCHAS baked in (from the audit — these silently break the client if ignored):
//  * `tier` in `queue`/`create` is the BARE number (1..4). The server prepends paymentMode to build its pool key
//    (e.g. "none:1"). Do NOT send "none:1" yourself.
//  * Free mode (mobile) sends paymentMode:'none' — this bypasses ALL Solana/on-chain code on the server.
//  * Player `name` must be UNIQUE — matchmaking keys on it; two clients with the same name ghost each other.
//  * The result message for online matchmaking is `async-result` (NOT `result`, which is the challenge-room shape).
//  * Times the server sends (answer-ack.serverTime, async-result *.serverTime) are ALREADY countdown- and
//    RTT-adjusted display values — show them directly, don't re-adjust. Your own displayed time stays LOCAL (freeze-on-tap).
//  * answerIndex === -1 means "timed out".

// ---------- TIMING CONSTANTS (mirror server) ----------
export const TIME_LIMIT_MS = 10000;   // answer window
export const COUNTDOWN_MS   = 2400;   // 3 ticks x 800ms
export const ANSWER_TIMEOUT_GRACE_MS = 500; // safety-net auto-submit fires at TIME_LIMIT + grace (~10.5s)

// ---------- CLIENT -> SERVER (messages the app SENDS) ----------
// Free-mode / online matchmaking (what mobile uses):
export const queue = (name, tier = 1, { wallet = null, onChainGameId = null, paymentMode = 'none' } = {}) =>
  ({ type: 'queue', name, tier, paymentMode, wallet, onChainGameId });
/** answerIndex: 0..3, or -1 for timeout. clientTime: ms since GO (local). */
export const asyncAnswer = (matchId, answerIndex, clientTime) =>
  ({ type: 'async-answer', matchId, answerIndex, clientTime });
export const cancelMatch = (matchId) => ({ type: 'cancel-match', matchId });
export const rttPong = (nonce) => ({ type: 'rtt-pong', nonce });
export const keepalive = () => ({ type: 'keepalive' }); // server ignores; native ws ping is the real keepalive

// Challenge (friend-game ROOM engine) — for Phase 4:
export const createRoom = (name, tier = 1, { wallet = null, onChainGameId = null, paymentMode = 'none' } = {}) =>
  ({ type: 'create', name, tier, paymentMode, wallet, onChainGameId });
export const joinRoom = (gameId, name, { wallet = null } = {}) => ({ type: 'join', gameId, name, wallet });
export const answer = (answerIndex, clientTime) => ({ type: 'answer', answerIndex, clientTime }); // room-mode
export const pong = (nonce) => ({ type: 'pong', nonce }); // room-mode latency probe
export const rematch = () => ({ type: 'rematch' });

// Solana / paid only (WEB-ONLY — mobile free mode never sends these):
export const verifyWallet = (wallet, signature, message) => ({ type: 'verify-wallet', wallet, signature, message });

// ---------- SERVER -> CLIENT (messages the app HANDLES) ----------
export const SERVER_MSG = {
  // async / online matchmaking
  ASYNC_OPPONENT_FOUND: 'async-opponent-found', // { opponentName }
  ASYNC_QUESTION:       'async-question',        // { matchId, question:{ text, imageToken, options[] } }
  ASYNC_WAITING:        'async-waiting',         // { matchId, message }
  ANSWER_ACK:           'answer-ack',            // { matchId, serverTime }  (serverTime = display-adjusted)
  ASYNC_RESULT:         'async-result',          // see AsyncResult typedef below
  GAME_EXPIRED:         'game-expired',          // { matchId, message }
  QUEUE_FAILED:         'queue-failed',          // { matchId, error }
  MATCH_CANCELLED:      'match-cancelled',       // { matchId, wager, txSignature }  (txSignature null in free mode)
  CANCEL_DENIED:        'cancel-denied',         // { matchId, message, remainingMs }
  // RTT / keepalive
  RTT_PING:             'rtt-ping',              // { nonce } -> reply rttPong(nonce)
  RTT_RESULT:           'rtt-result',            // { rtt }
  PING:                 'ping',                  // { nonce } (room) -> reply pong(nonce)
  // challenge room
  CREATED:              'created',               // { gameId }
  JOINED:               'joined',                // { hostName, tier }
  OPPONENT_JOINED:      'opponent-joined',       // { name }
  ROUND_START:          'round-start',           // { round, question:{...}, goDelay }
  ROUND_GO:             'round-go',              // { round }
  OPPONENT_ANSWERED:    'opponent-answered',     // {}
  RESULT:               'result',                // room result (NO serverTime/tier) — different shape from async-result
  OPPONENT_WANTS_REMATCH:'opponent-wants-rematch',// {}
  OPPONENT_DISCONNECTED:'opponent-disconnected', // {}
  REMATCH_CHAIN_SETUP:  'rematch-chain-setup',
  // errors
  ERROR:                'error',                 // { message }
  // Solana / paid (WEB-ONLY — mobile ignores these)
  VERIFY_WALLET_RESULT: 'verify-wallet-result',
  CHAIN_CREATED:        'chain-created',
  CHAIN_JOINED:         'chain-joined',
  CHAIN_JOINING:        'chain-joining',
  CHAIN_COMPLETE:       'chain-complete',
  CHAIN_ERROR:          'chain-error',
  SETTLE_TX:            'settle-tx',
};

// Message types the mobile FREE/ONLINE client must handle (everything else is web/solana):
export const MOBILE_ONLINE_INBOUND = [
  SERVER_MSG.ASYNC_OPPONENT_FOUND, SERVER_MSG.ASYNC_QUESTION, SERVER_MSG.ASYNC_WAITING,
  SERVER_MSG.ANSWER_ACK, SERVER_MSG.ASYNC_RESULT, SERVER_MSG.GAME_EXPIRED,
  SERVER_MSG.QUEUE_FAILED, SERVER_MSG.MATCH_CANCELLED, SERVER_MSG.CANCEL_DENIED,
  SERVER_MSG.RTT_PING, SERVER_MSG.RTT_RESULT,
];

/**
 * @typedef {Object} AsyncSide   per-player block inside async-result
 * @property {number} answer       chosen index, -1 if timed out
 * @property {string} answerText
 * @property {number} time         raw ms
 * @property {number} serverTime   DISPLAY value (countdown+RTT removed) — show this
 * @property {('win'|'loss'|'draw')} result
 * @property {string} [name]       opponent only
 *
 * @typedef {Object} AsyncResult
 * @property {string} matchId
 * @property {number} tier
 * @property {AsyncSide} you
 * @property {AsyncSide} opponent
 * @property {number} correctIdx
 * @property {string} correctAnswer
 * @property {string[]} options
 * @property {('correct_answer'|'both_wrong'|'faster'|'same_speed')} reason
 *
 * @typedef {Object} AsyncQuestion
 * @property {string} matchId
 * @property {{ text:string, imageToken:string, options:string[] }} question   image: GET {SERVER}/img/{imageToken}
 */

// Build the animal image URL from a token (server serves it from memory, 120s TTL):
export const imageUrl = (serverHttpBase, imageToken) => `${serverHttpBase}/img/${imageToken}`;

// Free-mode server (preview). Mobile sets this; do not hardcode elsewhere.
export const PREVIEW_SERVER_WS = 'wss://web-production-c6ec6.up.railway.app';
