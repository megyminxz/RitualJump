// ==================== LEADERBOARD MODULE ====================
// Лідерборд в стилі Ritual

// Leaderboard disabled - using Supabase instead
const API_URL = null; // Set to your server URL to enable, or leave null for Supabase-only

// ==================== API FUNCTIONS ====================

// Отримати ТОП гравців з сервера або Supabase
async function fetchLeaderboard() {
    // Try Supabase first
    if (window.XPSystem && typeof window.XPSystem.getLeaderboard === 'function') {
        try {
            const data = await window.XPSystem.getLeaderboard(50);
            console.log('XPSystem.getLeaderboard returned:', data);
            if (data && data.length > 0) {
                // Transform to expected format with all stats
                return data.map(item => ({
                    score: item.total_xp,
                    user_id: item.user_id,
                    nickname: item.nickname,
                    updated_at: item.updated_at,
                    games_played: item.games_played || 0,
                    total_score: item.total_score || 0,
                    time_played: item.time_played || 0
                }));
            }
        } catch (err) {
            console.warn('Supabase leaderboard failed:', err);
        }
    }

    // Fallback to API if configured
    if (!API_URL) return []; // Return empty array, not null
    try {
        const response = await fetch(`${API_URL}/leaderboard`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.success) {
            return result.data;
        } else {
            console.error('Leaderboard error:', result.error);
            return [];
        }
    } catch (error) {
        console.error('Failed to fetch leaderboard:', error);
        return [];
    }
}

// Відправити score на сервер
async function submitScore(score) {
    console.log('submitScore called with:', score);

    // Always update local stats
    updateLocalStats(score);

    if (!API_URL) return { success: true }; // API disabled - using Supabase only
    try {
        const response = await fetch(`${API_URL}/score`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ score: score })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.success) {
            console.log('Score submitted:', result.data);
            // Оновлюємо локальну статистику
            updateLocalStats(score);
            return result.data;
        } else {
            console.error('Submit error:', result.error);
            return null;
        }
    } catch (error) {
        console.error('Failed to submit score:', error);
        // Все одно оновлюємо локальну статистику
        updateLocalStats(score);
        return null;
    }
}

// ==================== LOCAL STATS ====================

function getLocalStats() {
    // Get XP from XPSystem or localStorage
    let totalXP = 0;
    let xpStats = { games_played: 0, total_score: 0, time_played: 0 };

    if (window.XPSystem) {
        totalXP = window.XPSystem.getLocalXP();
        xpStats = window.XPSystem.getLocalStats();
    } else {
        totalXP = parseInt(localStorage.getItem('ritual_total_xp')) || 0;
    }

    // Default stats object using XPSystem stats
    const stats = {
        bestScore: parseInt(localStorage.getItem('doodleHighScore')) || 0,
        gamesPlayed: xpStats.games_played || 0,
        totalScore: xpStats.total_score || 0,
        timePlayed: xpStats.time_played || 0,
        avgScore: xpStats.games_played > 0 ? Math.round(xpStats.total_score / xpStats.games_played) : 0,
        totalXP: totalXP
    };

    // Also check legacy ritualStats for backward compatibility
    const statsStr = localStorage.getItem('ritualStats');
    if (statsStr && stats.gamesPlayed === 0) {
        try {
            const parsed = JSON.parse(statsStr);
            stats.gamesPlayed = parsed.gamesPlayed || stats.gamesPlayed;
            stats.totalScore = parsed.totalScore || stats.totalScore;
            stats.avgScore = parsed.avgScore || stats.avgScore;
            stats.bestScore = parsed.bestScore || stats.bestScore;
        } catch (e) {
            console.warn('Failed to parse ritualStats:', e);
        }
    }

    return stats;
}

function updateLocalStats(score) {
    const stats = getLocalStats();

    // Ensure numeric values
    stats.gamesPlayed = (parseInt(stats.gamesPlayed) || 0) + 1;
    stats.totalScore = (parseInt(stats.totalScore) || 0) + score;
    stats.avgScore = Math.round(stats.totalScore / stats.gamesPlayed);

    if (score > (stats.bestScore || 0)) {
        stats.bestScore = score;
    }

    // Save to localStorage
    localStorage.setItem('ritualStats', JSON.stringify(stats));

    console.log('Stats updated:', stats);
}

