const socket = io(GAMERO_CONFIG.SERVER_URL);

let myPlayerName = "";
let partnerPlayerName = "";
let currentRoomCode = "";
let isHost = false;
let mySecretNumber = "";
let isMyTurn = false;
let currentDifficulty = "easy";
let typingTimeout = null;
let justGuessed = false;
let lastTurnUpdate = null;
let turnUpdateTimeout = null;

// Digit knowledge trackers: 'green' | 'yellow' | 'gray' | null
let myDigitState   = {}; // what I know about opponent's number
let partnerDigitState = {}; // what partner knows about mine

const DIFF_CONFIG = {
  easy:   { digits: 4, repeats: false, label: "🟢 Easy — 4 digits, no repeats" },
  medium: { digits: 5, repeats: false, label: "🟡 Medium — 5 digits, no repeats" },
  hard:   { digits: 5, repeats: true,  label: "🔴 Hard — 5 digits, repeats allowed" }
};

// ─── SOUNDS ───────────────────────────────────────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function getAudio() { if (!audioCtx) audioCtx = new AudioCtx(); return audioCtx; }
function playTone(freq, type, duration, vol = 0.3) {
  try {
    const ctx = getAudio();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    o.start(); o.stop(ctx.currentTime + duration);
  } catch(e) {}
}
function soundCorrect() { playTone(523,'sine',0.15); setTimeout(()=>playTone(659,'sine',0.15),120); setTimeout(()=>playTone(784,'sine',0.3),240); }
function soundWrong()   { playTone(220,'sawtooth',0.18,0.2); }
function soundSubmit()  { playTone(440,'sine',0.1,0.15); }
function soundTaunt()   { playTone(880,'sine',0.08,0.25); }
function soundWin()     { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>playTone(f,'sine',0.3),i*100)); }

// ─── DIFFICULTY ───────────────────────────────────────────────────────────────
function selectDifficulty(diff) {
  currentDifficulty = diff;
  document.querySelectorAll(".diff-card").forEach(c => c.classList.remove("selected"));
  document.querySelector(`.diff-card[data-diff="${diff}"]`).classList.add("selected");
  applyDifficultyToUI(diff);
  if (currentRoomCode) {
    socket.emit("setDifficulty", { roomCode: currentRoomCode, difficulty: diff });
  }
}

function confirmDifficulty() {
  if (!currentRoomCode) return;
  socket.emit("setDifficulty",     { roomCode: currentRoomCode, difficulty: currentDifficulty });
  socket.emit("confirmDifficulty", { roomCode: currentRoomCode, difficulty: currentDifficulty });
}

function buildDigitInputs(containerId, prefix, count) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  for (let i = 1; i <= count; i++) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "digit-input";
    input.id = `${prefix}${i}`;
    input.maxLength = 1;
    input.autocomplete = "off";
    input.inputMode = "numeric";
    input.pattern = "[0-9]*";
    container.appendChild(input);
  }
  setupDigitInputs(prefix, count);
}

function buildPartnerSecretPlaceholder(count) {
  const container = document.getElementById("partnerSecretDisplay");
  if (!container) return;
  container.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const cube = document.createElement("div");
    cube.className = "cube empty"; cube.textContent = "?";
    container.appendChild(cube);
  }
}

function buildDigitTracker(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  for (let d = 0; d <= 9; d++) {
    const key = document.createElement("div");
    key.className = "digit-key";
    key.id = `${containerId}-${d}`;
    key.textContent = d;
    container.appendChild(key);
  }
}

function updateDigitTracker(containerId, digitState) {
  for (let d = 0; d <= 9; d++) {
    const el = document.getElementById(`${containerId}-${d}`);
    if (!el) continue;
    el.className = "digit-key" + (digitState[d] ? ` ${digitState[d]}` : "");
  }
}

