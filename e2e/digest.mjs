// digest.mjs — the morning report (CJ 2026-09-24: "bugs surface every morning from anyone's phone, not when I hit one").
// Reads the last 24 h from the server DB + Apple's TestFlight feedback/crash inbox, writes a markdown digest, and pushes
// a one-line summary to CJ's phone through the server's own push. Runs from CI (secrets: SENSE_DB_URL, SENSE_ADMIN_KEY,
// ASC_API_KEY_BASE64). Read-only against the game; the only write is the push and the digest file.
import pg from 'pg';
import { createSign, createPrivateKey } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
const BASE = process.env.SENSE_BASE || 'https://web-production-c6ec6.up.railway.app';
const DBURL = process.env.SENSE_DB_URL || process.env.DATABASE_URL; const ADMIN = process.env.SENSE_ADMIN_KEY || '';
const ASC_B64 = process.env.ASC_API_KEY_BASE64 || '', ASC_KID = process.env.ASC_KEY_ID || '47N638GLZG', ASC_ISS = process.env.ASC_ISSUER_ID || 'b26d5075-81df-418d-93b6-a3dd7be13e0c';
const BUNDLE = 'com.dogmomhq.sensemobile';
const HOURS = Number(process.env.DIGEST_HOURS || 24);
const TEST_NAMES = "handle NOT LIKE 'Load%' AND handle NOT LIKE 'Sparring%' AND handle NOT LIKE 'Player%' AND handle NOT LIKE 'jzvg%' AND handle NOT LIKE 'q0au%' AND handle NOT LIKE 'Probe%'";
const pool = new pg.Pool({ connectionString: DBURL, ssl: { rejectUnauthorized: false }, max: 2 });
const q = async (sql, p = []) => (await pool.query(sql, p)).rows;
const since = `now() - interval '${HOURS} hours'`;
// bots, harness players, the e2e waiver list, and simulator installs (beacon `sim:true` from B218; before that the sim's
// iOS runtime string) are not "real players"
const testAcct = "(SELECT account_id FROM users WHERE handle LIKE 'Load%' OR handle LIKE 'Sparring%' OR handle LIKE 'jzvg%' OR handle LIKE 'q0au%' OR handle LIKE 'Probe%' OR handle LIKE 'Player%' OR handle LIKE 'E2E%' UNION SELECT unnest(string_to_array((SELECT value FROM server_config WHERE key='e2e_accounts'), ',')) UNION SELECT DISTINCT account_id FROM client_events WHERE kind='health' AND (meta->>'sim'='true' OR meta->>'os'='26.2') AND created_at>now()-interval '30 days')";
const out = []; const line = (s = '') => out.push(s);
const day = new Date().toISOString().slice(0, 10);
line(`# Sense daily digest — ${day} (last ${HOURS} h, UTC)`); line();

// ── 1. who played, how it went ───────────────────────────────────────────────────────────────
const sessions = await q(`SELECT u.handle, count(*) FILTER (WHERE e.name='launch') launches, max(e.build) build, min(e.created_at)::text first, max(e.created_at)::text last
  FROM client_events e JOIN users u ON u.account_id=e.account_id WHERE e.created_at>${since} AND e.kind='health' AND u.account_id NOT IN ${testAcct} GROUP BY 1 ORDER BY 2 DESC`);
const rounds = await q(`SELECT count(*)::int n, count(*) FILTER (WHERE payment_mode='credits')::int paid, count(*) FILTER (WHERE status='settled')::int settled,
  count(*) FILTER (WHERE status='expired')::int expired, count(*) FILTER (WHERE status IN ('open','matched'))::int live
  FROM game_queue WHERE created_at>${since} AND (account_a NOT IN ${testAcct} OR account_a IS NULL) AND player_a NOT LIKE 'Load%' AND player_a NOT LIKE 'jzvg%' AND player_a NOT LIKE 'q0au%' AND player_a NOT LIKE 'Player%' AND player_a NOT LIKE 'Sparring%'`);
