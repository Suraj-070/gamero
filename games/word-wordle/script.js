const socket = io(GAMERO_CONFIG.SERVER_URL);

const MAX_GUESSES = 6;
const WORD_LENGTH = 5;

let myPlayerName = "";
let partnerPlayerName = "";
let currentRoomCode = "";
let isHost = false;
let myGuessCount = 0;
let theirGuessCount = 0;
let gameOver = false;
let typingTimeout = null;
let myKeyboardState = {};

// Store all guesses for board reveal + share
let myGuessList = [];      // [{guess, feedback}]
let theirGuessList = [];   // [{feedback}] — no letters
let lastGameResult = null; // stored for share button

const KEYBOARD_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['Z','X','C','V','B','N','M']
];

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
function soundCorrect() { [523,659,784,1047].forEach((f,i) => setTimeout(() => playTone(f,'sine',0.25), i*80)); }
function soundWrong()   { playTone(220,'sawtooth',0.15,0.2); }
function soundSubmit()  { playTone(440,'sine',0.08,0.15); }
function soundTaunt()   { playTone(880,'sine',0.06,0.2); }
function soundWin()     { [523,659,784,1047,1319].forEach((f,i) => setTimeout(() => playTone(f,'sine',0.3), i*90)); }
function soundClose()   { playTone(330,'sine',0.12,0.3); }

// ─── GRID SETUP ───────────────────────────────────────────────────────────────
function buildGrid(containerId, showLetters) {
  const grid = document.getElementById(containerId);
  grid.innerHTML = "";
  for (let r = 0; r < MAX_GUESSES; r++) {
    const row = document.createElement("div");
    row.className = "wordle-row";
    row.id = `${containerId}-row-${r}`;
    for (let c = 0; c < WORD_LENGTH; c++) {
      const cube = document.createElement("div");
      cube.className = "wordle-cube";
      cube.id = `${containerId}-${r}-${c}`;
      row.appendChild(cube);
    }
    grid.appendChild(row);
  }
}

function buildKeyboard(containerId) {
  const kb = document.getElementById(containerId);
  kb.innerHTML = "";
  KEYBOARD_ROWS.forEach(row => {
    const rowDiv = document.createElement("div");
    rowDiv.className = "key-row";
    row.forEach(letter => {
      const key = document.createElement("div");
      key.className = "key";
      key.id = `${containerId}-key-${letter}`;
      key.textContent = letter;
      rowDiv.appendChild(key);
    });
    kb.appendChild(rowDiv);
  });
}

function highlightActiveRow(gridId, rowIndex) {
  if (rowIndex >= MAX_GUESSES) return;
  for (let c = 0; c < WORD_LENGTH; c++) {
    const cube = document.getElementById(`${gridId}-${rowIndex}-${c}`);
    if (cube && !cube.classList.contains('green') && !cube.classList.contains('yellow') && !cube.classList.contains('gray')) {
      cube.classList.add('active-row');
    }
  }
}

function removeActiveRow(gridId, rowIndex) {
  for (let c = 0; c < WORD_LENGTH; c++) {
    const cube = document.getElementById(`${gridId}-${rowIndex}-${c}`);
    if (cube) cube.classList.remove('active-row');
  }
}

// ─── RACE BAR ─────────────────────────────────────────────────────────────────
function updateRaceBar() {
  const myPct  = (myGuessCount  / MAX_GUESSES) * 100;
  const theirPct = (theirGuessCount / MAX_GUESSES) * 100;
  document.getElementById("myRaceFill").style.width    = myPct + "%";
  document.getElementById("theirRaceFill").style.width = theirPct + "%";
  document.getElementById("myRaceCount").textContent    = `${myGuessCount}/${MAX_GUESSES}`;
  document.getElementById("theirRaceCount").textContent = `${theirGuessCount}/${MAX_GUESSES}`;
}

