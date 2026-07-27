// paid-assert.mjs — ground truth for the paid E2E. Polls the DB until the robot's
// match settles, then asserts money conservation AND that the robot actually
// answered via UI taps. Exits 0 = PAID GREEN.
//
// Run-8 lesson: don't assume rows[0] is THE match — a stray tap on PLAY AGAIN can
// leave a NEWER open row for the robot. Find the settled row, then fail loudly if
// any stray open/matched rows exist (that means the flow tapped something it
// shouldn't have).
import pg from 'pg';
import { readFileSync } from 'fs';

const DB_URL = (process.env.SENSE_DB_URL || '').replace(':5432', ':6543');
const ctx = JSON.parse(readFileSync('/tmp/e2e-ctx.json', 'utf8'));
const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const fail = async (msg, extra) => { console.error('ASSERT FAIL:', msg, extra || ''); await c.end(); process.exit(1); };

// 1. the robot's match(es): created this run, settled (draws settle too — settleAsync
//    always ends at status 'settled'; refund legs keep the sum at zero).
//    B61: EXPECT_MATCHES=2 in the runback scenario — match 1 AND the PLAY-AGAIN
//    re-queue must BOTH settle. 1 settled + 1 timed-out orphan = the old glitch.
const EXPECT = Math.max(1, parseInt(process.env.EXPECT_MATCHES || '1', 10));
let matches = [];
for (let i = 0; i < 18; i++) {
  const { rows } = await c.query(
    `SELECT match_id, status, tier, payment_mode, player_a, player_b, answer_a, answer_b
     FROM game_queue
     WHERE (player_a = $1 OR player_b = $1) AND payment_mode = 'credits'
     ORDER BY id DESC LIMIT 8`, [ctx.robotHandle]);
  matches = rows.filter(r => r.status === 'settled');
  if (matches.length >= EXPECT) break;
  if (rows.length) console.log(`waiting for settle ${matches.length}/${EXPECT}... newest status=${rows[0].status} (${i})`);
  else console.log(`waiting for match row... (${i})`);
  await new Promise(r => setTimeout(r, 5000));
}
if (matches.length < EXPECT) await fail(`only ${matches.length}/${EXPECT} settled credits matches for robot`, ctx.robotHandle);
matches = matches.slice(0, EXPECT);
console.log('matches:', JSON.stringify(matches));

// 2. the robot must have ANSWERED via taps in EVERY match (that is the point of the
//    rig). -1 / null = timed out -> the UI flow failed even if money is clean. In the
//    runback scenario a -1 on match 2 = the exact 2026-07-27 orphan (50c timeout loss).
for (const match of matches) {
  const side = match.player_a === ctx.robotHandle ? 'a' : 'b';
  const robotAnswer = match['answer_' + side];
  if (robotAnswer === null || Number(robotAnswer) === -1)
    await fail(`robot (player_${side}) never answered in ${match.match_id} — answer=${robotAnswer} (orphaned/timed out)`);
  console.log(`robot answered in ${match.match_id}: player_${side} idx=${robotAnswer}`);
}

// 3. no stray open/matched rows for the robot (a late tap on PLAY AGAIN creates one)
const { rows: strays } = await c.query(
  `SELECT match_id, status FROM game_queue
   WHERE (player_a = $1 OR player_b = $1) AND status IN ('open','matched')`, [ctx.robotHandle]);
if (strays.length) await fail(`stray non-terminal game(s) for robot — flow tapped something it shouldn't: ${JSON.stringify(strays)}`);

// 4. conservation: all ledger legs for EACH match sum to zero
for (const match of matches) {
  const { rows: legs } = await c.query(
    `SELECT account_id, type, amount FROM credit_ledger WHERE match_id = $1 ORDER BY id`, [match.match_id]);
  const sum = legs.reduce((s, l) => s + Number(l.amount), 0);
  console.log(`legs ${match.match_id}:`, JSON.stringify(legs), 'sum:', sum);
  if (sum !== 0) await fail(`match legs sum ${sum}c != 0`, match.match_id);
  if (!legs.some(l => l.type === 'entry')) await fail('no entry legs', match.match_id);
}

// 5. per-account: stored balance == ledger sum for both e2e accounts
for (const id of [ctx.robotId, ctx.botId]) {
  const { rows: [{ bal }] } = await c.query(`SELECT COALESCE((SELECT balance FROM credit_accounts WHERE account_id=$1),0) AS bal`, [id]);
  const { rows: [{ ls }] } = await c.query(`SELECT COALESCE(SUM(amount),0) AS ls FROM credit_ledger WHERE account_id=$1`, [id]);
  console.log(`account ${id.slice(0, 8)}: stored=${bal} ledger=${ls}`);
  if (Number(bal) !== Number(ls)) await fail(`account ${id} stored ${bal} != ledger ${ls}`);
}
await c.end();
console.log(`PAID ASSERT: GREEN — ${matches.length} settled match(es), robot answered in all, no strays, legs sum 0, balances consistent`);
