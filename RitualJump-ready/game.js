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
function gameOver() {
    gameRunning = false;

    if (score > highScore) {
        highScore = score;
        localStorage.setItem('doodleHighScore', highScore);
        document.getElementById('best').textContent = highScore;
        document.getElementById('menuBest').textContent = highScore;
    }

    document.getElementById('finalScore').textContent = score;
    document.getElementById('gameOver').style.display = 'block';

    // === LEADERBOARD INTEGRATION ===
    if (window.LeaderboardAPI && score > 0) {
        window.LeaderboardAPI.onGameOver(score);
    }
}

// Start/restart game
function startGame() {
    score = 0;
    cameraY = 0;
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
