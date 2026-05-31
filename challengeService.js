// challengeService.js — Modular challenge lifecycle manager (MOBILE)
// Reused VERBATIM from the web client — the friend-game state machine is identical.
// ONLY the 3 window.location URL helpers (buildInviteUrl / getGameIdFromUrl /
// clearGameIdFromUrl) are swapped for a mobile-friendly code/Expo-Linking adapter,
// exactly as called out in MULTIPLAYER-MASTER-PLAN.md (the "link adapter seam").
//
// This service owns challenge STATE only. It doesn't touch the DOM or React.
// Components call it, it calls WS, it emits state changes via callbacks.

import { wsSend, wsSendWhenReady } from './websocket.js';

// --- State ---
let _challenge = null;   // Current active challenge (host or joiner)
let _listeners = [];      // State change callbacks

function emit() {
  const snapshot = _challenge ? { ..._challenge } : null;
  _listeners.forEach(fn => fn(snapshot));
}

// --- Public API ---

/** Subscribe to challenge state changes. Returns unsubscribe function. */
export function onChallengeChange(fn) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(f => f !== fn); };
}

/** Get current challenge state (snapshot). */
export function getChallenge() {
  return _challenge ? { ..._challenge } : null;
}

/** Host creates a challenge. Tier must be selected before calling. */
export function createChallenge({ tier, playerName, wallet, paymentMode, onChainGameId }) {
  _challenge = {
    role: 'host',
    gameId: null,
    tier,
    status: 'creating',
    hostName: playerName,
    joinerName: null,
    inviteUrl: null,
    paymentMode: paymentMode || 'none',
    wallet: wallet || null,
    onChainGameId: onChainGameId || null,
  };
  emit();

  wsSendWhenReady({
    type: 'create',
    name: playerName,
    tier,
    wallet: wallet || null,
    paymentMode: paymentMode || 'none',
    onChainGameId: onChainGameId || null,
  });
}

/** Joiner accepts a challenge (sends join to server). */
export function acceptChallenge({ gameId, playerName, wallet }) {
  _challenge = {
    role: 'joiner',
    gameId,
    tier: null, // filled in by 'joined' message
    status: 'accepting',
    hostName: null,
    joinerName: playerName,
    inviteUrl: null,
    paymentMode: null,
    wallet: wallet || null,
    onChainGameId: null,
  };
  emit();

  wsSendWhenReady({
    type: 'join',
    gameId,
    name: playerName,
    wallet: wallet || null,
  });
}

/** Request rematch after a challenge game. */
export function requestRematch() {
  if (!_challenge) return;
  wsSend({ type: 'rematch' });
}

/** Close/leave the current challenge. */
export function closeChallenge() {
  _challenge = null;
  emit();
}

// ---- MOBILE link adapter (the only deviation from web) ----
// Web shared a ?game=<id> URL. Mobile shares the bare game CODE (typed or pasted
// on the other device), which works in Expo Go / Snack today. A sense://game/<id>
// deep link can replace this in a dev build (Phase 5) without touching the state machine.
/** Build the shareable invite from a gameId — on mobile this is the bare code. */
export function buildInviteUrl(gameId) {
  return gameId;
}

/** Mobile has no launch URL to parse (deep-link handling is added in a dev build). */
export function getGameIdFromUrl() {
  return null;
}

/** No-op on mobile (no URL to clear). */
export function clearGameIdFromUrl() {}

// --- WS Message Handler ---
// App.js calls this for challenge-related messages.
// Returns true if the message was handled, false if not a challenge message.

export function handleChallengeMessage(msg) {
  switch (msg.type) {
    case 'created': {
      if (_challenge && _challenge.role === 'host') {
        _challenge.gameId = msg.gameId;
        _challenge.status = 'waiting';
        _challenge.inviteUrl = buildInviteUrl(msg.gameId);
        emit();
      }
      return true;
    }

    case 'joined': {
      if (_challenge && _challenge.role === 'joiner') {
        _challenge.hostName = msg.hostName;
        _challenge.tier = msg.tier;
        _challenge.status = 'joined';
        emit();
      }
      return true;
    }

    case 'opponent-joined': {
      if (_challenge && _challenge.role === 'host') {
        _challenge.joinerName = msg.name;
        _challenge.status = 'joined';
        emit();
      }
      return true;
    }

    case 'opponent-wants-rematch': {
      if (_challenge) {
        _challenge.opponentWantsRematch = true;
        emit();
      }
      return true;
    }

    case 'opponent-disconnected': {
      if (_challenge) {
        _challenge.opponentDisconnected = true;
        emit();
      }
      return true;
    }

    default:
      return false;
  }
}
