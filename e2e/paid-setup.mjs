// paid-setup.mjs — provision two throwaway Supabase users (robot + harness bot),
// seed them server-side (DOB, attest, 300c credits), and flag them in
// server_config e2e_accounts so the geo datacenter gate lets the Azure runner in.
// Everything created here is torn down by paid-cleanup.mjs (always-run step).
import pg from 'pg';
import { writeFileSync } from 'fs';

const SUPABASE_URL = 'https://nexpzwfemjcqdrljrfjy.supabase.co';
const SR = process.env.SUPABASE_SERVICE_ROLE;
const DB_URL = (process.env.SENSE_DB_URL || '').replace(':5432', ':6543'); // transaction pooler — never burn session slots
const RUN = process.env.RUN_ID || String(Date.now());
if (!SR || !DB_URL) { console.error('missing SUPABASE_SERVICE_ROLE / SENSE_DB_URL'); process.exit(1); }

const uniq = `${RUN}x${Date.now().toString(36).slice(-4)}`;
const mk = (who) => ({
  email: `e2e-${who}-${uniq}@sense-e2e.test`,
  password: 'E2e!' + Math.random().toString(36).slice(2, 12) + 'Zz9',
  handle: `E2E${who[0].toUpperCase() + who.slice(1)}${uniq}`.slice(0, 24).replace(/[^\w#]/g, ''),
});

async function gotrue(path, opts = {}) {
  const r = await fetch(SUPABASE_URL + path, {
    ...opts,
    headers: { apikey: SR, Authorization: 'Bearer ' + SR, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} -> ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

async function createAndGrant(u) {
  const created = await gotrue('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email: u.email, password: u.password, email_confirm: true }) });
  const session = await gotrue('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: u.email, password: u.password }) });
  if (!session.expires_at && session.expires_in) session.expires_at = Math.floor(Date.now() / 1000) + Number(session.expires_in);
  return { id: created.id, session };
}

const robot = mk('robot'), bot = mk('bot');
const r = await createAndGrant(robot);
const b = await createAndGrant(bot);
console.log('robot user:', r.id, robot.handle);
console.log('bot   user:', b.id, bot.handle);

const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('BEGIN');
  for (const [id, h, who] of [[r.id, robot.handle, 'robot'], [b.id, bot.handle, 'bot']]) {
    await client.query(`INSERT INTO users (account_id, handle, dob) VALUES ($1,$2,'1990-01-01')
                        ON CONFLICT (account_id) DO UPDATE SET handle=EXCLUDED.handle, dob=EXCLUDED.dob`, [id, h]);
    await client.query(`INSERT INTO credit_accounts (account_id, handle, balance) VALUES ($1,$2,300)
                        ON CONFLICT (account_id) DO UPDATE SET balance=300, handle=EXCLUDED.handle`, [id, h]);
    await client.query(`INSERT INTO credit_ledger (account_id, type, amount, balance_after, note)
                        VALUES ($1,'bonus',300,300,$2)`, [id, `E2E seed run ${RUN}`]);
    await client.query(`INSERT INTO device_attest (account_id, key_id, verdict) VALUES ($1,$2,'valid')
                        ON CONFLICT (key_id) DO NOTHING`, [id, `e2e-${who}-${uniq}`]);
  }
  await client.query(`INSERT INTO server_config (key, value) VALUES ('e2e_accounts',$1)
                      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [`${r.id},${b.id}`]);
  await client.query('COMMIT');
} catch (e) { await client.query('ROLLBACK'); throw e; } finally { await client.end(); }

writeFileSync('/tmp/e2e-session.json', JSON.stringify(r.session));
writeFileSync('/tmp/e2e-ctx.json', JSON.stringify({
  runId: RUN, robotId: r.id, botId: b.id,
  robotHandle: robot.handle, botHandle: bot.handle,
  robotEmail: robot.email, botEmail: bot.email, botPassword: bot.password,
}, null, 2));
console.log('seeded: DOB 1990-01-01, 300c each, attest valid, e2e_accounts flag set');