function applyDifficultyToUI(diff) {
  const cfg = DIFF_CONFIG[diff];
  const setupTitle = document.getElementById("setupTitle");
  const setupHint  = document.getElementById("setupHint");
  if (setupTitle) setupTitle.textContent = `🔒 Set Your ${cfg.digits}-Digit Secret Number`;
  if (setupHint)  setupHint.textContent  = cfg.repeats
    ? `Enter ${cfg.digits} digits — repeats allowed (0-9)`
    : `Enter ${cfg.digits} different digits (0-9)`;
  buildDigitInputs("secretInputs", "secret", cfg.digits);
  buildDigitInputs("guessInputs",  "guess",  cfg.digits);
  buildPartnerSecretPlaceholder(cfg.digits);
  const badge = document.getElementById("gameDifficultyBadge");
  if (badge) { const icons = {easy:"🟢 Easy",medium:"🟡 Medium",hard:"🔴 Hard"}; badge.textContent = icons[diff]||diff; }
}

// ─── TURN / UI ────────────────────────────────────────────────────────────────
function updateTurnBanner() {
  const banner = document.getElementById("turnBanner");
  if (!banner) return;
  if (isMyTurn) {
    banner.className = "turn-banner my-turn";
    banner.textContent = "✨ Your Turn — Make a guess!";
  } else {
    banner.className = "turn-banner their-turn";
    banner.textContent = `⏳ ${partnerPlayerName}'s turn...`;
  }
}

function updateTurnState(currentTurnPlayer) {
  if (currentTurnPlayer) isMyTurn = currentTurnPlayer === myPlayerName;
  const myIndicator      = document.getElementById("myTurnIndicator");
  const partnerIndicator = document.getElementById("partnerTurnIndicator");
  const inputSection     = document.getElementById("guessInputSection");
  const myBoard          = document.getElementById("myBoard");
  const partnerBoard     = document.getElementById("partnerBoard");
  const submitBtn        = document.getElementById("guessBtn");

  if (isMyTurn) {
    myIndicator.textContent = "✅ Your Turn"; myIndicator.className = "turn-indicator";
    partnerIndicator.textContent = "Waiting..."; partnerIndicator.className = "turn-indicator waiting";
    inputSection.classList.remove("disabled");
    myBoard.classList.add("active-turn"); partnerBoard.classList.remove("active-turn");
    document.getElementById("inputSectionTitle").textContent = "Make Your Guess";
    if (submitBtn) { submitBtn.disabled=false; submitBtn.style.opacity="1"; submitBtn.style.pointerEvents="auto"; }
    setTimeout(() => { const f=document.getElementById("guess1"); if(f) f.focus(); }, 100);
  } else {
    myIndicator.textContent = "Waiting..."; myIndicator.className = "turn-indicator waiting";
    partnerIndicator.textContent = "✅ Their Turn"; partnerIndicator.className = "turn-indicator";
    inputSection.classList.add("disabled");
    myBoard.classList.remove("active-turn"); partnerBoard.classList.add("active-turn");
    document.getElementById("inputSectionTitle").textContent = "Wait for Your Turn";
    if (submitBtn) { submitBtn.disabled=true; submitBtn.style.opacity="0.5"; submitBtn.style.pointerEvents="none"; }
  }
  updateTurnBanner();
}

// ─── TAUNTS ───────────────────────────────────────────────────────────────────
function sendTaunt(emoji) {
  soundTaunt();
  socket.emit("taunt", { roomCode: currentRoomCode, emoji });
  showTauntToast(emoji);
}
function showTauntToast(emoji) {
  const toast = document.getElementById("tauntToast");
  toast.textContent = emoji;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1200);
}

// ─── CUBE ANIMATIONS ─────────────────────────────────────────────────────────
function animateCubeRow(row, feedback, guess) {
  const cubes = row.querySelectorAll(".cube");
  cubes.forEach((cube, i) => {
    setTimeout(() => {
      cube.classList.add("flip");
      setTimeout(() => {
        cube.textContent = guess[i];
        cube.className = `cube ${feedback[i]} flip`;
        setTimeout(() => cube.classList.remove("flip"), 300);
      }, 250);
    }, i * 120);
  });
}

