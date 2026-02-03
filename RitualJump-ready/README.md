# RitualJump Leaderboard System

Повна система leaderboard для гри RitualJump з хостингом на Coolify.

## 📁 Структура проєкту

```
ritual platform/
├── backend/
│   ├── server.js          # Express API сервер
│   ├── package.json        # Node.js залежності
│   ├── Dockerfile          # Docker образ для Coolify
│   ├── docker-compose.yml  # Для локального тестування
│   ├── .dockerignore
│   └── data/
│       └── leaderboard.db  # SQLite база (створюється автоматично)
│
├── frontend/
│   ├── leaderboard.js      # Модуль для гри
│   └── INTEGRATION_GUIDE.md
│
└── README.md               # Ця документація
```

---

## 1. ДЕПЛОЙ БЕКЕНДУ НА COOLIFY

### 1.1 Підготовка

1. Увійди в панель Coolify: `https://your-coolify-instance.com`
2. Переконайся що маєш активний сервер (Server)

### 1.2 Створення GitHub репозиторію для бекенду

```bash
# Створи новий репозиторій на GitHub (наприклад: ritualjump-api)
# Потім:

cd "C:\ritual platform\backend"
git init
git add .
git commit -m "Initial commit: Leaderboard API"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ritualjump-api.git
git push -u origin main
```

### 1.3 Деплой в Coolify

1. **Projects → New Project** (або вибери існуючий)

2. **+ New → Public Repository**
   - Repository URL: `https://github.com/YOUR_USERNAME/ritualjump-api`
   - Branch: `main`
   - Build Pack: **Dockerfile**

3. **Configuration:**
   - Port: `3000`
   - Health Check Path: `/health`

