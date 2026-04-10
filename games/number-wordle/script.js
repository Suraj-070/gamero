// CHANGE THIS URL TO YOUR DEPLOYED SERVER
const socket = io("https://gamero-server.onrender.com");

let myPlayerName = "";
let partnerPlayerName = "";
let currentRoomCode = "";
let isHost = false;
let mySecretNumber = "";
let isMyTurn = false;

// Socket event listeners
socket.on("roomCreated", ({ roomCode, playerName, isHost: host }) => {
  currentRoomCode = roomCode;
  myPlayerName = playerName;
  isHost = host;
  document.getElementById("displayRoomCode").textContent = roomCode;
  showScreen("waitingScreen");
});

socket.on("partnerJoined", ({ partnerName }) => {
  partnerPlayerName = partnerName;
  document.getElementById("waitingStatus").innerHTML =
    `<span class="status-badge status-ready">✅ ${partnerName} joined!</span>`;
  document.getElementById("setupArea").style.display = "block";
});

socket.on("roomJoined", ({ roomCode, playerName, isHost: host, hostName }) => {
  currentRoomCode = roomCode;
  myPlayerName = playerName;
  isHost = host;
  partnerPlayerName = hostName;
  document.getElementById("displayRoomCode").textContent = roomCode;
  document.getElementById("waitingStatus").innerHTML =
    `<span class="status-badge status-ready">✅ Connected!</span>`;
  document.getElementById("setupArea").style.display = "block";
  showScreen("waitingScreen");
});

socket.on("playerReady", ({ playerName }) => {
  document.getElementById("waitingStatus").innerHTML =
    `<span class="status-badge status-ready">✅ ${playerName} is ready! Waiting for you...</span>`;
});

socket.on("gameStarted", ({ hostName, partnerName, firstTurn }) => {
  document.getElementById("myName").textContent = myPlayerName;
  document.getElementById("partnerName").textContent = partnerPlayerName;
  document.getElementById("gameRoomCode").textContent = currentRoomCode;

  // Display my secret number
  const mySecretDisplay = document.getElementById("mySecretDisplay");
  mySecretDisplay.innerHTML = "";
  for (let digit of mySecretNumber) {
    const cube = document.createElement("div");
    cube.className = "cube green";
    cube.textContent = digit;
    mySecretDisplay.appendChild(cube);
  }

  if (isHost) {
    document.getElementById("myHostBadge").style.display = "inline-block";
  }

  updateTurnState(firstTurn);
  showScreen("gameScreen");
  
  console.log('🎮 Game started! First turn:', firstTurn, '| My name:', myPlayerName);
});

// Turn update with guards
let lastTurnUpdate = null;
let turnUpdateTimeout = null;
let justGuessed = false;

socket.on("turnUpdate", ({ currentTurn }) => {
  console.log('🔄 Turn update received:', currentTurn, '| My name:', myPlayerName, '| Just guessed?', justGuessed);
  
  // GUARD: If I just guessed and turn comes back to me, IGNORE IT
  if (justGuessed && currentTurn === myPlayerName) {
    console.log('   ⚠️ IGNORED: I just guessed, turn cannot come back to me!');
    return;
  }
  
  // DEBOUNCE: Ignore duplicate turn updates within 200ms
  if (lastTurnUpdate === currentTurn && turnUpdateTimeout) {
    console.log('   ⏭️ IGNORED: Duplicate turn update');
    return;
  }
  
  // Clear previous timeout
  if (turnUpdateTimeout) {
    clearTimeout(turnUpdateTimeout);
  }
  
  lastTurnUpdate = currentTurn;
  updateTurnState(currentTurn);
  
  // Reset justGuessed flag after turn changes
  justGuessed = false;
  
  // Reset debounce after 200ms
  turnUpdateTimeout = setTimeout(() => {
    lastTurnUpdate = null;
    turnUpdateTimeout = null;
  }, 200);
});