// ─── REVEAL ROW ───────────────────────────────────────────────────────────────
function revealRow(gridId, rowIndex, letters, feedback, showLetters) {
  return new Promise(resolve => {
    for (let c = 0; c < WORD_LENGTH; c++) {
      const cube = document.getElementById(`${gridId}-${rowIndex}-${c}`);
      if (!cube) continue;
      const delay = c * 120;
      setTimeout(() => {
        cube.classList.add('flip');
        setTimeout(() => {
          if (showLetters) cube.textContent = letters[c];
          cube.classList.remove('active-row','filled','flip');
          cube.classList.add(showLetters ? feedback[c] : `hidden-${feedback[c]}`);
        }, 250);
      }, delay);
    }
    setTimeout(resolve, WORD_LENGTH * 120 + 300);
  });
}

// ─── KEYBOARD UPDATE ─────────────────────────────────────────────────────────
function updateKeyboard(letters, feedback) {
  const priority = { green: 3, yellow: 2, gray: 1 };
  for (let i = 0; i < letters.length; i++) {
    const letter = letters[i].toUpperCase();
    const state  = feedback[i];
    const current = myKeyboardState[letter];
    if (!current || (priority[state] || 0) > (priority[current] || 0)) {
      myKeyboardState[letter] = state;
    }
  }
  for (const [letter, state] of Object.entries(myKeyboardState)) {
    const key = document.getElementById(`myKeyboard-key-${letter}`);
    if (key) { key.className = `key ${state}`; }
  }
}

// ─── LIVE TYPING PREVIEW ─────────────────────────────────────────────────────
let lastPreviewLength = 0;
function updateLivePreview(value) {
  if (gameOver) return;
  removeActiveRow("myGrid", myGuessCount);
  for (let c = 0; c < WORD_LENGTH; c++) {
    const cube = document.getElementById(`myGrid-${myGuessCount}-${c}`);
    if (!cube) continue;
    if (c < value.length) {
      const isNew = c >= lastPreviewLength;
      cube.textContent = value[c].toUpperCase();
      if (isNew) {
        cube.classList.remove('filled');
        void cube.offsetWidth; // force reflow for animation restart
        cube.classList.add('filled', 'active-row');
      } else {
        cube.classList.add('filled', 'active-row');
      }
    } else {
      cube.textContent = "";
      cube.classList.remove('filled');
      cube.classList.add('active-row');
    }
  }
  lastPreviewLength = value.length;
}

// ─── INPUT HANDLERS ───────────────────────────────────────────────────────────
function onWordInput(input) {
  input.value = input.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, WORD_LENGTH);
  updateLivePreview(input.value);
  if (!gameOver && currentRoomCode) {
    socket.emit('wordTyping', { roomCode: currentRoomCode });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('wordStopTyping', { roomCode: currentRoomCode }), 1500);
  }
}

function onWordKeydown(e) {
  if (e.key === 'Enter') submitGuess();
}

function shakeRow(gridId, rowIndex) {
  const row = document.getElementById(`${gridId}-row-${rowIndex}`);
  if (!row) return;
  row.querySelectorAll('.wordle-cube').forEach(cube => {
    cube.classList.remove('shake');
    void cube.offsetWidth;
    cube.classList.add('shake');
    setTimeout(() => cube.classList.remove('shake'), 450);
  });
}

// ─── TAUNTS ───────────────────────────────────────────────────────────────────
function sendTaunt(emoji) {
  soundTaunt();
  socket.emit('taunt', { roomCode: currentRoomCode, emoji });
  showTauntToast(emoji);
}
function showTauntToast(emoji) {
  const t = document.getElementById('tauntToast');
  t.textContent = emoji; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1200);
}

// ─── GAME FUNCTIONS ───────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function showHomeScreen()  { showScreen('homeScreen'); document.getElementById('joinError').style.display='none'; }
function showJoinScreen()  { document.getElementById('joinName')?.focus(); document.getElementById('joinError').style.display='none'; }

function createRoom() {
  const name = document.getElementById('playerName').value.trim();
  if (!name) { alert('Please enter your name!'); return; }
  socket.emit('createRoom', name);
}
function joinRoom() {
  const name = document.getElementById('joinName').value.trim();
  const code = document.getElementById('roomCode').value.trim().toUpperCase();
  if (!name || !code) {
    document.getElementById('joinError').textContent = 'Please enter name and room code!';
    document.getElementById('joinError').style.display = 'block';
    return;
  }
  socket.emit('joinRoom', { roomCode: code, playerName: name });
}

