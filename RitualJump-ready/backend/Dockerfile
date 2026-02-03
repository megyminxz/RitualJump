# Node.js LTS з підтримкою better-sqlite3
FROM node:20-alpine

# Встановлюємо залежності для компіляції better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Копіюємо package files
COPY package*.json ./

# Встановлюємо залежності
RUN npm ci --only=production

# Копіюємо код
COPY . .

# Створюємо папку для даних
RUN mkdir -p /app/data

# Порт
EXPOSE 3000

# Запуск
CMD ["node", "server.js"]
