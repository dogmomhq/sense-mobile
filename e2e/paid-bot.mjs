// paid-bot.mjs — harness opponent for the paid E2E. Signs in with a real Supabase
// password grant, queues tier 1 (50c credits) in the REAL pool, answers its async
// question slowly + wrong (answerIndex 0 unless 0 is correct-proof; clientTime 6s)
// so the sim robot's live answer decides the match. Logs every server message.
import WebSocket from 'ws';
import { readFileSync } from 'fs';

const WS_URL = process.env.WS_URL || 'wss://web-production-c6ec6.up.railway.app';
const SUPABASE_URL = 'https://nexpzwfemjcqdrljrfjy.supabase.co';
const SR = process.env.SUPABASE_SERVICE_ROLE;
const ctx = JSON.parse(readFileSync('/tmp/e2e-ctx.json', 'utf8'));

// Queue-busy pre-check: never join a real player's waiting open game. Poll up to 90s, then abort
// BEFORE any wager. Exit 5 = QUEUE-BUSY (distinct from real failures).
if (process.env.SENSE_DB_URL) {
  const { Client } = (await import('pg')).default;
  const db = new Client({ connectionString: process.env.SENSE_DB_URL.replace(':5432', ':6543'), ssl: { rejectUnauthorized: false } });
  await db.connect();
  let busy = true;
  for (let i = 0; i < 10; i++) {
    const r = await db.query("select count(*)::int as n from game_queue where status='open' and player_b is null");
    if (r.rows[0].n === 0) { busy = false; break; }
    console.log(`[bot] QUEUE-BUSY: ${r.rows[0].n} real open game(s) waiting — sleep 9s (${i + 1}/10)`);
    await new Promise(s => setTimeout(s, 9000));
  }
  await db.end();
  if (busy) { console.log('[bot] QUEUE-BUSY after 90s — aborting paid phase before any wager (exit 5)'); process.exit(5); }
  console.log('[bot] queue clear — proceeding');
}

const grant = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
  method: 'POST',
  headers: { apikey: SR, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: ctx.botEmail, password: ctx.botPassword }),
}).then(r => r.json());
if (!grant.access_token) { console.error('BOT GRANT FAILED', JSON.stringify(grant).slice(0, 200)); process.exit(1); }
const supabaseToken = grant.access_token;

const ws = new WebSocket(WS_URL);
let answered = false, settled = false, stranger = false;
const say = (o) => ws.send(JSON.stringify(o));
const log = (tag, o) => console.log(`[bot ${new Date().toISOString()}] ${tag} ${typeof o === 'string' ? o : JSON.stringify(o)}`);

ws.on('open', () => {
  log('open', WS_URL);
  say({ type: 'queue', name: ctx.botHandle, tier: 1, paymentMode: 'credits', wallet: null, onChainGameId: null,
        supabaseToken, preferredHandle: ctx.botHandle, src: 'tap' });
  log('sent', 'queue tier1 credits');
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
ws.on('close', (c) => { log('close', c); if (!settled) process.exit(stranger ? 4 : (answered ? 0 : 2)); });
ws.on('error', (e) => log('ws-error', e.message));
setInterval(() => { if (ws.readyState === WebSocket.OPEN) say({ type: 'keepalive' }); }, 25000);
setTimeout(() => { log('timeout', `answered=${answered} settled=${settled} stranger=${stranger}`); process.exit(stranger ? 4 : (answered ? 0 : 3)); }, 300000);