line(`## Play`); line(`- Real players seen: **${sessions.length}** (${sessions.map((s) => `${s.handle} ×${s.launches} on ${s.build}`).join(', ') || 'none'})`);
line(`- Games (non-bot): **${rounds[0].n}** created · ${rounds[0].paid} paid · ${rounds[0].settled} settled · ${rounds[0].expired} expired unmatched · ${rounds[0].live} still live`);

// ── 2. the things that would have been "bugs CJ finds" ───────────────────────────────────────
const slow = await q(`SELECT u.handle, e.created_at::text t, (e.meta->>'ms')::int ms, e.meta->>'mid' mid FROM client_events e JOIN users u ON u.account_id=e.account_id
  WHERE e.created_at>${since} AND e.name='clip_drawing' AND (e.meta->>'ms')::int > 1500 AND u.account_id NOT IN ${testAcct} ORDER BY 3 DESC LIMIT 15`);
const clipFail = await q(`SELECT u.handle, e.created_at::text t, e.name, e.meta FROM client_events e JOIN users u ON u.account_id=e.account_id
  WHERE e.created_at>${since} AND e.name IN ('clip_failed') AND u.account_id NOT IN ${testAcct} ORDER BY 2 DESC LIMIT 15`);
const retries = await q(`SELECT u.handle, e.created_at::text t, e.name, e.meta FROM client_events e JOIN users u ON u.account_id=e.account_id
  WHERE e.created_at>${since} AND ((e.name='answer_sent' AND (e.meta->>'try')::int > 1) OR e.name='answer_unacked') AND u.account_id NOT IN ${testAcct} ORDER BY 2 DESC LIMIT 15`);
const lost = await q(`SELECT g.match_id, g.created_at::text t, CASE WHEN g.answer_a=-1 THEN g.player_a ELSE g.player_b END who FROM game_queue g
  WHERE g.created_at>${since} AND g.status='settled' AND g.payment_mode='credits' AND g.player_a NOT LIKE 'Load%' AND g.player_a NOT LIKE 'Player%'
  AND ((g.answer_a=-1 AND g.ready_a IS NOT NULL AND NOT EXISTS (SELECT 1 FROM answer_audit a WHERE a.match_id=g.match_id AND a.player=g.player_a))
    OR (g.answer_b=-1 AND g.ready_b IS NOT NULL AND NOT EXISTS (SELECT 1 FROM answer_audit a WHERE a.match_id=g.match_id AND a.player=g.player_b)))`);
const crashes = await q(`SELECT u.handle, e.created_at::text t, e.name, e.meta FROM client_events e JOIN users u ON u.account_id=e.account_id
  WHERE e.created_at>${since} AND e.name IN ('unclean_exit','crash','js_error') AND u.account_id NOT IN ${testAcct} ORDER BY 2 DESC LIMIT 15`);
const handoffs = await q(`SELECT created_at::text t, handle, code, detail FROM block_log WHERE created_at>${since} AND kind='clip' AND ${TEST_NAMES} ORDER BY 1 DESC LIMIT 15`);
const refunds = await q(`SELECT l.created_at::text t, u.handle, l.amount, l.note, l.match_id FROM credit_ledger l LEFT JOIN users u ON u.account_id=l.account_id
  WHERE l.created_at>${since} AND l.type='refund' AND l.account_id NOT IN ${testAcct} ORDER BY 1 DESC LIMIT 15`);