function setReady() {
  document.getElementById('readyBtn').disabled = true;
  document.getElementById('readyBtn').textContent = '⏳ Waiting for partner...';
  socket.emit('wordWordleReady', { roomCode: currentRoomCode });
}

async function submitGuess() {
  if (gameOver) return;
  const input = document.getElementById('wordInput');
  const word = input.value.trim().toUpperCase();
  if (word.length !== WORD_LENGTH) {
    shakeRow('myGrid', myGuessCount);
    document.getElementById('guessHint').textContent = `Word must be ${WORD_LENGTH} letters!`;
    return;
  }
  soundSubmit();
  socket.emit('wordWordleGuess', { roomCode: currentRoomCode, guess: word });
  input.value = '';
  lastPreviewLength = 0;
  updateLivePreview('');
  document.getElementById('guessHint').textContent = 'Guess submitted...';
  // Disable input while waiting for server response
  input.disabled = true;
  document.getElementById('guessBtn').disabled = true;
}

function resetGame() { socket.emit('resetWordWordle', { roomCode: currentRoomCode }); }
function leaveGame()  { location.href = '../../index.html'; }

// ─── SOCKET EVENTS ────────────────────────────────────────────────────────────

// ─── Reconnection ─────────────────────────────
// Attach after socket + state vars are declared
setTimeout(() => {
  GAMERO_RECONNECT.attach(socket, currentRoomCode, GAMERO_PLAYER.getName());
  // Re-attach when roomCode changes (after joining/creating)
  const _origSetRC = (v) => { currentRoomCode = v; GAMERO_RECONNECT.attach(socket, v, myPlayerName || GAMERO_PLAYER.getName()); };
  // Patch roomCreated and roomJoined to update reconnect context
}, 0);

socket.on('roomCreated', ({ roomCode, playerName, isHost: host }) => {
  currentRoomCode = roomCode; myPlayerName = playerName; isHost = host;
  GAMERO_RECONNECT.attach(socket, roomCode, playerName);
  GAMERO_WAITING.build('waitingCardContainer', roomCode, playerName, ['Connected','Get ready','Play!']);
  showScreen('waitingScreen');
});

socket.on('partnerJoined', ({ partnerName }) => {
  partnerPlayerName = partnerName;
  GAMERO_WAITING.partnerJoined(partnerName);
  document.getElementById('readyArea').style.display = 'block';
});

socket.on('roomJoined', ({ roomCode, playerName, isHost: host, hostName }) => {
  currentRoomCode = roomCode; myPlayerName = playerName;
  isHost = host; partnerPlayerName = hostName;
  GAMERO_RECONNECT.attach(socket, roomCode, playerName);
  GAMERO_WAITING.build('waitingCardContainer', roomCode, playerName, ['Connected','Get ready','Play!']);
  GAMERO_WAITING.partnerJoined(hostName);
  document.getElementById('readyArea').style.display = 'block';
  showScreen('waitingScreen');
});

socket.on('playerReady', ({ playerName }) => {
  GAMERO_WAITING.advanceStep(2);
});

socket.on('wordWordleStarted', () => {
  // Reset state
  myGuessCount = 0; theirGuessCount = 0;
  gameOver = false; myKeyboardState = {};
  myGuessList = []; theirGuessList = []; lastGameResult = null;
  lastPreviewLength = 0;

  document.getElementById('myName').textContent = myPlayerName;
  document.getElementById('partnerName').textContent = partnerPlayerName;
  document.getElementById('myRaceLabel').textContent = myPlayerName;
  document.getElementById('theirRaceLabel').textContent = partnerPlayerName;
  document.getElementById('gameRoomCode').textContent = currentRoomCode;
  document.getElementById('typingName').textContent = partnerPlayerName;
  document.getElementById('closeCallBanner').style.display = 'none';

  // Build grids and keyboards
  buildGrid('myGrid', true);
  buildGrid('opponentGrid', false);
  buildKeyboard('myKeyboard');

  // Highlight first row
  highlightActiveRow('myGrid', 0);
  updateRaceBar();

  // Enable input
  const input = document.getElementById('wordInput');
  input.disabled = false; input.value = '';
  document.getElementById('guessBtn').disabled = false;
  document.getElementById('guessHint').textContent = 'Type your guess and press Enter or →';
  document.getElementById('guessInputSection').classList.remove('disabled');

  showScreen('gameScreen');
  setTimeout(() => input.focus(), 200);

  GameroModal.success('Word chosen! Race to guess it!', 'Go!', '⚡');
});