function shakeInputs() {
  const inputs = document.querySelectorAll("#secretInputs .digit-input, #guessInputs .digit-input");
  inputs.forEach(inp => {
    inp.classList.remove("shake");
    void inp.offsetWidth;
    inp.classList.add("shake");
    setTimeout(() => inp.classList.remove("shake"), 450);
  });
}

// ─── SOCKET EVENTS ────────────────────────────────────────────────────────────

// ─── Reconnection ─────────────────────────────
// Attach after socket + state vars are declared
setTimeout(() => {
  GAMERO_RECONNECT.attach(socket, currentRoomCode, GAMERO_PLAYER.getName());
  // Re-attach when roomCode changes (after joining/creating)
  const _origSetRC = (v) => { currentRoomCode = v; GAMERO_RECONNECT.attach(socket, v, myPlayerName || GAMERO_PLAYER.getName()); };
  // Patch roomCreated and roomJoined to update reconnect context
}, 0);

socket.on("roomCreated", ({ roomCode, playerName, isHost: host }) => {
  currentRoomCode = roomCode; myPlayerName = playerName; isHost = host;
  GAMERO_RECONNECT.attach(socket, roomCode, playerName);
  GAMERO_WAITING.build('waitingCardContainer', roomCode, playerName, ['Connected','Pick difficulty','Play!']);
  showScreen("waitingScreen");
});

socket.on("partnerJoined", ({ partnerName }) => {
  partnerPlayerName = partnerName;
  GAMERO_WAITING.partnerJoined(partnerName);
  if (isHost) {
    document.getElementById("difficultyArea").style.display = "block";
    document.getElementById("confirmDiffBtn").style.display = "block";
    applyDifficultyToUI(currentDifficulty);
  }
});

socket.on("roomJoined", ({ roomCode, playerName, isHost: host, hostName }) => {
  currentRoomCode = roomCode; myPlayerName = playerName; isHost = host; partnerPlayerName = hostName;
  GAMERO_RECONNECT.attach(socket, roomCode, playerName);
  GAMERO_WAITING.build('waitingCardContainer', roomCode, playerName, ['Connected','Pick difficulty','Play!']);
  GAMERO_WAITING.partnerJoined(hostName);
  showScreen("waitingScreen");
});

socket.on("difficultySet", ({ difficulty }) => {
  currentDifficulty = difficulty;
  if (!isHost) {
    const cfg = DIFF_CONFIG[difficulty];
    document.getElementById("difficultyDisplay").style.display = "block";
    document.getElementById("partnerDifficultyText").textContent = cfg.label;
    applyDifficultyToUI(difficulty);
    document.getElementById("waitingStatus").innerHTML = `<span class="status-badge status-ready">⏳ Host is choosing difficulty...</span>`;
  }
});

socket.on("difficultyConfirmed", ({ difficulty }) => {
  currentDifficulty = difficulty;
  const cfg = DIFF_CONFIG[difficulty];
  applyDifficultyToUI(difficulty);
  document.getElementById("setupArea").style.display = "block";
  if (isHost) {
    document.getElementById("confirmDiffBtn").style.display = "none";
    GAMERO_WAITING.advanceStep(2);
  } else {
    document.getElementById("difficultyDisplay").style.display = "block";
    document.getElementById("partnerDifficultyText").textContent = cfg.label;
    GAMERO_WAITING.advanceStep(2);
  }
});

socket.on("playerReady", ({ playerName }) => {
  // Advance to step 2 when partner is ready
  GAMERO_WAITING.advanceStep(2);
});

