// paid-precheck.mjs — gate BEFORE any wager. If a real player has an open game
// waiting, the robot's PLAY NOW would FIFO-join it and put real money in play.
// Runs foreground before the robot launches. Exit 5 = QUEUE-BUSY.
import pg from 'pg';

const db = new pg.Client({
  connectionString: (process.env.SENSE_DB_URL || '').replace(':5432', ':6543'),
  ssl: { rejectUnauthorized: false },
});
await db.connect();
let busy = true;
for (let i = 0; i < 10; i++) {
  const r = await db.query("select count(*)::int as n from game_queue where status='open' and player_b is null");
  if (r.rows[0].n === 0) { busy = false; break; }
  console.log(`QUEUE-BUSY: ${r.rows[0].n} open game(s) waiting — sleep 9s (${i + 1}/10)`);
  await new Promise(s => setTimeout(s, 9000));
}
await db.end();
if (busy) { console.log('QUEUE-BUSY after 90s — aborting paid phase before any wager (exit 5)'); process.exit(5); }
console.log('queue clear — paid phase may proceed');
