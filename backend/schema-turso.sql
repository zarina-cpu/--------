-- Turso / libSQL (SQLite) Schema for «Мой Путь»

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    password_hash TEXT,
    oauth_provider TEXT,
    oauth_id TEXT,
    avatar_url TEXT,
    avatar_source TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx
  ON users (phone)
  WHERE phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_oauth_provider_id_idx
  ON users (oauth_provider, oauth_id)
  WHERE oauth_provider IS NOT NULL AND oauth_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS mood_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    text_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('will_do', 'wont_do')),
    logs TEXT DEFAULT '[]',
    thoughts_milestones TEXT DEFAULT '{"7": "", "14": "", "21": ""}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS basics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('want', 'can')),
    title TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('habit_archive', 'manual_achievement', 'habit_milestone')),
    habit_id INTEGER REFERENCES habits(id) ON DELETE SET NULL,
    milestone_day INTEGER,
    habit_snapshot TEXT,
    hidden_from_hall INTEGER NOT NULL DEFAULT 0,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS achievements_habit_milestone_uidx
  ON achievements (user_id, habit_id, milestone_day)
  WHERE type = 'habit_milestone' AND habit_id IS NOT NULL AND milestone_day IS NOT NULL;

CREATE TABLE IF NOT EXISTS diary_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    text_reflection TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS day_journals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_date TEXT NOT NULL,
    gratitude TEXT NOT NULL DEFAULT '[]',
    stress_text TEXT NOT NULL DEFAULT '',
    lesson_text TEXT NOT NULL DEFAULT '',
    note_text TEXT NOT NULL DEFAULT '',
    stress_entries TEXT NOT NULL DEFAULT '[]',
    lesson_entries TEXT NOT NULL DEFAULT '[]',
    note_entries TEXT NOT NULL DEFAULT '[]',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, entry_date)
);
