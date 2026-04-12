// CHANGE THIS URL TO YOUR DEPLOYED SERVER
const socket = io(GAMERO_CONFIG.SERVER_URL);

let myPlayerName = '';
let partnerPlayerName = '';
let currentRoomCode = '';
let isHost = false;
let myScore = 0;
let partnerScore = 0;
let myStreak = 0;
let partnerStreak = 0;
let myCorrectAnswers = 0;
let partnerCorrectAnswers = 0;
let currentQuestion = null;
let myAnswer = null;
let timerInterval = null;

// Socket event listeners

// ─── Reconnection ─────────────────────────────
// Attach after socket + state vars are declared
setTimeout(() => {
  GAMERO_RECONNECT.attach(socket, currentRoomCode, GAMERO_PLAYER.getName());
  // Re-attach when roomCode changes (after joining/creating)
  const _origSetRC = (v) => { currentRoomCode = v; GAMERO_RECONNECT.attach(socket, v, myPlayerName || GAMERO_PLAYER.getName()); };
  // Patch roomCreated and roomJoined to update reconnect context
}, 0);

socket.on('roomCreated', ({ roomCode, playerName, isHost: host }) => {
    currentRoomCode = roomCode;
    myPlayerName = playerName;
    isHost = host;
    GAMERO_RECONNECT.attach(socket, roomCode, playerName);
    document.getElementById('setupRoomCode').textContent = roomCode;
    document.getElementById('setupStatus').innerHTML = 
        '<span class="status-badge status-waiting">⏳ Waiting for partner...</span>';
    showScreen('setupScreen');
});

socket.on('partnerJoined', ({ partnerName }) => {
    partnerPlayerName = partnerName;
    document.getElementById('setupStatus').innerHTML = 
        `<span class="status-badge status-ready">✅ ${partnerName} joined!</span>`;
    if (!isHost) {
        document.getElementById('setupArea').style.display = 'none';
        document.getElementById('setupStatus').innerHTML += 
            '<p style="color: rgba(255,255,255,0.8); margin-top: 16px;">Waiting for host to start the game...</p>';
    }
});

socket.on('roomJoined', ({ roomCode, playerName, isHost: host, hostName }) => {
    currentRoomCode = roomCode;
    myPlayerName = playerName;
    isHost = host;
    partnerPlayerName = hostName;
    GAMERO_RECONNECT.attach(socket, roomCode, playerName);
    document.getElementById('setupRoomCode').textContent = roomCode;
    document.getElementById('setupStatus').innerHTML = 
        `<span class="status-badge status-ready">✅ Connected to ${hostName}'s game!</span>`;
    document.getElementById('setupArea').style.display = 'none';
    showScreen('setupScreen');
});

socket.on('gameStarted', ({ hostName, partnerName, category, difficulty, totalRounds }) => {
    document.getElementById('myNameGame').textContent = myPlayerName;
    document.getElementById('partnerNameGame').textContent = partnerPlayerName;
    document.getElementById('totalRounds').textContent = totalRounds;
    document.getElementById('categoryDisplay').textContent = getCategoryName(category);
    showScreen('gameScreen');
});

socket.on('newQuestion', ({ question, roundNumber, totalRounds }) => {
    currentQuestion = question;
    myAnswer = null;
    displayQuestion(question, roundNumber, totalRounds);
});

socket.on('roundResult', ({ hostCorrect, partnerCorrect, hostScore, partnerScore, hostStreak, partnerStreak, correctAnswer }) => {
    const myCorrect = isHost ? hostCorrect : partnerCorrect;
    const oldMyScore = myScore;
    const oldPartnerScore = partnerScore;
    
    myScore = isHost ? hostScore : partnerScore;
    partnerScore = isHost ? partnerScore : hostScore;
    myStreak = isHost ? hostStreak : partnerStreak;
    partnerStreak = isHost ? partnerStreak : hostStreak;
    
    if (myCorrect) myCorrectAnswers++;
    if ((isHost && partnerCorrect) || (!isHost && hostCorrect)) partnerCorrectAnswers++;
    
    // ANIMATED SCORE UPDATE
    animateScoreUpdate('myScore', oldMyScore, myScore, myCorrect);
    animateScoreUpdate('partnerScore', oldPartnerScore, partnerScore, !myCorrect && ((isHost && partnerCorrect) || (!isHost && hostCorrect)));
    
    document.getElementById('myStreak').textContent = myStreak > 0 ? `🔥 ${myStreak} streak` : '';
    document.getElementById('partnerStreak').textContent = partnerStreak > 0 ? `🔥 ${partnerStreak} streak` : '';
    
    showRoundResult(correctAnswer, myCorrect);
});

