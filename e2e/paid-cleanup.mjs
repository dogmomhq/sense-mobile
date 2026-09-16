// paid-cleanup.mjs — teardown for the paid E2E run. ALWAYS runs (if: always()).
// Order:
//   1. reset server_config e2e_accounts='' (stop geo bypass first)
//   2. SQL-expire non-terminal games that are PURELY e2e (e2e-created unmatched
//      opens + e2e-vs-e2e matched) so the server's 60s cron leaves them alone.
//      Mixed games (e2e vs real player) are NEVER touched — server settles them.
//   3. one transaction: scrub ledgers/accounts/users/attest ONLY for accounts whose
//      every match is pure-e2e; delete rake legs for pure-e2e matches with atomic
//      house decrement; verify house stored==ledger or ROLLBACK.
//      Accounts touching a mixed match are LEFT INTACT (deleting half a real match
//      would corrupt the money audit forever) — loud warning instead.
//   4. delete game_queue rows for pure-e2e matches
//   5. delete Supabase auth users for scrubbed accounts only
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

  // 2. expire ONLY pure-e2e non-terminal games
  const exp = await client.query(
    `UPDATE game_queue SET status='expired'
     WHERE player_a = ANY($1) AND (player_b IS NULL OR player_b = ANY($1))
       AND status IN ('open','matched','settling')
     RETURNING match_id`, [handles]);
  console.log(`CLEANUP: expired ${exp.rowCount} pure-e2e non-terminal games`);

  // classify every match the e2e accounts touched
  const mres = await client.query(
    `SELECT DISTINCT l.match_id, g.player_a, g.player_b
     FROM credit_ledger l LEFT JOIN game_queue g ON g.match_id = l.match_id
     WHERE l.account_id = ANY($1) AND l.match_id IS NOT NULL`, [ids]);
  const pure = [], mixed = [];
  for (const r of mres.rows) {
    const ok = (!r.player_a || handles.includes(r.player_a)) && (!r.player_b || handles.includes(r.player_b));
    (ok ? pure : mixed).push(r.match_id);
  }
  if (mixed.length) {
    console.log(`CLEANUP WARNING: MIXED-MATCH LEFTOVER — ${mixed.length} match(es) involve a real player: ${mixed.join(', ')}`);
    console.log('CLEANUP WARNING: leaving BOTH e2e accounts + all their rows intact (never corrupt a real match). Reconcile manually.');
  }

  if (!mixed.length) {
    // 3. atomic scrub (only when every match is pure e2e)
    await client.query('BEGIN');
    let rakeSum = 0;
    if (pure.length) {
      const rk = await client.query(
        `DELETE FROM credit_ledger WHERE account_id='house' AND type='rake' AND match_id = ANY($1)
         RETURNING amount`, [pure]);
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

    // 4. pure-e2e game rows
    if (!failed) {
      const gq = await client.query(
        `DELETE FROM game_queue WHERE player_a = ANY($1) AND (player_b IS NULL OR player_b = ANY($1))`, [handles]);
      console.log(`CLEANUP: deleted ${gq.rowCount} game_queue rows`);
    }

    // 5. Supabase auth users
    if (!failed) {
      for (const id of ids) {
        const r = await fetch(`${SB}/auth/v1/admin/users/${id}`, {
          method: 'DELETE', headers: { apikey: SR, Authorization: `Bearer ${SR}` } });
        console.log(`CLEANUP: auth user ${id.slice(0, 8)} delete → ${r.status}`);
      }
    }
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