line(); line(`## Would-have-been-a-bug`);
const sec = (title, rows, fmt) => { line(`- **${title}: ${rows.length}**`); for (const r of rows) line(`  - ${fmt(r)}`); };
sec('Clips slower than 1.5 s to first frame', slow, (r) => `${r.handle} ${r.ms} ms at ${r.t.slice(11, 19)} (${r.mid})`);
sec('Clip failed to load / round backed out', clipFail, (r) => `${r.handle} ${r.t.slice(11, 19)} ${JSON.stringify(r.meta)}`);
sec('Answers that needed a resend or were never acked', retries, (r) => `${r.handle} ${r.t.slice(11, 19)} ${r.name} ${JSON.stringify(r.meta)}`);
sec('Lost answers (READY landed, no answer ever arrived, timed out)', lost, (r) => `${r.who} in ${r.match_id} at ${r.t.slice(11, 19)}`);
sec('Crashes / unclean exits reported by the app', crashes, (r) => `${r.handle} ${r.t.slice(11, 19)} ${r.name} ${JSON.stringify(r.meta).slice(0, 120)}`);
sec('Clip-failed hand-offs (server)', handoffs, (r) => `${r.handle} ${r.code} ${r.t.slice(11, 19)} — ${r.detail}`);
sec('Refunds to real players', refunds, (r) => `${r.handle || '?'} +${(Number(r.amount) / 100).toFixed(2)} ${r.note || ''} ${r.match_id || ''}`);

// ── 3. anticheat + gates (observe rows a human should glance at) ─────────────────────────────
const observe = await q(`SELECT code, count(*)::int n, array_agg(DISTINCT handle) handles FROM block_log WHERE created_at>${since} AND ${TEST_NAMES}
  AND kind IN ('anticheat_observe','anticheat','geo','match','funds','admin') AND code NOT IN ('dc_observe_unconfigured','geo_state_mismatch_observed') GROUP BY 1 ORDER BY 2 DESC LIMIT 20`);
const frozen = await q(`SELECT u.handle, c.frozen_reason, c.frozen_at::text t FROM credit_accounts c JOIN users u ON u.account_id=c.account_id WHERE c.frozen AND c.frozen_at>${since}`);
line(); line(`## Anticheat & gates`);
line(`- Accounts frozen in the window: **${frozen.length}**${frozen.map((f) => ` — ${f.handle}: ${f.frozen_reason}`).join('')}`);
line(`- Observe/refusal rows: ${observe.length ? observe.map((o) => `${o.code} ×${o.n} (${o.handles.slice(0, 3).join(', ')})`).join(' · ') : 'none'}`);

// ── 4. money ─────────────────────────────────────────────────────────────────────────────────
let money = null; try { money = await (await fetch(BASE + '/api/admin/conservation', { headers: { 'x-admin-key': ADMIN } })).json(); } catch (e) { money = { error: String(e.message) }; }
const wd = await q(`SELECT status, count(*)::int n FROM withdrawals WHERE updated_at>${since} GROUP BY 1`).catch(() => []);
const dep = await q(`SELECT status, count(*)::int n, COALESCE(sum(amount_cents),0)::int c FROM deposits WHERE updated_at>${since} GROUP BY 1`).catch(() => []);
line(); line(`## Money`);
line(`- Conservation: **${money && money.healthy ? 'OK' : 'CHECK'}** (gap ${money ? money.gapCents : '?'}¢, leaking ${money ? money.leakingMatches : '?'}, in-flight >1h ${money ? money.inFlightOver1hCents : '?'}¢, stuck settling ${money ? money.stuckSettling : '?'})`);
line(`- Deposits touched: ${dep.map((d) => `${d.status} ×${d.n} ($${(d.c / 100).toFixed(2)})`).join(', ') || 'none'} · Withdrawals touched: ${wd.map((w) => `${w.status} ×${w.n}`).join(', ') || 'none'}`);