// XP-based rank system (same as game.js)
function getRankFromXP(xp) {
    if (xp >= 40000) return { name: 'RITUAL MASTER', level: '4/4', class: 'ritual-master', color: '#FFD700' };
    if (xp >= 5000) return { name: 'RITUALIST', level: '3/4', class: 'ritualist', color: '#39ff14' };
    if (xp >= 1000) return { name: 'RITTY', level: '2/4', class: 'ritty', color: '#00bfff' };
    return { name: 'RITTY BITTY', level: '1/4', class: 'ritty-bitty', color: '#888888' };
}

// For backward compatibility
function getRankFromScore(score) {
    return getRankFromXP(score);
}

function getAvatarColor(index) {
    const colors = ['#FFD700', '#C0C0C0', '#CD7F32', '#39ff14', '#ff6b6b', '#9b59b6', '#e67e22', '#3498db'];
    return colors[index % colors.length];
}

// ==================== UI FUNCTIONS ====================

function createLeaderboardUI() {
    // Стилі для leaderboard
    const styles = document.createElement('style');
    styles.textContent = `
        /* Leaderboard Overlay */
        #leaderboardOverlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            z-index: 999;
        }

        /* Leaderboard Container */
        #leaderboardPanel {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 1000;
            overflow-y: auto;
            padding: 20px;
            box-sizing: border-box;
        }

        .lb-wrapper {
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        /* Header */
        .lb-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
        }

        .lb-logo {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .lb-logo-icon {
            width: 50px;
            height: 50px;
            background: #39ff14;
            border-radius: 12px;
        }

        .lb-logo-text {
            font-family: 'Orbitron', sans-serif;
            font-size: 28px;
            font-weight: 900;
            color: #39ff14;
            letter-spacing: 3px;
        }

        .lb-logo-sub {
            font-family: 'Orbitron', sans-serif;
            font-size: 12px;
            color: #666;
            letter-spacing: 4px;
            margin-top: 2px;
        }

        .lb-date {
            color: #666;
            font-family: 'Orbitron', sans-serif;
            font-size: 14px;
        }

        .lb-back-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            min-width: 120px;
            padding: 14px 28px;
            background: transparent;
            border: 2px solid #39ff14;
            color: #39ff14;
            font-family: 'Orbitron', sans-serif;
            font-size: 14px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 2px;
            cursor: pointer;
            transition: all 0.2s ease;
            border-radius: 12px;
            box-shadow: 0 0 10px rgba(57, 255, 20, 0.2);
        }

        .lb-back-btn:hover {
            background: #39ff14;
            color: #000;
            box-shadow: 0 0 30px rgba(57, 255, 20, 0.6);
            transform: translateY(-2px);
        }

        /* Main Content */
        .lb-content {
            display: grid;
            grid-template-columns: 320px 1fr;
            gap: 20px;
        }

        @media (max-width: 900px) {
            .lb-content {
                grid-template-columns: 1fr;
            }
        }

        /* Stats Panel (Left) */
        .lb-stats-panel {
            background: rgba(0, 0, 0, 0.8);
            border: 2px solid #39ff14;
            border-radius: 16px;
            padding: 25px;
            height: fit-content;
        }

        .lb-stats-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }

        .lb-stats-title {
            color: #39ff14;
            font-family: 'Orbitron', sans-serif;
            font-size: 14px;
            letter-spacing: 2px;
        }

        .lb-stats-position {
            background: rgba(57, 255, 20, 0.2);
            border: 1px solid #39ff14;
            color: #39ff14;
            padding: 5px 12px;
            border-radius: 6px;
            font-family: 'Orbitron', sans-serif;
            font-size: 12px;
            font-weight: bold;
        }

        .lb-avatar-section {
            text-align: center;
            margin-bottom: 20px;
        }

        .lb-avatar {
            width: 100px;
            height: 100px;
            border-radius: 50%;
            margin: 0 auto 15px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .lb-rank-name {
            font-family: 'Orbitron', sans-serif;
            font-size: 20px;
            font-weight: 900;
            letter-spacing: 3px;
            margin-bottom: 5px;
        }

        .lb-rank-name.ritual-master { color: #FFD700; text-shadow: 0 0 15px rgba(255, 215, 0, 0.6); }
        .lb-rank-name.ritualist { color: #39ff14; text-shadow: 0 0 10px rgba(57, 255, 20, 0.5); }
        .lb-rank-name.ritty { color: #00bfff; }
        .lb-rank-name.ritty-bitty { color: #888; }

        .lb-rank-level {
            font-size: 12px;
            color: #39ff14;
        }

        .lb-stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 20px;
        }

        .lb-stat-box {
            background: rgba(57, 255, 20, 0.05);
            border: 1px solid rgba(57, 255, 20, 0.2);
            border-radius: 10px;
            padding: 15px;
            text-align: center;
        }

        .lb-stat-value {
            font-family: 'Orbitron', sans-serif;
            font-size: 22px;
            font-weight: bold;
            color: #39ff14;
            margin-bottom: 5px;
        }

        .lb-stat-label {
            font-size: 10px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .lb-progress-section {
            margin-bottom: 20px;
        }

        .lb-progress-header {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #666;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .lb-progress-bar {
            height: 8px;
            background: #1a1a1a;
            border-radius: 4px;
            overflow: hidden;
        }

        .lb-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #1a6600, #39ff14);
            border-radius: 4px;
            transition: width 0.5s ease;
        }

        .lb-share-btn {
            width: 100%;
            padding: 16px 32px;
            background: #39ff14;
            border: 2px solid #39ff14;
            border-radius: 12px;
            color: #000;
            font-family: 'Orbitron', sans-serif;
            font-size: 14px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 2px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            transition: all 0.2s ease;
            box-shadow: 0 0 20px rgba(57, 255, 20, 0.6);
        }

        .lb-share-btn:hover {
            background: #4dff2a;
            box-shadow: 0 0 30px rgba(57, 255, 20, 0.6), 0 0 60px rgba(57, 255, 20, 0.4);
            transform: translateY(-2px);
        }

        /* Leaderboard Table (Right) */
        .lb-table-panel {
            background: rgba(0, 0, 0, 0.8);
            border: 2px solid #39ff14;
            border-radius: 16px;
            padding: 25px;
            overflow: hidden;
        }

        .lb-search {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }

        .lb-search-input {
            flex: 1;
            padding: 14px 24px;
            background: rgba(57, 255, 20, 0.03);
            border: 2px solid rgba(57, 255, 20, 0.2);
            border-radius: 12px;
            color: #fff;
            font-size: 14px;
            font-family: 'Orbitron', sans-serif;
            transition: all 0.2s ease;
        }

        .lb-search-input::placeholder {
            color: #555;
        }

        .lb-search-input:focus {
            outline: none;
            border-color: #39ff14;
            box-shadow: 0 0 15px rgba(57, 255, 20, 0.2);
        }

        .lb-search-btn {
            padding: 14px 24px;
            background: #39ff14;
            border: 2px solid #39ff14;
            border-radius: 12px;
            color: #000;
            font-family: 'Orbitron', sans-serif;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            cursor: pointer;
            transition: all 0.2s ease;
            white-space: nowrap;
        }

        .lb-search-btn:hover {
            background: #4dff2a;
            box-shadow: 0 0 20px rgba(57, 255, 20, 0.6);
        }

        .lb-table-header {
            display: grid;
            grid-template-columns: 60px 1fr 100px 60px 80px 60px;
            padding: 15px 20px;
            color: #666;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 1px;
            border-bottom: 1px solid #333;
        }

        @media (max-width: 700px) {
            .lb-table-header {
                grid-template-columns: 50px 1fr 80px;
            }
            .lb-table-header span:nth-child(4),
            .lb-table-header span:nth-child(5),
            .lb-table-header span:nth-child(6) {
                display: none;
            }
        }

        .lb-table-body {
            max-height: 500px;
            overflow-y: auto;
        }

        .lb-table-row {
            display: grid;
            grid-template-columns: 60px 1fr 100px 60px 80px 60px;
            padding: 15px 20px;
            align-items: center;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            transition: background 0.2s ease;
        }

        .lb-table-row:hover {
            background: rgba(57, 255, 20, 0.05);
        }

        .lb-table-row.top-1 {
            background: linear-gradient(90deg, rgba(255, 215, 0, 0.1), transparent);
            border-left: 3px solid #FFD700;
        }

        .lb-table-row.top-2 {
            background: linear-gradient(90deg, rgba(192, 192, 192, 0.1), transparent);
            border-left: 3px solid #C0C0C0;
        }

        .lb-table-row.top-3 {
            background: linear-gradient(90deg, rgba(205, 127, 50, 0.1), transparent);
            border-left: 3px solid #CD7F32;
        }

        .lb-table-row.current-user {
            background: linear-gradient(90deg, rgba(57, 255, 20, 0.15), rgba(57, 255, 20, 0.05));
            border-left: 3px solid #39ff14;
            box-shadow: inset 0 0 20px rgba(57, 255, 20, 0.1);
        }

        .lb-table-row.current-user .lb-player-name {
            color: #39ff14;
            font-weight: 700;
        }

        @keyframes highlightPulse {
            0% { box-shadow: inset 0 0 30px rgba(57, 255, 20, 0.5), 0 0 30px rgba(57, 255, 20, 0.5); }
            50% { box-shadow: inset 0 0 50px rgba(57, 255, 20, 0.8), 0 0 50px rgba(57, 255, 20, 0.8); }
            100% { box-shadow: inset 0 0 20px rgba(57, 255, 20, 0.1); }
        }

        @media (max-width: 700px) {
            .lb-table-row {
                grid-template-columns: 50px 1fr 80px;
            }
            .lb-table-row span:nth-child(4),
            .lb-table-row span:nth-child(5),
            .lb-table-row span:nth-child(6) {
                display: none;
            }
        }

        .lb-rank-num {
            color: #39ff14;
            font-family: 'Orbitron', sans-serif;
            font-weight: bold;
            font-size: 14px;
        }

        .lb-player-info {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .lb-player-avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            flex-shrink: 0;
        }

        .lb-player-name {
            color: #fff;
            font-weight: 600;
            font-size: 14px;
        }

        .lb-player-rank {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 2px;
        }

        .lb-player-rank.ritual-master { color: #FFD700; }
        .lb-player-rank.ritualist { color: #39ff14; }
        .lb-player-rank.ritty { color: #00bfff; }
        .lb-player-rank.ritty-bitty { color: #888; }

        .lb-score {
            color: #39ff14;
            font-family: 'Orbitron', sans-serif;
            font-weight: bold;
            font-size: 16px;
        }

        .lb-level {
            color: #39ff14;
            font-size: 13px;
        }

        .lb-games {
            color: #888;
            font-size: 13px;
        }

        .lb-time {
            color: #888;
            font-size: 13px;
        }

        .lb-load-more {
            width: 100%;
            padding: 16px 32px;
            background: transparent;
            border: 2px solid #39ff14;
            border-radius: 12px;
            color: #39ff14;
            font-family: 'Orbitron', sans-serif;
            font-size: 14px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 2px;
            cursor: pointer;
            margin-top: 20px;
            transition: all 0.2s ease;
            box-shadow: 0 0 10px rgba(57, 255, 20, 0.2);
        }

        .lb-load-more:hover {
            background: #39ff14;
            color: #000;
            box-shadow: 0 0 30px rgba(57, 255, 20, 0.6);
            transform: translateY(-2px);
        }

        /* Loading & Error States */
        .lb-loading, .lb-error, .lb-empty {
            text-align: center;
            padding: 40px;
            font-family: 'Orbitron', sans-serif;
        }

        .lb-loading { color: #39ff14; }
        .lb-error { color: #ff3939; }
        .lb-empty { color: #666; }

        .lb-loading-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid #333;
            border-top-color: #39ff14;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 15px;
        }

        @keyframes spin {
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(styles);

    // Overlay
    const overlay = document.createElement('div');
    overlay.id = 'leaderboardOverlay';
    overlay.onclick = hideLeaderboard;
    document.body.appendChild(overlay);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'leaderboardPanel';
    panel.innerHTML = `
        <div class="lb-wrapper">
            <!-- Header -->
            <div class="lb-header">
                <div class="lb-logo">
                    <div class="lb-logo-icon"></div>
                    <div>
                        <div class="lb-logo-text">RITUAL</div>
                        <div class="lb-logo-sub">LEADERBOARD</div>
                    </div>
                </div>
                <button class="lb-back-btn" onclick="hideLeaderboard()">
                    ← BACK
                </button>
            </div>

            <!-- Main Content -->
            <div class="lb-content">
                <!-- Stats Panel (Left) -->
                <div class="lb-stats-panel">
                    <div class="lb-stats-header">
                        <span class="lb-stats-title">YOUR STATS</span>
                        <span class="lb-stats-position" id="lbPosition">-</span>
                    </div>

                    <div class="lb-avatar-section">
                        <div class="lb-avatar" id="lbAvatar" style="background: #39ff14;"></div>
                        <div class="lb-rank-name ritualist" id="lbRankName">RITUALIST</div>
                        <div class="lb-rank-level" id="lbRankLevel">Level 3/3 • MAX RANK!</div>
                    </div>

                    <div class="lb-stats-grid">
                        <div class="lb-stat-box">
                            <div class="lb-stat-value" id="lbBestScore">0</div>
                            <div class="lb-stat-label">Total XP</div>
                        </div>
                        <div class="lb-stat-box">
                            <div class="lb-stat-value" id="lbGames">0</div>
                            <div class="lb-stat-label">Games</div>
                        </div>
                        <div class="lb-stat-box">
                            <div class="lb-stat-value" id="lbAvgScore">0</div>
                            <div class="lb-stat-label">Avg Score</div>
                        </div>
                        <div class="lb-stat-box">
                            <div class="lb-stat-value" id="lbTimePlayed">0s</div>
                            <div class="lb-stat-label">Time Played</div>
                        </div>
                    </div>

                    <div class="lb-progress-section">
                        <div class="lb-progress-header">
                            <span>RANK PROGRESS</span>
                            <span id="lbProgressPercent">0%</span>
                        </div>
                        <div class="lb-progress-bar">
                            <div class="lb-progress-fill" id="lbProgressFill" style="width: 0%;"></div>
                        </div>
                    </div>

                    <button class="lb-share-btn" onclick="if(typeof openShareModal === 'function') openShareModal();">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                        SHARE
                    </button>
                </div>

                <!-- Leaderboard Table (Right) -->
                <div class="lb-table-panel">
                    <div class="lb-search">
                        <input type="text" class="lb-search-input" placeholder="Search by name..." id="lbSearch">
                        <button class="lb-search-btn" id="lbSearchBtn">Search</button>
                    </div>

                    <div class="lb-table-header">
                        <span>RANK</span>
                        <span>PLAYER</span>
                        <span>SCORE</span>
                        <span>LVL</span>
                        <span>GAMES</span>
                        <span>TIME</span>
                    </div>

                    <div class="lb-table-body" id="lbTableBody">
                        <div class="lb-loading">
                            <div class="lb-loading-spinner"></div>
                            Loading leaderboard...
                        </div>
                    </div>

                    <button class="lb-load-more" id="lbLoadMore" style="display: none;">
                        ▼ LOAD MORE PLAYERS
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(panel);

    // Кнопка відкриття (додається після кнопки Developers в меню)
    const devsBtn = document.getElementById('devsBtn');
    if (devsBtn) {
        const btn = document.createElement('button');
        btn.id = 'leaderboardBtn';
        btn.className = 'toxic-btn toxic-btn-secondary';
        btn.textContent = 'Leaderboard';
        btn.onclick = showLeaderboard;
        devsBtn.insertAdjacentElement('afterend', btn);
    }

    // Game Over leaderboard button
    const gameOverBtn = document.getElementById('leaderboardGameOver');
    if (gameOverBtn) {
        gameOverBtn.onclick = showLeaderboard;
    }
}

