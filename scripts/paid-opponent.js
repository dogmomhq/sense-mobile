// CI opponent for the paid-match e2e: joins the SAME credits pool as the app on the emulator,
// answers, and waits for the result so the app's match settles. Runs on the CI runner.
const WebSocket = require('ws');
const URL = process.env.SENSE_WS || 'wss://web-production-c6ec6.up.railway.app';
const s = { ws: new WebSocket(URL), token: null, handle: null, matchId: null, done: false };
const send = (o) => { try { s.ws.send(JSON.stringify(o)); } catch (e) {} };
s.ws.on('open', () => { send({ type: 'register', preferredHandle: 'Bot' + (Date.now() % 100000) }); });
s.ws.on('message', (d) => {
  let m; try { m = JSON.parse(d); } catch { return; }
  if (m.type === 'registered') { s.token = m.token; s.handle = m.handle; console.log('[opp] registered', s.handle);
    send({ type: 'queue', name: s.handle, tier: 1, paymentMode: 'credits', token: s.token }); }
  if (m.type === 'async-question') { s.matchId = m.matchId; console.log('[opp] question -> answer', m.matchId);
    send({ type: 'async-answer', matchId: m.matchId, answerIndex: 0, clientTime: 4000 }); }
  if (m.type === 'async-result') { console.log('[opp] RESULT you=', m.you.result, 'opp=', m.opponent.result); s.done = true; setTimeout(() => process.exit(0), 400); }
  if (m.type === 'queue-failed' || m.type === 'error') console.log('[opp] srv', JSON.stringify(m));
});
s.ws.on('error', (e) => console.log('[opp] ws error', e.message));
setTimeout(() => { console.log('[opp] exit (done=' + s.done + ', matchId=' + s.matchId + ')'); process.exit(0); }, 150000);
