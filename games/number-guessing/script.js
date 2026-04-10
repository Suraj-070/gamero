

// Socket Connection - CHANGE THIS TO YOUR SERVER!
const socket = io("https://gamero-server.onrender.com");

// Game State
let myPlayerName = "";
let partnerPlayerName = "";
let currentRoomCode = "";
let isHost = false;
let mySecretNumber = "";
let myGuesses = [];
let partnerGuesses = [];
let currentTurn = null;
let isMyTurn = false;

// Hint Tracker State
let myLowestTooLow = null;
let myHighestTooHigh = null;

// UI Helper Functions
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function updateTurnIndicator() {
    const myHint = document.getElementById('myCurrentHint');
    const partnerHint = document.getElementById('partnerCurrentHint');
    const guessInput = document.getElementById('guessInput');
    const submitBtn = document.querySelector('.input-section button');
    
    console.log('🔧 updateTurnIndicator called | isMyTurn:', isMyTurn, '| currentTurn:', currentTurn, '| myName:', myPlayerName);
    
    if (isMyTurn) {
        // MY TURN - FORCE ENABLE
        console.log('   ✅ Enabling MY input');
        myHint.className = 'current-hint waiting';
        myHint.textContent = '✨ YOUR TURN - Make your guess!';
        myHint.style.backgroundColor = '#fff3cd';
        
        partnerHint.className = 'current-hint waiting';
        partnerHint.textContent = '⏳ Waiting for you...';
        partnerHint.style.backgroundColor = '#f8f9fa';
        
        guessInput.disabled = false;
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.pointerEvents = 'auto';
        guessInput.style.opacity = '1';
        guessInput.style.pointerEvents = 'auto';
        
        setTimeout(() => guessInput.focus(), 100);
    } else {
        // PARTNER'S TURN - FORCE DISABLE
        console.log('   ❌ Disabling MY input');
        myHint.className = 'current-hint waiting';
        myHint.textContent = '⏳ Waiting for partner...';
        myHint.style.backgroundColor = '#f8f9fa';
        
        partnerHint.className = 'current-hint waiting';
        partnerHint.textContent = '✨ THEIR TURN';
        partnerHint.style.backgroundColor = '#fff3cd';
        
        guessInput.disabled = true;
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        submitBtn.style.pointerEvents = 'none';
        guessInput.style.opacity = '0.5';
        guessInput.style.pointerEvents = 'none';
    }
}

function updateHintTracker() {
    const tooLowEl = document.getElementById('myTooLow');
    const tooHighEl = document.getElementById('myTooHigh');
    const rangeEl = document.getElementById('myRange');
    
    if (myLowestTooLow !== null) {
        tooLowEl.innerHTML = `<div class="hint-value">${myLowestTooLow} ↓</div>`;
    } else {
        tooLowEl.innerHTML = `<div class="hint-value none">---</div>`;
    }
    
    if (myHighestTooHigh !== null) {
        tooHighEl.innerHTML = `<div class="hint-value">${myHighestTooHigh} ↑</div>`;
    } else {
        tooHighEl.innerHTML = `<div class="hint-value none">---</div>`;
    }
    
    if (myLowestTooLow !== null && myHighestTooHigh !== null) {
        rangeEl.innerHTML = `🎯 Secret is between: <div class="range-text">${myLowestTooLow + 1} - ${myHighestTooHigh - 1}</div>`;
    } else if (myLowestTooLow !== null) {
        rangeEl.innerHTML = `🎯 Secret is: <div class="range-text">Greater than ${myLowestTooLow}</div>`;
    } else if (myHighestTooHigh !== null) {
        rangeEl.innerHTML = `🎯 Secret is: <div class="range-text">Less than ${myHighestTooHigh}</div>`;
    } else {
        rangeEl.innerHTML = `Make your first guess!`;
    }
}