// Показати leaderboard
async function showLeaderboard(isNewRecord = false) {
    const panel = document.getElementById('leaderboardPanel');
    const overlay = document.getElementById('leaderboardOverlay');
    const tableBody = document.getElementById('lbTableBody');

    if (!panel) return;

    // Показуємо панель
    panel.style.display = 'block';
    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';

    // Loading state
    tableBody.innerHTML = `
        <div class="lb-loading">
            <div class="lb-loading-spinner"></div>
            Loading leaderboard...
        </div>
    `;

    // Отримуємо позицію користувача
    let userPosition = { position: null, total: 0 };
    if (window.XPSystem && window.XPSystem.getUserPosition) {
        userPosition = await window.XPSystem.getUserPosition();
    }

    // Оновлюємо статистику гравця з позицією
    await updateStatsPanel(userPosition);

    // Завантажуємо дані
    const data = await fetchLeaderboard();
    console.log('Leaderboard data:', data);

    if (data === null) {
        tableBody.innerHTML = `
            <div class="lb-error">
                Failed to load leaderboard<br>
                <small style="color: #666;">Check your connection</small>
            </div>
        `;
        return;
    }

    if (data.length === 0) {
        tableBody.innerHTML = `
            <div class="lb-empty">
                No scores yet<br>
                <small>Be the first to play!</small>
            </div>
        `;
        return;
    }

    // Cache data for search (with original positions)
    cachedLeaderboardData = data.map((item, index) => ({
        ...item,
        originalPosition: index + 1
    }));
    cachedUserPosition = userPosition;

    // Clear search input
    const searchInput = document.getElementById('lbSearch');
    if (searchInput) searchInput.value = '';

    // Рендеримо таблицю
    renderLeaderboardTable(cachedLeaderboardData, userPosition);
}

