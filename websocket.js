// websocket.js — WebSocket connection to game server
// Mirrors original client.html connectWS(callback) pattern:
// connect → open → verify wallet → callback → then allow sends

// Server URL is injected (setServerUrl) so this module is platform-agnostic
// (web supplies it from config; native supplies its own). No config import.
let _serverUrl = null;
export function setServerUrl(url) { _serverUrl = url; }

let ws = null;
let reconnectTimer = null;
let messageHandler = null;
let disconnectHandler = null;
let connectionLostHandler = null; // dormant since B54 (loop never gives up); kept because App.js still passes it
let walletAuth = null;
let keepaliveInterval = null;
let reconnecting = false;
let onOpenHandler = null;
let walletVerified = false; // tracks whether server confirmed wallet
let verifyCallback = null; // callback waiting for verify-wallet-result
let verifyTimeout = null;
let pendingQueue = []; // messages queued while WS connecting
let intentionalClose = false; // B43: disconnectWS() sets this so onclose skips the reconnect ladder
// B54: endless-reconnect state. The old inline ladder gave up after 5 tries (~30s) and,
// worse, a socket that died AFTER one successful reconnect had NO retry at all (dead end
// shipped 5/31: NO SIGNAL said RETRYING… while nothing retried — caught on video 7/18).
const RECONNECT_CAP_MS = 8000;
let reconnectAttempts = 0;
let retryNow = null; // lets a user tap fast-forward a backoff wait (see connectWS)
let connStateCb = null; // B42: app-level "is the pipe up" indicator (UI truth on waiting screens)
export function onConnState(cb) { connStateCb = cb; }
function notifyConn(up) { try { if (connStateCb) connStateCb(up); } catch (e) {} }
// B42: with wifi off, a socket can hang in CONNECTING forever — onclose never fires,
// so the retry loop (and its bailHome after 5 fails) never runs. Force-close hung dials.
// B55 (7/19): 6000 -> 4000. Railway edge dial-timeout waves hang NEW dials silently; healthy
// connects finish <1s wifi / 1-3s weak cellular, so 4s only kills genuinely stuck attempts
// and hands them to the B54 retry ladder sooner. Do NOT go lower: 1s would kill slow-but-
// healthy cellular handshakes and loop them forever.
const CONNECT_TIMEOUT_MS = 4000;
function armConnectWatchdog(sock) {
  const t = setTimeout(() => { try { if (sock && sock.readyState === 0) sock.close(); } catch (e) {} }, CONNECT_TIMEOUT_MS);
  return () => clearTimeout(t);
}

export function setWalletAuth(auth) {
  walletAuth = auth;
}

export function getWalletAuth() {
  return walletAuth;
}

// Called by handleMessage when verify-wallet-result arrives
export function onWalletVerified(success) {
  walletVerified = success;
  if (verifyCallback) {
    clearTimeout(verifyTimeout);
    verifyCallback();
    verifyCallback = null;
  }
  // Flush any pending messages
  flushPending();
}

function flushPending() {
  while (pendingQueue.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(pendingQueue.shift()));
  }
}

function setupWsHandlers(socket) {
  socket.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      console.log('Server:', msg.type);
      if (messageHandler) messageHandler(msg);
    } catch (err) {
      console.error('[ws] Parse error:', err);
    }
  };
}

function startKeepalive() {
  if (keepaliveInterval) clearInterval(keepaliveInterval);
  keepaliveInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'keepalive' }));
  }, 20000);
}

function stopKeepalive() {
  if (keepaliveInterval) { clearInterval(keepaliveInterval); keepaliveInterval = null; }
}

function handleOpen(callback) {
  console.log('[ws] Connected to', _serverUrl);
  notifyConn(true);
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  startKeepalive();

  if (walletAuth) {
    // Store callback — fires when verify-wallet-result arrives or after 3s timeout
    verifyCallback = callback || null;
    ws.send(JSON.stringify({ type: 'verify-wallet', ...walletAuth }));
    if (callback) {
      verifyTimeout = setTimeout(() => {
        console.warn('[auth] Verify timeout — proceeding anyway');
        if (verifyCallback) { verifyCallback(); verifyCallback = null; }
        flushPending();
      }, 3000);
    }
  } else {
    walletVerified = true;
    if (callback) callback();
    flushPending();
  }
}

