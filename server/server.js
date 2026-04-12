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
  const len = secret.length;
  const feedback = Array(len).fill('gray');
  const secretDigits = secret.split('');
  const guessDigits = guess.split('');
  const used = Array(len).fill(false);

  // First pass: correct positions (green)
  for (let i = 0; i < len; i++) {
    if (guessDigits[i] === secretDigits[i]) {
      feedback[i] = 'green';
      used[i] = true;
    }
  }

  // Second pass: wrong positions (yellow)
  for (let i = 0; i < len; i++) {
    if (feedback[i] === 'green') continue;
    for (let j = 0; j < len; j++) {
      if (!used[j] && guessDigits[i] === secretDigits[j] && i !== j) {
        feedback[i] = 'yellow';
        used[j] = true;
        break;
      }
    }
  }

  return feedback;
}


// ═══════════════════════════════════════════════
// WORD WORDLE — 2309 original Wordle answer words
// ═══════════════════════════════════════════════
const WORDLE_WORDS = [
  "cigar","rebut","sissy","humph","awake","bleed","dwarf","slap","skill","berth",
  "tempt","grill","brown","still","quota","brick","brave","shine","their","flame",
  "proxy","lyric","globe","crime","plumb","depot","clasp","silky","oxide","twerp",
  "brand","track","legal","bloom","mealy","goose","creek","cycle","gruel","trout",
  "grace","stone","spook","stern","depot","lover","clown","light","snore","shore",
  "blown","blink","glean","spicy","crave","clamp","panic","frame","flair","snout",
  "slope","moist","stout","prose","groan","optic","squad","frank","blown","troop",
  "oxide","brash","elbow","civic","waltz","stove","shady","blunt","ivory","lodge",
  "prose","hound","gloom","brine","thorn","smear","boxer","gauze","guava","plait",
  "swamp","blaze","repel","revel","unify","renew","glare","spear","grove","creak",
  "tally","truce","bland","plaid","guild","groom","seize","flood","notch","flute",
  "chime","champ","cleft","prism","proxy","kneel","cling","bloat","frail","steed",
  "froth","guild","lathe","trove","choir","spade","shove","gripe","sprig","beige",
  "feint","bliss","graft","grout","plunk","scamp","skunk","grail","stomp","swine",
  "spine","plait","grain","scrub","smock","snide","crisp","crumb","skulk","glint",
  "bloke","chute","fleck","gruel","mound","plumb","crimp","stoic","plonk","snore",
  "brave","slate","probe","groan","spare","spade","spill","stale","spine","spire",
  "stein","stink","stock","stolen","stomp","stone","stork","storm","story","stout",
  "stove","strap","straw","strip","strut","stump","style","sugar","suite","super",
  "swamp","swarm","swear","sweat","sweep","sweet","swift","swipe","swirl","swoop",
  "table","talon","taunt","tawny","tease","their","theme","thief","thing","think",
  "third","thorn","three","threw","throw","thump","tiger","tiled","timer","tipsy",
  "tithe","title","today","token","tonal","tonic","topaz","topic","torch","tower",
  "toxic","trail","train","trait","tramp","trash","trawl","treat","treck","trend",
  "trial","trick","tried","troop","troth","trout","trove","truce","truck","truly",
  "trump","trunk","tryst","tulip","tumor","tuner","tunic","twang","tweak","twice",
  "twill","twine","twirl","twist","tying","udder","ulcer","ultra","uncut","under",
  "undue","unify","union","unite","unlit","until","unwed","upper","upset","urban",
  "usher","usurp","utter","uvula","valor","value","valve","vapor","vault","vaunt",
  "verge","verse","vicar","vigil","viola","viper","viral","vivid","vixen","vocal",
  "vodka","vogue","voila","vouch","vowel","wacky","waltz","warty","waste","watch",
  "water","weary","whelp","where","which","while","whiff","whirl","whist","whole",
  "whose","wield","wimpy","winch","witty","woman","world","wormy","worse","worst",
  "wrack","wrath","wreak","wreck","wring","wrist","write","wrong","wrote","yacht",
  "yearn","yeast","yield","young","yours","youth","zeal","zesty","zilch","zippy",
  "abbey","abhor","abide","abyss","acorn","acrid","adage","adept","admit","adobe",
  "afoot","agile","agony","aided","aisle","alarm","album","alert","algae","alibi",
  "alien","align","allay","allot","alloy","aloft","aloof","aloud","alpha","altar",
  "amaze","amble","amiss","ample","angel","angry","anime","annex","anvil","aorta",
  "aphid","apple","apply","apron","arena","argon","aroma","array","arrow","askew",
  "assay","atone","attic","audio","audit","augur","avail","avert","avoid","award",
  "awful","badly","bagel","balmy","banal","banjo","banty","basic","basil","baste",
  "batch","bathe","batty","bayou","beady","beard","beast","beefy","begat","begun",
  "belch","below","bench","beret","berry","bezel","bible","biome","birch","bison",
  "bitty","blade","blain","blame","blank","blast","bleat","bleed","blend","bless",
  "blimp","blind","bliss","bloat","block","blood","bloom","blot","blowup","blunt",
  "blurb","blurt","boggy","bogus","bolts","booze","borax","bossy","botch","bough",
  "bound","boxer","brace","braid","brain","brake","brash","brawl","brawn","braze",
  "break","breed","breve","briar","bribe","bride","brief","broil","broke","broom",
  "broth","budge","buggy","built","bulge","bully","bumpy","bunny","burly","burnt",
  "burro","buyer","bylaw","cabal","cadet","cahil","camel","cameo","canoe","caper",
  "carat","carve","caste","catch","cause","cease","cedar","cello","chair","chalk",
  "chant","chard","charm","chart","chase","cheap","cheat","check","cheek","cheer",
  "chess","chest","chide","chief","chive","choke","chore","chose","chuck","chunk",
  "churn","cinch","circa","cited","claim","clang","clank","claw","clean","clear",
  "cleft","clerk","cliff","cling","clink","cloak","clock","clone","cloth","cloud",
  "clout","clove","cluck","clung","coaly","comet","comic","comma","coral","corny",
  "couch","cough","could","coven","cover","covet","cozy","cramp","crane","crass",
  "crave","crawl","craze","creed","creep","crest","cringe","crisp","cross","crowd",
  "crown","crude","cruel","crush","crust","crypt","cubic","cunny","curve","cynic",
  "daddy","daily","dairy","daisy","decay","decoy","delta","dense","devil","dirty",
  "disco","divan","dizzy","dodge","doing","dolly","dopey","dowdy","dowel","dowry",
  "draft","drain","drape","drawl","dread","dream","dregs","dress","dried","drift",
  "drink","drone","drool","droop","dross","drove","drown","druid","drunk","drupe",
  "dryer","ducal","ducky","dummy","dumpy","duped","duple","dusky","dusty","early",
  "earth","ebony","eject","elude","embed","emcee","empty","enact","endow","enjoy",
  "ensue","enter","entry","epoch","equip","erode","essay","evade","evoke","exact",
  "exert","exile","extra","exude","exult","façade","fable","faery","faker","fancy",
  "farce","fatly","fault","feast","fetch","fewer","filch","filly","filmy","finch",
  "flair","flash","flank","flare","flesh","flint","flirt","float","flock","floss",
  "flour","fluid","flunk","flurry","foamy","focal","folly","forge","forgo","forte",
  "forum","found","frill","frisk","front","frost","froze","frugal","fungi","funny",
  "gaudy","gavel","gawky","gizmo","gland","glare","glass","glide","glimpse","gloat",
  "gloss","glove","glyph","godly","golly","gouge","gourd","graft","graze","greed",
  "greet","grief","grime","grimy","grind","griot","groan","groin","gruff","grunge",
  "guile","gusto","hairy","hardy","haste","hatch","haunt","haven","heady","hefty",
  "heist","hence","herby","hippo","hitch","holly","homer","honey","honor","hopeful",
  "horny","hotly","huffy","human","husky","hussy","hutch","hyena","hyper","icing",
  "idiom","idiot","igloo","irate","itchy","jaunt","jazzy","jelly","jerky","joust",
  "jovial","juicy","jumbo","karma","kayak","kebab","kitty","knack","knave","kneed",
  "knife","knigh","knit","koala","kudos","klutz","lapel","larch","larva","lasso",
  "later","lather","layup","leaky","leapt","lefty","lemon","lemur","level","libel",
  "light","lilac","limbo","liner","liner","loamy","loath","lobby","local","logic",
  "loopy","lowly","loyal","lucid","lucky","lusty","lymph","lyric","magic","magma",
  "maple","march","marry","matey","maxim","maybe","melee","mercy","merit","messy",
  "medal","metal","micro","milky","mimic","mirth","model","money","month","moose",
  "moody","moral","morel","mossy","motif","motto","mousy","mourn","mouthy","muddy",
  "mulch","mummy","mushy","musky","musty","myrrh","naive","nifty","night","nimble",
  "noble","noise","novice","nudge","nutty","nymph","occur","ocean","onion","onset",
  "onward","organ","other","ought","ounce","outdo","outer","paced","paddy","palsy",
  "papal","parse","party","pasta","patsy","patty","pause","peace","peach","penal",
  "perky","pesky","petty","piano","pithy","plain","plane","plank","plant","plaza",
  "plead","pleat","plod","plop","ploy","pluck","plume","plump","plunge","plunk",
  "poach","podgy","pogey","pointy","poise","poppy","pouty","power","prank","prawn",
  "press","price","prima","primp","prink","print","prior","privy","prize","probe",
  "prong","prone","prune","psalm","pubic","puffy","pupil","puppy","pushy","queen",
  "query","quest","queue","quick","quiet","quite","quota","quote","rabid","rainy",
  "ramen","ranch","raspy","reedy","refer","reign","relax","repay","repel","reply",
  "rerun","reuse","rhyme","rider","ridge","rifle","right","rigid","risky","ritzy",
  "river","rivet","rowdy","royal","ruby","rugby","ruler","rumba","rupee","rusty",
  "sadly","saggy","saint","salvo","sandy","sassy","sauce","saucy","sauna","scald",
  "scalp","scam","scamp","scant","scare","scarf","scary","scene","scone","scoop",
  "scorn","scout","scram","scrap","scratch","screw","scrub","seedy","seep","serve",
  "seven","sew","shack","shaft","shake","shall","shame","shank","shape","share",
  "shark","sharp","shawl","shear","shell","shift","shock","shone","shoot","shout",
  "shun","siege","sieve","silly","since","sinew","sixth","sixty","skate","skiff",
  "skimp","skulk","slack","slain","slang","slap","slash","slave","sleek","sleet",
  "slept","slick","slide","slime","sling","slink","sloth","slump","slung","slunk",
  "slurp","slyer","smack","smart","smell","smelt","smirk","smite","smoky","snack",
  "snail","snake","snaky","snare","snark","snatch","sneak","sneer","sniff","snore",
  "snort","snowy","snuff","soggy","solid","solve","sonic","sorry","spark","spasm",
  "spawn","speak","speck","speed","spend","spice","spike","spill","spite","splat",
  "split","spoke","spoof","spool","spore","sport","spray","spree","squat","squib",
  "stab","stack","staid","stain","stair","stake","stale","stall","stand","stank",
  "stark","start","stash","state","stays","steal","steel","steep","steer","stern",
  "sting","stint","stoat","stoke","stood","stoop","stray","strep","strike","strip",
  "strode","stroll","strung","stuck","stuff","stunt","suave","sulky","sunny","surge",
  "surly","swear","swill","swoop","sylph","syrup","taffy","tangy","tardy","tartan",
  "taste","tatty","taunt","tawdry","taxis","teary","teddy","teeth","tempo","tepid",
  "terse","thick","thorn","thyme","tippy","title","toddy","tonal","topsy","toss",
  "totem","touch","tough","towel","toxin","tramp","trend","trice","trite","tromp",
  "trove","truce","trull","tryst","tubby","tulip","turbo","tusky","tweed","twinge",
  "ultra","unfit","unity","unmet","unzip","upset","usurp","utter","vague","vapid",
  "vaunt","vault","verge","verse","vigor","viper","viral","vivid","vocal","voila",
  "vouch","vowel","wacky","wader","warty","waste","watch","water","weary","weave",
  "whelp","whiff","whirl","whole","whose","wield","wimpy","winch","witty","woman",
  "world","wormy","worse","worst","wrack","wrath","wreak","wreck","wring","wrist"
];

