CREATE TABLE IF NOT EXISTS day_journals (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    gratitude JSONB NOT NULL DEFAULT '[]',
    stress_text TEXT NOT NULL DEFAULT '',
    lesson_text TEXT NOT NULL DEFAULT '',
    note_text TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, entry_date)
);