socket.on("gameStarted", ({ firstTurn, difficulty }) => {
  currentDifficulty = difficulty;
  applyDifficultyToUI(difficulty);
  const cfg = DIFF_CONFIG[difficulty];

  document.getElementById("myName").textContent = myPlayerName;
  document.getElementById("partnerName").textContent = partnerPlayerName;
  document.getElementById("gameRoomCode").textContent = currentRoomCode;
  document.getElementById("typingName").textContent = partnerPlayerName;

  // Build digit trackers
  myDigitState = {}; partnerDigitState = {};
  buildDigitTracker("myDigitKeys");
  buildDigitTracker("partnerDigitKeys");

  // Show my secret number
  const mySecretDisplay = document.getElementById("mySecretDisplay");
  mySecretDisplay.innerHTML = "";
  for (let digit of mySecretNumber) {
    const cube = document.createElement("div");
    cube.className = "cube green"; cube.textContent = digit;
    mySecretDisplay.appendChild(cube);
  }

  if (isHost) document.getElementById("myHostBadge").style.display = "inline-block";
  updateTurnState(firstTurn);
  showScreen("gameScreen");
});

socket.on("turnUpdate", ({ currentTurn }) => {
  if (justGuessed && currentTurn === myPlayerName) return;
  if (lastTurnUpdate === currentTurn && turnUpdateTimeout) return;
  if (turnUpdateTimeout) clearTimeout(turnUpdateTimeout);
  lastTurnUpdate = currentTurn;
  updateTurnState(currentTurn);
  justGuessed = false;
  turnUpdateTimeout = setTimeout(() => { lastTurnUpdate = null; turnUpdateTimeout = null; }, 200);
});

socket.on("guessResult", ({ playerName, guess, feedback }) => {
  const isMine = playerName === myPlayerName;
  // My guesses → partner's board; their guesses → my board
  const container = isMine ? document.getElementById("partnerGuesses") : document.getElementById("myGuesses");
  const digitStateToUpdate = isMine ? myDigitState : partnerDigitState;
  const trackerContainerId  = isMine ? "myDigitKeys" : "partnerDigitKeys";

  const guessRow = document.createElement("div");
  guessRow.className = "cube-row slide-up";
  for (let i = 0; i < guess.length; i++) {
    const cube = document.createElement("div");
    cube.className = "cube";
    guessRow.appendChild(cube);
  }
  container.insertBefore(guessRow, container.firstChild);

  // Animate flip reveal
  setTimeout(() => {
    const cubes = guessRow.querySelectorAll(".cube");
    cubes.forEach((cube, i) => {
      setTimeout(() => {
        cube.classList.add("flip");
        setTimeout(() => {
          cube.textContent = guess[i];
          cube.className = `cube ${feedback[i]}`;
        }, 250);
      }, i * 120);
    });
  }, 50);

  // Update digit tracker — green > yellow > gray priority
  for (let i = 0; i < guess.length; i++) {
    const d = parseInt(guess[i]);
    const prev = digitStateToUpdate[d];
    const next = feedback[i];
    if (!prev || (prev === 'gray' && next !== 'gray') || (prev === 'yellow' && next === 'green')) {
      digitStateToUpdate[d] = next;
    }
  }
  setTimeout(() => updateDigitTracker(trackerContainerId, digitStateToUpdate), guess.length * 120 + 300);

  // Sound
  if (feedback.every(f => f === 'green')) soundCorrect(); else soundWrong();
});

socket.on("typing", ({ playerName }) => {
  if (playerName !== myPlayerName) document.getElementById("typingIndicator").classList.add("visible");
});
socket.on("stopTyping", ({ playerName }) => {
  if (playerName !== myPlayerName) document.getElementById("typingIndicator").classList.remove("visible");
});
socket.on("taunt", ({ emoji }) => { soundTaunt(); showTauntToast(emoji); });