socket.on('invalidWord', () => {
  shakeRow('myGrid', myGuessCount);
  soundWrong();
  document.getElementById('guessHint').textContent = '❌ Not a valid word!';
  const input = document.getElementById('wordInput');
  input.disabled = false;
  document.getElementById('guessBtn').disabled = false;
  setTimeout(() => input.focus(), 100);
  setTimeout(() => {
    if (document.getElementById('guessHint').textContent === '❌ Not a valid word!') {
      document.getElementById('guessHint').textContent = 'Type your guess and press Enter or →';
    }
  }, 2000);
});

socket.on('wordWordleResult', async ({ guess, feedback, guessNumber, solved }) => {
  myGuessList.push({ guess, feedback });
  // Re-enable input
  const input = document.getElementById('wordInput');
  input.disabled = false;
  document.getElementById('guessBtn').disabled = false;

  // Reveal the row
  await revealRow('myGrid', guessNumber - 1, guess.split(''), feedback, true);
  updateKeyboard(guess.split(''), feedback);

  myGuessCount = guessNumber;
  updateRaceBar();
  highlightActiveRow('myGrid', myGuessCount);

  if (solved) {
    // Lock input immediately — server will send youSolved or wordWordleOver next
    gameOver = true;
    document.getElementById('guessInputSection').classList.add('disabled');
    document.getElementById('guessHint').textContent = '🎉 Correct! Waiting...';
    soundCorrect();
  } else if (guessNumber >= MAX_GUESSES) {
    document.getElementById('guessHint').textContent = '😢 Out of guesses!';
    soundWrong();
    document.getElementById('guessInputSection').classList.add('disabled');
    gameOver = true;
  } else {
    const allGray = feedback.every(f => f === 'gray');
    if (allGray) { soundWrong(); document.getElementById('guessHint').textContent = 'No matching letters. Try again!'; }
    else { soundSubmit(); document.getElementById('guessHint').textContent = 'Keep going!'; }
    setTimeout(() => input.focus(), 100);
  }
});

socket.on('opponentGuessed', ({ feedback, guessNumber }) => {
  theirGuessList.push({ feedback });
  // Show only colours on opponent board
  const hiddenLetters = Array(WORD_LENGTH).fill('');
  revealRow('opponentGrid', guessNumber - 1, hiddenLetters, feedback, false);
  theirGuessCount = guessNumber;
  updateRaceBar();

  // Close call detection — 4 greens
  const greenCount = feedback.filter(f => f === 'green').length;
  if (greenCount >= 4 && !gameOver) {
    soundClose();
    const banner = document.getElementById('closeCallBanner');
    banner.style.display = 'block';
    setTimeout(() => banner.style.display = 'none', 3000);
  }
});

socket.on('youSolved', ({ word, guessNumber }) => {
  // I solved it — show celebration but game isn't over yet (opponent still guessing)
  soundWin();
  confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  document.getElementById('guessHint').textContent = `🎉 You got it in ${guessNumber}! Waiting for opponent to finish...`;
  document.getElementById('guessInputSection').classList.add('disabled');
  gameOver = true; // stop me from guessing more
});

socket.on('opponentSolved', ({ solverName, guessNumber }) => {
  // Opponent solved it — show banner but keep MY input open so I can still guess
  soundClose();
  const banner = document.getElementById('closeCallBanner');
  banner.textContent = `🏆 ${solverName} solved it in ${guessNumber}! You still have your remaining guesses!`;
  banner.style.display = 'block';
  banner.style.background = 'linear-gradient(135deg,#fff5f5,#fed7d7)';
  banner.style.borderColor = '#fc8181';
  banner.style.color = '#c53030';
  // Don't set gameOver — opponent can still guess
  document.getElementById('guessHint').textContent = `Keep going! Can you solve it too?`;
});

