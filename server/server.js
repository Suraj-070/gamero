import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Store active game rooms
const rooms = new Map();

// Generate random room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Fetch trivia questions from Open Trivia DB
async function fetchTriviaQuestions(category, difficulty, amount) {
  try {
    const url = `https://opentdb.com/api.php?amount=${amount}&category=${category}&difficulty=${difficulty}&type=multiple`;
    console.log(`Fetching trivia from: ${url}`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.response_code === 0 && data.results && data.results.length > 0) {
      console.log(`Successfully fetched ${data.results.length} questions`);
      return data.results;
    } else {
      console.log('API returned no results, using fallback');
      return getFallbackQuestions(amount);
    }
  } catch (error) {
    console.error('Error fetching trivia:', error);
    return getFallbackQuestions(amount);
  }
}

// Fallback questions if API fails
function getFallbackQuestions(amount) {
  const fallback = [
    {
      question: "What is the capital of France?",
      correct_answer: "Paris",
      incorrect_answers: ["London", "Berlin", "Madrid"]
    },
    {
      question: "What is 2 + 2?",
      correct_answer: "4",
      incorrect_answers: ["3", "5", "6"]
    },
    {
      question: "What year did World War II end?",
      correct_answer: "1945",
      incorrect_answers: ["1944", "1946", "1943"]
    },
    {
      question: "What is the largest planet in our solar system?",
      correct_answer: "Jupiter",
      incorrect_answers: ["Saturn", "Neptune", "Earth"]
    },
    {
      question: "Who painted the Mona Lisa?",
      correct_answer: "Leonardo da Vinci",
      incorrect_answers: ["Michelangelo", "Raphael", "Donatello"]
    },
    {
      question: "What is the speed of light?",
      correct_answer: "299,792 km/s",
      incorrect_answers: ["150,000 km/s", "500,000 km/s", "100,000 km/s"]
    },
    {
      question: "How many continents are there?",
      correct_answer: "7",
      incorrect_answers: ["5", "6", "8"]
    },
    {
      question: "What is the smallest country in the world?",
      correct_answer: "Vatican City",
      incorrect_answers: ["Monaco", "San Marino", "Liechtenstein"]
    },
    {
      question: "Who wrote 'Romeo and Juliet'?",
      correct_answer: "William Shakespeare",
      incorrect_answers: ["Charles Dickens", "Jane Austen", "Mark Twain"]
    },
    {
      question: "What is the chemical symbol for gold?",
      correct_answer: "Au",
      incorrect_answers: ["Go", "Gd", "Ag"]
    },
    {
      question: "How many bones are in the human body?",
      correct_answer: "206",
      incorrect_answers: ["195", "215", "200"]
    },
    {
      question: "What is the tallest mountain in the world?",
      correct_answer: "Mount Everest",
      incorrect_answers: ["K2", "Kangchenjunga", "Lhotse"]
    },
    {
      question: "Who invented the telephone?",
      correct_answer: "Alexander Graham Bell",
      incorrect_answers: ["Thomas Edison", "Nikola Tesla", "Benjamin Franklin"]
    },
    {
      question: "What is the capital of Japan?",
      correct_answer: "Tokyo",
      incorrect_answers: ["Kyoto", "Osaka", "Hiroshima"]
    },
    {
      question: "How many sides does a hexagon have?",
      correct_answer: "6",
      incorrect_answers: ["5", "7", "8"]
    }
  ];
  
  return fallback.slice(0, Math.min(amount, fallback.length));
}

// Send next trivia question
function sendNextQuestion(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || !room.triviaData) return;
  
  const { questions, currentRound, totalRounds } = room.triviaData;
  
  if (currentRound >= totalRounds) {
    // Game over
    endTriviaGame(roomCode);
    return;
  }
  
  const question = questions[currentRound];
  room.triviaData.currentRound++;
  room.triviaData.hostAnswer = null;
  room.triviaData.partnerAnswer = null;
  
  io.to(roomCode).emit('newQuestion', {
    question: question,
    roundNumber: currentRound + 1,
    totalRounds: totalRounds
  });
}

// Check trivia answers
function checkTriviaAnswers(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || !room.triviaData) return;
  
  const { questions, currentRound, hostAnswer, partnerAnswer } = room.triviaData;
  const correctAnswer = questions[currentRound - 1].correct_answer;
  
  const hostCorrect = hostAnswer === correctAnswer;
  const partnerCorrect = partnerAnswer === correctAnswer;
  
  // Update scores
  if (hostCorrect) {
    room.triviaData.hostScore += 10;
    room.triviaData.hostStreak++;
    room.triviaData.hostCorrect++;
  } else {
    room.triviaData.hostStreak = 0;
  }
  
  if (partnerCorrect) {
    room.triviaData.partnerScore += 10;
    room.triviaData.partnerStreak++;
    room.triviaData.partnerCorrect++;
  } else {
    room.triviaData.partnerStreak = 0;
  }
  
  // Send results
  io.to(roomCode).emit('roundResult', {
    hostCorrect: hostCorrect,
    partnerCorrect: partnerCorrect,
    hostScore: room.triviaData.hostScore,
    partnerScore: room.triviaData.partnerScore,
    hostStreak: room.triviaData.hostStreak,
    partnerStreak: room.triviaData.partnerStreak,
    correctAnswer: correctAnswer
  });
  
  // Next question after 3 seconds
  setTimeout(() => {
    sendNextQuestion(roomCode);
  }, 3000);
}