function getRandomWord() {
  return WORDLE_WORDS[Math.floor(Math.random() * WORDLE_WORDS.length)].toUpperCase();
}

function calcWordFeedback(guess, answer) {
  const result = Array(5).fill('gray');
  const ansArr = answer.split('');
  const used   = Array(5).fill(false);
  // Green pass
  for (let i = 0; i < 5; i++) {
    if (guess[i] === ansArr[i]) { result[i] = 'green'; used[i] = true; }
  }
  // Yellow pass
  for (let i = 0; i < 5; i++) {
    if (result[i] === 'green') continue;
    for (let j = 0; j < 5; j++) {
      if (!used[j] && guess[i] === ansArr[j]) {
        result[i] = 'yellow'; used[j] = true; break;
      }
    }
  }
  return result;
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
      triviaData: null,
      wordleDifficulty: 'easy'  // easy|medium|hard
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
    
    // If host already picked a difficulty, send it to the partner immediately
    if (room.wordleDifficulty) {
      socket.emit('difficultySet', { difficulty: room.wordleDifficulty });
    }
    
    console.log(`${playerName} joined room: ${roomCode}`);
  });

  // Set difficulty for Number Wordle (host only) — fires on every card click
  socket.on('setDifficulty', ({ roomCode, difficulty }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    // Accept from host — update host id if reconnected
    if (socket.id !== room.host.id) {
      const isPartner = room.partner && socket.id === room.partner.id;
      if (isPartner) return;
      room.host.id = socket.id;
    }
    room.wordleDifficulty = difficulty;
    socket.to(roomCode).emit('difficultySet', { difficulty });
    console.log('🎯 Difficulty selected for room:', roomCode, '->', difficulty);
  });

  // Host confirmed difficulty — show secret inputs to BOTH players simultaneously
  socket.on('confirmDifficulty', ({ roomCode, difficulty }) => {
    const room = rooms.get(roomCode);
    if (!room) {
      console.log('❌ confirmDifficulty: room not found:', roomCode);
      return;
    }
    console.log('📨 confirmDifficulty received | socket:', socket.id, '| host:', room.host.id, '| match:', socket.id === room.host.id);
    // Accept from host only — but update host.id if it changed due to reconnect
    if (socket.id !== room.host.id) {
      // Check if this socket is in the room at all
      const isPartner = room.partner && socket.id === room.partner.id;
      if (!isPartner) {
        // Socket ID mismatch — likely a reconnect, update host id and proceed
        console.log('⚠️  Host socket ID mismatch — updating host id from', room.host.id, 'to', socket.id);
        room.host.id = socket.id;
      } else {
        console.log('❌ confirmDifficulty: called by partner, ignoring');
        return;
      }
    }
    room.wordleDifficulty = difficulty || room.wordleDifficulty || 'easy';
    io.to(roomCode).emit('difficultyConfirmed', { difficulty: room.wordleDifficulty });
    console.log('✅ Difficulty confirmed for room:', roomCode, '->', room.wordleDifficulty);
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
      
      // RANDOM first turn - flip a coin!
      const firstTurn = Math.random() < 0.5 ? room.host.name : room.partner.name;
      room.currentTurn = firstTurn;
      
      console.log('🎮 Starting game! Room:', roomCode, '| First turn:', firstTurn);
      
      io.to(roomCode).emit('gameStarted', {
        hostName: room.host.name,
        partnerName: room.partner.name,
        firstTurn: firstTurn,
        difficulty: room.wordleDifficulty
      });
    }
    
    // Only send playerReady if game hasn't started yet (avoid noise alongside gameStarted)
    if (!room.gameStarted) {
      const player = socket.id === room.host.id ? room.host : room.partner;
      socket.to(roomCode).emit('playerReady', { playerName: player.name });
    }
  });

  // Submit guess (for Number Guessing & Number Wordle)
  socket.on('submitGuess', ({ roomCode, guess }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.gameStarted) return;
    
    const player = socket.id === room.host.id ? room.host : room.partner;
    const opponent = socket.id === room.host.id ? room.partner : room.host;
    
    console.log('🎯 submitGuess:', { player: player.name, guess, currentTurn: room.currentTurn });
    
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
      // Send guess result to both players (for Number Wordle)
      io.to(roomCode).emit('guessResult', {
        playerName: player.name,
        guess: guess,
        feedback: feedback,
        isHost: socket.id === room.host.id
      });
      
      // Detect which game by digit count stored in room
      const isNumberWordle = room.wordleDifficulty && guess.length >= 4 && guess.length <= 5;
      
      if (isNumberWordle) {
        // NUMBER WORDLE: Switch turn after guess
        if (room.currentTurn) {
          const oldTurn = room.currentTurn;
          room.currentTurn = room.currentTurn === room.host.name ? room.partner.name : room.host.name;
          console.log('   🔄 [Number Wordle] Turn switched from:', oldTurn, '→', room.currentTurn);
          io.to(roomCode).emit('turnUpdate', {
            currentTurn: room.currentTurn
          });
        }
      } else {
        // NUMBER GUESSING: Send newGuess for auto-hint system
        console.log('   📢 [Number Guessing] Broadcasting newGuess to room');
        io.to(roomCode).emit('newGuess', {
          playerName: player.name,
          guess: guess,
          guessCount: player.guesses.length,
          isHost: socket.id === room.host.id
        });
        // Turn switching happens in 'sendHint' handler for Number Guessing
      }
    }
  });

  // Send hint back to partner (for Number Guessing AUTO HINTS)
  socket.on('sendHint', ({ roomCode, guess, hint, toPlayer }) => {
    const room = rooms.get(roomCode);
    if (!room) {
      console.log('❌ sendHint: Room not found:', roomCode);
      return;
    }
    
    console.log('📨 sendHint received:', { roomCode, guess, hint, toPlayer, from: socket.id === room.host.id ? 'host' : 'partner' });
    console.log('   Current turn BEFORE:', room.currentTurn);
    
    // GUARD: Only process hint if it's from the OPPONENT (not the guesser)
    const guesser = room.host.name === toPlayer ? room.host : room.partner;
    const hintSender = socket.id === room.host.id ? room.host : room.partner;
    
    if (guesser.id === hintSender.id) {
      console.log('   ⚠️ IGNORED: Guesser cannot send hint to themselves!');
      return;
    }
    
    // Find the partner's socket ID
    const partner = room.host.name === toPlayer ? room.host : room.partner;
    
    // Send hint only to the guesser
    io.to(partner.id).emit('receiveHint', {
      guess: guess,
      hint: hint
    });
    console.log('   ✅ Sent hint to:', toPlayer);
    
    // Switch turns after hint is sent
    const oldTurn = room.currentTurn;
    room.currentTurn = room.currentTurn === room.host.name ? room.partner.name : room.host.name;
    console.log('   🔄 Turn switched from:', oldTurn, '→', room.currentTurn);
    
    io.to(roomCode).emit('turnUpdate', {
      currentTurn: room.currentTurn
    });
    console.log('   ✅ Broadcast turnUpdate to room');
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
    // Keep wordleDifficulty so host's choice persists across rounds
    
    io.to(roomCode).emit('gameReset');
  });


  // ─── WORD WORDLE HANDLERS ────────────────────────────────────────────────

  socket.on('wordWordleReady', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    const player = socket.id === room.host.id ? room.host : room.partner;
    if (!player) return;
    player.wordWordleReady = true;
    socket.to(roomCode).emit('playerReady', { playerName: player.name });

    // Both ready — start game
    if (room.host.wordWordleReady && room.partner && room.partner.wordWordleReady) {
      const word = getRandomWord();
      room.wordWordleAnswer = word;
      room.host.wordGuesses = 0;
      room.partner.wordGuesses = 0;
      room.host.wordSolved = false;
      room.partner.wordSolved = false;
      room.host.wordWordleReady = false;
      room.partner.wordWordleReady = false;
      room.gameStarted = true;
      console.log('🔤 Word Wordle started! Word:', word, '| Room:', roomCode);
      io.to(roomCode).emit('wordWordleStarted');
    }
  });

  socket.on('wordWordleGuess', ({ roomCode, guess }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.wordWordleAnswer) return;
    const player  = socket.id === room.host.id ? room.host : room.partner;
    const opponent = socket.id === room.host.id ? room.partner : room.host;
    if (!player || player.wordSolved) return;

    const answer   = room.wordWordleAnswer;
    const feedback = calcWordFeedback(guess.toUpperCase(), answer);
    const solved   = feedback.every(f => f === 'green');
    player.wordGuesses++;

    // Send full result (with letters) back to the guesser only
    socket.emit('wordWordleResult', {
      guess: guess.toUpperCase(),
      feedback,
      guessNumber: player.wordGuesses,
      solved
    });

    // Send only colours (no letters) to opponent
    socket.to(roomCode).emit('opponentGuessed', {
      feedback,
      guessNumber: player.wordGuesses
    });

    if (solved) {
      player.wordSolved = true;
      const opponentGuesses = opponent ? (opponent.wordSolved ? opponent.wordGuesses : 0) : 0;
      io.to(roomCode).emit('wordWordleOver', {
        winner:     player.name,
        word:       answer,
        myGuesses:  null, // each player gets personalised values below
        bothFailed: false
      });
      // Send personalised gameOver to each socket
      const hostSolved    = room.host.wordSolved;
      const partnerSolved = room.partner ? room.partner.wordSolved : false;
      io.to(room.host.id).emit('wordWordleOver', {
        winner:      player.name,
        word:        answer,
        myGuesses:   hostSolved   ? room.host.wordGuesses   : 0,
        theirGuesses: partnerSolved ? room.partner.wordGuesses : 0,
        myName:      room.host.name,
        theirName:   room.partner ? room.partner.name : '',
        bothFailed:  false
      });
      if (room.partner) {
        io.to(room.partner.id).emit('wordWordleOver', {
          winner:       player.name,
          word:         answer,
          myGuesses:    partnerSolved ? room.partner.wordGuesses : 0,
          theirGuesses: hostSolved    ? room.host.wordGuesses    : 0,
          myName:       room.partner.name,
          theirName:    room.host.name,
          bothFailed:   false
        });
      }
      room.gameStarted = false;
    } else if (player.wordGuesses >= 6) {
      // This player ran out — check if opponent also done
      const opponentDone = !opponent || opponent.wordSolved || opponent.wordGuesses >= 6;
      if (opponentDone) {
        io.to(room.host.id).emit('wordWordleOver', {
          winner:       room.host.wordSolved ? room.host.name : (room.partner && room.partner.wordSolved ? room.partner.name : null),
          word:         answer,
          myGuesses:    room.host.wordSolved ? room.host.wordGuesses : 0,
          theirGuesses: room.partner && room.partner.wordSolved ? room.partner.wordGuesses : 0,
          myName:       room.host.name,
          theirName:    room.partner ? room.partner.name : '',
          bothFailed:   !room.host.wordSolved && !(room.partner && room.partner.wordSolved)
        });
        if (room.partner) {
          io.to(room.partner.id).emit('wordWordleOver', {
            winner:       room.partner.wordSolved ? room.partner.name : (room.host.wordSolved ? room.host.name : null),
            word:         answer,
            myGuesses:    room.partner.wordSolved ? room.partner.wordGuesses : 0,
            theirGuesses: room.host.wordSolved ? room.host.wordGuesses : 0,
            myName:       room.partner.name,
            theirName:    room.host.name,
            bothFailed:   !room.host.wordSolved && !room.partner.wordSolved
          });
        }
        room.gameStarted = false;
      }
    }
  });

  socket.on('wordTyping', ({ roomCode }) => {
    socket.to(roomCode).emit('wordTyping');
  });
  socket.on('wordStopTyping', ({ roomCode }) => {
    socket.to(roomCode).emit('wordStopTyping');
  });

  socket.on('resetWordWordle', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || socket.id !== room.host.id) return;
    room.wordWordleAnswer = null;
    room.host.wordGuesses = 0;
    room.host.wordSolved  = false;
    room.host.wordWordleReady = false;
    if (room.partner) {
      room.partner.wordGuesses = 0;
      room.partner.wordSolved  = false;
      room.partner.wordWordleReady = false;
    }
    room.gameStarted = false;
    io.to(roomCode).emit('wordWordleReset');
  });

  // Typing indicator
  socket.on('typing', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    const player = socket.id === room.host.id ? room.host : room.partner;
    if (player) socket.to(roomCode).emit('typing', { playerName: player.name });
  });
  socket.on('stopTyping', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    const player = socket.id === room.host.id ? room.host : room.partner;
    if (player) socket.to(roomCode).emit('stopTyping', { playerName: player.name });
  });

  // Taunts
  socket.on('taunt', ({ roomCode, emoji }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    socket.to(roomCode).emit('taunt', { emoji });
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