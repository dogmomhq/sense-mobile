// B171 CLIENT EVENT LOG
// ---------------------------------------------------------------------------
// Why this file exists. DepositCoinflow has always timestamped every pay-button
// event — mount, loadStart, loadEnd, error, per brand — via its stamp() helper,
// and written them to console.log plus an on-screen debug line behind a hidden
// flag. Nowhere else. On 2026-09-11 CJ tapped Apple Pay five times and nothing
// happened; the app knew exactly why and discarded it five times, and all that
// survived were five expired deposit intents and a guess.
//
// Design rules, in order of importance:
//  1. It must NEVER affect the thing it is watching. Every call is fire-and-
//     forget, wrapped, and a failed POST is dropped, not retried forever.
//  2. It is a diagnostic, not an audit trail. Dropping events is fine.
//  3. It must work before sign-in — a dead deposit button is often the reason
//     someone is not signed in yet. So it identifies with the device id, and the
//     server attributes an account only if the caller's own token proves one.
import { installIdSync } from './installId';

const MAX_QUEUE = 60;      // hard ceiling; oldest dropped first
const BATCH_MS = 1500;     // coalesce a burst of button events into one POST
const MAX_BATCH = 40;      // the server rejects more than this per request

let base = null;           // https base, set by configure()
let token = null;          // player auth token, if we have one
let build = null;
let queue = [];
let timer = null;
let sending = false;

export function configure({ httpsBase, authToken, buildTag } = {}) {
  if (httpsBase) base = httpsBase;
  if (authToken !== undefined) token = authToken || null;
  if (buildTag) build = buildTag;
}

// A session groups one visit to one screen, so a whole timeline can be pulled
// back out with ?session=… instead of guessing from timestamps.
export function buildTag() { return build; }

export function newSession(prefix = 's') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function logEvent(kind, session, name, tMs, meta) {
  try {
    if (!name) return;
    queue.push({ kind: String(kind || 'client'), session: session || null, name: String(name), tMs, meta: meta || null });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    if (!timer) timer = setTimeout(() => { timer = null; flush(); }, BATCH_MS);
  } catch (e) {}
}

export async function flush() {
  if (sending || !base || !queue.length) return;
  let deviceId = null;
  try { deviceId = installIdSync(); } catch (e) { deviceId = null; }
  if (!deviceId) return;                     // nothing to attribute it to; drop
  // One POST carries one kind + one session — the server stores those per request.
  const head = queue[0];
  const batch = [];
  const rest = [];
  for (const e of queue) {
    if (e.kind === head.kind && e.session === head.session && batch.length < MAX_BATCH) batch.push(e);
    else rest.push(e);
  }
  if (!batch.length) return;
  queue = rest;
  sending = true;
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const kill = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, 6000) : null;
    await fetch(base + '/api/client-events', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { 'x-auth-token': token } : {}),
      body: JSON.stringify({ deviceId, build, kind: head.kind, session: head.session,
        events: batch.map((e) => ({ name: e.name, tMs: e.tMs, meta: e.meta })) }),
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (kill) clearTimeout(kill);
  } catch (e) {
    // Deliberately NOT requeued. If the network is the problem, the events
    // describing the network problem are not worth making it worse.
  } finally {
    sending = false;
    if (queue.length && !timer) timer = setTimeout(() => { timer = null; flush(); }, BATCH_MS);
  }
}

export default { configure, buildTag, newSession, logEvent, flush };
