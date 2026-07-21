// paid-cleanup.mjs — teardown for the paid E2E run. ALWAYS runs (if: always()).
// Order matters:
//   1. reset server_config e2e_accounts='' (stop geo bypass FIRST so nothing new can queue)
//   2. SQL-expire any open/matched e2e games (before scrubbing, so the server's 60s
//      expiry cron can't refund-into rows we're about to delete)
//   3. one transaction: delete e2e ledgers/accounts/users/attest + rake legs for their
//      matches WITH atomic house decrement; verify house stored==ledger or ROLLBACK
//   4. delete game_queue rows involving e2e handles
//   5. delete the two Supabase auth users
//   6. print global invariant (every account: stored == ledger sum)
import fs from 'fs';
import pg from 'pg';

const DB_URL = (process.env.SENSE_DB_URL || '').replace(':5432', ':6543'); // transaction pooler
const SR = process.env.SUPABASE_SERVICE_ROLE;
const SB = 'https://nexpzwfemjcqdrljrfjy.supabase.co';
if (!DB_URL || !SR) { console.error('CLEANUP: missing SENSE_DB_URL or SUPABASE_SERVICE_ROLE'); process.exit(1); }

let ctx = null;
try { ctx = JSON.parse(fs.readFileSync('/tmp/e2e-ctx.json', 'utf8')); }
catch { console.log('CLEANUP: no /tmp/e2e-ctx.json — setup never ran, nothing to clean'); process.exit(0); }

const ids = [ctx.robotId, ctx.botId].filter(Boolean);
const handles = [ctx.robotHandle, ctx.botHandle].filter(Boolean);
if (!ids.length) { console.log('CLEANUP: ctx has no ids, nothing to clean'); process.exit(0); }

const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
let failed = false;

try {
  // 1. flag off first
  await client.query(`UPDATE server_config SET value='' WHERE key='e2e_accounts'`);
  console.log('CLEANUP: e2e_accounts flag reset');

  // 2. expire any non-terminal e2e games so the server cron leaves them alone
  const exp = await client.query(
    `UPDATE game_queue SET status='expired'
     WHERE (player_a = ANY($1) OR player_b = ANY($1)) AND status IN ('open','matched','settling')
     RETURNING match_id, status`, [handles]);
  console.log(`CLEANUP: expired ${exp.rowCount} non-terminal e2e games`);

  // matches these accounts ever touched (for rake-leg removal)
  const mres = await client.query(
    `SELECT DISTINCT match_id FROM credit_ledger WHERE account_id = ANY($1) AND match_id IS NOT NULL`, [ids]);
  const matchIds = mres.rows.map(r => r.match_id);

  // 3. atomic scrub
  await client.query('BEGIN');
  let rakeSum = 0;
  if (matchIds.length) {
    const rk = await client.query(
      `DELETE FROM credit_ledger WHERE account_id='house' AND type='rake' AND match_id = ANY($1)
       RETURNING amount`, [matchIds]);
    rakeSum = rk.rows.reduce((s, r) => s + Number(r.amount), 0);
    if (rakeSum > 0) {
      await client.query(`UPDATE credit_accounts SET balance = balance - $1 WHERE account_id='house'`, [rakeSum]);
    }
    console.log(`CLEANUP: removed ${rk.rowCount} rake legs (${rakeSum}c) + decremented house`);
  }
  await client.query(`DELETE FROM credit_ledger WHERE account_id = ANY($1)`, [ids]);
  await client.query(`DELETE FROM credit_accounts WHERE account_id = ANY($1)`, [ids]);
  await client.query(`DELETE FROM device_attest WHERE account_id = ANY($1)`, [ids]);
  await client.query(`DELETE FROM users WHERE account_id = ANY($1)`, [ids]);

  // verify house consistency INSIDE the transaction; rollback if broken
  const hv = await client.query(
    `SELECT (SELECT balance FROM credit_accounts WHERE account_id='house') AS stored,
            (SELECT COALESCE(SUM(amount),0) FROM credit_ledger WHERE account_id='house') AS ledger`);
  const { stored, ledger } = hv.rows[0];
  if (Number(stored) !== Number(ledger)) {
    await client.query('ROLLBACK');
    console.error(`CLEANUP RED: house stored=${stored} != ledger=${ledger} after scrub — ROLLED BACK`);
    failed = true;
  } else {
    await client.query('COMMIT');
    console.log(`CLEANUP: scrub committed, house consistent (stored=${stored} == ledger=${ledger})`);
  }

  // 4. game rows (outside txn; harmless if some remain on failure)
  if (!failed) {
    const gq = await client.query(
      `DELETE FROM game_queue WHERE player_a = ANY($1) OR player_b = ANY($1)`, [handles]);
    console.log(`CLEANUP: deleted ${gq.rowCount} game_queue rows`);
  }

  // 5. Supabase auth users (best-effort even on failure — they're inert without DB rows)
  for (const id of ids) {
    const r = await fetch(`${SB}/auth/v1/admin/users/${id}`, {
      method: 'DELETE', headers: { apikey: SR, Authorization: `Bearer ${SR}` } });
    console.log(`CLEANUP: auth user ${id.slice(0, 8)} delete → ${r.status}`);
  }

  // 6. global invariant
  const gi = await client.query(
    `SELECT COUNT(*) AS bad FROM (
       SELECT ca.account_id FROM credit_accounts ca
       LEFT JOIN (SELECT account_id, SUM(amount) s FROM credit_ledger GROUP BY account_id) l
         ON l.account_id = ca.account_id
       WHERE ca.balance != COALESCE(l.s, 0)) x`);
  const bad = Number(gi.rows[0].bad);
  if (bad > 0) { console.error(`CLEANUP RED: ${bad} account(s) stored != ledger globally`); failed = true; }
  else console.log('CLEANUP: global invariant OK — every account stored == ledger');
} catch (e) {
  try { await client.query('ROLLBACK'); } catch {}
  console.error('CLEANUP RED:', e.message);
  failed = true;
} finally {
  await client.end();
}
process.exit(failed ? 1 : 0);