function renderLeaderboardTable(data, userPosition = {}) {
    const tableBody = document.getElementById('lbTableBody');
    const currentUserId = window.getUserId ? window.getUserId() : null;

    tableBody.innerHTML = data.map((item, index) => {
        const position = item.originalPosition || (index + 1);
        const rank = getRankFromXP(item.score); // score is actually total_xp
        const avatarColor = getAvatarColor(position - 1);
        // Only highlight the PRIMARY current user ID (not old localStorage ID)
        const isCurrentUser = item.user_id === currentUserId;

        // Player name - show nickname if available, "YOU" for current user
        let playerName;
        if (isCurrentUser) {
            // Show nickname with star if available, otherwise just "YOU"
            const myNickname = item.nickname || (window.WalletAuth?.currentUser?.nickname);
            playerName = myNickname ? `★ ${myNickname} ★` : '★ YOU ★';
        } else if (item.nickname) {
            // Show registered nickname
            playerName = item.nickname;
        } else {
            // Fallback to anonymous name from user_id
            const shortId = item.user_id ? item.user_id.slice(-8) : `Player_${position}`;
            playerName = `Player_${shortId.slice(0, 6)}`;
        }

        const topClass = position <= 3 ? `top-${position}` : '';
        const currentUserClass = isCurrentUser ? 'current-user' : '';

        // Format time played
        const timePlayed = item.time_played || 0;
        const timeStr = timePlayed > 0 ? formatTime(timePlayed) : '-';
        const gamesStr = item.games_played > 0 ? item.games_played : '-';

        return `
            <div class="lb-table-row ${topClass} ${currentUserClass}">
                <span class="lb-rank-num">${position <= 3 ? '' : '#'}${position}</span>
                <div class="lb-player-info">
                    <div class="lb-player-avatar" style="background: ${isCurrentUser ? '#39ff14' : avatarColor};"></div>
                    <div>
                        <div class="lb-player-name">${playerName}</div>
                        <div class="lb-player-rank ${rank.class}">${rank.name}</div>
                    </div>
                </div>
                <span class="lb-score">${formatScore(item.score)}</span>
                <span class="lb-level">${rank.level}</span>
                <span class="lb-games">${gamesStr}</span>
                <span class="lb-time">${timeStr}</span>
            </div>
        `;
    }).join('');
}