socket.on("gameOver", ({ winner, hostName, partnerName, hostNumber, partnerNumber, hostGuesses, partnerGuesses }) => {
  const iWon = winner === myPlayerName;
  const winnerGuesses = winner === hostName ? hostGuesses : partnerGuesses;
  const loserGuesses  = winner === hostName ? partnerGuesses : hostGuesses;

  // Header
  const header = document.getElementById("gameOverHeader");
  header.className = "game-over-header" + (iWon ? "" : " lost");
  document.getElementById("gameOverEmoji").textContent   = iWon ? "🏆" : "😢";
  document.getElementById("gameOverTitle").textContent   = iWon ? "You Won!" : `${winner} Won!`;
  document.getElementById("gameOverSubtitle").textContent = `Solved in ${winnerGuesses} guess${winnerGuesses!==1?'es':''}!`;

  // Number reveal row (both numbers shown together)
  const revealRow = document.getElementById("numberRevealRow");
  revealRow.innerHTML = "";
  const hostCubes   = buildRevealCubeRow(hostNumber,   hostName,   "Host");
  const divider     = document.createElement("div");
  divider.style.cssText = "width:2px;background:rgba(255,255,255,0.12);border-radius:2px;margin:0 12px";
  const partnerCubes = buildRevealCubeRow(partnerNumber, partnerName, "Partner");
  revealRow.appendChild(hostCubes);
  revealRow.appendChild(divider);
  revealRow.appendChild(partnerCubes);

  // Stat cards
  const statsEl = document.getElementById("finalStats");
  statsEl.innerHTML = "";
  const myGuesses   = isHost ? hostGuesses   : partnerGuesses;
  const theirGuesses = isHost ? partnerGuesses : hostGuesses;
  statsEl.appendChild(makeNWStatCard(myPlayerName,    myGuesses,    iWon));
  statsEl.appendChild(makeNWStatCard(isHost ? partnerName : hostName, theirGuesses, !iWon));

  // Mini boards
  const grid = document.getElementById("numbersRevealGrid");
  grid.innerHTML = "";
  grid.appendChild(makeNumberPanel(hostName,    hostNumber,    winner === hostName));
  grid.appendChild(makeNumberPanel(partnerName, partnerNumber, winner === partnerName));

  if (isHost) {
    document.getElementById("hostResetControls").innerHTML = '<button class="btn-success" onclick="resetGame()">🔄 Play Again</button>';
    document.getElementById("hostResetControls").style.display = "block";
  } else {
    document.getElementById("hostResetControls").innerHTML = '<p style="text-align:center;color:#718096;font-size:0.88em;margin-bottom:12px;font-weight:600">⏳ Waiting for host to start next round...</p>';
    document.getElementById("hostResetControls").style.display = "block";
  }

  showScreen("gameOverScreen");
  if (iWon) {
    soundWin();
    setTimeout(() => confetti({ particleCount: 160, spread: 80, origin: { y: 0.55 }, colors: ['#667eea','#764ba2','#fff','#48bb78'] }), 150);
  } else {
    soundWrong();
  }
});

function buildRevealCubeRow(number, playerName, role) {
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:8px";
  const label = document.createElement("div");
  label.style.cssText = "font-size:0.7em;color:rgba(255,255,255,0.5);font-weight:700;text-transform:uppercase;letter-spacing:1px";
  label.textContent = playerName;
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:6px";
  for (const digit of number) {
    const cube = document.createElement("div");
    cube.className = "reveal-cube";
    cube.textContent = digit;
    row.appendChild(cube);
  }
  wrap.appendChild(label);
  wrap.appendChild(row);
  return wrap;
}

function makeNWStatCard(name, guesses, isWinner) {
  const card = document.createElement("div");
  card.className = `stat-card ${isWinner ? "winner-card" : ""}`;
  card.innerHTML = `
    <div class="stat-name">${name}</div>
    <div class="stat-score">${guesses}</div>
    <div class="stat-label">guess${guesses!==1?'es':''}</div>
    ${isWinner ? '<div class="stat-winner-badge">🏆 Winner</div>' : ''}
  `;
  return card;
}