function updateMyGuessesUI() {
    const container = document.getElementById('myGuesses');
    
    if (myGuesses.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🎯</div>
                <div class="empty-state-text">No guesses yet</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = myGuesses.map(g => `
        <div class="guess-item ${g.hint}">
            <span class="guess-number">${g.number}</span>
            <span class="guess-hint ${g.hint}">
                ${g.hint === 'low' ? '<span class="hint-arrow">↓</span> TOO LOW' : 
                  g.hint === 'high' ? '<span class="hint-arrow">↑</span> TOO HIGH' : 
                  '<span class="hint-arrow">✓</span> CORRECT!'}
            </span>
        </div>
    `).reverse().join('');
    
    document.getElementById('myGuessCount').textContent = `${myGuesses.length} ${myGuesses.length === 1 ? 'guess' : 'guesses'}`;
    updateHintTracker();
}

function updatePartnerGuessesUI() {
    const container = document.getElementById('partnerGuesses');
    
    if (partnerGuesses.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⏳</div>
                <div class="empty-state-text">Waiting for opponent...</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = partnerGuesses.map(g => `
        <div class="guess-item ${g.hint}">
            <span class="guess-number">${g.number}</span>
            <span class="guess-hint ${g.hint}">
                ${g.hint === 'low' ? '<span class="hint-arrow">↓</span> TOO LOW' : 
                  g.hint === 'high' ? '<span class="hint-arrow">↑</span> TOO HIGH' : 
                  '<span class="hint-arrow">✓</span> CORRECT!'}
            </span>
        </div>
    `).reverse().join('');
    
    document.getElementById('partnerGuessCount').textContent = `${partnerGuesses.length} ${partnerGuesses.length === 1 ? 'guess' : 'guesses'}`;
}

// Game Functions
async function createRoom() {
    const name = document.getElementById('playerName').value.trim();
    if (!name) {
        await GameroModal.warning('Please enter your name!', 'Name Required', '✏️');
        return;
    }
    const loader = GameroModal.loadingDots('Creating room...', 'Please Wait');
    window.currentLoader = loader;
    socket.emit('createRoom', name);
}

async function joinRoom() {
    const name = document.getElementById('joinName').value.trim();
    const code = document.getElementById('roomCode').value.trim().toUpperCase();
    if (!name || !code) {
        await GameroModal.warning('Please enter your name and room code!', 'Missing Information', '✏️');
        return;
    }
    const loader = GameroModal.loadingDots('Joining room...', 'Please Wait');
    window.currentLoader = loader;
    socket.emit('joinRoom', { roomCode: code, playerName: name });
}

async function setSecretNumber() {
    const number = document.getElementById('secretNumber').value.trim();
    if (!number) {
        await GameroModal.warning('Please enter a secret number!', 'Number Required', '🔢');
        return;
    }
    mySecretNumber = number;
    document.getElementById('mySecretNumber').textContent = number;
    socket.emit('setSecretNumber', { roomCode: currentRoomCode, secretNumber: number });
    document.getElementById('setupArea').style.display = 'none';
    document.getElementById('waitingStatus').innerHTML = 
        '<span class="status-badge status-waiting">⏳ Waiting for partner to set their number...</span>';
}

async function submitGuess() {
    const guess = document.getElementById('guessInput').value.trim();
    if (!guess) {
        await GameroModal.warning('Please enter a number!', 'Guess Required', '🔢');
        return;
    }
    if (!isMyTurn) {
        await GameroModal.warning('Wait for your turn!', 'Not Your Turn', '⏳');
        return;
    }
    
    console.log('📤 Submitting guess:', guess);
    
    // Set flag that I just guessed
    justGuessed = true;
    
    // IMMEDIATELY disable and switch to waiting state
    isMyTurn = false;
    updateTurnIndicator();
    
    socket.emit('submitGuess', { roomCode: currentRoomCode, guess: guess });
    document.getElementById('guessInput').value = '';
}

async function declareWinner(winner) {
    const winnerName = winner === 'host' ? myPlayerName : partnerPlayerName;
    const confirmed = await GameroModal.confirm(
        `Declare ${winnerName} as the winner?`,
        'Confirm Winner',
        '🏆'
    );
    if (confirmed) {
        socket.emit('declareWinner', { roomCode: currentRoomCode, winner: winner });
    }
}

function resetGame() {
    socket.emit('resetGame', { roomCode: currentRoomCode });
}

function leaveGame() {
    location.href = '../../index.html';
}

// ============================================
// SOCKET EVENT LISTENERS
// ============================================

socket.on('roomCreated', ({ roomCode, playerName, isHost: host }) => {
    currentRoomCode = roomCode;
    myPlayerName = playerName;
    isHost = host;
    document.getElementById('displayRoomCode').textContent = roomCode;
    document.getElementById('roomCodeValue').textContent = roomCode;
    showScreen('waitingScreen');
    if (window.currentLoader) {
        window.currentLoader.close();
        window.currentLoader = null;
    }
});

socket.on('partnerJoined', ({ partnerName }) => {
    partnerPlayerName = partnerName;
    document.getElementById('waitingStatus').innerHTML = 
        `<span class="status-badge status-ready">✅ ${partnerName} joined!</span>`;
    document.getElementById('setupArea').style.display = 'block';
});

socket.on('roomJoined', ({ roomCode, playerName, isHost: host, hostName }) => {
    currentRoomCode = roomCode;
    myPlayerName = playerName;
    isHost = host;
    partnerPlayerName = hostName;
    document.getElementById('displayRoomCode').textContent = roomCode;
    document.getElementById('roomCodeValue').textContent = roomCode;
    document.getElementById('waitingStatus').innerHTML = 
        '<span class="status-badge status-ready">✅ Connected!</span>';
    document.getElementById('setupArea').style.display = 'block';
    showScreen('waitingScreen');
    if (window.currentLoader) {
        window.currentLoader.close();
        window.currentLoader = null;
    }
});

socket.on('playerReady', ({ playerName }) => {
    document.getElementById('waitingStatus').innerHTML = 
        `<span class="status-badge status-waiting">⏳ ${playerName} is ready...</span>`;
});

socket.on('gameStarted', ({ hostName, partnerName, firstTurn }) => {
    console.log('🎮 Game started! First turn:', firstTurn);
    
    document.getElementById('myName').textContent = myPlayerName;
    document.getElementById('partnerName').textContent = partnerPlayerName;
    myGuesses = [];
    partnerGuesses = [];
    myLowestTooLow = null;
    myHighestTooHigh = null;
    currentTurn = firstTurn;
    isMyTurn = (currentTurn === myPlayerName);
    
    console.log('   My name:', myPlayerName, '| Is my turn?', isMyTurn);
    
    updateMyGuessesUI();
    updatePartnerGuessesUI();
    updateHintTracker();
    updateTurnIndicator();
    
    if (isHost) {
        document.getElementById('hostControls').style.display = 'block';
    }
    
    showScreen('gameplayScreen');
    
    if (isMyTurn) {
        GameroModal.success('You go first!', 'Game Started', '🎯');
    } else {
        GameroModal.info(`${partnerPlayerName} goes first!`, 'Game Started', '⏳');
    }
});

// TURN UPDATE
let lastTurnUpdate = null;
let turnUpdateTimeout = null;
let justGuessed = false;

socket.on('turnUpdate', ({ currentTurn: newTurn }) => {
    console.log('🔄 Turn update received:', newTurn, '| My name:', myPlayerName, '| Is my turn?', newTurn === myPlayerName, '| Just guessed?', justGuessed);
    
    // GUARD: If I just guessed and turn comes back to me, IGNORE IT
    if (justGuessed && newTurn === myPlayerName) {
        console.log('   ⚠️ IGNORED: I just guessed, turn cannot come back to me!');
        return;
    }
    
    // DEBOUNCE: Ignore duplicate turn updates within 200ms
    if (lastTurnUpdate === newTurn && turnUpdateTimeout) {
        console.log('   ⏭️ IGNORED: Duplicate turn update');
        return;
    }
    
    // Clear previous timeout
    if (turnUpdateTimeout) {
        clearTimeout(turnUpdateTimeout);
    }
    
    lastTurnUpdate = newTurn;
    currentTurn = newTurn;
    isMyTurn = (currentTurn === myPlayerName);
    updateTurnIndicator();
    
    // Reset justGuessed flag after turn changes
    justGuessed = false;
    
    // Reset debounce after 200ms
    turnUpdateTimeout = setTimeout(() => {
        lastTurnUpdate = null;
        turnUpdateTimeout = null;
    }, 200);
});

// Partner's guess
socket.on('newGuess', ({ playerName, guess, isHost: guessIsHost }) => {
    const isMyGuess = (isHost && guessIsHost) || (!isHost && !guessIsHost);
    
    console.log('📨 newGuess:', { playerName, guess, isMyGuess, isHost, guessIsHost, myName: myPlayerName });
    
    // ONLY process if this is truly my PARTNER's guess
    if (!isMyGuess && playerName !== myPlayerName) {
        // Partner's guess - calculate and send hint
        const partnerGuessNum = parseInt(guess);
        const mySecretNum = parseInt(mySecretNumber);
        
        let hint = 'waiting';
        if (partnerGuessNum < mySecretNum) {
            hint = 'low';
        } else if (partnerGuessNum > mySecretNum) {
            hint = 'high';
        } else {
            hint = 'correct';
        }
        
        console.log('   ✅ Calculated hint:', hint, '| Sending back to:', playerName);
        
        partnerGuesses.push({
            number: guess,
            hint: hint
        });
        updatePartnerGuessesUI();
        
        // Send hint back
        socket.emit('sendHint', {
            roomCode: currentRoomCode,
            guess: guess,
            hint: hint,
            toPlayer: playerName
        });
        
        // Check if partner won
        if (hint === 'correct') {
            setTimeout(() => {
                socket.emit('declareWinner', { 
                    roomCode: currentRoomCode, 
                    winner: isHost ? 'partner' : 'host'
                });
            }, 1000);
        }
    } else {
        console.log('   ⏭️ Skipped: This is MY guess, not partner\'s');
    }
});

// Receive hint for MY guess
socket.on('receiveHint', ({ guess, hint }) => {
    console.log('💡 Received hint for my guess:', guess, '→', hint);
    const guessNum = parseInt(guess);
    
    myGuesses.push({
        number: guess,
        hint: hint
    });
    
    // Update range tracker
    if (hint === 'low') {
        if (myLowestTooLow === null || guessNum > myLowestTooLow) {
            myLowestTooLow = guessNum;
        }
    } else if (hint === 'high') {
        if (myHighestTooHigh === null || guessNum < myHighestTooHigh) {
            myHighestTooHigh = guessNum;
        }
    }
    
    updateMyGuessesUI();
    
    // Check if I won
    if (hint === 'correct') {
        setTimeout(() => {
            socket.emit('declareWinner', { 
                roomCode: currentRoomCode, 
                winner: isHost ? 'host' : 'partner'
            });
        }, 1000);
    }
});

socket.on('gameOver', ({ winner, hostName, partnerName, hostNumber, partnerNumber, hostGuesses, partnerGuesses }) => {
    document.getElementById('winnerText').textContent = `🏆 ${winner} Wins!`;
    document.getElementById('hostNameReveal').textContent = hostName;
    document.getElementById('revealedHostNumber').textContent = hostNumber;
    document.getElementById('partnerNameReveal').textContent = partnerName;
    document.getElementById('revealedPartnerNumber').textContent = partnerNumber;
    document.getElementById('hostNameGuesses').textContent = hostName;
    document.getElementById('hostGuessCount').textContent = hostGuesses;
    document.getElementById('partnerNameGuesses').textContent = partnerName;
    document.getElementById('partnerGuessCount').textContent = partnerGuesses;
    
    if (isHost) {
        document.getElementById('hostResetControls').style.display = 'block';
    }
    
    showScreen('gameOverScreen');
    
    if (typeof confetti !== 'undefined') {
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
        });
    }
});

