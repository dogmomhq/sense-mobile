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
let connectionLostHandler = null; // called when all reconnects fail
let walletAuth = null;
let keepaliveInterval = null;
let reconnecting = false;
let onOpenHandler = null;
let walletVerified = false; // tracks whether server confirmed wallet
let verifyCallback = null; // callback waiting for verify-wallet-result
let verifyTimeout = null;
let pendingQueue = []; // messages queued while WS connecting
let connStateCb = null; // B42: app-level "is the pipe up" indicator (UI truth on waiting screens)
export function onConnState(cb) { connStateCb = cb; }
function notifyConn(up) { try { if (connStateCb) connStateCb(up); } catch (e) {} }
// B42: with wifi off, a socket can hang in CONNECTING forever — onclose never fires,
// so the retry loop (and its bailHome after 5 fails) never runs. Force-close hung dials.
const CONNECT_TIMEOUT_MS = 6000;
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

export function connectWS(onMessage, onDisconnect, onOpen, onConnectionLost) {
  if (!_serverUrl) { console.error('[ws] setServerUrl() must be called before connectWS'); return; }
  messageHandler = onMessage;
  disconnectHandler = onDisconnect;
  onOpenHandler = onOpen;
  if (onConnectionLost) connectionLostHandler = onConnectionLost;

  if (ws && ws.readyState === WebSocket.OPEN) {
    if (onOpen) onOpen();
    return;
  }

  ws = new WebSocket(_serverUrl);
  const disarm = armConnectWatchdog(ws);

  ws.onopen = () => {
    disarm();
    handleOpen(onOpen);
  };

  setupWsHandlers(ws);

  ws.onclose = () => {
    console.log('[ws] Disconnected');
    disarm();
    notifyConn(false);
    ws = null;
    stopKeepalive();
    if (disconnectHandler) disconnectHandler();
    if (!reconnecting) {
      reconnecting = true;
      let attempts = 0;
      const maxAttempts = 5;
      const tryReconnect = () => {
        attempts++;
        console.log('[ws] Reconnect attempt', attempts);
        try {
          ws = new WebSocket(_serverUrl);
          const disarmR = armConnectWatchdog(ws);
          ws.onopen = () => {
            disarmR();
            console.log('[ws] Reconnected');
            notifyConn(true);
            reconnecting = false;
            startKeepalive();
            if (walletAuth) ws.send(JSON.stringify({ type: 'verify-wallet', ...walletAuth }));
            ws.onclose = () => {
              ws = null;
              stopKeepalive();
              notifyConn(false);
              if (disconnectHandler) disconnectHandler();
            };
            ws.onerror = () => {};
            setupWsHandlers(ws);
            if (onOpenHandler) onOpenHandler();
          };
          ws.onclose = () => {
            disarmR();
            notifyConn(false);
            ws = null;
            if (attempts < maxAttempts) setTimeout(tryReconnect, 2000 * attempts);
            else {
              reconnecting = false;
              if (connectionLostHandler) connectionLostHandler();
            }
          };
          ws.onerror = () => {};
        } catch (e) {
          if (attempts < maxAttempts) setTimeout(tryReconnect, 2000 * attempts);
          else {
            reconnecting = false;
            if (connectionLostHandler) connectionLostHandler();
          }
        }
      };
      setTimeout(tryReconnect, 1000);
    }
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
  reconnecting = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  stopKeepalive();
  if (ws) { ws.close(); ws = null; }
}
