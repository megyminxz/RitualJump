const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Шлях до файлу з даними
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'scores.json');

// Створюємо папку data якщо не існує
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ініціалізуємо файл якщо не існує
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

// Функції для роботи з даними
function loadScores() {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

function saveScores(scores) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(scores, null, 2));
}

// CORS - дозволяємо всі домени (для простоти)
app.use(cors());
app.use(express.json());

console.log('Data file:', DATA_FILE);

// ==================== API ENDPOINTS ====================

// GET /leaderboard - отримати ТОП-10
app.get('/leaderboard', (req, res) => {
    try {
        const scores = loadScores();
        const top10 = scores
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);

        res.json({
            success: true,
            data: top10
        });
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch leaderboard'
        });
    }
});

// POST /score - додати новий рекорд
app.post('/score', (req, res) => {
    try {
        const { score } = req.body;

        // Валідація
        if (typeof score !== 'number') {
            return res.status(400).json({
                success: false,
                error: 'Score must be a number'
            });
        }

        // Фільтрація невалідних значень
        if (score <= 0 || score > 1e9) {
            return res.status(400).json({
                success: false,
                error: 'Invalid score value'
            });
        }

        const validScore = Math.floor(score);
        const scores = loadScores();

        // Додаємо новий score
        const newEntry = {
            score: validScore,
            created_at: new Date().toISOString()
        };
        scores.push(newEntry);

        // Зберігаємо (тримаємо тільки топ 1000 для економії місця)
        const sorted = scores.sort((a, b) => b.score - a.score).slice(0, 1000);
        saveScores(sorted);

        // Позиція в рейтингу
        const position = sorted.findIndex(s => s.score === validScore && s.created_at === newEntry.created_at) + 1;

        res.json({
            success: true,
            data: {
                score: validScore,
                position: position,
                isTop10: position <= 10
            }
        });
    } catch (error) {
        console.error('Error saving score:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save score'
        });
    }
});

// GET /stats
app.get('/stats', (req, res) => {
    try {
        const scores = loadScores();
        const total = scores.length;
        const avg = total > 0 ? Math.round(scores.reduce((a, b) => a + b.score, 0) / total) : 0;
        const best = total > 0 ? Math.max(...scores.map(s => s.score)) : 0;

        res.json({
            success: true,
            data: {
                totalGames: total,
                averageScore: avg,
                bestScore: best
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root
app.get('/', (req, res) => {
    res.json({
        name: 'RitualJump Leaderboard API',
        version: '1.0.0',
        endpoints: {
            'GET /leaderboard': 'Get TOP-10 scores',
            'POST /score': 'Submit a new score',
            'GET /stats': 'Get statistics',
            'GET /health': 'Health check'
        }
    });
});

// Запуск
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
