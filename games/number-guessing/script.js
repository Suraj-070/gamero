const socket = io("http://localhost:3001");

let myPlayerName = "";
let partnerPlayerName = "";
let currentRoomCode = "";
let isHost = false;
let mySecretNumber = "";
let myGuesses = [];
let partnerGuesses = [];
let currentTurn = null;
let isMyTurn = false;
let myLowestTooLow = null;
let myHighestTooHigh = null;
let typingTimeout = null;
let justGuessed = false;
let lastTurnUpdate = null;
let turnUpdateTimeout = null;

// ─── SOUNDS ───────────────────────────────────────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function getAudio() { if (!audioCtx) audioCtx = new AudioCtx(); return audioCtx; }

function playTone(freq, type, duration, vol = 0.3) {
  try {
    const ctx = getAudio();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    o.start(); o.stop(ctx.currentTime + duration);
  } catch(e) {}
}
function soundCorrect() { playTone(523, 'sine', 0.15); setTimeout(() => playTone(659, 'sine', 0.15), 120); setTimeout(() => playTone(784, 'sine', 0.3), 240); }
function soundWrong()   { playTone(220, 'sawtooth', 0.18, 0.2); }
function soundSubmit()  { playTone(440, 'sine', 0.1, 0.15); }
function soundTaunt()   { playTone(880, 'sine', 0.08, 0.25); }
function soundWin()     { [523,659,784,1047].forEach((f,i) => setTimeout(() => playTone(f,'sine',0.3), i*100)); }

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function updateTurnBanner() {
  const banner = document.getElementById('turnBanner');
  if (isMyTurn) {
    banner.className = 'turn-banner my-turn';
    banner.textContent = '✨ Your Turn — Make a guess!';
  } else {
    banner.className = 'turn-banner their-turn';
    banner.textContent = `⏳ ${partnerPlayerName}'s turn...`;
  }
}

function updateTurnIndicator() {
  const guessInput = document.getElementById('guessInput');
  const submitBtn = document.getElementById('submitGuessBtn');
  const myPanel = document.getElementById('myPanel');
  const opponentPanel = document.getElementById('opponentPanel');

  if (isMyTurn) {
    document.getElementById('myCurrentHint').className = 'current-hint waiting';
    document.getElementById('myCurrentHint').textContent = '✨ Your turn — make a guess!';
    document.getElementById('partnerCurrentHint').className = 'current-hint waiting';
    document.getElementById('partnerCurrentHint').textContent = '⏳ Waiting for you...';
    guessInput.disabled = false; submitBtn.disabled = false;
    guessInput.style.opacity = '1'; submitBtn.style.opacity = '1';
    myPanel.classList.add('active-turn'); opponentPanel.classList.remove('active-turn');
    setTimeout(() => guessInput.focus(), 100);
  } else {
    document.getElementById('myCurrentHint').className = 'current-hint waiting';
    document.getElementById('myCurrentHint').textContent = `⏳ Waiting for ${partnerPlayerName}...`;
    document.getElementById('partnerCurrentHint').className = 'current-hint waiting';
    document.getElementById('partnerCurrentHint').textContent = '✨ Their turn';
    guessInput.disabled = true; submitBtn.disabled = true;
    guessInput.style.opacity = '0.5'; submitBtn.style.opacity = '0.5';
    myPanel.classList.remove('active-turn'); opponentPanel.classList.add('active-turn');
  }
  updateTurnBanner();
}

function updateNumberLine() {
  const bar = document.getElementById('myRangeBar');
  const boundLow = document.getElementById('myBoundLow');
  const boundHigh = document.getElementById('myBoundHigh');
  const boundRange = document.getElementById('myBoundRange');
  const MAX = 1000;
  const lo = myLowestTooLow !== null ? myLowestTooLow + 1 : 1;
  const hi = myHighestTooHigh !== null ? myHighestTooHigh - 1 : MAX;
  const leftPct = ((lo - 1) / MAX) * 100;
  const widthPct = ((hi - lo + 1) / MAX) * 100;
  bar.style.left = Math.max(0, leftPct) + '%';
  bar.style.width = Math.min(100, Math.max(2, widthPct)) + '%';
  boundLow.textContent = myLowestTooLow !== null ? '>' + myLowestTooLow : '?';
  boundHigh.textContent = myHighestTooHigh !== null ? '<' + myHighestTooHigh : '?';
  if (myLowestTooLow !== null && myHighestTooHigh !== null) {
    boundRange.textContent = `${lo} – ${hi}`;
  } else if (myLowestTooLow !== null) {
    boundRange.textContent = `> ${myLowestTooLow}`;
  } else if (myHighestTooHigh !== null) {
    boundRange.textContent = `< ${myHighestTooHigh}`;
  } else {
    boundRange.textContent = 'Start guessing!';
  }
}

