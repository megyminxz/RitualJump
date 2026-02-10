// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Responsive canvas - fullscreen
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gameScale = canvas.height / 600;
}

let gameScale = 1;
resizeCanvas();
window.addEventListener('resize', () => {
    resizeCanvas();
    if (player) {
        // Keep player in bounds after resize
        if (player.x > canvas.width) player.x = canvas.width - player.width;
    }
});

// Load sprites
const spriteJump = new Image();
const spriteIdle = new Image();
const backgroundImage = new Image();
const platformNormalSprite = new Image();
const platformBrokenSprite = new Image();
spriteJump.src = 'sprite/1.jpg';
spriteIdle.src = 'sprite/2.jpg';
backgroundImage.src = 'sprite/fon.png';
platformNormalSprite.src = 'sprite/platform1.jpg';
platformBrokenSprite.src = 'sprite/platform.jpg';

// Game state
let score = 0;
let highScore = localStorage.getItem('doodleHighScore') || 0;
let gameRunning = false;
let cameraY = 0;
let gameStartTime = 0; // Track when game started

// Delta time
let lastTime = 0;
const TARGET_FPS = 60;
const TARGET_FRAME_TIME = 1000 / TARGET_FPS;

document.getElementById('best').textContent = highScore;
document.getElementById('menuBest').textContent = highScore;

// Input
const keys = { left: false, right: false };

document.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
});

// Touch controls for mobile
let touchStartX = 0;
let isTouching = false;