async function updateStatsPanel(userPosition = {}) {
    // Get local stats first
    let stats = getLocalStats();

    // Try to get cloud stats if available
    if (window.XPSystem && typeof window.XPSystem.getUserStats === 'function') {
        try {
            const cloudStats = await window.XPSystem.getUserStats();
            // Merge cloud stats with local
            stats = {
                ...stats,
                gamesPlayed: cloudStats.games_played || stats.gamesPlayed,
                totalScore: cloudStats.total_score || stats.totalScore,
                timePlayed: cloudStats.time_played || stats.timePlayed || 0,
                avgScore: cloudStats.avg_score || stats.avgScore,
                totalXP: cloudStats.total_xp || stats.totalXP
            };
        } catch (e) {
            console.log('Could not fetch cloud stats:', e);
        }
    }

    console.log('updateStatsPanel - stats:', stats, 'position:', userPosition);
    const totalXP = stats.totalXP || 0;
    const rank = getRankFromXP(totalXP);

    // Оновлюємо елементи
    const avatar = document.getElementById('lbAvatar');
    const rankName = document.getElementById('lbRankName');
    const rankLevel = document.getElementById('lbRankLevel');
    const bestScore = document.getElementById('lbBestScore');
    const games = document.getElementById('lbGames');
    const avgScore = document.getElementById('lbAvgScore');
    const progressPercent = document.getElementById('lbProgressPercent');
    const progressFill = document.getElementById('lbProgressFill');
    const positionEl = document.getElementById('lbPosition');
    const timePlayedEl = document.getElementById('lbTimePlayed');

    if (avatar) avatar.style.background = rank.color;
    if (rankName) {
        rankName.textContent = rank.name;
        rankName.className = 'lb-rank-name ' + rank.class;
    }
    if (rankLevel) {
        const maxRank = rank.name === 'RITUAL MASTER' ? ' • MAX RANK!' : '';
        rankLevel.textContent = `Level ${rank.level}${maxRank}`;
    }
    // Show total XP instead of best score
    if (bestScore) bestScore.textContent = formatScore(totalXP);
    if (games) games.textContent = stats.gamesPlayed || 0;
    if (avgScore) avgScore.textContent = formatScore(stats.avgScore || 0);
    if (timePlayedEl) timePlayedEl.textContent = stats.timePlayed > 0 ? formatTime(stats.timePlayed) : '0s';

    // Show user's position
    if (positionEl) {
        if (userPosition.position) {
            positionEl.textContent = `#${userPosition.position} of ${userPosition.total}`;
        } else {
            positionEl.textContent = '-';
        }
    }

    // Прогрес до наступного рангу (XP-based)
    let progress = 0;
    if (totalXP >= 40000) {
        progress = 100;
    } else if (totalXP >= 5000) {
        progress = Math.round(((totalXP - 5000) / (40000 - 5000)) * 100);
    } else if (totalXP >= 1000) {
        progress = Math.round(((totalXP - 1000) / (5000 - 1000)) * 100);
    } else {
        progress = Math.round((totalXP / 1000) * 100);
    }

    if (progressPercent) progressPercent.textContent = progress + '%';
    if (progressFill) progressFill.style.width = progress + '%';
}

