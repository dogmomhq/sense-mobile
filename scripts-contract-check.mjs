// B168: refuse to publish a bundle that has no handler for a signal the live server says it emits.
// Contract: GET <server>/api/contract → { http: { route: [signals] }, ws: { type: [signals] } }.
// Handler evidence, per surface (a signal is "handled" when the file that owns that surface reads it):
//   http /api/deposit/intent → screens/DepositCoinflow.js must reference `.<signal>`
//   ws error                 → App.js must reference `msg.<signal>`
import fs from 'fs';
const SERVER = process.env.SENSE_SERVER || 'https://web-production-c6ec6.up.railway.app';
const OWNERS = { http: { '/api/deposit/intent': 'screens/DepositCoinflow.js' }, ws: { error: 'App.js' } };
let c;
try { const r = await fetch(SERVER + '/api/contract'); if (!r.ok) throw new Error('http ' + r.status); c = await r.json(); }
catch (e) { console.error(`CONTRACT: could not read ${SERVER}/api/contract (${e.message}) — refusing to publish blind`); process.exit(1); }
let bad = 0;
for (const surface of ['http', 'ws']) for (const [key, signals] of Object.entries(c[surface] || {})) {
  const file = (OWNERS[surface] || {})[key];
  if (!file) { console.error(`CONTRACT: server emits on ${surface} ${key} but this check has no owner file for it — add one to OWNERS`); bad++; continue; }
  const src = fs.readFileSync(file, 'utf8');
  for (const sig of signals) {
    const re = surface === 'ws' ? new RegExp(`msg\\.${sig}\\b`) : new RegExp(`\\.${sig}\\b`);
    if (!re.test(src)) { console.error(`CONTRACT: ${surface} ${key} emits ${sig} and ${file} never reads it — dead end for the player`); bad++; }
    else console.log(`ok  ${surface} ${key} ${sig} → ${file}`);
  }
}
if (bad) { console.error(`CONTRACT CHECK FAILED (${bad})`); process.exit(1); }
console.log('contract ok');
