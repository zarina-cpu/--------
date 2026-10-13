require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { createClient } = require('@libsql/client');

async function migrate() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (!tursoUrl) {
    console.error('Ошибка: TURSO_DATABASE_URL не задана в backend/.env');
    process.exit(1);
  }

  console.log('Подключение к локальному PostgreSQL...');
  const pg = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT) || 5432,
  });

  console.log(`Подключение к Turso (${tursoUrl})...`);
  const turso = createClient({ url: tursoUrl, authToken: tursoToken });

  // 1. Применяем схему
  console.log('Применение схемы schema-turso.sql...');
  const sqlFile = path.resolve(__dirname, '../schema-turso.sql');
  const schemaSql = fs.readFileSync(sqlFile, 'utf8');
  const cleanSchemaSql = schemaSql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');
  const statements = cleanSchemaSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await turso.execute(stmt);
  }
  console.log('Схема готова.');

  // 2. Users
  console.log('Миграция users...');
  const { rows: users } = await pg.query('SELECT * FROM users ORDER BY id ASC');
  for (const u of users) {
    await turso.execute({
      sql: `INSERT OR REPLACE INTO users (id, email, phone, password_hash, oauth_provider, oauth_id, avatar_url, avatar_source, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        u.id,
        u.email,
        u.phone,
        u.password_hash,
        u.oauth_provider,
        u.oauth_id,
        u.avatar_url,
        u.avatar_source,
        u.created_at ? new Date(u.created_at).toISOString() : null,
      ],
    });
  }
  console.log(`Перенесено пользователей: ${users.length}`);

  // 3. Mood logs
  console.log('Миграция mood_logs...');
  const { rows: moods } = await pg.query('SELECT * FROM mood_logs ORDER BY id ASC');
  for (const m of moods) {
    await turso.execute({
      sql: `INSERT OR REPLACE INTO mood_logs (id, user_id, emoji, text_reason, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        m.id,
        m.user_id,
        m.emoji,
        m.text_reason,
        m.created_at ? new Date(m.created_at).toISOString() : null,
      ],
    });
  }
  console.log(`Перенесено записей настроения: ${moods.length}`);

  // 4. Habits
  console.log('Миграция habits...');
  const { rows: habits } = await pg.query('SELECT * FROM habits ORDER BY id ASC');
  for (const h of habits) {
    const logsJson = JSON.stringify(Array.isArray(h.logs) ? h.logs : []);
    const tmJson = JSON.stringify(h.thoughts_milestones || { '7': '', '14': '', '21': '' });
    await turso.execute({
      sql: `INSERT OR REPLACE INTO habits (id, user_id, title, type, logs, thoughts_milestones, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        h.id,
        h.user_id,
        h.title,
        h.type,
        logsJson,
        tmJson,
        h.created_at ? new Date(h.created_at).toISOString() : null,
      ],
    });
  }
  console.log(`Перенесено привычек: ${habits.length}`);

  // 5. Basics
  console.log('Миграция basics...');
  const { rows: basics } = await pg.query('SELECT * FROM basics ORDER BY id ASC');
  for (const b of basics) {
    await turso.execute({
      sql: `INSERT OR REPLACE INTO basics (id, user_id, type, title, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        b.id,
        b.user_id,
        b.type,
        b.title,
        b.created_at ? new Date(b.created_at).toISOString() : null,
      ],
    });
  }
  console.log(`Перенесено базовых пунктов: ${basics.length}`);

  // 6. Achievements
  console.log('Миграция achievements...');
  const { rows: achievements } = await pg.query('SELECT * FROM achievements ORDER BY id ASC');
  for (const a of achievements) {
    const snapJson = a.habit_snapshot ? JSON.stringify(a.habit_snapshot) : null;
    await turso.execute({
      sql: `INSERT OR REPLACE INTO achievements (id, user_id, title, type, habit_id, milestone_day, habit_snapshot, hidden_from_hall, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        a.id,
        a.user_id,
        a.title,
        a.type,
        a.habit_id,
        a.milestone_day,
        snapJson,
        a.hidden_from_hall ? 1 : 0,
        a.completed_at ? new Date(a.completed_at).toISOString() : null,
      ],
    });
  }
  console.log(`Перенесено достижений: ${achievements.length}`);

  // 7. Diary entries
  console.log('Миграция diary_entries...');
  const { rows: diary } = await pg.query('SELECT * FROM diary_entries ORDER BY id ASC');
  for (const d of diary) {
    await turso.execute({
      sql: `INSERT OR REPLACE INTO diary_entries (id, user_id, text_reflection, created_at)
            VALUES (?, ?, ?, ?)`,
      args: [
        d.id,
        d.user_id,
        d.text_reflection,
        d.created_at ? new Date(d.created_at).toISOString() : null,
      ],
    });
  }
  console.log(`Перенесено записей дневника: ${diary.length}`);

  // 8. Day journals
  console.log('Миграция day_journals...');
  const { rows: journals } = await pg.query(
    "SELECT id, user_id, to_char(entry_date, 'YYYY-MM-DD') AS entry_date, gratitude, stress_text, lesson_text, note_text, stress_entries, lesson_entries, note_entries, updated_at FROM day_journals ORDER BY id ASC"
  );
  for (const j of journals) {
    await turso.execute({
      sql: `INSERT OR REPLACE INTO day_journals (id, user_id, entry_date, gratitude, stress_text, lesson_text, note_text, stress_entries, lesson_entries, note_entries, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        j.id,
        j.user_id,
        j.entry_date,
        JSON.stringify(j.gratitude || []),
        j.stress_text || '',
        j.lesson_text || '',
        j.note_text || '',
        JSON.stringify(j.stress_entries || []),
        JSON.stringify(j.lesson_entries || []),
        JSON.stringify(j.note_entries || []),
        j.updated_at ? new Date(j.updated_at).toISOString() : null,
      ],
    });
  }
  console.log(`Перенесено дневников дня: ${journals.length}`);

  await pg.end();
  console.log('\n🎉 Все данные успешно перенесены из PostgreSQL в Turso!');
}

migrate().catch((err) => {
  console.error('Ошибка при миграции:', err);
  process.exit(1);
});