socket.on('wordWordleOver', ({ winner, word, myGuesses, theirGuesses, myName, theirName, bothFailed }) => {
  gameOver = true;
  document.getElementById('guessInputSection').classList.add('disabled');
  document.getElementById('closeCallBanner').style.display = 'none';

  const iWon   = winner === myPlayerName;
  const iDrew  = bothFailed;

  // Store for share
  lastGameResult = { winner, word, myGuesses, theirGuesses, myName: myPlayerName, theirName, bothFailed, iWon };

  // Header styling
  const header = document.getElementById('gameOverHeader');
  header.className = 'game-over-header' + (iWon ? '' : iDrew ? ' draw' : ' lost');

  if (iDrew) {
    document.getElementById('gameOverEmoji').textContent = '🤝';
    document.getElementById('gameOverTitle').textContent = 'Nobody got it!';
    document.getElementById('gameOverSubtitle').textContent = 'The word remains unsolved...';
    soundWrong();
  } else if (iWon) {
    document.getElementById('gameOverEmoji').textContent = '🏆';
    document.getElementById('gameOverTitle').textContent = 'You Won!';
    document.getElementById('gameOverSubtitle').textContent = `Solved in ${myGuesses} guess${myGuesses!==1?'es':''}!`;
    soundWin();
    setTimeout(() => confetti({ particleCount: 180, spread: 85, origin: { y: 0.55 }, colors: ['#11998e','#38ef7d','#fff'] }), 150);
  } else {
    document.getElementById('gameOverEmoji').textContent = '😢';
    document.getElementById('gameOverTitle').textContent = `${winner} Won!`;
    document.getElementById('gameOverSubtitle').textContent = theirGuesses > 0
      ? `They solved it in ${theirGuesses} guess${theirGuesses!==1?'es':''}` : '';
    soundWrong();
  }

  // Word reveal cubes
  const cubesContainer = document.getElementById('wordRevealCubes');
  cubesContainer.innerHTML = '';
  word.split('').forEach(letter => {
    const cube = document.createElement('div');
    cube.className = 'word-reveal-cube';
    cube.textContent = letter;
    cubesContainer.appendChild(cube);
  });

  // Stat cards
  const statsEl = document.getElementById('finalStats');
  const myCard  = makeStatCard(myPlayerName, myGuesses, iWon || (!iDrew && !iWon && myGuesses > 0 && myGuesses <= theirGuesses));
  const theirCard = makeStatCard(theirName, theirGuesses, !iWon && !iDrew);
  statsEl.innerHTML = '';
  statsEl.appendChild(myCard);
  statsEl.appendChild(theirCard);

  // Boards reveal
  buildBoardsReveal(word, myName, theirName);

  // Reset controls
  if (isHost) {
    document.getElementById('hostResetControls').innerHTML = '<button class="btn-success" onclick="resetGame()">🔄 Play Again</button>';
  } else {
    document.getElementById('hostResetControls').innerHTML =
      '<p style="text-align:center;color:#718096;font-size:0.88em;margin-bottom:12px;font-weight:600">⏳ Waiting for host to start next round...</p>';
  }
  document.getElementById('hostResetControls').style.display = 'block';

  showScreen('gameOverScreen');
});

function makeStatCard(name, guesses, isWinner) {
  const card = document.createElement('div');
  card.className = `stat-card ${isWinner ? 'winner-card' : 'loser-card'}`;
  const solved = guesses > 0;
  card.innerHTML = `
    <div class="stat-name">${name}</div>
    <div class="stat-score">${solved ? guesses + '/6' : '—'}</div>
    <div class="stat-label">${solved ? 'guess' + (guesses !== 1 ? 'es' : '') : 'did not solve'}</div>
    ${isWinner ? '<div class="stat-badge">🏆 Winner</div>' : ''}
  `;
  return card;
}

function buildBoardsReveal(word, myName, theirName) {
  const container = document.getElementById('boardsReveal');
  container.innerHTML = '';
  // My board — full letters
  container.appendChild(makeBoardRevealPanel(myName, myGuessList, true));
  // Their board — colours only, now revealed with hidden cubes shown as coloured
  container.appendChild(makeBoardRevealPanel(theirName, theirGuessList, false));
}