// B54: ONE shared retry loop for every unexpected close. Capped backoff (1s,2s,…8s cap),
// never gives up — the user's escape is the CANCEL button, not a dead screen. Attempt
// counter resets on every successful open so the NEXT drop starts a fresh fast ladder.
function scheduleReconnect() {
  if (reconnecting) return; // one loop at a time
  reconnecting = true;
  const backoff = () => Math.min(1000 * Math.max(reconnectAttempts, 1), RECONNECT_CAP_MS);
  const tryReconnect = () => {
    reconnectTimer = null;
    if (!reconnecting) return; // disconnectWS() while we waited — stand down
    reconnectAttempts++;
    console.log('[ws] Reconnect attempt', reconnectAttempts);
    try {
      ws = new WebSocket(_serverUrl);
      const disarmR = armConnectWatchdog(ws);
      ws.onopen = () => {
        disarmR();
        console.log('[ws] Reconnected');
        reconnecting = false;
        reconnectAttempts = 0; // B54: fresh ladder for the next drop
        retryNow = null;
        notifyConn(true);
        startKeepalive();
        if (walletAuth) ws.send(JSON.stringify({ type: 'verify-wallet', ...walletAuth }));
        else flushPending(); // B54: no auth step means nothing else drains the pending queue
        ws.onclose = () => {
          // B54: THE FIX. This handler used to be notifyConn(false)-and-nothing — after one
          // successful reconnect in a session, the next drop had no retry at all.
          ws = null;
          stopKeepalive();
          notifyConn(false);
          if (disconnectHandler) disconnectHandler();
          if (intentionalClose) { intentionalClose = false; return; }
          scheduleReconnect();
        };
        ws.onerror = () => {};
        setupWsHandlers(ws);
        { const h = onOpenHandler; onOpenHandler = null; if (h) h(); } // B43: one-shot
      };
      ws.onclose = () => { // dial failed (or B42 watchdog force-closed a hung CONNECTING)
        disarmR();
        notifyConn(false);
        ws = null;
        if (intentionalClose) { intentionalClose = false; reconnecting = false; return; }
        reconnectTimer = setTimeout(tryReconnect, backoff());
      };
      ws.onerror = () => {};
    } catch (e) {
      reconnectTimer = setTimeout(tryReconnect, backoff());
    }
  };
  retryNow = tryReconnect;
  reconnectTimer = setTimeout(tryReconnect, 1000);
}

// B54: user tapped while the loop was in a backoff wait — dial NOW, they're standing there.
// (If a dial is already in flight there's no timer to skip; the watchdog resolves it ≤4s.)
function kickReconnect() {
  if (!reconnecting || !reconnectTimer) return;
  clearTimeout(reconnectTimer); reconnectTimer = null;
  if (retryNow) retryNow();
}

export function connectWS(onMessage, onDisconnect, onOpen, onConnectionLost) {
  if (!_serverUrl) { console.error('[ws] setServerUrl() must be called before connectWS'); return; }
  intentionalClose = false; // B43: a new connect intent re-arms normal reconnect behavior
  messageHandler = onMessage;
  disconnectHandler = onDisconnect;
  onOpenHandler = onOpen;
  if (onConnectionLost) connectionLostHandler = onConnectionLost;

  if (ws && ws.readyState === WebSocket.OPEN) {
    onOpenHandler = null; // B43: one-shot — never leave a fired intent armed for a later reconnect
    if (onOpen) onOpen();
    return;
  }
  // B54: a dial is already in flight — don't open a rival socket (rival dials were the old
  // ghost-socket vector). The armed intent (onOpenHandler, latest wins) fires when it lands.
  if (ws && ws.readyState === WebSocket.CONNECTING) return;
  // B54: the reconnect loop owns the line right now — piggyback it; fast-forward any wait.
  if (reconnecting) { kickReconnect(); return; }

  ws = new WebSocket(_serverUrl);
  const disarm = armConnectWatchdog(ws);

  ws.onopen = () => {
    disarm();
    const h = onOpenHandler; onOpenHandler = null; // B43 one-shot; B54: fire the LATEST intent, not the captured one
    handleOpen(h);
  };

  setupWsHandlers(ws);

  ws.onclose = () => {
    console.log('[ws] Disconnected');
    disarm();
    notifyConn(false);
    ws = null;
    stopKeepalive();
    if (disconnectHandler) disconnectHandler();
    if (intentionalClose) { intentionalClose = false; return; } // B43: we hung up on purpose — no zombie reconnect
    scheduleReconnect(); // B54: shared endless loop (was: inline 5-attempt ladder that could dead-end)
  };

  ws.onerror = (err) => {
    console.error('[ws] Error:', err);
  };
}

// Send with callback pattern: if WS is ready, send immediately.
// If WS is connecting, queue the message.
export function wsSend(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  } else if (ws && ws.readyState === WebSocket.CONNECTING) {
    console.log('[ws] Queuing message:', msg.type);
    pendingQueue.push(msg);
  } else {
    console.warn('[ws] Not connected, message dropped:', msg.type);
  }
}

// Send only when WS ready + wallet verified. Callback-style for critical game messages.
export function wsSendWhenReady(msg, callback) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    if (callback) callback();
  } else {
    // Connect first, then send
    pendingQueue.push(msg);
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      connectWS(messageHandler, disconnectHandler, () => {
        if (onOpenHandler) onOpenHandler();
        if (callback) callback();
      }, connectionLostHandler);
    }
  }
}

export function isConnected() {
  return ws && ws.readyState === WebSocket.OPEN;
}

export function disconnectWS() {
  intentionalClose = true;  // B43: tell onclose this hangup is on purpose
  onOpenHandler = null;     // B43: drop any armed intent (e.g. a queue send) so nothing can replay it
  pendingQueue = [];        // B43: drop buffered messages — a stale queued 'queue' msg is a ghost-game vector
  reconnecting = false;
  retryNow = null; reconnectAttempts = 0; // B54: kill any pending loop dial
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  stopKeepalive();
  if (ws) { ws.close(); ws = null; }
}