socket.on('gameOver', ({ winner, hostScore, partnerScore, hostCorrect, partnerCorrect }) => {
    const won = (isHost && winner === 'host') || (!isHost && winner === 'partner');
    
    document.getElementById('gameOverEmoji').textContent = won ? '🎉' : '😢';
    document.getElementById('winnerText').textContent = won ? 'You Won!' : `${partnerPlayerName} Won!`;
    document.getElementById('finalMyName').textContent = myPlayerName;
    document.getElementById('finalPartnerName').textContent = partnerPlayerName;
    document.getElementById('finalMyScore').textContent = isHost ? hostScore : partnerScore;
    document.getElementById('finalPartnerScore').textContent = isHost ? partnerScore : hostScore;
    document.getElementById('finalMyCorrect').textContent = isHost ? hostCorrect : partnerCorrect;
    document.getElementById('finalPartnerCorrect').textContent = isHost ? partnerCorrect : hostCorrect;
    
    if (isHost) {
        document.getElementById('hostResetControls').style.display = 'block';
    }
    
    if (won && typeof confetti !== 'undefined') {
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
        });
    }
    
    showScreen('gameOverScreen');
});

socket.on('gameReset', () => {
    myScore = 0;
    partnerScore = 0;
    myStreak = 0;
    partnerStreak = 0;
    myCorrectAnswers = 0;
    partnerCorrectAnswers = 0;
    showScreen('setupScreen');
});

socket.on('error', (message) => {
    document.getElementById('joinError').textContent = message;
    document.getElementById('joinError').style.display = 'block';
});

socket.on('hostLeft', () => {
    alert('Host left the game!');
    location.href = '../../index.html';
});

socket.on('partnerLeft', () => {
    alert('Partner left the game!');
    location.href = '../../index.html';
});

// Helper functions
function getCategoryName(categoryId) {
    const categories = {
        '9': 'General Knowledge 🌍',
        '11': 'Film 🎬',
        '12': 'Music 🎵',
        '14': 'Television 📺',
        '15': 'Video Games 🎮',
        '17': 'Science & Nature 🔬',
        '18': 'Computers 💻',
        '21': 'Sports ⚾',
        '22': 'Geography 🗺️',
        '23': 'History 📜',
        '27': 'Animals 🐾',
        '31': 'Anime & Manga 🇯🇵'
    };
    return categories[categoryId] || 'General Knowledge';
}

function decodeHTML(html) {
    const txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
}

function displayQuestion(question, roundNumber, totalRounds) {
    document.getElementById('currentRound').textContent = roundNumber;
    document.getElementById('questionNumber').textContent = `Question ${roundNumber}/${totalRounds}`;
    document.getElementById('questionText').textContent = decodeHTML(question.question);
    
    // Shuffle answers
    const answers = [question.correct_answer, ...question.incorrect_answers]
        .sort(() => Math.random() - 0.5);
    
    const optionsHtml = answers.map((answer, index) => `
        <div class="answer-option" onclick="selectAnswer('${encodeURIComponent(answer)}', this)">
            <span class="answer-label">${String.fromCharCode(65 + index)}.</span>
            ${decodeHTML(answer)}
        </div>
    `).join('');
    
    document.getElementById('answerOptions').innerHTML = optionsHtml;
    document.getElementById('waitingForPartner').style.display = 'none';
    document.getElementById('timerContainer').style.display = 'block';
    
    // Update scores
    document.getElementById('myScore').textContent = myScore;
    document.getElementById('partnerScore').textContent = partnerScore;
    document.getElementById('myStreak').textContent = myStreak > 0 ? `🔥 Streak: ${myStreak}` : '';
    document.getElementById('partnerStreak').textContent = partnerStreak > 0 ? `🔥 Streak: ${partnerStreak}` : '';
    
    startTimer(20);
}

