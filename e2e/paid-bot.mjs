// paid-bot.mjs — harness opponent for the paid E2E.
//
// ROLE FLIP (2026-07-21, after run 8): the ROBOT is now the CREATOR — its Maestro
// flow then has the exact practice-flow shape (8s creator countdown absorbs
// waitForAnimationToEnd, taps land at question start with the full 10s window).
// Run 8 failed because as JOINER the question appears ~instantly and the 9s
// animation wait ate the whole answer window (robot timed out, late taps hit
// PLAY AGAIN on results and requeued a stray open game).
//
// This bot: signs in, connects, WAITS until the robot's open game is at the FIFO
// head, then queues — the server matches it in as guest (creator socket is live,
// so no recorded answer is required). Answers idx 0 @6s so the robot's live tap
// decides the match. Queue-busy gating now lives in paid-precheck.mjs (runs
// foreground BEFORE the robot launches).
import WebSocket from 'ws';
import { readFileSync } from 'fs';
import pg from 'pg';

const WS_URL = process.env.WS_URL || 'wss://web-production-c6ec6.up.railway.app';
const SUPABASE_URL = 'https://nexpzwfemjcqdrljrfjy.supabase.co';
const SR = process.env.SUPABASE_SERVICE_ROLE;
const ctx = JSON.parse(readFileSync('/tmp/e2e-ctx.json', 'utf8'));

const grant = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
  method: 'POST',
  headers: { apikey: SR, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: ctx.botEmail, password: ctx.botPassword }),
}).then(r => r.json());
if (!grant.access_token) { console.error('BOT GRANT FAILED', JSON.stringify(grant).slice(0, 200)); process.exit(1); }
const supabaseToken = grant.access_token;

const ws = new WebSocket(WS_URL);
let answered = false, settled = false, stranger = false, queued = false;
const say = (o) => ws.send(JSON.stringify(o));
const log = (tag, o) => console.log(`[bot ${new Date().toISOString()}] ${tag} ${typeof o === 'string' ? o : JSON.stringify(o)}`);

// Wait for the ROBOT's open game to reach the FIFO head, then queue as guest.
// If a stranger's game is at the head, queuing would FIFO-join THEIRS — never do that.
async function waitForRobotGameThenQueue() {
  const db = new pg.Client({
    connectionString: (process.env.SENSE_DB_URL || '').replace(':5432', ':6543'),
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();
  for (let i = 0; i < 75; i++) {                     // 75 x 2s = 150s budget
    const { rows } = await db.query(
      "select player_a, match_id from game_queue where status='open' and player_b is null order by id asc limit 1");
    if (rows.length && rows[0].player_a === ctx.robotHandle) {
      await db.end();
      say({ type: 'queue', name: ctx.botHandle, tier: 1, paymentMode: 'credits', wallet: null, onChainGameId: null,
            supabaseToken, preferredHandle: ctx.botHandle, src: 'tap' });
      queued = true;
      log('sent', `queue tier1 credits (robot game ${rows[0].match_id} at head)`);
      return;
    }
    if (rows.length) log('waiting', `FIFO head is ${rows[0].player_a} (not robot) — hold (${i})`);
    await new Promise(s => setTimeout(s, 2000));
  }
  await db.end();
  log('timeout', 'robot open game never reached FIFO head in 150s — no wager made (exit 5)');
  process.exit(5);
}

ws.on('open', () => {
  log('open', WS_URL);
  waitForRobotGameThenQueue().catch(e => { log('poll-error', e.message); process.exit(1); });
});
ws.on('message', (buf) => {
  let m; try { m = JSON.parse(buf.toString()); } catch { return; }
  log('recv', m);
  if (m.type === 'async-opponent-found') {
    const opp = m.opponent && m.opponent.name || m.opponentName || m.name || '?';
    if (String(opp) !== String(ctx.robotHandle)) {
      stranger = true;
      log('STRANGER-PAIRED', `opponent=${opp} expected=${ctx.robotHandle} — playing out, will exit 4`);
    } else log('paired', `opponent=${opp} (robot, as planned)`);
  }
  if (m.type === 'async-question' && !answered) {
    answered = true;
    setTimeout(() => {
      say({ type: 'async-answer', matchId: m.matchId, answerIndex: 0, clientTime: 6000,
            name: ctx.botHandle, supabaseToken });
      log('sent', `async-answer match=${m.matchId} idx=0 t=6000`);
    }, 6000);
  }
  if (m.type === 'async-result') { settled = true; log('SETTLED', m.you && m.you.result); setTimeout(() => process.exit(stranger ? 4 : 0), 1500); }
  if (m.type === 'error') log('SERVER-ERROR', m.message || m.code);
});
ws.on('close', (c) => { log('close', c); if (!settled) process.exit(stranger ? 4 : (queued ? (answered ? 0 : 2) : 5)); });
ws.on('error', (e) => log('ws-error', e.message));
setInterval(() => { if (ws.readyState === WebSocket.OPEN) say({ type: 'keepalive' }); }, 25000);
setTimeout(() => { log('timeout', `queued=${queued} answered=${answered} settled=${settled} stranger=${stranger}`); process.exit(stranger ? 4 : (answered ? 0 : 3)); }, 300000);