socket.on("guessResult", ({ playerName, guess, feedback, isHost: guessIsHost }) => {
  const isMine = playerName === myPlayerName;
  
  // SWAP: My guesses appear on opponent's panel (where their secret is)
  // Their guesses appear on my panel (where my secret is)
  const container = isMine
    ? document.getElementById("partnerGuesses")
    : document.getElementById("myGuesses");

  const guessRow = document.createElement("div");
  guessRow.className = "cube-row";

  for (let i = 0; i < 4; i++) {
    const cube = document.createElement("div");
    cube.className = `cube ${feedback[i]}`;
    cube.textContent = guess[i];
    cube.style.animationDelay = `${i * 0.1}s`;
    guessRow.appendChild(cube);
  }

  container.insertBefore(guessRow, container.firstChild);
});

socket.on("gameOver", ({ winner, hostName, partnerName, hostNumber, partnerNumber, hostGuesses, partnerGuesses }) => {
  const winnerName = winner;
  const winnerGuessCount = winner === hostName ? hostGuesses : partnerGuesses;

  document.getElementById("winnerEmoji").textContent = winner === myPlayerName ? "🎉" : "😢";
  document.getElementById("winnerText").textContent = `${winner} Won!`;
  document.getElementById("winnerNameStats").textContent = winnerName;
  document.getElementById("winnerGuesses").textContent = winnerGuessCount;

  // Display revealed numbers
  displayRevealedNumber("hostNameReveal", "hostNumberReveal", hostName, hostNumber);
  displayRevealedNumber("partnerNameReveal", "partnerNumberReveal", partnerName, partnerNumber);

  if (isHost) {
    document.getElementById("hostResetControls").style.display = "block";
  }

  showScreen("gameOverScreen");
});

socket.on("gameReset", () => {
  mySecretNumber = "";
  document.getElementById("myGuesses").innerHTML = "";
  document.getElementById("partnerGuesses").innerHTML = "";
  clearSecretInputs();
  clearGuessInputs();
  document.getElementById("setupArea").style.display = "block";
  document.getElementById("waitingStatus").innerHTML =
    `<span class="status-badge status-ready">✅ Both players ready!</span>`;
  showScreen("waitingScreen");
});

socket.on("error", (message) => {
  document.getElementById("joinError").textContent = message;
  document.getElementById("joinError").style.display = "block";
});

socket.on("hostLeft", () => {
  alert("Host left the game!");
  location.href = "../../index.html";
});

socket.on("partnerLeft", () => {
  alert("Partner left the game!");
  location.href = "../../index.html";
});

// Helper Functions
function displayRevealedNumber(nameId, numberId, name, number) {
  document.getElementById(nameId).textContent = name;
  const container = document.getElementById(numberId);
  container.innerHTML = "";
  for (let digit of number) {
    const cube = document.createElement("div");
    cube.className = "cube green";
    cube.textContent = digit;
    container.appendChild(cube);
  }
}

function updateTurnState(currentTurnPlayer) {
  if (currentTurnPlayer) {
    isMyTurn = currentTurnPlayer === myPlayerName;
  }
  
  console.log('🔧 updateTurnState | currentTurnPlayer:', currentTurnPlayer, '| isMyTurn:', isMyTurn);

  const myIndicator = document.getElementById("myTurnIndicator");
  const partnerIndicator = document.getElementById("partnerTurnIndicator");
  const inputSection = document.getElementById("guessInputSection");
  const myBoard = document.getElementById("myBoard");
  const partnerBoard = document.getElementById("partnerBoard");
  const submitBtn = document.querySelector('.submit-btn');

  if (isMyTurn) {
    console.log('   ✅ Enabling MY turn');
    myIndicator.textContent = "✅ Your Turn";
    myIndicator.className = "turn-indicator";
    partnerIndicator.textContent = "Waiting...";
    partnerIndicator.className = "turn-indicator waiting";
    inputSection.classList.remove("disabled");
    myBoard.classList.add("active-turn");
    partnerBoard.classList.remove("active-turn");
    document.getElementById("inputSectionTitle").textContent = "Make Your Guess";
    
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
      submitBtn.style.pointerEvents = 'auto';
    }
    
    setTimeout(() => {
      const firstInput = document.getElementById('guess1');
      if (firstInput) firstInput.focus();
    }, 100);
  } else {
    console.log('   ❌ Disabling MY turn');
    myIndicator.textContent = "Waiting...";
    myIndicator.className = "turn-indicator waiting";
    partnerIndicator.textContent = "✅ Their Turn";
    partnerIndicator.className = "turn-indicator";
    inputSection.classList.add("disabled");
    myBoard.classList.remove("active-turn");
    partnerBoard.classList.add("active-turn");
    document.getElementById("inputSectionTitle").textContent = "Wait for Your Turn";
    
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.5';
      submitBtn.style.pointerEvents = 'none';
    }
  }
}