// ── 5. TestFlight feedback + Apple crash logs ────────────────────────────────────────────────
line(); line(`## TestFlight inbox (App Store Connect)`);
let tfSummary = 'skipped (no key)';
if (ASC_B64) {
  try {
    const pem = Buffer.from(ASC_B64, 'base64').toString('utf8');
    const key = createPrivateKey(pem);
    const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const head = b64u({ alg: 'ES256', kid: ASC_KID, typ: 'JWT' }), body = b64u({ iss: ASC_ISS, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' });
    const sig = createSign('sha256').update(`${head}.${body}`).sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    const jwt = `${head}.${body}.${sig}`;
    const asc = async (path) => { const r = await fetch('https://api.appstoreconnect.apple.com' + path, { headers: { Authorization: 'Bearer ' + jwt } }); const j = await r.json(); if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 200)}`); return j; };
    const apps = await asc(`/v1/apps?filter[bundleId]=${BUNDLE}`); const appId = apps.data && apps.data[0] && apps.data[0].id;
    if (!appId) throw new Error('app not found for ' + BUNDLE);
    const cutoff = Date.now() - HOURS * 3600000;
    const shots = await asc(`/v1/apps/${appId}/betaFeedbackScreenshotSubmissions?limit=50&sort=-createdDate&include=build,tester`).catch((e) => ({ data: [], err: e.message }));
    const cr = await asc(`/v1/apps/${appId}/betaFeedbackCrashSubmissions?limit=50&sort=-createdDate&include=build,tester`).catch((e) => ({ data: [], err: e.message }));
    const recent = (arr) => (arr.data || []).filter((x) => new Date(x.attributes.createdDate).getTime() > cutoff);
    const rs = recent(shots), rc = recent(cr);
    const build = (x, inc) => { const b = (inc || []).find((i) => i.type === 'builds' && x.relationships && x.relationships.build && x.relationships.build.data && i.id === x.relationships.build.data.id); return b ? b.attributes.version : '?'; };
    line(`- Screenshot feedback (new): **${rs.length}**${shots.err ? ' — API error: ' + shots.err : ''}`);
    for (const s of rs) { const a = s.attributes; line(`  - ${a.createdDate.slice(0, 16)} build ${build(s, shots.included)} · ${a.deviceModel || ''} ${a.osVersion || ''} · "${(a.comment || '').replace(/\s+/g, ' ').slice(0, 200)}"${(a.screenshots || []).length ? ` · ${a.screenshots.length} screenshot(s)` : ''}`); }
    line(`- Crash reports (new): **${rc.length}**${cr.err ? ' — API error: ' + cr.err : ''}`);
    for (const c of rc) { const a = c.attributes; line(`  - ${a.createdDate.slice(0, 16)} build ${build(c, cr.included)} · ${a.deviceModel || ''} ${a.osVersion || ''} · ${(a.comment || a.crashLog ? 'has log' : '')}`); }
    const allShots = (shots.data || []).length, allCr = (cr.data || []).length;
    line(`- All-time in the inbox: ${allShots} screenshot submissions, ${allCr} crash submissions`);
    tfSummary = `${rs.length} feedback, ${rc.length} crashes`;
  } catch (e) { line(`- ASC pull failed: ${e.message}`); tfSummary = 'ASC error'; }
} else line(`- ${tfSummary}`);

// ── write + push ─────────────────────────────────────────────────────────────────────────────
const md = out.join('\n') + '\n';
mkdirSync('digests', { recursive: true }); writeFileSync(`digests/${day}.md`, md); writeFileSync('digests/latest.md', md);
console.log(md);
const flags = slow.length + clipFail.length + retries.length + lost.length + crashes.length + handoffs.length + frozen.length;
const summary = `${sessions.length} players, ${rounds[0].settled} games. ${flags ? flags + ' item(s) to look at' : 'nothing to look at'}. Money ${money && money.healthy ? 'OK' : 'CHECK'}. TestFlight: ${tfSummary}.`;
if (ADMIN && process.env.DIGEST_PUSH !== '0') {
  await fetch(BASE + '/api/admin/push/send', { method: 'POST', headers: { 'x-admin-key': ADMIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `Sense digest ${day}`, body: summary.slice(0, 200) }) }).then((r) => console.log('push', r.status)).catch((e) => console.log('push failed', e.message));
}
await pool.end();
