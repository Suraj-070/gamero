// ═══════════════════════════════════════════════
// GAMERO — Central Config
// Change SERVER_URL when deploying to Render
// ═══════════════════════════════════════════════

const GAMERO_CONFIG = {
  SERVER_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3001'
    : 'https://YOUR-SERVER.onrender.com', // ← change this once when you deploy
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

// ═══════════════════════════════════════════════
// GAMERO — Animated Waiting Room Builder
// Injects animated waiting UI into any game
// ═══════════════════════════════════════════════
const GAMERO_WAITING = {

  // Call this once after room is created/joined
  // containerId = the div to inject into
  // steps = array of step labels e.g. ['Connect','Set Up','Play!']
  build(containerId, roomCode, myName, steps = ['Connect', 'Set up', 'Play!']) {
    const el = document.getElementById(containerId);
    if (!el) return;

    el.innerHTML = `
      <div class="waiting-card">

        <!-- Animated header with room code -->
        <div class="waiting-header">
          <div class="waiting-room-label">Room Code</div>
          <div class="waiting-room-code" id="gw-roomcode">${roomCode}</div>
          <button class="copy-code-btn" onclick="GAMERO_WAITING.copyCode('${roomCode}')" id="gw-copybtn">
            <span>📋</span> Tap to copy
          </button>
        </div>

        <div class="waiting-body">

          <!-- Step progress -->
          <div class="waiting-steps" id="gw-steps">
            ${steps.map((s, i) => `
              <div class="waiting-step ${i === 0 ? 'done' : i === 1 ? 'active' : ''}" id="gw-step-${i}">
                <div class="step-circle">${i === 0 ? '✓' : i + 1}</div>
                <div class="step-label">${s}</div>
              </div>
            `).join('')}
          </div>

          <!-- Partner joined banner (hidden until joined) -->
          <div class="partner-joined-banner" id="gw-joined-banner">
            <div class="pjb-icon">🎉</div>
            <div>
              <div class="pjb-text" id="gw-joined-text">Partner joined!</div>
              <div class="pjb-sub">Get ready to play</div>
            </div>
          </div>

          <!-- Avatar + status row -->
          <div class="waiting-status-row">
            <div class="waiting-avatars">
              <div class="waiting-avatar me" id="gw-avatar-me">🎮</div>
              <div class="waiting-vs">VS</div>
              <div class="waiting-avatar partner" id="gw-avatar-partner">?</div>
            </div>
            <div class="waiting-status-text">
              <div class="waiting-status-title" id="gw-status-title">Waiting for opponent...</div>
              <div class="waiting-status-sub" id="gw-status-sub">${myName} is ready</div>
              <div class="waiting-dots" id="gw-dots">
                <div class="waiting-dot"></div>
                <div class="waiting-dot"></div>
                <div class="waiting-dot"></div>
              </div>
            </div>
          </div>

        </div>
      </div>
    `;
  },

  // Call when partner connects
  partnerJoined(partnerName) {
    // Update avatar
    const avatar = document.getElementById('gw-avatar-partner');
    if (avatar) {
      avatar.textContent = '👤';
      avatar.classList.add('connected');
    }
    // Show joined banner
    const banner = document.getElementById('gw-joined-banner');
    const bannerText = document.getElementById('gw-joined-text');
    if (banner) { banner.classList.add('visible'); }
    if (bannerText) bannerText.textContent = `${partnerName} joined!`;

    // Update status
    const title = document.getElementById('gw-status-title');
    const sub   = document.getElementById('gw-status-sub');
    const dots  = document.getElementById('gw-dots');
    if (title) title.textContent = 'Both players connected!';
    if (sub)   sub.textContent   = `${partnerName} is here`;
    if (dots)  dots.style.display = 'none';

    // Advance step
    this.advanceStep(2);

    // Sound
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [523, 659, 784].forEach((f, i) => {
        setTimeout(() => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.type = 'sine'; o.frequency.value = f;
          g.gain.setValueAtTime(0.2, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
          o.start(); o.stop(ctx.currentTime + 0.2);
        }, i * 100);
      });
    } catch(e) {}
  },

  advanceStep(activeIndex) {
    document.querySelectorAll('[id^="gw-step-"]').forEach((el, i) => {
      el.classList.remove('done', 'active');
      if (i < activeIndex) {
        el.classList.add('done');
        el.querySelector('.step-circle').textContent = '✓';
      } else if (i === activeIndex) {
        el.classList.add('active');
      }
    });
  },

  copyCode(code) {
    const btn = document.getElementById('gw-copybtn');
    navigator.clipboard.writeText(code).then(() => {
      if (btn) { btn.innerHTML = '<span>✅</span> Copied!'; btn.classList.add('copied'); }
      setTimeout(() => {
        if (btn) { btn.innerHTML = '<span>📋</span> Tap to copy'; btn.classList.remove('copied'); }
      }, 2000);
    }).catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = code; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      if (btn) { btn.innerHTML = '<span>✅</span> Copied!'; btn.classList.add('copied'); }
      setTimeout(() => {
        if (btn) { btn.innerHTML = '<span>📋</span> Tap to copy'; btn.classList.remove('copied'); }
      }, 2000);
    });
  }
};