// Сховати leaderboard
function hideLeaderboard() {
    const panel = document.getElementById('leaderboardPanel');
    const overlay = document.getElementById('leaderboardOverlay');

    if (panel) panel.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
}

// Допоміжні функції
function formatScore(score) {
    return score.toLocaleString();
}

function formatTime(seconds) {
    if (seconds < 60) {
        return `${seconds}s`;
    } else if (seconds < 3600) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
}

// ==================== INTEGRATION ====================

// Ця функція викликається при game over
async function onGameOver(finalScore) {
    console.log('onGameOver called with:', finalScore);
    if (finalScore <= 0) return;

    // Відправляємо score
    const result = await submitScore(finalScore);

    // Якщо потрапили в TOP-10, показуємо leaderboard
    if (result && result.isTop10) {
        setTimeout(() => {
            showLeaderboard(true);
        }, 1500);
    }
}

// ==================== SEARCH ====================

let cachedLeaderboardData = [];
let cachedUserPosition = {};

function filterLeaderboard(searchTerm) {
    const tableBody = document.getElementById('lbTableBody');
    if (!tableBody || !cachedLeaderboardData.length) return;

    const term = searchTerm.toLowerCase().trim();

    if (!term) {
        // Show all data
        renderLeaderboardTable(cachedLeaderboardData, cachedUserPosition);
        return;
    }

    // Filter data
    const filtered = cachedLeaderboardData.filter((item, index) => {
        const currentUserId = window.getUserId ? window.getUserId() : null;
        const isCurrentUser = item.user_id === currentUserId;
        const playerName = isCurrentUser ? 'you' : `player_${item.user_id?.slice(-6) || index}`;
        const rank = getRankFromXP(item.score);

        return playerName.toLowerCase().includes(term) ||
               rank.name.toLowerCase().includes(term) ||
               item.score.toString().includes(term);
    });

    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <div class="lb-empty">
                No players found for "${searchTerm}"
            </div>
        `;
        return;
    }

    renderLeaderboardTable(filtered, cachedUserPosition);
}

// ==================== INITIALIZATION ====================

// Ініціалізуємо при завантаженні сторінки
document.addEventListener('DOMContentLoaded', () => {
    createLeaderboardUI();

    // Add search listener
    setTimeout(() => {
        const searchInput = document.getElementById('lbSearch');
        const searchBtn = document.getElementById('lbSearchBtn');

        if (searchBtn && searchInput) {
            searchBtn.addEventListener('click', () => {
                filterLeaderboard(searchInput.value);
            });

            // Also search on Enter key
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    filterLeaderboard(searchInput.value);
                }
            });
        }
    }, 100);

    console.log('Leaderboard module initialized');
});

// Експортуємо функції для використання в game.js
window.LeaderboardAPI = {
    fetchLeaderboard,
    submitScore,
    showLeaderboard,
    hideLeaderboard,
    onGameOver
};

// Глобальна функція для закриття (використовується в onclick)
window.hideLeaderboard = hideLeaderboard;