canvas.addEventListener('touchstart', (e) => {
    if (!gameRunning) return;
    e.preventDefault();
    isTouching = true;
    touchStartX = e.touches[0].clientX;

    // Determine which half of screen was touched
    const screenCenter = canvas.width / 2;
    if (touchStartX < screenCenter) {
        keys.left = true;
        keys.right = false;
    } else {
        keys.right = true;
        keys.left = false;
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    if (!gameRunning || !isTouching) return;
    e.preventDefault();
    const touchX = e.touches[0].clientX;
    const screenCenter = canvas.width / 2;

    if (touchX < screenCenter) {
        keys.left = true;
        keys.right = false;
    } else {
        keys.right = true;
        keys.left = false;
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    isTouching = false;
    keys.left = false;
    keys.right = false;
}, { passive: false });

canvas.addEventListener('touchcancel', (e) => {
    isTouching = false;
    keys.left = false;
    keys.right = false;
});

// Platform types
const PLATFORM_TYPES = {
    NORMAL: 'normal',
    MOVING: 'moving',
    BREAKING: 'breaking',
    SPRING: 'spring'
};

// Player
class Player {
    constructor() {
        this.baseWidth = 70;   // Bigger character
        this.baseHeight = 85;  // Bigger character
        this.x = canvas.width / 2 - (this.baseWidth * gameScale) / 2;
        this.y = canvas.height - 100 * gameScale - this.baseHeight * gameScale - 5; // On top of start platform
        this.velX = 0;
        this.velY = 0;

        // Physics values
        this.baseSpeed = 5.5;
        this.baseJumpForce = -10;
        this.baseGravity = 0.3;

        this.facing = 1;
    }

    get width() { return this.baseWidth * gameScale; }
    get height() { return this.baseHeight * gameScale; }
    get speed() { return this.baseSpeed * gameScale; }
    get jumpForce() { return this.baseJumpForce * gameScale; }
    get gravity() { return this.baseGravity * gameScale; }

    // Calculate max jump height for platform generation
    get maxJumpHeight() {
        // Physics: h = v² / (2g)
        return (this.baseJumpForce * this.baseJumpForce) / (2 * this.baseGravity) * gameScale * 0.75;
    }

    reset() {
        this.x = canvas.width / 2 - this.width / 2;
        this.y = canvas.height - 100 * gameScale - this.height - 5;
        this.velX = 0;
        this.velY = 0;
    }

    update(dt) {
        const timeScale = dt / TARGET_FRAME_TIME;

        // Horizontal movement
        if (keys.left) {
            this.velX = -this.speed;
            this.facing = -1;
        } else if (keys.right) {
            this.velX = this.speed;
            this.facing = 1;
        } else {
            this.velX *= Math.pow(0.85, timeScale);
        }

        // Apply gravity
        this.velY += this.gravity * timeScale;

        // Update position
        this.x += this.velX * timeScale;
        this.y += this.velY * timeScale;

        // Wrap around screen edges
        if (this.x + this.width < 0) {
            this.x = canvas.width;
        } else if (this.x > canvas.width) {
            this.x = -this.width;
        }

        // Check platform collisions (only when falling)
        if (this.velY > 0) {
            for (let platform of platforms) {
                if (this.landedOn(platform)) {
                    if (platform.type === PLATFORM_TYPES.BREAKING) {
                        platform.breaking = true;
                    } else if (platform.type === PLATFORM_TYPES.SPRING &&
                               this.y + this.height <= platform.y + 15 * gameScale) {
                        this.velY = this.jumpForce * 1.8;
                        platform.springActive = true;
                        setTimeout(() => platform.springActive = false, 200);
                    } else if (!platform.broken) {
                        this.velY = this.jumpForce;
                    }
                }
            }
        }

        // Update camera when player goes above middle
        if (this.y < cameraY + canvas.height * 0.4) {
            const diff = (cameraY + canvas.height * 0.4) - this.y;
            cameraY -= diff;
            score = Math.max(score, Math.floor(-cameraY / (10 * gameScale)));
            document.getElementById('score').textContent = score;
        }

        // Check game over
        if (this.y - cameraY > canvas.height + 50 * gameScale) {
            gameOver();
        }
    }

    landedOn(platform) {
        if (platform.broken) return false;

        const playerBottom = this.y + this.height;
        const playerPrevBottom = playerBottom - this.velY;

        return playerBottom >= platform.y &&
               playerPrevBottom <= platform.y + 15 * gameScale &&
               this.x + this.width > platform.x &&
               this.x < platform.x + platform.width;
    }

    draw() {
        const sprite = this.velY < 0 ? spriteJump : spriteIdle;
        const screenY = this.y - cameraY;

        ctx.save();

        if (this.facing === -1) {
            ctx.translate(this.x + this.width, screenY);
            ctx.scale(-1, 1);
            ctx.drawImage(sprite, 0, 0, this.width, this.height);
        } else {
            ctx.drawImage(sprite, this.x, screenY, this.width, this.height);
        }

        ctx.restore();
    }
}

// Platform
class Platform {
    constructor(x, y, type = PLATFORM_TYPES.NORMAL) {
        this.baseWidth = 85;
        this.baseHeight = 18;
        this.x = x;
        this.y = y;
        this.type = type;
        this.broken = false;
        this.breaking = false;
        this.breakTimer = 0;
        this.springActive = false;

        // For moving platforms
        this.baseMoveSpeed = 1.8;
        this.moveDir = Math.random() > 0.5 ? 1 : -1;
    }

    get width() { return this.baseWidth * gameScale; }
    get height() { return this.baseHeight * gameScale; }
    get moveSpeed() { return this.baseMoveSpeed * gameScale; }

    update(dt) {
        const timeScale = dt / TARGET_FRAME_TIME;

        // Moving platform logic
        if (this.type === PLATFORM_TYPES.MOVING) {
            this.x += this.moveSpeed * this.moveDir * timeScale;
            if (this.x <= 0 || this.x + this.width >= canvas.width) {
                this.moveDir *= -1;
            }
        }

        // Breaking platform logic
        if (this.breaking && !this.broken) {
            this.breakTimer += timeScale;
            if (this.breakTimer > 15) {
                this.broken = true;
            }
        }
    }

    draw() {
        if (this.broken) return;

        const screenY = this.y - cameraY;

        // Skip if off screen
        if (screenY > canvas.height + 50 || screenY < -50) return;

        ctx.save();

        // Breaking animation
        if (this.breaking) {
            ctx.globalAlpha = 1 - (this.breakTimer / 15);
            ctx.translate(this.x + this.width/2, screenY + this.height/2);
            ctx.rotate(this.breakTimer * 0.08);
            ctx.translate(-(this.x + this.width/2), -(screenY + this.height/2));
        }

        // Draw based on type
        switch (this.type) {
            case PLATFORM_TYPES.NORMAL:
                this.drawNormal(screenY);
                break;
            case PLATFORM_TYPES.MOVING:
                this.drawMoving(screenY);
                break;
            case PLATFORM_TYPES.BREAKING:
                this.drawBreaking(screenY);
                break;
            case PLATFORM_TYPES.SPRING:
                this.drawSpring(screenY);
                break;
        }

        ctx.restore();
    }

    drawNormal(screenY) {
        // Draw platform sprite (normal)
        if (platformNormalSprite.complete && platformNormalSprite.naturalWidth > 0) {
            ctx.drawImage(platformNormalSprite, this.x, screenY, this.width, this.height);
        } else {
            // Fallback
            ctx.fillStyle = '#4CAF50';
            ctx.fillRect(this.x, screenY, this.width, this.height);
        }
    }

    drawMoving(screenY) {
        // Draw platform sprite (same as normal)
        if (platformNormalSprite.complete && platformNormalSprite.naturalWidth > 0) {
            ctx.drawImage(platformNormalSprite, this.x, screenY, this.width, this.height);
        } else {
            // Fallback
            ctx.fillStyle = '#2196F3';
            ctx.fillRect(this.x, screenY, this.width, this.height);
        }
    }

    drawBreaking(screenY) {
        // Draw broken platform sprite
        if (platformBrokenSprite.complete && platformBrokenSprite.naturalWidth > 0) {
            ctx.drawImage(platformBrokenSprite, this.x, screenY, this.width, this.height);
        } else {
            // Fallback
            ctx.fillStyle = '#8D6E63';
            ctx.fillRect(this.x, screenY, this.width, this.height);
        }
    }

    drawSpring(screenY) {
        // Draw platform sprite (normal) as base
        if (platformNormalSprite.complete && platformNormalSprite.naturalWidth > 0) {
            ctx.drawImage(platformNormalSprite, this.x, screenY, this.width, this.height);
        } else {
            ctx.fillStyle = '#4CAF50';
            ctx.fillRect(this.x, screenY, this.width, this.height);
        }

        // Draw spring on top
        const springHeight = (this.springActive ? 6 : 15) * gameScale;
        const springY = screenY - springHeight;

        ctx.fillStyle = '#FF5722';
        ctx.beginPath();
        ctx.roundRect(this.x + this.width/2 - 10 * gameScale, springY, 20 * gameScale, springHeight, 4 * gameScale);
        ctx.fill();

        ctx.strokeStyle = '#BF360C';
        ctx.lineWidth = 2 * gameScale;
        for (let i = 0; i < 3; i++) {
            const ly = springY + 4 * gameScale + i * (springHeight / 4);
            ctx.beginPath();
            ctx.moveTo(this.x + this.width/2 - 7 * gameScale, ly);
            ctx.lineTo(this.x + this.width/2 + 7 * gameScale, ly);
            ctx.stroke();
        }
    }
}

// Platforms array
let platforms = [];
let player;

// Generate platforms with guaranteed reachability
function generatePlatforms() {
    platforms = [];

    const platformWidth = 85 * gameScale;
    const maxJumpHeight = player ? player.maxJumpHeight : 120 * gameScale;
    const minGap = 40 * gameScale;
    const maxGap = maxJumpHeight * 0.85; // Never exceed 85% of max jump height

    // Starting platform (wide, centered)
    const startPlatform = new Platform(
        canvas.width / 2 - platformWidth / 2,
        canvas.height - 100 * gameScale,
        PLATFORM_TYPES.NORMAL
    );
    platforms.push(startPlatform);

    // Generate platforms going up
    let lastPlatform = startPlatform;
    let y = lastPlatform.y - minGap;

    while (y > cameraY - canvas.height) {
        // Calculate reachable X range from last platform
        const maxHorizontalDistance = canvas.width * 0.4; // Can reach 40% of screen width

        let minX = Math.max(0, lastPlatform.x - maxHorizontalDistance);
        let maxX = Math.min(canvas.width - platformWidth, lastPlatform.x + maxHorizontalDistance);

        // Random X within reachable range
        const x = minX + Math.random() * (maxX - minX);

        // Get platform type (no breaking platforms at start)
        const type = getRandomPlatformType(Math.abs(y));

        // If it's a breaking platform, ensure there's another reachable platform nearby
        if (type === PLATFORM_TYPES.BREAKING) {
            // Add a normal platform nearby
            const safeY = y - (minGap + Math.random() * 20 * gameScale);
            const safeX = Math.max(0, Math.min(canvas.width - platformWidth, x + (Math.random() - 0.5) * maxHorizontalDistance * 0.5));
            platforms.push(new Platform(safeX, safeY, PLATFORM_TYPES.NORMAL));
        }

        const platform = new Platform(x, y, type);
        platforms.push(platform);

        lastPlatform = platform;

        // Gap between platforms (always reachable)
        const gap = minGap + Math.random() * (maxGap - minGap);
        y -= gap;
    }
}

function getRandomPlatformType(height) {
    // No breaking platforms in first 500 units
    const difficulty = Math.min(height / (1000 * gameScale), 0.6);

    const rand = Math.random();

    if (rand < 0.55 - difficulty * 0.2) return PLATFORM_TYPES.NORMAL;
    if (rand < 0.75) return PLATFORM_TYPES.MOVING;
    if (rand < 0.88 && height > 500 * gameScale) return PLATFORM_TYPES.BREAKING;
    return PLATFORM_TYPES.SPRING;
}

// Add new platforms as player goes up
function addNewPlatforms() {
    // Find highest platform
    let topPlatform = platforms[0];
    for (let p of platforms) {
        if (p.y < topPlatform.y) topPlatform = p;
    }

    const platformWidth = 85 * gameScale;
    const maxJumpHeight = player.maxJumpHeight;
    const minGap = 40 * gameScale;
    const maxGap = maxJumpHeight * 0.85;

    // Generate new platforms above
    while (topPlatform.y > cameraY - 100 * gameScale) {
        const maxHorizontalDistance = canvas.width * 0.4;

        let minX = Math.max(0, topPlatform.x - maxHorizontalDistance);
        let maxX = Math.min(canvas.width - platformWidth, topPlatform.x + maxHorizontalDistance);

        const x = minX + Math.random() * (maxX - minX);
        const gap = minGap + Math.random() * (maxGap - minGap);
        const y = topPlatform.y - gap;

        const type = getRandomPlatformType(Math.abs(y - canvas.height));

        // Add safety platform for breaking platforms
        if (type === PLATFORM_TYPES.BREAKING) {
            const safeGap = minGap + Math.random() * 20 * gameScale;
            const safeX = Math.max(0, Math.min(canvas.width - platformWidth, x + (Math.random() - 0.5) * maxHorizontalDistance * 0.5));
            const safePlatform = new Platform(safeX, y - safeGap, PLATFORM_TYPES.NORMAL);
            platforms.push(safePlatform);
        }

        const platform = new Platform(x, y, type);
        platforms.push(platform);
        topPlatform = platform;
    }

    // Remove platforms far below screen
    platforms = platforms.filter(p => p.y < cameraY + canvas.height + 200 * gameScale);
}

// Draw background
function drawBackground() {
    // Fill with black first (fallback)
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (backgroundImage.complete && backgroundImage.naturalWidth > 0) {
        // Calculate scale to cover canvas width while maintaining aspect ratio
        const imgWidth = backgroundImage.naturalWidth;
        const imgHeight = backgroundImage.naturalHeight;

        // Scale to fit canvas width
        const scale = canvas.width / imgWidth;
        const scaledHeight = imgHeight * scale;

        // Calculate scroll offset with parallax effect
        // The offset moves down as cameraY decreases (player goes up)
        const scrollSpeed = 0.5; // Parallax factor
        const offset = (-cameraY * scrollSpeed) % scaledHeight;

        // Draw multiple copies for seamless scrolling
        // Start from above the visible area
        const startY = offset - scaledHeight;

        for (let y = startY; y < canvas.height; y += scaledHeight) {
            ctx.drawImage(backgroundImage, 0, y, canvas.width, scaledHeight);
        }
    }
}

// Game over
async function gameOver() {
    console.log('gameOver() called');
    gameRunning = false;

    // Calculate game duration in seconds
    const gameDuration = gameStartTime > 0 ? Math.floor((Date.now() - gameStartTime) / 1000) : 0;
    console.log('Game duration:', gameDuration, 'seconds');

    // Update best score (single game record)
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('doodleHighScore', highScore);
        document.getElementById('best').textContent = highScore;
        document.getElementById('menuBest').textContent = highScore;
    }

    // Add XP from this game (cumulative system)
    if (score > 0) {
        // Always sync to user_xp table for leaderboard with game stats
        if (window.XPSystem) {
            await window.XPSystem.addXP(score, gameDuration);
        }

        // Also update WalletAuth if user is logged in
        if (window.WalletAuth && window.WalletAuth.currentUser) {
            await window.WalletAuth.updateUserXP(score);
            // Update user XP display
            const userXPEl = document.getElementById('userXP');
            if (userXPEl) {
                userXPEl.textContent = window.WalletAuth.currentUser.total_xp.toLocaleString() + ' XP';
            }
        } else if (!window.XPSystem) {
            // Fallback: add XP locally
            const currentXP = parseInt(localStorage.getItem('ritual_total_xp')) || 0;
            localStorage.setItem('ritual_total_xp', (currentXP + score).toString());
        }

        // Update rank display with new XP
        if (typeof updateRankDisplay === 'function') {
            updateRankDisplay();
        }
    }

    document.getElementById('finalScore').textContent = score;

    // Show XP earned this game
    const xpEarnedEl = document.getElementById('xpEarned');
    if (xpEarnedEl) {
        xpEarnedEl.textContent = '+' + score + ' XP';
    }

    document.getElementById('gameOver').style.display = 'block';

    // Update share link for game over screen
    if (typeof updateShareLinks === 'function') {
        updateShareLinks();
    }

    // Submit score to leaderboard
    console.log('Game over - score:', score, 'LeaderboardAPI exists:', !!window.LeaderboardAPI);
    if (window.LeaderboardAPI && score > 0) {
        window.LeaderboardAPI.onGameOver(score);
    }
}

// Start/restart game
function startGame() {
    score = 0;
    cameraY = 0;
    gameStartTime = Date.now(); // Track game start time
    document.getElementById('score').textContent = 0;
    document.getElementById('gameOver').style.display = 'none';
    document.getElementById('startMenu').style.display = 'none';
    document.getElementById('ui').style.display = 'block';

    player = new Player();
    generatePlatforms();
    gameRunning = true;
    lastTime = performance.now();
}

// Start button (main menu)
document.getElementById('startBtn').addEventListener('click', startGame);

// Restart button
document.getElementById('restartBtn').addEventListener('click', startGame);

// Menu button (return to main menu)
document.getElementById('menuBtn').addEventListener('click', function() {
    document.getElementById('gameOver').style.display = 'none';
    document.getElementById('ui').style.display = 'none';
    document.getElementById('startMenu').style.display = 'flex';
    gameRunning = false;
});

// Developers button
document.getElementById('devsBtn').addEventListener('click', function() {
    document.getElementById('devsPanel').style.display = 'flex';
});

// Developers close button
document.getElementById('devsCloseBtn').addEventListener('click', function() {
    document.getElementById('devsPanel').style.display = 'none';
});

// Tutorial
let currentSlide = 0;
const totalSlides = 7;

// Create dots
const dotsContainer = document.querySelector('.tutorial-dots');
for (let i = 0; i < totalSlides; i++) {
    const dot = document.createElement('div');
    dot.className = 'tutorial-dot' + (i === 0 ? ' active' : '');
    dot.addEventListener('click', () => goToSlide(i));
    dotsContainer.appendChild(dot);
}

function updateSlides() {
    document.querySelectorAll('.tutorial-slide').forEach((slide, index) => {
        slide.classList.toggle('active', index === currentSlide);
    });
    document.querySelectorAll('.tutorial-dot').forEach((dot, index) => {
        dot.classList.toggle('active', index === currentSlide);
    });
    // Update prev/next button states
    document.getElementById('tutorialPrev').style.opacity = currentSlide === 0 ? '0.3' : '1';
    document.getElementById('tutorialNext').style.opacity = currentSlide === totalSlides - 1 ? '0.3' : '1';
}

function goToSlide(index) {
    currentSlide = Math.max(0, Math.min(totalSlides - 1, index));
    updateSlides();
}

document.getElementById('tutorialBtn').addEventListener('click', function() {
    currentSlide = 0;
    updateSlides();
    document.getElementById('tutorialPanel').style.display = 'flex';
});

document.getElementById('tutorialPrev').addEventListener('click', function() {
    if (currentSlide > 0) {
        currentSlide--;
        updateSlides();
    }
});

document.getElementById('tutorialNext').addEventListener('click', function() {
    if (currentSlide < totalSlides - 1) {
        currentSlide++;
        updateSlides();
    }
});

document.getElementById('tutorialClose').addEventListener('click', function() {
    document.getElementById('tutorialPanel').style.display = 'none';
});

// Game loop with delta time
function gameLoop(currentTime) {
    // Calculate delta time
    const dt = Math.min(currentTime - lastTime, 50);
    lastTime = currentTime;

    // Draw background
    drawBackground();

    if (gameRunning) {
        // Update with delta time
        player.update(dt);
        platforms.forEach(p => p.update(dt));
        addNewPlatforms();
    }

    // Draw platforms
    platforms.forEach(p => p.draw());

    // Draw player
    if (player) {
        player.draw();
    }

    requestAnimationFrame(gameLoop);
}

// Wait for sprites to load
let loadedImages = 0;
let assetsReady = false;

function onImageLoad() {
    loadedImages++;
    if (loadedImages >= 5) {
        assetsReady = true;
        // Start the render loop but don't start the game yet
        requestAnimationFrame(gameLoop);
    }
}

spriteJump.onload = onImageLoad;
spriteIdle.onload = onImageLoad;
backgroundImage.onload = onImageLoad;
platformNormalSprite.onload = onImageLoad;
platformBrokenSprite.onload = onImageLoad;
spriteJump.onerror = onImageLoad;
spriteIdle.onerror = onImageLoad;
backgroundImage.onerror = onImageLoad;
platformNormalSprite.onerror = onImageLoad;
platformBrokenSprite.onerror = onImageLoad;

// ==========================================
// RANK SYSTEM
// ==========================================
// Rank icons embedded as data URIs (works offline and avoids CORS issues)
const RANK_ICONS_BASE64 = {
    'ritty-bitty': 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 36 36"><path fill="#77B255" d="M22.911 14.398c-1.082.719-2.047 1.559-2.88 2.422-.127-4.245-1.147-9.735-6.772-12.423C12.146-1.658-.833 1.418.328 2.006c2.314 1.17 3.545 4.148 5.034 5.715 2.653 2.792 5.603 2.964 7.071.778 3.468 2.254 3.696 6.529 3.59 11.099-.012.505-.023.975-.023 1.402v14c0 1.104 4 1.104 4 0V23.51c.542-.954 2.122-3.505 4.43-5.294 1.586 1.393 4.142.948 6.463-1.495 1.489-1.567 2.293-4.544 4.607-5.715 1.221-.618-12.801-3.994-12.589 3.392z"/></svg>'),
    'ritty': 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 36 36"><path fill="#67757F" d="M20 21.5c0 .828-.672 1.5-1.5 1.5-.829 0-1.5-.672-1.5-1.5v-3c0-.829.671-1.5 1.5-1.5.828 0 1.5.671 1.5 1.5v3z"/><path fill="#E1E8ED" d="M27.138 33.817C27.183 35.022 26.206 36 25 36H12.183C10.977 36 10 35.022 10 33.817V21c0-1.205.115-2.183 2.183-2.183S15 23 25 21c1.091 0 2.183.978 2.138 2.183v10.634z"/><path fill="#FCAB40" d="M18.687 18.538c-2.595 0-6.962-1.934-6.962-5.898 0-3.988 4.351-5.414 7.005-11.401.751-1.693.999-1.107 1.86-.076 2.06 2.463 5.058 7.483 5.058 11.574-.001 4.641-4.64 5.801-6.961 5.801z"/><path fill="#FDCB58" d="M18.687 17.447c-4.184 0-3.482-5.802 0-9.283 2.321 1.16 5.801 9.283 0 9.283z"/><path fill="#CCD6DD" d="M11 29c0 .553-.448 1-1 1s-1-.447-1-1v-7c0-.553.448-1 1-1s1 .447 1 1v7zm4 3c0 .553-.448 1-1 1s-1-.447-1-1v-7c0-.553.448-1 1-1s1 .447 1 1v7zm0-11c0 .553-.448 1-1 1s-1-.447-1-1v-1c0-.553.448-1 1-1s1 .447 1 1v1z"/></svg>'),
    'ritualist': 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><g><path d="M 21.80 95.22 C19.82,100.52 16.00,100.70 16.00,95.49 C16.00,94.32 14.71,92.42 13.11,91.24 C10.75,89.50 9.91,87.68 8.50,81.33 C4.41,62.99 7.97,38.29 15.50,32.77 C17.66,31.18 18.16,32.20 17.51,36.89 C17.08,40.02 17.23,42.03 17.92,42.45 C18.51,42.82 19.00,44.23 19.00,45.60 C19.00,47.09 20.51,49.70 22.78,52.14 C26.51,56.13 26.64,56.17 30.63,55.10 C32.86,54.50 35.48,53.12 36.46,52.04 C39.11,49.12 39.56,41.92 37.52,35.41 C35.62,29.39 35.93,24.28 38.48,19.38 C39.31,17.80 39.99,15.11 39.99,13.40 C40.00,9.99 43.09,6.44 45.31,7.29 C46.22,7.64 46.93,10.33 47.38,15.13 C47.93,21.06 48.54,22.95 50.60,25.11 C57.41,32.21 64.32,32.61 70.66,26.28 C74.93,22.01 75.99,16.62 73.98,9.45 C72.58,4.42 73.67,1.69 75.96,4.46 C76.67,5.31 78.00,6.00 78.91,6.00 C81.66,6.00 89.40,14.60 89.46,17.71 C89.48,19.43 90.26,20.81 91.56,21.46 C93.54,22.46 93.60,23.12 93.17,37.50 C92.44,61.73 92.48,62.77 94.40,64.89 C95.36,65.95 97.39,67.33 98.92,67.97 C101.34,68.97 102.28,68.76 106.31,66.31 C109.37,64.45 111.60,62.12 112.89,59.43 C114.52,56.04 115.33,55.36 117.78,55.36 L 120.72 55.36 L 120.82 62.43 C120.98,73.64 117.61,87.93 114.14,90.76 C113.29,91.45 112.12,93.47 111.55,95.26 C110.85,97.42 109.77,98.60 108.31,98.81 C106.31,99.10 106.05,98.56 105.42,93.00 C104.87,88.14 104.25,86.55 102.41,85.35 C99.74,83.60 96.36,84.31 95.55,86.80 C95.25,87.74 93.46,89.55 91.58,90.83 C85.95,94.65 82.83,91.86 80.88,81.29 C79.11,71.72 73.85,63.43 66.33,58.32 C59.99,54.01 59.18,55.00 58.46,67.89 C58.00,76.13 57.84,76.58 54.29,80.22 C51.32,83.26 49.86,84.00 46.86,84.00 C43.67,84.00 42.62,83.37 39.52,79.59 C35.29,74.42 34.51,74.04 30.44,75.14 C27.62,75.89 27.21,76.60 25.10,84.23 C23.84,88.78 22.36,93.72 21.80,95.22 Z" fill="rgb(65,253,176)"/><path d="M 21.80 95.22 C22.36,93.72 23.84,88.78 25.10,84.23 C27.21,76.60 27.62,75.89 30.44,75.14 C34.51,74.04 35.29,74.42 39.52,79.59 C42.62,83.37 43.67,84.00 46.86,84.00 C49.86,84.00 51.32,83.26 54.29,80.22 C57.84,76.58 58.00,76.13 58.46,67.89 C59.18,55.00 59.99,54.01 66.33,58.32 C73.85,63.43 79.11,71.72 80.88,81.29 C82.83,91.86 85.95,94.65 91.58,90.83 C93.46,89.55 95.25,87.74 95.55,86.80 C96.36,84.31 99.74,83.60 102.41,85.35 C104.25,86.55 104.87,88.14 105.42,93.00 C106.05,98.56 106.31,99.10 108.31,98.81 C109.77,98.60 110.85,97.42 111.55,95.26 C112.12,93.47 113.29,91.45 114.14,90.76 C117.61,87.93 120.98,73.64 120.82,62.43 L 120.72 55.36 L 117.78 55.36 C115.33,55.36 114.52,56.04 112.89,59.43 C111.60,62.12 109.37,64.45 106.31,66.31 C102.28,68.76 101.34,68.97 98.92,67.97 C97.39,67.33 95.36,65.95 94.40,64.89 C92.48,62.77 92.44,61.73 93.17,37.50 C93.60,23.12 93.54,22.46 91.56,21.46 C90.26,20.81 89.48,19.43 89.46,17.71 C89.43,16.38 88.01,14.06 86.17,11.82 C89.51,15.30 92.33,18.69 93.15,20.30 C96.01,25.90 96.50,33.29 95.00,48.05 C93.81,59.71 93.84,61.10 95.36,63.42 C100.00,70.50 109.01,65.91 114.37,53.74 C116.94,47.90 119.54,45.64 121.00,48.01 C122.49,50.41 123.18,68.32 122.06,75.50 C120.84,83.31 115.43,95.01 110.34,100.87 L 107.18 104.50 L 106.09 101.69 C105.49,100.15 104.73,97.00 104.38,94.69 C103.24,86.93 99.58,83.69 97.13,88.26 C95.57,91.17 89.97,95.00 87.28,95.00 C83.58,95.00 80.47,89.93 78.68,81.00 C76.75,71.40 73.64,65.91 67.41,61.14 C61.18,56.37 59.55,57.27 60.42,64.99 C60.80,68.40 60.64,72.56 60.03,74.72 C58.56,79.94 52.37,85.90 47.61,86.68 C44.03,87.26 43.58,87.01 38.59,81.64 C35.70,78.54 32.83,76.00 32.20,76.00 C29.88,76.00 24.35,90.07 23.37,98.49 C23.05,101.25 22.45,103.87 22.03,104.32 C20.76,105.67 13.98,96.96 10.36,89.32 C5.89,79.89 4.66,72.78 5.29,60.00 C5.71,51.35 6.33,48.21 8.83,42.16 C12.47,33.33 16.67,26.73 18.31,27.27 C19.07,27.52 19.71,31.18 20.07,37.35 C20.62,46.67 20.78,47.17 24.02,50.52 C28.11,54.74 30.00,54.86 34.15,51.16 C37.03,48.59 37.29,47.87 36.98,43.41 C36.84,41.34 36.70,36.62 36.62,31.77 C36.82,32.95 37.12,34.16 37.52,35.41 C39.56,41.92 39.11,49.12 36.46,52.04 C35.48,53.12 32.86,54.50 30.63,55.10 C26.64,56.17 26.51,56.13 22.78,52.14 C20.51,49.70 19.00,47.09 19.00,45.60 C19.00,44.23 18.51,42.82 17.92,42.45 C17.23,42.03 17.08,40.02 17.51,36.89 C18.16,32.20 17.66,31.18 15.50,32.77 C7.97,38.29 4.41,62.99 8.50,81.33 C9.91,87.68 10.75,89.50 13.11,91.24 C14.71,92.42 16.00,94.32 16.00,95.49 C16.00,100.70 19.82,100.52 21.80,95.22 Z" fill="rgb(84,245,181)"/><path d="M 5.53 73.27 C6.19,78.92 7.70,83.71 10.36,89.32 C13.98,96.96 20.76,105.67 22.03,104.32 C22.45,103.87 23.05,101.25 23.37,98.49 C24.35,90.07 29.88,76.00 32.20,76.00 C32.83,76.00 35.70,78.54 38.59,81.64 C43.58,87.01 44.03,87.26 47.61,86.68 C52.37,85.90 58.56,79.94 60.03,74.72 C60.64,72.56 60.80,68.40 60.42,64.99 C59.55,57.27 61.18,56.37 67.41,61.14 C73.64,65.91 76.75,71.40 78.68,81.00 C80.47,89.93 83.58,95.00 87.28,95.00 C89.97,95.00 95.57,91.17 97.13,88.26 C99.58,83.69 103.24,86.93 104.38,94.69 C104.73,97.00 105.49,100.15 106.09,101.69 L 106.60 103.02 L 105.13 99.79 C103.96,97.21 103.00,94.50 103.00,93.75 C103.00,92.03 100.99,90.00 99.29,90.00 C98.57,90.00 96.12,91.35 93.84,93.00 C91.56,94.65 88.67,96.00 87.41,96.00 C83.61,96.00 80.43,92.05 78.54,85.00 C75.41,73.31 73.71,69.57 69.47,65.09 C63.76,59.05 62.00,59.79 62.00,68.26 C62.00,79.40 56.62,86.72 47.70,87.73 C43.41,88.21 42.91,88.00 38.25,83.64 C34.09,79.74 33.08,79.23 31.70,80.27 C29.35,82.03 25.35,93.43 24.52,100.73 C23.88,106.32 23.62,106.87 22.02,106.01 C19.40,104.61 13.26,95.69 9.88,88.39 C7.53,83.32 6.15,78.71 5.53,73.27 Z" fill="rgb(126,248,199)"/><path d="M 21.39 105.59 C21.62,105.77 21.83,105.91 22.02,106.01 C23.62,106.87 23.88,106.32 24.52,100.73 C25.35,93.43 29.35,82.03 31.70,80.27 C33.08,79.23 34.09,79.74 38.25,83.64 C42.91,88.00 43.41,88.21 47.70,87.73 C56.62,86.72 62.00,79.40 62.00,68.26 C62.00,59.79 63.76,59.05 69.47,65.09 C73.71,69.57 75.41,73.31 78.54,85.00 C80.43,92.05 83.61,96.00 87.41,96.00 C88.67,96.00 91.56,94.65 93.84,93.00 C96.12,91.35 98.57,90.00 99.29,90.00 C100.99,90.00 103.00,92.03 103.00,93.75 C103.00,94.50 103.96,97.21 105.13,99.79 L 106.60 103.02 L 107.00 104.04 C106.51,104.56 106.02,105.07 105.50,105.59 C92.37,118.87 81.18,123.94 65.00,123.98 C53.98,124.00 45.29,121.89 36.97,117.15 C30.55,113.50 25.54,109.84 21.39,105.59 Z" fill="rgb(164,252,215)"/></g></svg>')
};

// XP-based rank system (cumulative XP, not single game score)
const RANKS = {
    RITTY_BITTY: { name: 'Ritty Bitty', icon: 'role/ritibiti.svg', minXP: 0, class: 'ritty-bitty' },
    RITTY: { name: 'Ritty', icon: 'role/riti.svg', minXP: 1000, class: 'ritty' },
    RITUALIST: { name: 'Ritualist', icon: 'role/ritualist.svg', minXP: 5000, class: 'ritualist' },
    RITUAL_MASTER: { name: 'Ritual Master', icon: 'role/ritualist.svg', minXP: 40000, class: 'ritual-master' }
};

// Get total XP (from WalletAuth, XPSystem, or localStorage fallback)
function getTotalXP() {
    // Priority 1: Logged in user via wallet
    if (window.WalletAuth && window.WalletAuth.currentUser) {
        return window.WalletAuth.currentUser.total_xp || 0;
    }
    // Priority 2: XPSystem
    if (window.XPSystem) {
        return window.XPSystem.getLocalXP();
    }
    // Fallback: localStorage
    return parseInt(localStorage.getItem('ritual_total_xp')) || 0;
}

function getRank(xp) {
    if (xp >= RANKS.RITUAL_MASTER.minXP) return RANKS.RITUAL_MASTER;
    if (xp >= RANKS.RITUALIST.minXP) return RANKS.RITUALIST;
    if (xp >= RANKS.RITTY.minXP) return RANKS.RITTY;
    return RANKS.RITTY_BITTY;
}

function getNextRank(xp) {
    if (xp >= RANKS.RITUAL_MASTER.minXP) return null; // Max rank
    if (xp >= RANKS.RITUALIST.minXP) return RANKS.RITUAL_MASTER;
    if (xp >= RANKS.RITTY.minXP) return RANKS.RITUALIST;
    return RANKS.RITTY;
}

function getRankProgress(xp) {
    const currentRank = getRank(xp);
    const nextRank = getNextRank(xp);

    if (!nextRank) {
        return { percent: 100, current: xp, target: xp };
    }

    const rangeStart = currentRank.minXP;
    const rangeEnd = nextRank.minXP;
    const progress = xp - rangeStart;
    const range = rangeEnd - rangeStart;
    const percent = Math.min(100, Math.floor((progress / range) * 100));

    return { percent, current: xp, target: rangeEnd };
}

function updateRankDisplay() {
    const totalXP = getTotalXP();
    const rank = getRank(totalXP);
    const nextRank = getNextRank(totalXP);
    const progress = getRankProgress(totalXP);

    // Update menu rank display
    const menuRankIconImg = document.getElementById('menuRankIconImg');
    const menuRankTitle = document.getElementById('menuRankTitle');
    const menuRankProgress = document.getElementById('menuRankProgress');

    if (menuRankIconImg) menuRankIconImg.src = rank.icon;
    if (menuRankTitle) {
        menuRankTitle.textContent = rank.name;
        menuRankTitle.className = 'menu-rank-title ' + rank.class;
    }
    if (menuRankProgress) {
        if (nextRank) {
            menuRankProgress.textContent = `${totalXP.toLocaleString()} / ${nextRank.minXP.toLocaleString()} XP to ${nextRank.name}`;
        } else {
            menuRankProgress.textContent = 'MAX RANK ACHIEVED!';
        }
    }

    // Update rank panel
    const rankIconImg = document.getElementById('rankIconImg');
    const rankTitle = document.getElementById('rankTitle');
    const rankScore = document.getElementById('rankScore');
    const rankProgressFill = document.getElementById('rankProgressFill');
    const rankProgressText = document.getElementById('rankProgressText');
    const currentRankLabel = document.getElementById('currentRankLabel');
    const nextRankLabel = document.getElementById('nextRankLabel');

    if (rankIconImg) {
        rankIconImg.src = rank.icon;
        // Add glow effect for Ritualist and Ritual Master
        const rankIconContainer = document.getElementById('rankIcon');
        if (rankIconContainer) {
            rankIconContainer.classList.remove('ritualist-glow');
            if (rank.name === 'Ritualist' || rank.name === 'Ritual Master') {
                rankIconContainer.classList.add('ritualist-glow');
            }
        }
    }
    if (rankTitle) {
        rankTitle.textContent = rank.name;
        rankTitle.className = 'rank-title ' + rank.class;
    }
    if (rankScore) rankScore.textContent = totalXP.toLocaleString() + ' XP';
    if (rankProgressFill) {
        rankProgressFill.style.width = progress.percent + '%';
        rankProgressFill.className = 'rank-progress-fill ' + rank.class;
    }
    if (rankProgressText) rankProgressText.textContent = progress.percent + '%';
    if (currentRankLabel) currentRankLabel.textContent = rank.name;
    if (nextRankLabel) {
        if (nextRank) {
            nextRankLabel.textContent = `${nextRank.name} (${nextRank.minXP.toLocaleString()} XP)`;
        } else {
            nextRankLabel.textContent = 'MAX RANK!';
        }
    }

    // Update tier indicators
    const tierBitty = document.getElementById('tierBitty');
    const tierRitty = document.getElementById('tierRitty');
    const tierRitualist = document.getElementById('tierRitualist');

    // Reset all tiers
    [tierBitty, tierRitty, tierRitualist].forEach(tier => {
        if (tier) tier.className = 'rank-tier';
    });

    // Mark unlocked and active tiers
    if (tierBitty) {
        tierBitty.classList.add(rank.name === 'Ritty Bitty' ? 'active' : 'unlocked');
    }
    if (tierRitty) {
        if (totalXP >= RANKS.RITTY.minXP) {
            tierRitty.classList.add(rank.name === 'Ritty' ? 'active' : 'unlocked');
        }
    }
    if (tierRitualist) {
        if (totalXP >= RANKS.RITUALIST.minXP) {
            tierRitualist.classList.add(rank.name === 'Ritualist' || rank.name === 'Ritual Master' ? 'active' : 'unlocked');
        }
    }

    // Update criteria items
    const criteriaBitty = document.getElementById('criteriaBitty');
    const criteriaRitty = document.getElementById('criteriaRitty');
    const criteriaRitualist = document.getElementById('criteriaRitualist');
    const statusBitty = document.getElementById('statusBitty');
    const statusRitty = document.getElementById('statusRitty');
    const statusRitualist = document.getElementById('statusRitualist');

    // Reset all criteria items
    [criteriaBitty, criteriaRitty, criteriaRitualist].forEach(item => {
        if (item) item.className = 'rank-criteria-item';
    });

    // Ritty Bitty - always unlocked
    if (criteriaBitty) {
        criteriaBitty.classList.add(rank.name === 'Ritty Bitty' ? 'active' : 'unlocked');
    }
    if (statusBitty) {
        statusBitty.innerHTML = '<svg class="status-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/></svg> Unlocked';
        statusBitty.classList.remove('locked');
    }

    // Ritty
    if (criteriaRitty) {
        if (totalXP >= RANKS.RITTY.minXP) {
            criteriaRitty.classList.add(rank.name === 'Ritty' ? 'active' : 'unlocked');
        }
    }
    if (statusRitty) {
        if (totalXP >= RANKS.RITTY.minXP) {
            statusRitty.innerHTML = '<svg class="status-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/></svg> Unlocked';
            statusRitty.classList.remove('locked');
        } else {
            const needed = RANKS.RITTY.minXP - totalXP;
            statusRitty.innerHTML = `<svg class="status-icon" viewBox="0 0 24 24"><path d="M18 8H17V6C17 3.24 14.76 1 12 1C9.24 1 7 3.24 7 6V8H6C4.9 8 4 8.9 4 10V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V10C20 8.9 19.1 8 18 8ZM12 17C10.9 17 10 16.1 10 15C10 13.9 10.9 13 12 13C13.1 13 14 13.9 14 15C14 16.1 13.1 17 12 17ZM15.1 8H8.9V6C8.9 4.29 10.29 2.9 12 2.9C13.71 2.9 15.1 4.29 15.1 6V8Z" fill="currentColor"/></svg> ${needed.toLocaleString()} XP left`;
            statusRitty.classList.add('locked');
        }
    }

    // Ritualist
    if (criteriaRitualist) {
        if (totalXP >= RANKS.RITUALIST.minXP) {
            criteriaRitualist.classList.add(rank.name === 'Ritualist' || rank.name === 'Ritual Master' ? 'active' : 'unlocked');
        }
    }
    if (statusRitualist) {
        if (totalXP >= RANKS.RITUALIST.minXP) {
            statusRitualist.innerHTML = '<svg class="status-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/></svg> Unlocked';
            statusRitualist.classList.remove('locked');
        } else {
            const needed = RANKS.RITUALIST.minXP - totalXP;
            statusRitualist.innerHTML = `<svg class="status-icon" viewBox="0 0 24 24"><path d="M18 8H17V6C17 3.24 14.76 1 12 1C9.24 1 7 3.24 7 6V8H6C4.9 8 4 8.9 4 10V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V10C20 8.9 19.1 8 18 8ZM12 17C10.9 17 10 16.1 10 15C10 13.9 10.9 13 12 13C13.1 13 14 13.9 14 15C14 16.1 13.1 17 12 17ZM15.1 8H8.9V6C8.9 4.29 10.29 2.9 12 2.9C13.71 2.9 15.1 4.29 15.1 6V8Z" fill="currentColor"/></svg> ${needed.toLocaleString()} XP left`;
            statusRitualist.classList.add('locked');
        }
    }

    // Ritual Master (if element exists)
    const criteriaRitualMaster = document.getElementById('criteriaRitualMaster');
    const statusRitualMaster = document.getElementById('statusRitualMaster');
    if (criteriaRitualMaster) {
        if (totalXP >= RANKS.RITUAL_MASTER.minXP) {
            criteriaRitualMaster.classList.add('active');
        }
    }
    if (statusRitualMaster) {
        if (totalXP >= RANKS.RITUAL_MASTER.minXP) {
            statusRitualMaster.innerHTML = '<svg class="status-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/></svg> Unlocked';
            statusRitualMaster.classList.remove('locked');
        } else {
            const needed = RANKS.RITUAL_MASTER.minXP - totalXP;
            statusRitualMaster.innerHTML = `<svg class="status-icon" viewBox="0 0 24 24"><path d="M18 8H17V6C17 3.24 14.76 1 12 1C9.24 1 7 3.24 7 6V8H6C4.9 8 4 8.9 4 10V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V10C20 8.9 19.1 8 18 8ZM12 17C10.9 17 10 16.1 10 15C10 13.9 10.9 13 12 13C13.1 13 14 13.9 14 15C14 16.1 13.1 17 12 17ZM15.1 8H8.9V6C8.9 4.29 10.29 2.9 12 2.9C13.71 2.9 15.1 4.29 15.1 6V8Z" fill="currentColor"/></svg> ${needed.toLocaleString()} XP left`;
            statusRitualMaster.classList.add('locked');
        }
    }
}

// Rank panel close button
document.getElementById('rankCloseBtn').addEventListener('click', function() {
    document.getElementById('rankPanel').style.display = 'none';
});

// Update rank display on load
updateRankDisplay();

// ==========================================
// SHARE TO X (TWITTER) SYSTEM
// ==========================================

// Game URL - update this when deployed to GitHub Pages
const GAME_URL = 'https://megymin-xz.github.io/ritual-jump/';

let currentShareScore = 0;
let currentShareRank = null;

function getShareText(score, achievement) {
    return `Hey friends

I reached a record of ${score} in the game made by @megymin_xz and @emeli_mag and got the "${achievement}" badge

Try to beat my score`;
}

function createTweetLink(text) {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(GAME_URL)}`;
    return url;
}

function getRankLevel(xp) {
    if (xp >= RANKS.RITUAL_MASTER.minXP) return 4;
    if (xp >= RANKS.RITUALIST.minXP) return 3;
    if (xp >= RANKS.RITTY.minXP) return 2;
    return 1;
}

function updateNftCard() {
    const nickname = document.getElementById('shareNickname').value.trim();

    // Save nickname for future use (if not from WalletAuth)
    if (nickname && !(window.WalletAuth && window.WalletAuth.currentUser)) {
        localStorage.setItem('ritual_share_nickname', nickname);
    }

    // Update rank icon with embedded data URI
    const nftRankIcon = document.getElementById('nftRankIcon');
    if (nftRankIcon && currentShareRank) {
        const iconDataUri = RANK_ICONS_BASE64[currentShareRank.class];
        nftRankIcon.innerHTML = `<img src="${iconDataUri}" alt="${currentShareRank.name}">`;
    }

    // Update rank name
    const nftRankName = document.getElementById('nftRankName');
    if (nftRankName && currentShareRank) {
        nftRankName.textContent = currentShareRank.name;
        nftRankName.className = 'nft-rank-name ' + currentShareRank.class;
    }

    // Update score
    const nftScore = document.getElementById('nftScore');
    if (nftScore) {
        nftScore.textContent = currentShareScore;
    }

    // Update rank level
    const nftGames = document.getElementById('nftGames');
    if (nftGames) {
        nftGames.textContent = getRankLevel(currentShareScore) + '/4';
    }

    // Update player name
    const nftPlayerName = document.getElementById('nftPlayerName');
    if (nftPlayerName) {
        if (nickname) {
            nftPlayerName.textContent = nickname.startsWith('@') ? nickname : '@' + nickname;
            nftPlayerName.classList.remove('empty');
        } else {
            nftPlayerName.textContent = 'Enter your @username';
            nftPlayerName.classList.add('empty');
        }
    }

    // Update date
    const nftDate = document.getElementById('nftDate');
    if (nftDate) {
        const now = new Date();
        nftDate.textContent = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // Update ID (based on score)
    const nftId = document.getElementById('nftId');
    if (nftId) {
        nftId.textContent = '#' + String(currentShareScore).padStart(4, '0');
    }

    // Update go to X link
    const goBtn = document.getElementById('shareGoBtn');
    if (goBtn) {
        const text = getShareText(currentShareScore, currentShareRank.name);
        goBtn.href = createTweetLink(text + '\n\n');
    }
}

function openShareModal() {
    currentShareScore = getTotalXP();
    currentShareRank = getRank(currentShareScore);

    // Auto-fill username from logged in user
    const nicknameInput = document.getElementById('shareNickname');
    if (window.WalletAuth && window.WalletAuth.currentUser && window.WalletAuth.currentUser.nickname) {
        nicknameInput.value = '@' + window.WalletAuth.currentUser.nickname;
    } else {
        // Try to get from localStorage if saved before
        const savedNickname = localStorage.getItem('ritual_share_nickname');
        nicknameInput.value = savedNickname || '';
    }

    // Update card
    updateNftCard();

    // Show modal
    document.getElementById('shareModal').style.display = 'flex';
}

function closeShareModal() {
    document.getElementById('shareModal').style.display = 'none';
}

async function copyCardAsImage() {
    const card = document.getElementById('nftCard');
    const copyBtn = document.getElementById('shareCopyCard');

    try {
        copyBtn.disabled = true;
        copyBtn.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="spin"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg> Wait...`;

        // Wait for all images in card to load
        const images = card.querySelectorAll('img');
        await Promise.all(Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
            });
        }));

        // Small delay to ensure rendering
        await new Promise(resolve => setTimeout(resolve, 100));

        // Temporarily disable animation for screenshot
        card.style.setProperty('--animation-state', 'paused');

        // Use html2canvas to capture the card
        const canvas = await html2canvas(card, {
            backgroundColor: '#0d0d0d',
            scale: 2,
            logging: false,
            useCORS: true,
            allowTaint: false
        });

        // Re-enable animation
        card.style.removeProperty('--animation-state');

        // Convert to blob and copy/download
        canvas.toBlob(async (blob) => {
            try {
                // Try to copy image to clipboard
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]);

                copyBtn.classList.add('copied');
                copyBtn.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Copied!`;
            } catch (clipboardErr) {
                // Fallback: download the image
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ritual-jump-${currentShareScore}.png`;
                a.click();
                URL.revokeObjectURL(url);

                copyBtn.classList.add('copied');
                copyBtn.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Saved!`;
            }

            setTimeout(() => {
                copyBtn.disabled = false;
                copyBtn.classList.remove('copied');
                copyBtn.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg> Copy Card`;
            }, 2000);
        }, 'image/png');

    } catch (err) {
        console.error('Failed to copy card:', err);
        card.style.removeProperty('--animation-state');
        copyBtn.disabled = false;
        copyBtn.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg> Copy Card`;
    }
}

async function copyShareText() {
    const text = getShareText(currentShareScore, currentShareRank.name) + '\n\n' + GAME_URL;
    const copyBtn = document.getElementById('shareCopyText');

    try {
        await navigator.clipboard.writeText(text);

        copyBtn.classList.add('copied');
        copyBtn.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Copied!`;

        setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg> Copy Text`;
        }, 2000);
    } catch (err) {
        console.error('Failed to copy:', err);
    }
}

// Share button event listeners
document.getElementById('shareToX').addEventListener('click', function(e) {
    e.preventDefault();
    openShareModal();
});

document.getElementById('shareGameOver').addEventListener('click', function(e) {
    e.preventDefault();
    openShareModal();
});

document.getElementById('shareModalClose').addEventListener('click', closeShareModal);

document.getElementById('shareModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeShareModal();
    }
});

document.getElementById('shareNickname').addEventListener('input', updateNftCard);

document.getElementById('shareCopyCard').addEventListener('click', copyCardAsImage);

document.getElementById('shareCopyText').addEventListener('click', copyShareText);

// Update share links when rank panel opens
document.getElementById('menuRankBtn').addEventListener('click', function() {
    updateRankDisplay();
    document.getElementById('rankPanel').style.display = 'flex';
});

// ==========================================
// SUPABASE INITIALIZATION & XP SYNC
// ==========================================
document.addEventListener('DOMContentLoaded', async function() {
    // Try to initialize Supabase
    if (typeof window.initSupabase === 'function') {
        window.initSupabase();
    }

    // Sync XP from cloud (if available)
    if (window.XPSystem) {
        try {
            await window.XPSystem.syncFromCloud();
            console.log('XP synced from cloud');
        } catch (err) {
            console.log('Using local XP:', window.XPSystem.getLocalXP());
        }
    }

    // Update rank display with synced XP
    updateRankDisplay();
});