function clearSecretInputs() {
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`secret${i}`).value = "";
  }
}

function clearGuessInputs() {
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`guess${i}`).value = "";
  }
}

// UI Functions
function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(screenId).classList.add("active");
}

function showHomeScreen() {
  showScreen("homeScreen");
  document.getElementById("joinError").style.display = "none";
}

function showJoinScreen() {
  showScreen("joinScreen");
  document.getElementById("joinError").style.display = "none";
}

function createRoom() {
  const name = document.getElementById("playerName").value.trim();
  if (!name) {
    alert("Please enter your name!");
    return;
  }
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
  const digits = [];
  for (let i = 1; i <= 4; i++) {
    const val = document.getElementById(`secret${i}`).value;
    if (!val || !/^\d$/.test(val)) {
      await GameroModal.warning('Please enter 4 digits (0-9)!', 'Invalid Input', '🔢');
      return;
    }
    digits.push(val);
  }

  if (new Set(digits).size !== 4) {
    await GameroModal.warning('All digits must be different!', 'Invalid Number', '❌');
    return;
  }

  mySecretNumber = digits.join("");
  socket.emit("setSecretNumber", {
    roomCode: currentRoomCode,
    secretNumber: mySecretNumber,
  });
  document.getElementById("setupArea").style.display = "none";
  document.getElementById("waitingStatus").innerHTML =
    `<span class="status-badge status-ready">✅ Waiting for partner...</span>`;
}

async function submitGuess() {
  console.log('📤 submitGuess called | isMyTurn:', isMyTurn);
  
  if (!isMyTurn) {
    await GameroModal.info('Wait for your turn!', 'Not Your Turn', '⏸️');
    return;
  }

  const digits = [];
  for (let i = 1; i <= 4; i++) {
    const val = document.getElementById(`guess${i}`).value;
    if (!val || !/^\d$/.test(val)) {
      await GameroModal.warning('Please enter 4 digits (0-9)!', 'Invalid Input', '🔢');
      return;
    }
    digits.push(val);
  }

  const guess = digits.join("");
  console.log('📤 Submitting guess:', guess);
  
  justGuessed = true;
  isMyTurn = false;
  updateTurnState(null);
  
  socket.emit("submitGuess", { roomCode: currentRoomCode, guess: guess });
  clearGuessInputs();
}

function resetGame() {
  socket.emit("resetGame", { roomCode: currentRoomCode });
}

function leaveGame() {
  location.href = "../../index.html";
}

// Auto-focus and input navigation
function setupDigitInputs(prefix) {
  for (let i = 1; i <= 4; i++) {
    const input = document.getElementById(`${prefix}${i}`);

    input.addEventListener("input", function (e) {
      if (this.value.length === 1 && i < 4) {
        document.getElementById(`${prefix}${i + 1}`).focus();
      }
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Backspace" && this.value === "" && i > 1) {
        document.getElementById(`${prefix}${i - 1}`).focus();
      }
      if (e.key === "Enter" && i === 4) {
        if (prefix === "secret") {
          setSecretNumber();
        } else if (prefix === "guess") {
          submitGuess();
        }
      }
    });

    input.addEventListener("keypress", function (e) {
      if (!/[0-9]/.test(e.key)) {
        e.preventDefault();
      }
    });
  }
}

setupDigitInputs("secret");
setupDigitInputs("guess");

// Auto-focus first input on screen change
const observer = new MutationObserver(() => {
  const activeScreen = document.querySelector(".screen.active");
  if (activeScreen) {
    const firstInput = activeScreen.querySelector('input[type="text"]');
    if (firstInput) setTimeout(() => firstInput.focus(), 100);
  }
});
observer.observe(document.body, { childList: true, subtree: true });

console.log('🎮 Number Wordle loaded!');