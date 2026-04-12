// ═══════════════════════════════════════════════
// GAMERO — Central Config
// Change SERVER_URL when deploying to Render
// ═══════════════════════════════════════════════

const GAMERO_CONFIG = {
  SERVER_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3001'
    : 'https://gamero-server.onrender.com', // ← change this once when you deploy
};

// ─── Player name persistence ──────────────────
const GAMERO_PLAYER = {
  getName() {
    return localStorage.getItem('gamero_player_name') || '';
  },
  setName(name) {
    if (name && name.trim()) localStorage.setItem('gamero_player_name', name.trim());
  },
  init() {
    const saved = this.getName();
    ['playerName', 'joinName'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (saved) el.value = saved;
      el.addEventListener('change', () => GAMERO_PLAYER.setName(el.value));
      el.addEventListener('blur',   () => GAMERO_PLAYER.setName(el.value));
    });
  }
};

// ─── Reconnection Manager ─────────────────────
const GAMERO_RECONNECT = {
  overlay: null,
  countdown: null,
  countdownEl: null,
  partnerBanner: null,
  partnerTimer: null,
  graceSecs: 30,

  inject() {
    // Overlay (shown when WE disconnect)
    if (!document.getElementById('gamero-reconnect-overlay')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="gamero-reconnect-overlay">
          <div class="reconnect-spinner"></div>
          <p class="reconnect-title">Connection lost...</p>
          <p class="reconnect-sub">Trying to reconnect to your game</p>
          <div class="reconnect-countdown" id="gamero-rc-count">30</div>
          <p class="reconnect-sub">seconds before your opponent is notified</p>
          <button class="reconnect-cancel" onclick="GAMERO_RECONNECT.giveUp()">Leave Game</button>
        </div>
      `);
    }
    // Partner away banner (shown when THEY disconnect)
    if (!document.getElementById('gamero-partner-away')) {
      // Insert at top of container or body
      const target = document.querySelector('.container') || document.body;
      target.insertAdjacentHTML('afterbegin', '<div id="gamero-partner-away"></div>');
    }
    this.overlay     = document.getElementById('gamero-reconnect-overlay');
    this.countdownEl = document.getElementById('gamero-rc-count');
    this.partnerBanner = document.getElementById('gamero-partner-away');
  },

  // Called when socket disconnects unexpectedly
  showReconnecting(graceSeconds) {
    this.graceSecs = graceSeconds || 30;
    let remaining  = this.graceSecs;
    if (this.countdownEl) this.countdownEl.textContent = remaining;
    this.overlay?.classList.add('visible');
    this.countdown = setInterval(() => {
      remaining--;
      if (this.countdownEl) this.countdownEl.textContent = remaining;
      if (remaining <= 0) this.hideReconnecting();
    }, 1000);
  },

  hideReconnecting() {
    clearInterval(this.countdown);
    this.overlay?.classList.remove('visible');
  },

  giveUp() {
    this.hideReconnecting();
    location.href = '../../index.html';
  },

  // Called when partner disconnects
  showPartnerAway(playerName, graceSeconds) {
    if (!this.partnerBanner) return;
    this.partnerBanner.textContent =
      `⚠️ ${playerName} lost connection — waiting ${graceSeconds}s for them to come back...`;
    this.partnerBanner.classList.add('visible');
    clearTimeout(this.partnerTimer);
    this.partnerTimer = setTimeout(() => this.hidePartnerAway(), (graceSeconds + 2) * 1000);
  },

  hidePartnerAway() {
    this.partnerBanner?.classList.remove('visible');
  },

  // Wire up socket events — call this after socket is created in each game
  attach(socket, roomCode, playerName) {
    this.inject();

    // We lost connection
    socket.on('disconnect', (reason) => {
      // Don't show if it's an intentional disconnect (page leave)
      if (reason === 'io client disconnect') return;
      this.showReconnecting(this.graceSecs);
    });

    // We reconnected — try to rejoin
    socket.on('connect', () => {
      if (!roomCode || !playerName) { this.hideReconnecting(); return; }
      this.hideReconnecting();
      socket.emit('rejoinRoom', { roomCode, playerName });
    });

    // Server confirmed rejoin
    socket.on('rejoined', ({ isHost: host, partnerName, gameStarted }) => {
      this.hideReconnecting();
      this.hidePartnerAway();
      // Show a toast if we have GameroModal available
      if (typeof GameroModal !== 'undefined') {
        GameroModal.success('Reconnected!', 'Back in the game', '🔄');
      }
    });

    // Rejoin failed — room gone
    socket.on('rejoinFailed', ({ reason }) => {
      this.hideReconnecting();
      if (typeof GameroModal !== 'undefined') {
        GameroModal.error(reason || 'Could not rejoin.', 'Reconnect Failed', '❌').then(() => {
          location.href = '../../index.html';
        });
      } else {
        alert('Could not rejoin: ' + (reason || 'Room expired'));
        location.href = '../../index.html';
      }
    });

    // Partner disconnected
    socket.on('partnerDisconnected', ({ playerName: pName, gracePeriodSeconds }) => {
      this.showPartnerAway(pName, gracePeriodSeconds);
    });

    // Partner came back
    socket.on('partnerRejoined', ({ playerName: pName }) => {
      this.hidePartnerAway();
      if (typeof GameroModal !== 'undefined') {
        GameroModal.success(`${pName} reconnected!`, 'They\'re back!', '🙌');
      }
    });
  }
};

// ─── Init on DOM ready ────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  GAMERO_PLAYER.init();
});