function makeNumberPanel(name, number, isWinner) {
  const panel = document.createElement("div");
  panel.className = `number-panel ${isWinner ? "winner-panel" : ""}`;
  panel.innerHTML = `<div class="number-panel-name">${name}</div>`;
  const cubes = document.createElement("div");
  cubes.className = "number-panel-cubes";
  for (const digit of number) {
    const cube = document.createElement("div");
    cube.className = "mini-cube revealed";
    cube.textContent = digit;
    cubes.appendChild(cube);
  }
  panel.appendChild(cubes);
  return panel;
}

socket.on("gameReset", () => {
  mySecretNumber = ""; isMyTurn = false; justGuessed = false;
  lastTurnUpdate = null;
  if (turnUpdateTimeout) { clearTimeout(turnUpdateTimeout); turnUpdateTimeout = null; }
  myDigitState = {}; partnerDigitState = {};

  document.getElementById("myGuesses").innerHTML = "";
  document.getElementById("partnerGuesses").innerHTML = "";
  document.getElementById("mySecretDisplay").innerHTML = "";
  document.getElementById("hostResetControls").style.display = "none";

  const lockBtn = document.getElementById("lockBtn");
  if (lockBtn) { lockBtn.disabled=false; lockBtn.style.opacity="1"; lockBtn.style.pointerEvents="auto"; }

  if (isHost) {
    document.getElementById("difficultyArea").style.display = "block";
    document.getElementById("confirmDiffBtn").style.display = "block";
    document.getElementById("setupArea").style.display = "none";
    document.getElementById("difficultyDisplay").style.display = "none";
  } else {
    document.getElementById("setupArea").style.display = "none";
    document.getElementById("difficultyDisplay").style.display = "none";
    document.getElementById("difficultyArea").style.display = "none";
  }
  clearSecretInputs(); clearGuessInputs();
  GAMERO_WAITING.build('waitingCardContainer', currentRoomCode, myPlayerName, ['Connected','Pick difficulty','Play!']);
  GAMERO_WAITING.partnerJoined(partnerPlayerName);
  showScreen("waitingScreen");
});

socket.on("error", (message) => {
  document.getElementById("joinError").textContent = message;
  document.getElementById("joinError").style.display = "block";
});
socket.on("hostLeft",    () => { alert("Host left the game!");    location.href = "../../index.html"; });
socket.on("partnerLeft", () => { alert("Partner left the game!"); location.href = "../../index.html"; });

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────


function clearSecretInputs() {
  const cfg = DIFF_CONFIG[currentDifficulty];
  for (let i = 1; i <= cfg.digits; i++) { const el=document.getElementById(`secret${i}`); if(el) el.value=""; }
}
function clearGuessInputs() {
  const cfg = DIFF_CONFIG[currentDifficulty];
  for (let i = 1; i <= cfg.digits; i++) { const el=document.getElementById(`guess${i}`); if(el) el.value=""; }
}

// ─── UI FUNCTIONS ─────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}
function showHomeScreen() { showScreen("homeScreen"); document.getElementById("joinError").style.display="none"; }
function showJoinScreen()  { showScreen("joinScreen");  document.getElementById("joinError").style.display="none"; }

function createRoom() {
  const name = document.getElementById("playerName").value.trim();
  if (!name) { alert("Please enter your name!"); return; }
  socket.emit("createRoom", name);
}
function joinRoom() {
  const name = document.getElementById("joinName").value.trim();
  const code = document.getElementById("roomCode").value.trim().toUpperCase();
  if (!name || !code) {
    document.getElementById("joinError").textContent = "Please enter your name and room code!";
    document.getElementById("joinError").style.display = "block";
    return;
  }
  socket.emit("joinRoom", { roomCode: code, playerName: name });
}

