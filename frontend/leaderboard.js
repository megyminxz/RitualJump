// ==================== LEADERBOARD MODULE ====================
// Цей файл додає leaderboard функціонал до гри RitualJump

// !!! ВАЖЛИВО: Заміни цей URL на свій Coolify URL !!!
const API_URL = 'https://your-leaderboard.coolify.yourdomain.com';

// ==================== API FUNCTIONS ====================

// Отримати ТОП-10 з сервера
async function fetchLeaderboard() {
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
            return null;
        }
    } catch (error) {
        console.error('Failed to fetch leaderboard:', error);
        return null;
    }
}

// Відправити score на сервер
async function submitScore(score) {
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
            return result.data;
        } else {
            console.error('Submit error:', result.error);
            return null;
        }
    } catch (error) {
        console.error('Failed to submit score:', error);
        return null;
    }
}

// ==================== UI FUNCTIONS ====================

// Створити HTML для leaderboard панелі
function createLeaderboardUI() {
    // Стилі для leaderboard
    const styles = document.createElement('style');
    styles.textContent = `
        #leaderboardPanel {
            display: none;
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.95);
            border: 2px solid #39ff14;
            padding: 20px;
            z-index: 1000;
            min-width: 300px;
            max-width: 90vw;
            box-shadow: 0 0 30px rgba(57, 255, 20, 0.5);
        }

        #leaderboardPanel h2 {
            color: #39ff14;
            text-align: center;
            margin: 0 0 15px 0;
            font-family: 'Orbitron', monospace;
            font-size: clamp(1.2rem, 4vw, 1.8rem);
            text-shadow: 0 0 10px #39ff14;
        }

        #leaderboardList {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        #leaderboardList li {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            margin: 4px 0;
            background: rgba(57, 255, 20, 0.1);
            border-left: 3px solid #39ff14;
            font-family: 'Orbitron', monospace;
            color: #fff;
            font-size: clamp(0.8rem, 3vw, 1rem);
        }

        #leaderboardList li:first-child {
            background: rgba(255, 215, 0, 0.2);
            border-left-color: gold;
        }

        #leaderboardList li:nth-child(2) {
            background: rgba(192, 192, 192, 0.2);
            border-left-color: silver;
        }

        #leaderboardList li:nth-child(3) {
            background: rgba(205, 127, 50, 0.2);
            border-left-color: #cd7f32;
        }

        .lb-rank {
            color: #39ff14;
            font-weight: bold;
            margin-right: 10px;
        }

        .lb-score {
            color: #39ff14;
        }

        #leaderboardClose {
            display: block;
            width: 100%;
            margin-top: 15px;
            padding: 10px;
            background: transparent;
            border: 2px solid #39ff14;
            color: #39ff14;
            font-family: 'Orbitron', monospace;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        #leaderboardClose:hover {
            background: #39ff14;
            color: #000;
        }

        #leaderboardBtn {
            position: absolute;
            top: 10px;
            right: 10px;
            padding: 8px 15px;
            background: transparent;
            border: 2px solid #39ff14;
            color: #39ff14;
            font-family: 'Orbitron', monospace;
            font-size: 0.8rem;
            cursor: pointer;
            z-index: 100;
            transition: all 0.3s ease;
        }

        #leaderboardBtn:hover {
            background: #39ff14;
            color: #000;
        }

        .lb-loading {
            text-align: center;
            color: #39ff14;
            padding: 20px;
            font-family: 'Orbitron', monospace;
        }

        .lb-error {
            text-align: center;
            color: #ff3939;
            padding: 20px;
            font-family: 'Orbitron', monospace;
        }

        .lb-empty {
            text-align: center;
            color: #888;
            padding: 20px;
            font-family: 'Orbitron', monospace;
        }

        #newRecordBadge {
            display: none;
            background: gold;
            color: #000;
            padding: 5px 10px;
            font-size: 0.8rem;
            text-align: center;
            margin-bottom: 10px;
            animation: pulse 1s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }

        #leaderboardOverlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            z-index: 999;
        }
    `;
    document.head.appendChild(styles);

    // Overlay
    const overlay = document.createElement('div');
    overlay.id = 'leaderboardOverlay';
    overlay.onclick = hideLeaderboard;
    document.body.appendChild(overlay);

    // Панель leaderboard
    const panel = document.createElement('div');
    panel.id = 'leaderboardPanel';
    panel.innerHTML = `
        <h2>🏆 TOP 10</h2>
        <div id="newRecordBadge">NEW HIGH SCORE!</div>
        <ul id="leaderboardList">
            <li class="lb-loading">Loading...</li>
        </ul>
        <button id="leaderboardClose">CLOSE</button>
    `;
    document.body.appendChild(panel);

    // Кнопка відкриття (додається до startMenu)
    const startMenu = document.getElementById('startMenu');
    if (startMenu) {
        const btn = document.createElement('button');
        btn.id = 'leaderboardBtn';
        btn.textContent = '🏆 TOP 10';
        btn.onclick = showLeaderboard;
        startMenu.appendChild(btn);
    }

    // Close button
    document.getElementById('leaderboardClose').onclick = hideLeaderboard;
}

// Показати leaderboard
async function showLeaderboard(isNewRecord = false) {
    const panel = document.getElementById('leaderboardPanel');
    const overlay = document.getElementById('leaderboardOverlay');
    const list = document.getElementById('leaderboardList');
    const badge = document.getElementById('newRecordBadge');

    if (!panel) return;

    // Показуємо панель
    panel.style.display = 'block';
    overlay.style.display = 'block';

    // New record badge
    badge.style.display = isNewRecord ? 'block' : 'none';

    // Loading state
    list.innerHTML = '<li class="lb-loading">Loading...</li>';

    // Завантажуємо дані
    const data = await fetchLeaderboard();

    if (data === null) {
        list.innerHTML = '<li class="lb-error">Failed to load leaderboard</li>';
        return;
    }

    if (data.length === 0) {
        list.innerHTML = '<li class="lb-empty">No scores yet. Be the first!</li>';
        return;
    }

    // Рендеримо список
    list.innerHTML = data.map((item, index) => `
        <li>
            <span>
                <span class="lb-rank">#${index + 1}</span>
                ${getMedal(index)}
            </span>
            <span class="lb-score">${formatScore(item.score)}</span>
        </li>
    `).join('');
}

// Сховати leaderboard
function hideLeaderboard() {
    const panel = document.getElementById('leaderboardPanel');
    const overlay = document.getElementById('leaderboardOverlay');

    if (panel) panel.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
}

// Допоміжні функції
function getMedal(index) {
    const medals = ['🥇', '🥈', '🥉'];
    return medals[index] || '';
}

function formatScore(score) {
    return score.toLocaleString();
}

// ==================== INTEGRATION ====================

// Ця функція викликається при game over
async function onGameOver(finalScore) {
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

// ==================== INITIALIZATION ====================

// Ініціалізуємо при завантаженні сторінки
document.addEventListener('DOMContentLoaded', () => {
    createLeaderboardUI();
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