function updateMyGuessesUI() {
  const container = document.getElementById('myGuesses');
  if (myGuesses.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎯</div><div class="empty-state-text">No guesses yet</div></div>`;
    return;
  }
  container.innerHTML = myGuesses.slice().reverse().map(g => `
    <div class="guess-item ${g.hint}">
      <span class="guess-number">${g.number}</span>
      <span class="guess-hint ${g.hint}">
        ${g.hint === 'low' ? '<span class="hint-arrow">↑</span> Too Low' :
          g.hint === 'high' ? '<span class="hint-arrow">↓</span> Too High' :
          '<span class="hint-arrow">✓</span> Correct!'}
      </span>
    </div>`).join('');
  document.getElementById('myGuessCount').textContent = `${myGuesses.length} guess${myGuesses.length !== 1 ? 'es' : ''}`;
  updateNumberLine();
}

function updatePartnerGuessesUI() {
  const container = document.getElementById('partnerGuesses');
  if (partnerGuesses.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⏳</div><div class="empty-state-text">Waiting...</div></div>`;
    return;
  }
  container.innerHTML = partnerGuesses.slice().reverse().map(g => `
    <div class="guess-item ${g.hint}">
      <span class="guess-number">${g.number}</span>
      <span class="guess-hint ${g.hint}">
        ${g.hint === 'low' ? '<span class="hint-arrow">↑</span> Too Low' :
          g.hint === 'high' ? '<span class="hint-arrow">↓</span> Too High' :
          '<span class="hint-arrow">✓</span> Correct!'}
      </span>
    </div>`).join('');
  document.getElementById('partnerGuessCount').textContent = `${partnerGuesses.length} guess${partnerGuesses.length !== 1 ? 'es' : ''}`;
}

// ─── TAUNTS ───────────────────────────────────────────────────────────────────
function sendTaunt(emoji) {
  soundTaunt();
  socket.emit('taunt', { roomCode: currentRoomCode, emoji });
  showTauntToast(emoji);
}

function showTauntToast(emoji) {
  const toast = document.getElementById('tauntToast');
  toast.textContent = emoji;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1200);
}

// ─── GAME FUNCTIONS ───────────────────────────────────────────────────────────
async function createRoom() {
  const name = document.getElementById('playerName').value.trim();
  if (!name) { await GameroModal.warning('Please enter your name!', 'Name Required', '✏️'); return; }
  const loader = GameroModal.loadingDots('Creating room...', 'Please Wait');
  window.currentLoader = loader;
  socket.emit('createRoom', name);
}

async function joinRoom() {
  const name = document.getElementById('joinName').value.trim();
  const code = document.getElementById('roomCode').value.trim().toUpperCase();
  if (!name || !code) { await GameroModal.warning('Please enter your name and room code!', 'Missing Info', '✏️'); return; }
  const loader = GameroModal.loadingDots('Joining room...', 'Please Wait');
  window.currentLoader = loader;
  socket.emit('joinRoom', { roomCode: code, playerName: name });
}

async function setSecretNumber() {
  const number = document.getElementById('secretNumber').value.trim();
  if (!number) { await GameroModal.warning('Please enter a secret number!', 'Number Required', '🔢'); return; }
  mySecretNumber = number;
  document.getElementById('mySecretNumber').textContent = number;
  socket.emit('setSecretNumber', { roomCode: currentRoomCode, secretNumber: number });
  document.getElementById('setupArea').style.display = 'none';
  document.getElementById('waitingStatus').innerHTML = '<span class="status-badge status-waiting">⏳ Waiting for partner to set their number...</span>';
}