function selectAnswer(answer, element) {
    if (myAnswer !== null) return; // Already answered
    
    myAnswer = decodeURIComponent(answer);
    
    // Visual feedback
    document.querySelectorAll('.answer-option').forEach(opt => {
        opt.classList.remove('selected');
        opt.classList.add('disabled');
    });
    element.classList.add('selected');
    
    // Send answer to server
    socket.emit('submitAnswer', { 
        roomCode: currentRoomCode, 
        answer: myAnswer 
    });
    
    // Show waiting state
    stopTimer();
    document.getElementById('waitingForPartner').style.display = 'block';
    document.getElementById('timerContainer').style.display = 'none';
}

function showRoundResult(correctAnswer, myCorrect) {
    const options = document.querySelectorAll('.answer-option');
    options.forEach(opt => {
        const answerText = opt.textContent.trim().substring(2).trim();
        if (decodeHTML(correctAnswer) === answerText) {
            opt.classList.add('correct');
        } else if (opt.classList.contains('selected')) {
            opt.classList.add('incorrect');
        }
    });
    
    if (myCorrect && typeof confetti !== 'undefined') {
        confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.7 }
        });
    }
}

function startTimer(seconds) {
    let timeLeft = seconds;
    const timerFill = document.getElementById('timerFill');
    const timerText = document.getElementById('timerText');
    
    timerInterval = setInterval(() => {
        timeLeft--;
        timerText.textContent = timeLeft;
        timerFill.style.width = (timeLeft / seconds * 100) + '%';
        
        if (timeLeft <= 0) {
            stopTimer();
            if (myAnswer === null) {
                // Auto-submit no answer
                socket.emit('submitAnswer', { 
                    roomCode: currentRoomCode, 
                    answer: null 
                });
                document.getElementById('waitingForPartner').style.display = 'block';
                document.getElementById('timerContainer').style.display = 'none';
            }
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// UI Functions
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function showHomeScreen() {
    showScreen('homeScreen');
    document.getElementById('joinError').style.display = 'none';
}

function showJoinScreen() {
    showScreen('joinScreen');
    document.getElementById('joinError').style.display = 'none';
}

function createRoom() {
    const name = document.getElementById('playerName').value.trim();
    if (!name) {
        alert('Please enter your name!');
        return;
    }
    socket.emit('createRoom', name);
}

function joinRoom() {
    const name = document.getElementById('joinName').value.trim();
    const code = document.getElementById('roomCode').value.trim().toUpperCase();
    
    if (!name || !code) {
        document.getElementById('joinError').textContent = 'Please enter your name and room code!';
        document.getElementById('joinError').style.display = 'block';
        return;
    }
    
    socket.emit('joinRoom', { roomCode: code, playerName: name });
}

function startGame() {
    const category = document.getElementById('categorySelect').value;
    const difficulty = document.getElementById('difficultySelect').value;
    const rounds = document.getElementById('roundsSelect').value;
    
    socket.emit('startTrivia', { 
        roomCode: currentRoomCode, 
        category: category,
        difficulty: difficulty,
        totalRounds: parseInt(rounds)
    });
}

function resetGame() {
    socket.emit('resetGame', { roomCode: currentRoomCode });
}

function leaveGame() {
    location.href = '../../index.html';
}

// Auto-focus inputs
const observer = new MutationObserver(() => {
    const activeScreen = document.querySelector('.screen.active');
    if (activeScreen) {
        const firstInput = activeScreen.querySelector('input[type="text"]');
        if (firstInput) setTimeout(() => firstInput.focus(), 100);
    }
});
observer.observe(document.body, { childList: true, subtree: true });

// Animated score update function
function animateScoreUpdate(elementId, from, to, isCorrect) {
    const element = document.getElementById(elementId);
    const diff = to - from;
    
    if (diff === 0) {
        element.textContent = to;
        return;
    }
    
    // Add pulse animation
    if (isCorrect) {
        element.style.transform = 'scale(1.3)';
        element.style.transition = 'transform 0.3s ease';
        setTimeout(() => {
            element.style.transform = 'scale(1)';
        }, 300);
    }
    
    // Count up animation
    const duration = 800;
    const steps = 20;
    const stepDuration = duration / steps;
    const increment = diff / steps;
    let current = from;
    let step = 0;
    
    const counter = setInterval(() => {
        step++;
        current += increment;
        element.textContent = Math.round(current);
        
        if (step >= steps) {
            clearInterval(counter);
            element.textContent = to;
        }
    }, stepDuration);
}

console.log('🎮 Trivia Battle loaded!');