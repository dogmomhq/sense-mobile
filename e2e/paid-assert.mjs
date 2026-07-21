// paid-assert.mjs — ground truth for the paid E2E. Polls the DB until the robot's
// match settles, then asserts money conservation. Exits 0 = PAID GREEN.
import pg from 'pg';
import { readFileSync } from 'fs';

const DB_URL = (process.env.SENSE_DB_URL || '').replace(':5432', ':6543');
const ctx = JSON.parse(readFileSync('/tmp/e2e-ctx.json', 'utf8'));
const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const fail = async (msg, extra) => { console.error('ASSERT FAIL:', msg, extra || ''); await c.end(); process.exit(1); };

// 1. the robot's match: created this run, settled
let match = null;
for (let i = 0; i < 12; i++) {
  const { rows } = await c.query(
    `SELECT match_id, status, tier, payment_mode, player_a, player_b, answer_a, answer_b
     FROM game_queue
     WHERE (player_a = $1 OR player_b = $1) AND payment_mode = 'credits'
     ORDER BY id DESC LIMIT 3`, [ctx.robotHandle]);
  if (rows.length && rows[0].status === 'settled') { match = rows[0]; break; }
  if (rows.length) console.log(`waiting for settle... status=${rows[0].status} (${i})`);
  else console.log(`waiting for match row... (${i})`);
  await new Promise(r => setTimeout(r, 5000));
}
if (!match) await fail('no settled credits match for robot handle', ctx.robotHandle);
console.log('match:', JSON.stringify(match));

// 2. conservation: all ledger legs for this match sum to zero
const { rows: legs } = await c.query(
  `SELECT account_id, type, amount FROM credit_ledger WHERE match_id = $1 ORDER BY id`, [match.match_id]);
const sum = legs.reduce((s, l) => s + Number(l.amount), 0);
console.log('legs:', JSON.stringify(legs), 'sum:', sum);
if (sum !== 0) await fail(`match legs sum ${sum}c != 0`, match.match_id);
if (!legs.some(l => l.type === 'entry')) await fail('no entry legs', match.match_id);

// 3. per-account: stored balance == ledger sum for both e2e accounts
for (const id of [ctx.robotId, ctx.botId]) {
  const { rows: [{ bal }] } = await c.query(`SELECT COALESCE((SELECT balance FROM credit_accounts WHERE account_id=$1),0) AS bal`, [id]);
  const { rows: [{ ls }] } = await c.query(`SELECT COALESCE(SUM(amount),0) AS ls FROM credit_ledger WHERE account_id=$1`, [id]);
  console.log(`account ${id.slice(0, 8)}: stored=${bal} ledger=${ls}`);
  if (Number(bal) !== Number(ls)) await fail(`account ${id} stored ${bal} != ledger ${ls}`);
}
await c.end();
console.log('PAID ASSERT: GREEN — settled match, legs sum 0, balances consistent');