function makeBoardRevealPanel(name, guessList, showLetters) {
  const panel = document.createElement('div');
  panel.className = 'board-reveal-panel' + (showLetters ? ' winner-panel' : '');
  panel.innerHTML = `<div class="board-reveal-name">${name}</div>`;
  const grid = document.createElement('div');
  grid.className = 'board-reveal-grid';
  for (let r = 0; r < MAX_GUESSES; r++) {
    const row = document.createElement('div');
    row.className = 'board-reveal-row';
    const guess = guessList[r];
    for (let c = 0; c < WORD_LENGTH; c++) {
      const cube = document.createElement('div');
      if (guess) {
        const fb = guess.feedback ? guess.feedback[c] : null;
        cube.className = `board-reveal-cube ${fb || ''}`;
        cube.textContent = showLetters && guess.guess ? guess.guess[c] : '';
      } else {
        cube.className = 'board-reveal-cube empty';
      }
      row.appendChild(cube);
    }
    grid.appendChild(row);
  }
  panel.appendChild(grid);
  return panel;
}

function shareResult() {
  if (!lastGameResult) return;
  const { winner, word, myGuesses, theirGuesses, myName: me, theirName, bothFailed, iWon } = lastGameResult;
  const lines = [`🔤 GAMERO Word Wordle`, ``];
  if (bothFailed) lines.push(`🤝 Nobody solved "${word}"`);
  else lines.push(`🏆 ${winner} solved it!`);
  lines.push(``);
  // Emoji grid for my board
  lines.push(`${me}:`);
  myGuessList.forEach(({feedback}) => {
    lines.push(feedback.map(f => f==='green'?'🟩':f==='yellow'?'🟨':'⬜').join(''));
  });
  lines.push(``);
  lines.push(`${theirName}:`);
  theirGuessList.forEach(({feedback}) => {
    lines.push(feedback.map(f => f==='green'?'🟩':f==='yellow'?'🟨':'⬜').join(''));
  });
  lines.push(``);
  lines.push(`Play at GAMERO! 🎮`);

  const text = lines.join('\n');
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('shareBtn');
    btn.textContent = '✅ Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = '<span>📋</span> Share Result'; btn.classList.remove('copied'); }, 2000);
  }).catch(() => {
    // Fallback for browsers without clipboard API
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    const btn = document.getElementById('shareBtn');
    btn.textContent = '✅ Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = '<span>📋</span> Share Result'; btn.classList.remove('copied'); }, 2000);
  });
}

socket.on('wordWordleReset', () => {
  myGuessCount = 0; theirGuessCount = 0;
  gameOver = false; myKeyboardState = {};
  myGuessList = []; theirGuessList = []; lastGameResult = null;
  lastPreviewLength = 0;
  // Reset UI elements
  document.getElementById('readyArea').style.display = 'block';
  document.getElementById('readyBtn').disabled = false;
  document.getElementById('readyBtn').textContent = '✅ I\'m Ready!';
  document.getElementById('hostResetControls').style.display = 'none';
  document.getElementById('closeCallBanner').style.display = 'none';
  document.getElementById('closeCallBanner').textContent = '🔥 Opponent is very close!';
  document.getElementById('guessInputSection').classList.remove('disabled');
  GAMERO_WAITING.build('waitingCardContainer', currentRoomCode, myPlayerName, ['Connected','Get ready','Play!']);
  GAMERO_WAITING.partnerJoined(partnerPlayerName);
  showScreen('waitingScreen');
});

socket.on('wordTyping', () => {
  document.getElementById('typingIndicator').classList.add('visible');
});
socket.on('wordStopTyping', () => {
  document.getElementById('typingIndicator').classList.remove('visible');
});
socket.on('taunt', ({ emoji }) => { soundTaunt(); showTauntToast(emoji); });

socket.on('hostLeft',    () => { alert('Host left!');    location.href = '../../index.html'; });
socket.on('partnerLeft', () => { alert('Partner left!'); location.href = '../../index.html'; });
socket.on('error', (msg) => { alert(msg); });

console.log('🔤 Word Wordle loaded!');