4. **Domains:**
   - Додай домен або використай згенерований Coolify
   - Приклад: `ritualjump-api.your-domain.com`
   - Увімкни **HTTPS** (Let's Encrypt)

5. **Persistent Storage (ВАЖЛИВО!):**
   - Source Path: `/app/data`
   - Destination: Новий Volume або вказати шлях
   - Це збереже базу даних між деплоями

6. **Deploy** → Натисни кнопку

### 1.4 Перевірка

Після деплою перевір:

```bash
# Має повернути JSON з інформацією про API
curl https://ritualjump-api.your-domain.com/

# Має повернути порожній leaderboard
curl https://ritualjump-api.your-domain.com/leaderboard

# Тест відправки score
curl -X POST https://ritualjump-api.your-domain.com/score \
  -H "Content-Type: application/json" \
  -d '{"score": 100}'
```

---

## 2. ІНТЕГРАЦІЯ ФРОНТЕНДУ

### 2.1 Клонуй репозиторій гри

```bash
git clone https://github.com/megyminxz/RitualJump.git
cd RitualJump
```

### 2.2 Додай leaderboard.js

Скопіюй файл `frontend/leaderboard.js` в корінь репозиторію гри.

### 2.3 Встанови API URL

Відкрий `leaderboard.js` і заміни:
```javascript
const API_URL = 'https://your-leaderboard.coolify.yourdomain.com';
```

На твій реальний Coolify URL:
```javascript
const API_URL = 'https://ritualjump-api.your-domain.com';
```

### 2.4 Підключи скрипт

Відкрий `index.html` і додай перед `<script src="game.js"></script>`:

```html
<script src="leaderboard.js"></script>
```

### 2.5 Модифікуй game.js

Знайди функцію `gameOver()` і додай в кінці:

```javascript
// === LEADERBOARD INTEGRATION ===
if (window.LeaderboardAPI && score > 0) {
    window.LeaderboardAPI.onGameOver(score);
}
```

### 2.6 Деплой на GitHub Pages

```bash
git add .
git commit -m "Add leaderboard feature"
git push origin main
```

GitHub Pages автоматично оновиться через 1-2 хвилини.

---

## 3. COOLIFY - ДЕТАЛЬНІ НАЛАШТУВАННЯ

### 3.1 Змінні середовища

В Coolify → твій проєкт → **Environment Variables**:

```
PORT=3000
NODE_ENV=production
```

### 3.2 Автоматичний редеплой

В Coolify → твій проєкт → **Webhooks**:
- Скопіюй webhook URL
- В GitHub репозиторії: Settings → Webhooks → Add webhook
- Payload URL: вставити URL з Coolify
- Content type: application/json
- Events: Just the push event

Тепер кожен push автоматично деплоїть нову версію.

### 3.3 Моніторинг

- **Logs**: Coolify → проєкт → Logs
- **Metrics**: Coolify → проєкт → Metrics (CPU, Memory)
- **Health**: API endpoint `/health`

---

## 4. ЛОКАЛЬНЕ ТЕСТУВАННЯ

### 4.1 Без Docker

```bash
cd backend
npm install
npm start
```

Сервер запуститься на `http://localhost:3000`

### 4.2 З Docker

```bash
cd backend
docker-compose up --build
```

### 4.3 Тестування API

```bash
# Отримати leaderboard
curl http://localhost:3000/leaderboard

# Додати score
curl -X POST http://localhost:3000/score \
  -H "Content-Type: application/json" \
  -d '{"score": 150}'

# Статистика
curl http://localhost:3000/stats
```

---

## 5. API ДОКУМЕНТАЦІЯ

### GET /leaderboard

Повертає TOP-10 рекордів.

**Response:**
```json
{
  "success": true,
  "data": [
    { "score": 500, "created_at": "2024-01-15T10:30:00.000Z" },
    { "score": 450, "created_at": "2024-01-15T09:20:00.000Z" }
  ]
}
```

### POST /score

Відправляє новий рекорд.

**Request:**
```json
{ "score": 123 }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 42,
    "score": 123,
    "position": 5,
    "isTop10": true
  }
}
```

### GET /stats

**Response:**
```json
{
  "success": true,
  "data": {
    "totalGames": 1500,
    "averageScore": 85,
    "bestScore": 500
  }
}
```

### GET /health

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## 6. CORS НАЛАШТУВАННЯ

Бекенд дозволяє запити тільки з:
- `https://megyminxz.github.io`
- `http://localhost:5500` (для розробки)
- `http://127.0.0.1:5500`

Щоб додати інші домени, відредагуй `ALLOWED_ORIGINS` в `server.js`.

---

## 7. TROUBLESHOOTING

### Помилка CORS

**Симптом:** В консолі браузера: `CORS policy: No 'Access-Control-Allow-Origin'`

**Рішення:** Додай домен гри в `ALLOWED_ORIGINS` в `server.js` і передеплой.

### База даних не зберігається

**Симптом:** Після редеплою leaderboard порожній.

**Рішення:** Переконайся що Persistent Storage налаштований в Coolify для `/app/data`.

### API не відповідає

1. Перевір логи в Coolify
2. Перевір `/health` endpoint
3. Перевір що порт 3000 правильно налаштований

### Score не відправляється

1. Відкрий DevTools → Network
2. Перевір запит до `/score`
3. Перевір що API_URL правильний в `leaderboard.js`

---

## 8. ЧЕКЛІСТ "ВСЕ ПРАЦЮЄ"

- [ ] `curl https://your-api/health` повертає `{"status":"ok"}`
- [ ] `curl https://your-api/leaderboard` повертає JSON
- [ ] POST на `/score` зберігає дані
- [ ] Кнопка "🏆 TOP 10" видна в меню гри
- [ ] Leaderboard завантажується при натисканні
- [ ] Score відправляється після game over (перевір в Network tab)
- [ ] При потраплянні в TOP-10 показується панель

---

## 9. БЕЗПЕКА

- ❌ Без авторизації (as requested)
- ✅ Валідація score (>0, <1 billion)
- ✅ CORS обмеження
- ✅ Rate limiting можна додати через nginx в Coolify
- ⚠️ Теоретично можна спамити fake scores - для простої гри це OK

---

## 10. МАСШТАБУВАННЯ

SQLite достатньо для тисяч записів. Якщо потрібно більше:

1. Замінити SQLite на PostgreSQL (Coolify підтримує)
2. Додати Redis для кешування
3. Додати rate limiting

Для звичайної браузерної гри поточне рішення більш ніж достатнє.