// End trivia game
function endTriviaGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || !room.triviaData) return;
  
  const { hostScore, partnerScore, hostCorrect, partnerCorrect } = room.triviaData;
  
  const winner = hostScore > partnerScore ? 'host' : 
                 partnerScore > hostScore ? 'partner' : 'tie';
  
  io.to(roomCode).emit('gameOver', {
    winner: winner,
    hostScore: hostScore,
    partnerScore: partnerScore,
    hostCorrect: hostCorrect,
    partnerCorrect: partnerCorrect
  });
}

// Calculate Wordle-style feedback for Number Wordle
function calculateFeedback(guess, secret) {
  const feedback = ['gray', 'gray', 'gray', 'gray'];
  const secretDigits = secret.split('');
  const guessDigits = guess.split('');
  const used = [false, false, false, false];
  
  // First pass: mark correct positions (green)
  for (let i = 0; i < 4; i++) {
    if (guessDigits[i] === secretDigits[i]) {
      feedback[i] = 'green';
      used[i] = true;
    }
  }
  
  // Second pass: mark wrong positions (yellow)
  for (let i = 0; i < 4; i++) {
    if (feedback[i] === 'green') continue;
    
    for (let j = 0; j < 4; j++) {
      if (!used[j] && guessDigits[i] === secretDigits[j] && i !== j) {
        feedback[i] = 'yellow';
        used[j] = true;
        break;
      }
    }
  }
  
  return feedback;
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Create new room
  socket.on('createRoom', (playerName) => {
    const roomCode = generateRoomCode();
    const room = {
      code: roomCode,
      host: {
        id: socket.id,
        name: playerName,
        secretNumber: null,
        guesses: []
      },
      partner: null,
      gameStarted: false,
      winner: null,
      currentTurn: null,
      triviaData: null
    };
    
    rooms.set(roomCode, room);
    socket.join(roomCode);
    
    socket.emit('roomCreated', { roomCode, playerName, isHost: true });
    console.log(`Room created: ${roomCode} by ${playerName}`);
  });

  // Join existing room
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const room = rooms.get(roomCode);
    
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    
    if (room.partner) {
      socket.emit('error', 'Room is full');
      return;
    }
    
    room.partner = {
      id: socket.id,
      name: playerName,
      secretNumber: null,
      guesses: []
    };
    
    socket.join(roomCode);
    
    // Notify both players
    socket.emit('roomJoined', { roomCode, playerName, isHost: false, hostName: room.host.name });
    io.to(room.host.id).emit('partnerJoined', { partnerName: playerName });
    
    console.log(`${playerName} joined room: ${roomCode}`);
  });

  // Set secret number (for Number Guessing & Number Wordle)
  socket.on('setSecretNumber', ({ roomCode, secretNumber }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    if (socket.id === room.host.id) {
      room.host.secretNumber = secretNumber;
    } else if (room.partner && socket.id === room.partner.id) {
      room.partner.secretNumber = secretNumber;
    }
    
    // Check if both players have set their numbers
    if (room.host.secretNumber && room.partner && room.partner.secretNumber) {
      room.gameStarted = true;
      room.currentTurn = room.host.name; // Host goes first
      io.to(roomCode).emit('gameStarted', {
        hostName: room.host.name,
        partnerName: room.partner.name,
        currentTurn: room.currentTurn
      });
    }
    
    // Notify the other player that this player is ready
    const player = socket.id === room.host.id ? room.host : room.partner;
    socket.to(roomCode).emit('playerReady', { playerName: player.name });
  });

  // Submit guess (for Number Guessing & Number Wordle)
  socket.on('submitGuess', ({ roomCode, guess }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.gameStarted) return;
    
    const player = socket.id === room.host.id ? room.host : room.partner;
    const opponent = socket.id === room.host.id ? room.partner : room.host;
    
    // Check if it's this player's turn (for Number Wordle)
    if (room.currentTurn && room.currentTurn !== player.name) return;
    
    player.guesses.push(guess);
    
    // Calculate feedback (for Number Wordle)
    const feedback = calculateFeedback(guess, opponent.secretNumber);
    
    // Check if player won
    const won = feedback.every(f => f === 'green');
    
    if (won) {
      // Player won!
      io.to(roomCode).emit('gameOver', { 
        winner: player.name,
        hostName: room.host.name,
        partnerName: room.partner.name,
        hostNumber: room.host.secretNumber,
        partnerNumber: room.partner ? room.partner.secretNumber : null,
        hostGuesses: room.host.guesses.length,
        partnerGuesses: room.partner ? room.partner.guesses.length : 0
      });
    } else {
      // Send guess result to both players
      io.to(roomCode).emit('guessResult', {
        playerName: player.name,
        guess: guess,
        feedback: feedback,
        isHost: socket.id === room.host.id
      });
      
      // For Number Guessing, also send as newGuess
      io.to(roomCode).emit('newGuess', {
        playerName: player.name,
        guess: guess,
        guessCount: player.guesses.length,
        isHost: socket.id === room.host.id
      });
      
      // Switch turns (for Number Wordle)
      if (room.currentTurn) {
        room.currentTurn = opponent.name;
        io.to(roomCode).emit('turnUpdate', { currentTurn: room.currentTurn });
      }
    }
  });

  // Declare winner (for Number Guessing - host only)
  socket.on('declareWinner', ({ roomCode, winner }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    // Only host can declare winner
    if (socket.id !== room.host.id) return;
    
    room.winner = winner;
    
    const winnerName = winner === 'host' ? room.host.name : room.partner.name;
    
    io.to(roomCode).emit('gameOver', { 
      winner: winnerName,
      hostName: room.host.name,
      partnerName: room.partner.name,
      hostNumber: room.host.secretNumber,
      partnerNumber: room.partner ? room.partner.secretNumber : null,
      hostGuesses: room.host.guesses.length,
      partnerGuesses: room.partner ? room.partner.guesses.length : 0
    });
  });

  // Start Trivia Game
  socket.on('startTrivia', async ({ roomCode, category, difficulty, totalRounds }) => {
    const room = rooms.get(roomCode);
    if (!room || socket.id !== room.host.id) return;
    
    console.log(`Starting trivia: category=${category}, difficulty=${difficulty}, rounds=${totalRounds}`);
    
    // Fetch questions from Open Trivia DB
    const questions = await fetchTriviaQuestions(category, difficulty, totalRounds);
    
    room.triviaData = {
      questions: questions,
      currentRound: 0,
      totalRounds: totalRounds,
      category: category,
      difficulty: difficulty,
      hostScore: 0,
      partnerScore: 0,
      hostStreak: 0,
      partnerStreak: 0,
      hostCorrect: 0,
      partnerCorrect: 0,
      hostAnswer: null,
      partnerAnswer: null
    };
    
    room.gameStarted = true;
    
    io.to(roomCode).emit('gameStarted', {
      hostName: room.host.name,
      partnerName: room.partner.name,
      category: category,
      difficulty: difficulty,
      totalRounds: totalRounds
    });
    
    // Send first question after 1 second
    setTimeout(() => {
      sendNextQuestion(roomCode);
    }, 1000);
  });

  // Submit Trivia Answer
  socket.on('submitAnswer', ({ roomCode, answer }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.triviaData) return;
    
    const isHost = socket.id === room.host.id;
    
    if (isHost) {
      room.triviaData.hostAnswer = answer;
    } else {
      room.triviaData.partnerAnswer = answer;
    }
    
    console.log(`Answer received from ${isHost ? 'host' : 'partner'}: ${answer}`);
    
    // Check if both answered
    if (room.triviaData.hostAnswer !== null && room.triviaData.partnerAnswer !== null) {
      console.log('Both players answered, checking results...');
      checkTriviaAnswers(roomCode);
    }
  });

  // Reset game
  socket.on('resetGame', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    // Only host can reset
    if (socket.id !== room.host.id) return;
    
    room.host.secretNumber = null;
    room.host.guesses = [];
    if (room.partner) {
      room.partner.secretNumber = null;
      room.partner.guesses = [];
    }
    room.gameStarted = false;
    room.winner = null;
    room.currentTurn = null;
    room.triviaData = null;
    
    io.to(roomCode).emit('gameReset');
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Find and clean up room
    for (const [code, room] of rooms.entries()) {
      if (room.host.id === socket.id) {
        io.to(code).emit('hostLeft');
        rooms.delete(code);
      } else if (room.partner && room.partner.id === socket.id) {
        room.partner = null;
        room.gameStarted = false;
        room.triviaData = null;
        io.to(room.host.id).emit('partnerLeft');
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🎮 GAMERO Server running on port ${PORT}`);
  console.log(`✅ Number Guessing ready`);
  console.log(`✅ Number Wordle ready`);
  console.log(`✅ Trivia Battle ready`);
});