socket.on('gameReset', () => {
    myGuesses = [];
    partnerGuesses = [];
    mySecretNumber = "";
    myLowestTooLow = null;
    myHighestTooHigh = null;
    currentTurn = null;
    isMyTurn = false;
    document.getElementById('setupArea').style.display = 'block';
    document.getElementById('secretNumber').value = '';
    document.getElementById('waitingStatus').innerHTML = 
        '<span class="status-badge status-ready">✅ Ready to play again!</span>';
    showScreen('waitingScreen');
});

socket.on('hostLeft', async () => {
    await GameroModal.error('Host left the game!', 'Game Ended', '👋');
    location.href = '../../index.html';
});

socket.on('partnerLeft', async () => {
    await GameroModal.info('Partner left the game. Waiting for new partner...', 'Partner Left', '👋');
    partnerPlayerName = "";
    document.getElementById('waitingStatus').innerHTML = 
        '<span class="status-badge status-waiting">⏳ Waiting for partner...</span>';
    document.getElementById('setupArea').style.display = 'none';
    showScreen('waitingScreen');
});

socket.on('error', async (message) => {
    await GameroModal.error(message, 'Connection Error', '❌');
});

document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const activeScreen = document.querySelector('.screen.active');
        if (activeScreen) {
            if (activeScreen.id === 'setupScreen' && document.getElementById('playerName').value) {
                createRoom();
            } else if (activeScreen.id === 'gameplayScreen' && isMyTurn) {
                submitGuess();
            }
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 Number Guessing loaded! (FORCED UI REFRESH FIX)');
});