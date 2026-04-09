# 🎮 GAMERO

**Multiplayer game platform for playing with friends in real-time!**

Currently featuring: **Number Guessing Game**

---

## 📂 Project Structure

```
gamero/
├── index.html              # Main landing page (game lobby)
├── server/
│   ├── package.json
│   └── server.js           # Socket.IO server for all games
└── games/
    └── number-guessing/
        └── index.html      # Number Guessing Game
```

---

## 🎯 Number Guessing Game

### How to Play

1. **Host creates game** → Gets a 6-digit room code
2. **Partner joins** using the room code
3. **Both enter secret numbers** (any length - 1 digit, 4 digits, 100 digits!)
4. **Start guessing!** 
   - Type your guesses
   - Both players see ALL guesses in real-time
   - Say "too high" or "too low" to each other on video call
5. **Host declares winner** when someone guesses correctly
6. **Game reveals:**
   - Winner announcement
   - Both secret numbers
   - Total guess counts for each player
7. **Play again** or leave!

### Features

✅ Any number length (not limited to 4 digits)  
✅ Both players see all guesses in real-time  
✅ Only host can declare winner  
✅ Reveals both numbers after game ends  
✅ Shows total guess counts  
✅ Play multiple rounds  
✅ Mobile-friendly  

---

## 🚀 Setup & Run Locally

### Prerequisites
- Node.js (v14 or higher)
- npm

### Installation

1. **Clone/Download the project**

2. **Install server dependencies:**
```bash
cd server
npm install
```

3. **Start the server:**
```bash
npm start
```
Server runs on `http://localhost:3001`

4. **Open the game:**
   - Simply open `index.html` in your browser
   - Or use a local server:
```bash
# From project root
npx http-server -p 8080
```
   - Visit `http://localhost:8080`

---

## 📦 Deployment Guide

### Deploy Server (Render - Free Tier)

1. **Push `server` folder to GitHub**

2. **Create new Web Service on Render:**
   - Connect your GitHub repo
   - Root Directory: `server`
   - Build Command: `npm install`
   - Start Command: `npm start`

3. **Note your server URL** (e.g., `https://gamero-server.onrender.com`)

### Deploy Client (Vercel - Free)

1. **Update Socket.IO URL in game file:**

Open `games/number-guessing/index.html` and change line ~312:
```javascript
// FROM:
const socket = io('http://localhost:3001');

// TO:
const socket = io('https://your-server-url.onrender.com');
```

2. **Deploy to Vercel:**
```bash
# Install Vercel CLI
npm i -g vercel

# From project root
vercel
```

Or use Vercel's GitHub integration.

---

## 🎨 Customization

### Change Brand Colors

Edit `index.html` (landing page):
```css
/* Current: Purple gradient */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* Example: Red/Orange */
background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
```

### Add New Games

1. Create folder: `games/your-game-name/`
2. Add `index.html` for your game
3. Update `index.html` (landing page) to add new game card:

```html
<div class="game-card active" onclick="playGame('your-game-name')">
    <div class="game-icon">
        🎲
        <span class="badge">Active</span>
    </div>
    <div class="game-content">
        <h2 class="game-title">Your Game Name</h2>
        <p class="game-description">Description here</p>
        <div class="game-meta">
            <div class="meta-item">
                <span>👥</span>
                <span>2-4 Players</span>
            </div>
        </div>
        <button class="play-button">Play Now!</button>
    </div>
</div>
```

4. Update the `playGame()` function in `index.html`

---

## 🔧 Server Configuration

### CORS Settings

Edit `server/server.js` if you need specific CORS:
```javascript
cors: {
  origin: "https://your-client-domain.com",  // Change from "*"
  methods: ["GET", "POST"]
}
```

### Port Configuration

Change port in `server/server.js`:
```javascript
const PORT = process.env.PORT || 3001;  // Change 3001 to your port
```

---

## 📱 Mobile Support

Fully responsive! Works perfectly on:
- 📱 Mobile phones (iOS/Android)
- 💻 Desktops
- 📱 Tablets

Perfect for video call gaming on mobile!

---

## 🐛 Troubleshooting

### "Connection Failed"
- Make sure server is running
- Check Socket.IO URL matches your server
- Verify CORS settings

### "Room Not Found"
- Room codes are case-sensitive
- Codes expire when host disconnects
- Make sure both using same server

### Partner Can't Join
- Only 2 players per room
- Share exact room code (copy/paste recommended)

---

## 🎉 Future Games

**Coming Soon:**
- Tic-Tac-Toe
- Trivia Quiz
- Drawing Game (Pictionary-style)
- Word Chain
- Rock Paper Scissors Tournament

---

## 🛠️ Tech Stack

- **Frontend:** HTML, CSS, JavaScript (Vanilla)
- **Backend:** Node.js, Express
- **Real-time:** Socket.IO (WebSocket)
- **Deployment:** Render (server), Vercel (client)

---

## 📝 License

Free to use and modify!

---

## 🙌 Credits

Built for playing games with distant friends over video calls!

Perfect for:
- Zoom game nights
- Discord hangouts  
- WhatsApp video calls
- Long-distance friendships

---

Enjoy GAMERO! 🎮🎉