async function submitGuess() {
  const guess = document.getElementById('guessInput').value.trim();
  if (!guess) { await GameroModal.warning('Please enter a number!', 'Guess Required', '🔢'); return; }
  if (!isMyTurn) { await GameroModal.warning('Wait for your turn!', 'Not Your Turn', '⏳'); return; }
  soundSubmit();
  justGuessed = true;
  isMyTurn = false;
  updateTurnIndicator();
  socket.emit('submitGuess', { roomCode: currentRoomCode, guess });
  // Stop typing emit and clear input
  socket.emit('stopTyping', { roomCode: currentRoomCode });
  document.getElementById('guessInput').value = '';
}

function resetGame() { socket.emit('resetGame', { roomCode: currentRoomCode }); }
function leaveGame() { location.href = '../../index.html'; }

// ─── TYPING INDICATOR ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const guessInput = document.getElementById('guessInput');
  if (!guessInput) return;
  guessInput.addEventListener('input', () => {
    if (!isMyTurn) return;
    socket.emit('typing', { roomCode: currentRoomCode });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('stopTyping', { roomCode: currentRoomCode }), 1500);
  });
});

// ─── SOCKET EVENTS ────────────────────────────────────────────────────────────
socket.on('roomCreated', ({ roomCode, playerName, isHost: host }) => {
  currentRoomCode = roomCode; myPlayerName = playerName; isHost = host;
  document.getElementById('roomCodeValue').textContent = roomCode;
  document.getElementById('displayRoomCode').textContent = roomCode;
  showScreen('waitingScreen');
  if (window.currentLoader) { window.currentLoader.close(); window.currentLoader = null; }
});

socket.on('partnerJoined', ({ partnerName }) => {
  partnerPlayerName = partnerName;
  document.getElementById('waitingStatus').innerHTML = `<span class="status-badge status-ready">✅ ${partnerName} joined!</span>`;
  document.getElementById('setupArea').style.display = 'block';
});

socket.on('roomJoined', ({ roomCode, playerName, isHost: host, hostName }) => {
  currentRoomCode = roomCode; myPlayerName = playerName; isHost = host; partnerPlayerName = hostName;
  document.getElementById('roomCodeValue').textContent = roomCode;
  document.getElementById('displayRoomCode').textContent = roomCode;
  document.getElementById('waitingStatus').innerHTML = '<span class="status-badge status-ready">✅ Connected!</span>';
  document.getElementById('setupArea').style.display = 'block';
  showScreen('waitingScreen');
  if (window.currentLoader) { window.currentLoader.close(); window.currentLoader = null; }
});

socket.on('playerReady', ({ playerName }) => {
  document.getElementById('waitingStatus').innerHTML = `<span class="status-badge status-waiting">⏳ ${playerName} is ready...</span>`;
});

socket.on('gameStarted', ({ firstTurn }) => {
  document.getElementById('myName').textContent = myPlayerName;
  document.getElementById('partnerName').textContent = partnerPlayerName;
  document.getElementById('typingName').textContent = partnerPlayerName;
  myGuesses = []; partnerGuesses = [];
  myLowestTooLow = null; myHighestTooHigh = null;
  currentTurn = firstTurn; isMyTurn = (currentTurn === myPlayerName);
  updateMyGuessesUI(); updatePartnerGuessesUI(); updateNumberLine(); updateTurnIndicator();
  showScreen('gameplayScreen');
  if (isMyTurn) GameroModal.success('You go first!', 'Game Started', '🎯');
  else GameroModal.info(`${partnerPlayerName} goes first!`, 'Game Started', '⏳');
});

socket.on('turnUpdate', ({ currentTurn: newTurn }) => {
  if (justGuessed && newTurn === myPlayerName) return;
  if (lastTurnUpdate === newTurn && turnUpdateTimeout) return;
  if (turnUpdateTimeout) clearTimeout(turnUpdateTimeout);
  lastTurnUpdate = newTurn; currentTurn = newTurn; isMyTurn = (currentTurn === myPlayerName);
  updateTurnIndicator(); justGuessed = false;
  turnUpdateTimeout = setTimeout(() => { lastTurnUpdate = null; turnUpdateTimeout = null; }, 200);
});

socket.on('newGuess', ({ playerName, guess, isHost: guessIsHost }) => {
  const isMyGuess = (isHost && guessIsHost) || (!isHost && !guessIsHost);
  if (!isMyGuess && playerName !== myPlayerName) {
    const partnerGuessNum = parseInt(guess);
    const mySecretNum = parseInt(mySecretNumber);
    let hint = partnerGuessNum < mySecretNum ? 'low' : partnerGuessNum > mySecretNum ? 'high' : 'correct';
    partnerGuesses.push({ number: guess, hint });
    updatePartnerGuessesUI();
    if (hint === 'correct') soundCorrect(); else soundWrong();
    socket.emit('sendHint', { roomCode: currentRoomCode, guess, hint, toPlayer: playerName });
    if (hint === 'correct') setTimeout(() => socket.emit('declareWinner', { roomCode: currentRoomCode, winner: isHost ? 'partner' : 'host' }), 1000);
  }
});