async function setSecretNumber() {
  const cfg = DIFF_CONFIG[currentDifficulty];
  const digits = [];
  for (let i = 1; i <= cfg.digits; i++) {
    const val = document.getElementById(`secret${i}`)?.value;
    if (!val || !/^\d$/.test(val)) {
      shakeInputs();
      await GameroModal.warning(`Please enter ${cfg.digits} digits (0-9)!`, "Invalid Input", "🔢");
      return;
    }
    digits.push(val);
  }
  if (!cfg.repeats && new Set(digits).size !== cfg.digits) {
    shakeInputs();
    await GameroModal.warning("All digits must be different!", "Invalid Number", "❌");
    return;
  }
  mySecretNumber = digits.join("");
  socket.emit("setSecretNumber", { roomCode: currentRoomCode, secretNumber: mySecretNumber });
  document.getElementById("setupArea").style.display = "none";
  document.getElementById("difficultyArea").style.display = "none";
  document.getElementById("waitingStatus").innerHTML = `<span class="status-badge status-ready">✅ Waiting for partner...</span>`;
}

async function submitGuess() {
  if (!isMyTurn) { await GameroModal.info("Wait for your turn!", "Not Your Turn", "⏸️"); return; }
  const cfg = DIFF_CONFIG[currentDifficulty];
  const digits = [];
  for (let i = 1; i <= cfg.digits; i++) {
    const val = document.getElementById(`guess${i}`)?.value;
    if (!val || !/^\d$/.test(val)) {
      shakeInputs();
      await GameroModal.warning(`Please enter ${cfg.digits} digits (0-9)!`, "Invalid Input", "🔢");
      return;
    }
    digits.push(val);
  }
  const guess = digits.join("");
  soundSubmit();
  justGuessed = true; isMyTurn = false;
  updateTurnState(null);
  socket.emit("submitGuess", { roomCode: currentRoomCode, guess });
  socket.emit("stopTyping", { roomCode: currentRoomCode });
  clearGuessInputs();
}

function resetGame() { socket.emit("resetGame", { roomCode: currentRoomCode }); }
function leaveGame()  { location.href = "../../index.html"; }

// ─── INPUT NAVIGATION ─────────────────────────────────────────────────────────
function setupDigitInputs(prefix, count) {
  for (let i = 1; i <= count; i++) {
    const input = document.getElementById(`${prefix}${i}`);
    if (!input) continue;
    input.addEventListener("input", function() {
      this.value = this.value.replace(/[^0-9]/g, '');
      if (this.value.length === 1) {
        this.classList.remove('has-value');
        void this.offsetWidth;
        this.classList.add('has-value');
        if (i < count) document.getElementById(`${prefix}${i+1}`)?.focus();
      } else {
        this.classList.remove('has-value');
      }
      // Typing indicator for guess inputs
      if (prefix === "guess" && isMyTurn) {
        socket.emit("typing", { roomCode: currentRoomCode });
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => socket.emit("stopTyping", { roomCode: currentRoomCode }), 1500);
      }
    });
    input.addEventListener("keydown", function(e) {
      if (e.key === "Backspace" && this.value === "" && i > 1) document.getElementById(`${prefix}${i-1}`)?.focus();
      if (e.key === "Enter" && i === count) {
        if (prefix === "secret") setSecretNumber();
        else if (prefix === "guess") submitGuess();
      }
    });
    input.addEventListener("keypress", function(e) { if (!/[0-9]/.test(e.key)) e.preventDefault(); });
  }
}

// Auto-focus first input when screen changes
const screenObserver = new MutationObserver(() => {
  const activeScreen = document.querySelector(".screen.active");
  if (activeScreen) {
    const firstInput = activeScreen.querySelector('input[type="text"]');
    if (firstInput) setTimeout(() => firstInput.focus(), 100);
  }
});
screenObserver.observe(document.body, { childList: true, subtree: true });

console.log("🎮 Number Wordle loaded — mobile-first polished!");