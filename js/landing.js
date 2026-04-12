// GAMERO Landing Page - Particle Animation

// Create floating particles
for(let i = 0; i < 50; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.animationDelay = Math.random() * 20 + 's';
    particle.style.animationDuration = (Math.random() * 10 + 15) + 's';
    document.body.appendChild(particle);
}

// Game navigation
function playGame(gameName) {
    if (gameName === 'number-guessing') {
        window.location.href = 'games/number-guessing/index.html';
    } else if (gameName === 'number-wordle') {
        window.location.href = 'games/number-wordle/index.html';
    } else if (gameName === 'trivia-battle') {
        window.location.href = 'games/trivia-battle/index.html';
    } else if (gameName === 'word-wordle') {
        window.location.href = 'games/word-wordle/index.html';
    }
}

// Enter key support
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const firstActive = document.querySelector('.game-card:not(.coming-soon)');
        if (firstActive) firstActive.click();
    }
});

// Hover sound effect (optional - can be enabled)
document.querySelectorAll('.game-card:not(.coming-soon)').forEach(card => {
    card.addEventListener('mouseenter', () => {
        card.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
    });
});