socket.on('receiveHint', ({ guess, hint }) => {
  const guessNum = parseInt(guess);
  myGuesses.push({ number: guess, hint });
  if (hint === 'low') { if (myLowestTooLow === null || guessNum > myLowestTooLow) myLowestTooLow = guessNum; }
  else if (hint === 'high') { if (myHighestTooHigh === null || guessNum < myHighestTooHigh) myHighestTooHigh = guessNum; }
  if (hint === 'correct') soundCorrect(); else soundWrong();
  updateMyGuessesUI();
  if (hint === 'correct') setTimeout(() => socket.emit('declareWinner', { roomCode: currentRoomCode, winner: isHost ? 'host' : 'partner' }), 1000);
});

socket.on('typing', ({ playerName }) => {
  if (playerName !== myPlayerName) {
    document.getElementById('typingIndicator').classList.add('visible');
  }
});
socket.on('stopTyping', ({ playerName }) => {
  if (playerName !== myPlayerName) {
    document.getElementById('typingIndicator').classList.remove('visible');
  }
});
socket.on('taunt', ({ emoji }) => { soundTaunt(); showTauntToast(emoji); });

socket.on('gameOver', ({ winner, hostName, partnerName, hostNumber, partnerNumber, hostGuesses, partnerGuesses: pGuesses }) => {
  document.getElementById('winnerText').textContent = `🏆 ${winner} Wins!`;
  document.getElementById('hostNameReveal').textContent = hostName;
  document.getElementById('revealedHostNumber').textContent = hostNumber;
  document.getElementById('partnerNameReveal').textContent = partnerName;
  document.getElementById('revealedPartnerNumber').textContent = partnerNumber;
  document.getElementById('hostNameGuesses').textContent = hostName;
  document.getElementById('hostGuessCountResult').textContent = hostGuesses;
  document.getElementById('partnerNameGuesses').textContent = partnerName;
  document.getElementById('partnerGuessCountResult').textContent = pGuesses;
  if (isHost) document.getElementById('hostResetControls').style.display = 'block';
  showScreen('gameOverScreen');
  if (winner === myPlayerName) { soundWin(); confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } }); }
  else soundWrong();
});

socket.on('gameReset', () => {
  myGuesses = []; partnerGuesses = []; mySecretNumber = '';
  myLowestTooLow = null; myHighestTooHigh = null;
  currentTurn = null; isMyTurn = false; justGuessed = false;
  lastTurnUpdate = null;
  if (turnUpdateTimeout) { clearTimeout(turnUpdateTimeout); turnUpdateTimeout = null; }
  document.getElementById('myGuessCount').textContent = '0 guesses';
  document.getElementById('partnerGuessCount').textContent = '0 guesses';
  document.getElementById('hostResetControls').style.display = 'none';
  document.getElementById('setupArea').style.display = 'block';
  document.getElementById('secretNumber').value = '';
  document.getElementById('waitingStatus').innerHTML = '<span class="status-badge status-ready">✅ Ready to play again!</span>';
  updateMyGuessesUI(); updatePartnerGuessesUI(); updateNumberLine();
  showScreen('waitingScreen');
});

socket.on('hostLeft', async () => { await GameroModal.error('Host left the game!', 'Game Ended', '👋'); location.href = '../../index.html'; });
socket.on('partnerLeft', async () => {
  await GameroModal.info('Partner left. Waiting for new partner...', 'Partner Left', '👋');
  partnerPlayerName = '';
  document.getElementById('waitingStatus').innerHTML = '<span class="status-badge status-waiting">⏳ Waiting for partner...</span>';
  document.getElementById('setupArea').style.display = 'none';
  showScreen('waitingScreen');
});
socket.on('error', async (message) => { await GameroModal.error(message, 'Error', '❌'); });

document.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const active = document.querySelector('.screen.active');
    if (active?.id === 'gameplayScreen' && isMyTurn) submitGuess();
  }
});