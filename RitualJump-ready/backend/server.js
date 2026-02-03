const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Дозволені домени для CORS
const ALLOWED_ORIGINS = [
    'https://megyminxz.github.io',
    'http://localhost:5500',      // Live Server для розробки
    'http://127.0.0.1:5500'
];

// CORS налаштування
app.use(cors({
    origin: function(origin, callback) {
        // Дозволяємо запити без origin (Postman, curl)
        if (!origin) return callback(null, true);

        if (ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS not allowed'));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Ініціалізація SQLite бази даних
const dbPath = path.join(__dirname, 'data', 'leaderboard.db');
const fs = require('fs');

// Створюємо папку data якщо не існує
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

const db = new Database(dbPath);

// Створюємо таблицю якщо не існує
db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        score INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Створюємо індекс для швидкого сортування
db.exec(`
    CREATE INDEX IF NOT EXISTS idx_score ON scores(score DESC)
`);

console.log('Database initialized at:', dbPath);

// ==================== API ENDPOINTS ====================

// GET /leaderboard - отримати ТОП-10
app.get('/leaderboard', (req, res) => {
    try {
        const stmt = db.prepare(`
            SELECT score, created_at
            FROM scores
            ORDER BY score DESC
            LIMIT 10
        `);
        const leaderboard = stmt.all();

        res.json({
            success: true,
            data: leaderboard
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
                error: 'Invalid score value (must be > 0 and < 1 billion)'
            });
        }

        // Округлюємо до цілого числа
        const validScore = Math.floor(score);

        // Зберігаємо в базу
        const stmt = db.prepare('INSERT INTO scores (score) VALUES (?)');
        const result = stmt.run(validScore);

        // Перевіряємо позицію в рейтингу
        const positionStmt = db.prepare(`
            SELECT COUNT(*) as position
            FROM scores
            WHERE score > ?
        `);
        const { position } = positionStmt.get(validScore);

        res.json({
            success: true,
            data: {
                id: result.lastInsertRowid,
                score: validScore,
                position: position + 1,
                isTop10: position < 10
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

// GET /stats - статистика (опціонально)
app.get('/stats', (req, res) => {
    try {
        const totalStmt = db.prepare('SELECT COUNT(*) as total FROM scores');
        const avgStmt = db.prepare('SELECT AVG(score) as average FROM scores');
        const maxStmt = db.prepare('SELECT MAX(score) as best FROM scores');

        const { total } = totalStmt.get();
        const { average } = avgStmt.get();
        const { best } = maxStmt.get();

        res.json({
            success: true,
            data: {
                totalGames: total,
                averageScore: Math.round(average || 0),
                bestScore: best || 0
            }
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch stats'
        });
    }
});

// Health check для Coolify
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'RitualJump Leaderboard API',
        version: '1.0.0',
        endpoints: {
            'GET /leaderboard': 'Get TOP-10 scores',
            'POST /score': 'Submit a new score',
            'GET /stats': 'Get game statistics',
            'GET /health': 'Health check'
        }
    });
});

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════════════╗
║   RitualJump Leaderboard API                   ║
║   Running on port ${PORT}                          ║
║   http://localhost:${PORT}                         ║
╚════════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down...');
    db.close();
    process.exit(0);
});
