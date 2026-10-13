ТЕХНИЧЕСКАЯ СПЕЦИФИКАЦИЯ (SPECIFICATION)
Проект: Психологический трекер «Мой Путь» (MVP)
Стек технологий:
Frontend: React 18+, Axios, Tailwind CSS (Mobile-first).
Backend: Node.js, Express, JSON Web Tokens (JWT), Bcrypt.js (хеширование).
Database: PostgreSQL 14+.
1. Архитектура базы данных (PostgreSQL)
Ниже представлены точные SQL-схемы для создания таблиц. Все сущности, кроме таблицы пользователей, связаны внешним ключом user_id с каскадным удалением (ON DELETE CASCADE).

-- 1. Таблица пользователей
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Записи настроения
CREATE TABLE mood_logs (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(50) NOT NULL,
    text_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Привычки
CREATE TABLE habits (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('will_do', 'wont_do')),
    logs TEXT[] DEFAULT '{}', -- Массив строк ISO 8601 (например, ['2026-10-10T21:00:00.000Z'])
    thoughts_milestones JSONB DEFAULT '{"7": "", "14": "", "21": ""}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Личные базисы (Хочу / Могу)
CREATE TABLE basics (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('want', 'can')),
    title TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Раздел "Я сделала" (Зал славы)
CREATE TABLE achievements (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('habit_archive', 'manual_achievement')),
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Дневник мыслей
CREATE TABLE diary_entries (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    text_reflection TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

2. Спецификация API Эндпоинтов (Node.js / Express)
Все эндпоинты, кроме /api/auth/*, должны быть защищены middleware авторизации authenticateToken, проверяющим JWT в заголовке Authorization: Bearer <TOKEN>. ID авторизованного пользователя извлекается в req.user.id.
2.1 Аутентификация
POST /api/auth/register
Тело запроса: { "email": "user@example.com", "password": "securepassword" }
Действие: Хеширует пароль через bcrypt, создает запись в users.
Ответ (201): { "message": "User registered successfully" }
POST /api/auth/login
Тело запроса: { "email": "user@example.com", "password": "securepassword" }
Действие: Проверяет пароль, генерирует JWT-токен (срок действия: 30d).
Ответ (200): { "token": "jwt_access_token_string" }

2.2 Работа с данными пользователя
GET /api/user/data
Действие: Агрегирует и возвращает абсолютно все данные пользователя из всех таблиц для минимизации количества запросов из SPA.
Ответ (200):
json
{
  "moods": [],
  "habits": [],
  "basics": [],
  "achievements": [],
  "diary": []
}

 
POST /api/moods — Добавить настроение. Тело: { "emoji": "😊", "text_reason": "Текст" }
POST /api/habits — Создать привычку. Тело: { "title": "Медитация", "type": "will_do" }
POST /api/basics — Добавить базис. Тело: { "title": "Текст", "type": "want" }
POST /api/achievements — Зафиксировать ручную победу. Тело: { "title": "Текст", "type": "manual_achievement" }
POST /api/diary — Запись в блокнот. Тело: { "text_reflection": "Текст" }
2.3 Специфическая бизнес-логика привычек
PUT /api/habits/:id/log
Действие: Добавляет текущую ISO-строку времени (new Date().toISOString()) в массив logs указанной привычки.
PUT /api/habits/:id/milestone
Тело запроса: { "day": 7, "text": "Новые инсайты" }
Действие: Обновляет поле thoughts_milestones по ключу дня.
DELETE /api/habits/:id/archive
Действие: В рамках одной транзакции переносит привычку (создает запись в achievements с типом habit_archive) и удаляет её из таблицы habits.
DELETE /api/user/reset
Действие: Каскадно удаляет все связанные с user_id записи во всех таблицах, кроме самой учетной записи в users.

3. Спецификация Фронтенда (React SPA)
3.1 Система роутинга и хранения сессии
Авторизация проверяется при запуске приложения: ищется token в localStorage.
Если токен найден, он автоматически подставляется в заголовки Axios: axios.defaults.headers.common['Authorization'] = 'Bearer ' + token. Вызывается метод GET /api/user/data для наполнения глобального состояния приложения.
Если токен отсутствует или сервер возвращает ошибку 401/403, состояние currentScreen принудительно переключается на 'login'.
3.2 Карта экранов (Переключатель состояний)
Вход (login): Чистая форма (Email, Password), переключатель режимов «Войти» / «Зарегистрироваться». При успехе токен пишется в localStorage, срабатывает редирект на дашборд.
Главный (main): Дашборд. Плиточная структура. На смартфонах блоки выстраиваются вертикально в одну колонку.
Виджет настроения: Кнопки-смайлы, инпут для текста, кнопка «Сохранить». Ниже — лента из 3 последних записей.
Виджет привычек: Список активных привычек. У каждой плитки есть кнопка «⚡ Отметить» и «Убрать в архив». Внутри плитки — 3 инпута для чекпоинтов (7, 14, 21 день).
Блок базисов: Две параллельные колонки (Хочу / Могу) с мини-формами для быстрой отправки в базу.
Зал славы (hall): Вывод ленты достижений из таблицы achievements. Форма ручного добавления достижений.
Аналитика (analytics): Сетка-таймлайн из 15 плиток, представляющих последние 15 дней (от сегодня вглубь истории). Каждая плитка отображает день недели, число и месяц.
Дневник (diary): Полноэкранный текстовый блокнот (textarea). Кнопка отправки сохраняет размышление, очищает поле и добавляет запись в общую ленту мыслей ниже.
Настройки (settings): Отображает email текущего пользователя. Содержит деструктивную кнопку «Стереть все данные» (вызывает DELETE /api/user/reset) и кнопку «Выйти из аккаунта».

4. Алгоритм сквозной фильтрации в Аналитике
При клике на любую плитку дня в календаре рассчитывается целевая дата TargetDate (без учета времени). Открывается модальное окно, выполняющее синхронную фильтрацию массивов, уже загруженных в стейт React:
Настроение: Массив moods фильтруется по условию new Date(mood.created_at).toDateString() === TargetDate.toDateString(). Выводятся эмодзи, причина и время в формате ЧЧ:ММ.
Привычки: Массив habits сканируется на вхождение дат. Элемент попадает в выборку, если внутри его массива logs есть хотя бы одна строка, у которой new Date(logTimestamp).toDateString() === TargetDate.toDateString().
Зал славы: Массив achievements фильтруется по совпадению completed_at с выбранным днем.
Дневник: Массив diary фильтруется по совпадению created_at с выбранным днем.

5. UI/UX и Адаптивность (Tailwind)
Mobile-First Контракт: Базовые стили пишутся для мобильных устройств (например, grid grid-cols-1). Для десктопов применяются модификаторы (md:grid-cols-3, md:flex-row).
Цветовой код: Фон приложения — bg-slate-50, карточки — bg-white со скруглениями rounded-2xl и легкой тенью shadow-sm. Тип привычки will_do подсвечивается изумрудным (text-emerald-700, bg-emerald-50), wont_do — розовым (text-rose-700, bg-rose-50). Кнопки действий — bg-indigo-600 с плавным переходом transition-colors hover:bg-indigo-700.
📊 Сравнительная матрица архитектуры MVP
Сущность БД Компонент API Экран Фронтенда Отображение в Аналитике (Модальное окно)
users /api/auth/* login / settings Не отображается (Системный уровень)
mood_logs /api/moods main (Виджет настроения) Да (Вывод: Эмодзи + Текст + Точное время ЧЧ:ММ)
habits /api/habits/* main (Управление привычками) Да (Вывод: Название выполненной привычки)
basics /api/basics main (Колонки Хочу/Могу) Не отображается (Это постоянный базис личности)
achievements /api/achievements hall (Зал славы) Да (Вывод: Архивированные марафоны и ручные победы)
diary_entries /api/diary diary (Блокнот рефлексии) Да (Вывод: Полный текст инсайтов/мыслей за день)

1. Файл конфигурации переменных окружения (.env)

env
# --- НАСТРОЙКИ СЕРВЕРА NODE.JS ---
PORT=5000
NODE_ENV=development

# --- КОНФИГУРАЦИЯ БАЗЫ ДАННЫХ POSTGRESQL ---
# Замените значения ниже на параметры вашей БД
DB_USER=postgres
DB_HOST=localhost
DB_NAME=my_way_db
DB_PASSWORD=your_secure_password
DB_PORT=5432

# --- БЕЗОПАСНОСТЬ И АУТЕНТИФИКАЦИЯ ---
# Секретный ключ для подписи и валидации JWT токенов
JWT_SECRET=super_secret_key_for_my_way_psychological_tracker_2026

# Срок действия токена сессии
JWT_EXPIRES_IN=30d
Используйте код с осторожностью.

 
 
📋 Сводная таблица структуры созданного проекта
После выполнения команд и создания конфигурационных файлов, структура вашего проекта в дереве проводника Cursor будет выглядеть следующим образом:
Директория / Файл Назначение в архитектуре трекера Ключевые зависимости
backend/server.js Главный файл Express-сервера (роуты API, контроллеры) express
backend/db.js Пул подключений к PostgreSQL с использованием .env pg
backend/middleware.js Защита эндпоинтов, валидация и расшифровка JWT jsonwebtoken
backend/.env Изолированное хранение паролей БД и секретов JWT dotenv
frontend/src/App.jsx React-клиент (6 экранов, стейты, Axios-запросы, Tailwind) react, axios
frontend/tailwind.config.js Файл конфигурации стилей и адаптивной сетки tailwindcss

