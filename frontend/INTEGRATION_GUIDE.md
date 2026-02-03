# Інтеграція Leaderboard в RitualJump

## Крок 1: Додай файл leaderboard.js

Скопіюй файл `leaderboard.js` в корінь репозиторію гри (поруч з `game.js`).

## Крок 2: Підключи скрипт в index.html

Знайди в `index.html` рядок:
```html
<script src="game.js"></script>
```

Додай ПЕРЕД ним:
```html
<script src="leaderboard.js"></script>
```

Результат:
```html
<script src="leaderboard.js"></script>
<script src="game.js"></script>
```

## Крок 3: Модифікуй функцію gameOver() в game.js

Знайди функцію `gameOver()` і додай виклик leaderboard API:

**БУЛО:**
```javascript
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
}
```

**СТАЛО:**
```javascript
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
```

## Крок 4: Встанови правильний API_URL

Відкрий `leaderboard.js` і заміни:
```javascript
const API_URL = 'https://your-leaderboard.coolify.yourdomain.com';
```

На твій реальний URL з Coolify, наприклад:
```javascript
const API_URL = 'https://ritualjump-api.your-coolify-domain.com';
```

## Крок 5: Закоміть та запуш

```bash
git add .
git commit -m "Add leaderboard feature"
git push origin main
```

GitHub Pages автоматично оновиться.

---

## Що додається в UI:

1. **Кнопка "🏆 TOP 10"** в головному меню
2. **Панель leaderboard** з TOP-10 рекордів
3. **Автоматичне відправлення** score при завершенні гри
4. **Сповіщення** якщо гравець потрапив в TOP-10
