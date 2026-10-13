require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const {
  ensureHabitMilestoneAchievements,
  syncAllHabitMilestonesForUser,
} = require('./habitMilestones');
const { normalizePhone, phonePlaceholderEmail } = require('./phoneUtils');
const { authenticateToken } = require('./middleware');
const { setupOAuth } = require('./oauth');
const {
  validateAvatarUrl,
  setManualAvatar,
  clearUserAvatar,
} = require('./avatar');
const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 15 * 60 * 1000 },
  })
);
app.use(passport.initialize());
app.use(passport.session());

function signToken(userId) {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
}

function normalizeGratitude(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 10)
    .map((item) => ({
      what: String(item?.what ?? '').trim(),
      whom: String(item?.whom ?? '').trim(),
    }))
    .filter((item) => item.what || item.whom);
}

function parseEntryDate(raw) {
  if (!raw) {
    return new Date().toISOString().slice(0, 10);
  }
  const s = String(raw).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return null;
  }
  return s;
}

function formatEntryDateFromDb(value) {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

function stableJournalEntryId(rawId, index, prefix) {
  if (rawId != null && String(rawId) !== '') {
    return String(rawId);
  }
  return `${prefix}-${index}`;
}

function normalizeGratitudeStored(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      const what = String(item?.what ?? '').trim();
      const whom = String(item?.whom ?? '').trim();
      if (!what && !whom) return null;
      return {
        what,
        whom,
        id: stableJournalEntryId(item?.id, index, 'gratitude'),
        created_at: item?.created_at || null,
      };
    })
    .filter(Boolean);
}

function parseTextEntries(raw, legacyText) {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((item, index) => ({
        id: stableJournalEntryId(item?.id, index, 'entry'),
        text: String(item?.text ?? '').trim(),
        created_at: item?.created_at || null,
      }))
      .filter((item) => item.text);
  }
  const legacy = String(legacyText ?? '').trim();
  if (legacy) {
    return [{ id: 'legacy', text: legacy, created_at: null }];
  }
  return [];
}

function resolveJournalEntryIndex(list, entryId, idPrefix) {
  const id = String(entryId);
  const byId = list.findIndex((item) => item?.id != null && String(item.id) === id);
  if (byId >= 0) return byId;
  if (id === 'legacy') {
    const legacyIdx = list.findIndex((item) => String(item?.id) === 'legacy');
    if (legacyIdx >= 0) return legacyIdx;
    if (list.length === 1) return 0;
  }
  const prefixed = `${idPrefix}-`;
  if (id.startsWith(prefixed)) {
    const n = parseInt(id.slice(prefixed.length), 10);
    if (!Number.isNaN(n) && n >= 0 && n < list.length) return n;
  }
  if (/^\d+$/.test(id)) {
    const n = parseInt(id, 10);
    if (n >= 0 && n < list.length) return n;
  }
  return -1;
}

function serializeDayJournalRow(row) {
  const entryDate = formatEntryDateFromDb(row.entry_date);
  return {
    id: row.id,
    entry_date: entryDate,
    gratitude: normalizeGratitudeStored(row.gratitude),
    stress_entries: parseTextEntries(row.stress_entries, row.stress_text),
    lesson_entries: parseTextEntries(row.lesson_entries, row.lesson_text),
    note_entries: parseTextEntries(row.note_entries, row.note_text),
    updated_at: row.updated_at,
  };
}

const DAY_JOURNAL_SECTIONS = new Set(['gratitude', 'stress', 'lesson', 'note']);

function userProfilePayload(row) {
  const email = row.email || '';
  const isPlaceholder =
    email.includes('@phone.myway.local') || email.endsWith('@oauth.myway.local');
  return {
    email: !isPlaceholder ? email : null,
    phone: row.phone || null,
    avatar_url: row.avatar_url || null,
    avatar_source: row.avatar_source || null,
    oauth_provider: row.oauth_provider || null,
  };
}

// --- Auth ---

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, phone } = req.body;
    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    if (phone) {
      const normalized = normalizePhone(phone);
      if (!normalized) {
        return res.status(400).json({ message: 'Invalid phone number' });
      }
      const existingPhone = await pool.query('SELECT id FROM users WHERE phone = $1', [
        normalized,
      ]);
      if (existingPhone.rows.length > 0) {
        return res.status(409).json({ message: 'User with this phone already exists' });
      }
      const placeholderEmail = phonePlaceholderEmail(normalized);
      await pool.query(
        'INSERT INTO users (email, phone, password_hash) VALUES ($1, $2, $3)',
        [placeholderEmail, normalized, passwordHash]
      );
      return res.status(201).json({ message: 'User registered successfully', phone: normalized });
    }

    if (!email) {
      return res.status(400).json({ message: 'Email or phone is required' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'User with this email already exists' });
    }

    await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2)',
      [email, passwordHash]
    );

    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, phone } = req.body;
    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }

    let result;
    if (phone) {
      const normalized = normalizePhone(phone);
      if (!normalized) {
        return res.status(400).json({ message: 'Invalid phone number' });
      }
      result = await pool.query(
        'SELECT id, email, phone, password_hash, avatar_url, avatar_source FROM users WHERE phone = $1',
        [normalized]
      );
    } else if (email) {
      result = await pool.query(
        'SELECT id, email, phone, password_hash, avatar_url, avatar_source FROM users WHERE email = $1',
        [email]
      );
    } else {
      return res.status(400).json({ message: 'Email or phone is required' });
    }

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    if (!user.password_hash) {
      return res.status(401).json({
        message: 'SOCIAL_LOGIN_ONLY',
      });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = signToken(user.id);
    const displayEmail =
      user.email && !user.email.includes('@phone.myway.local') ? user.email : null;
    res.json({
      token,
      email: displayEmail,
      phone: user.phone || null,
      avatar_url: user.avatar_url || null,
      avatar_source: user.avatar_source || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

setupOAuth(app, { pool, signToken });

// --- User data ---

app.get('/api/user/data', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const profileResult = await pool.query(
      'SELECT email, phone, avatar_url, avatar_source, oauth_provider FROM users WHERE id = $1',
      [userId]
    );
    const profileRow = profileResult.rows[0];
    const [moods, habitsResult, basics] = await Promise.all([
      pool.query(
        'SELECT id, emoji, text_reason, created_at FROM mood_logs WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      ),
      pool.query(
        'SELECT id, title, type, logs, thoughts_milestones, created_at FROM habits WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      ),
      pool.query(
        'SELECT id, type, title, created_at FROM basics WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      ),
    ]);

    try {
      await syncAllHabitMilestonesForUser(pool, userId, habitsResult.rows);
    } catch (syncErr) {
      console.error('Habit milestone sync skipped:', syncErr.message);
    }

    const [achievements, diary, dayJournals] = await Promise.all([
      pool.query(
        `SELECT id, title, type, completed_at, habit_id, milestone_day, habit_snapshot,
                COALESCE(hidden_from_hall, false) AS hidden_from_hall
         FROM achievements WHERE user_id = $1 ORDER BY completed_at DESC`,
        [userId]
      ),
      pool.query(
        'SELECT id, text_reflection, created_at FROM diary_entries WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      ),
      pool.query(
        `SELECT id, to_char(entry_date, 'YYYY-MM-DD') AS entry_date, gratitude,
                stress_text, lesson_text, note_text,
                stress_entries, lesson_entries, note_entries, updated_at
         FROM day_journals WHERE user_id = $1 ORDER BY entry_date DESC`,
        [userId]
      ),
    ]);

    res.json({
      user: profileRow ? userProfilePayload(profileRow) : null,
      moods: moods.rows,
      habits: habitsResult.rows,
      basics: basics.rows,
      achievements: achievements.rows,
      diary: diary.rows,
      day_journals: dayJournals.rows.map(serializeDayJournalRow),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/user/avatar', authenticateToken, async (req, res) => {
  try {
    const { avatar_url } = req.body;
    const row = await setManualAvatar(pool, req.user.id, avatar_url);
    res.json({ avatar_url: row.avatar_url, avatar_source: row.avatar_source });
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ message: err.message });
    }
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/user/avatar', authenticateToken, async (req, res) => {
  try {
    const row = await clearUserAvatar(pool, req.user.id);
    res.json({ avatar_url: row.avatar_url, avatar_source: row.avatar_source });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/user/reset', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    await client.query('BEGIN');
    await client.query('DELETE FROM mood_logs WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM habits WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM basics WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM achievements WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM diary_entries WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM day_journals WHERE user_id = $1', [userId]);
    await client.query('COMMIT');
    res.json({ message: 'All user data cleared' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// --- CRUD entities ---

app.post('/api/moods', authenticateToken, async (req, res) => {
  try {
    const { emoji, text_reason } = req.body;
    if (!emoji) {
      return res.status(400).json({ message: 'emoji is required' });
    }
    const result = await pool.query(
      `INSERT INTO mood_logs (user_id, emoji, text_reason)
       VALUES ($1, $2, $3)
       RETURNING id, emoji, text_reason, created_at`,
      [req.user.id, emoji, text_reason ?? null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/moods/:id', authenticateToken, async (req, res) => {
  try {
    const moodId = Number(req.params.id);
    const { emoji, text_reason } = req.body;
    if (!emoji) {
      return res.status(400).json({ message: 'emoji is required' });
    }
    const result = await pool.query(
      `UPDATE mood_logs
       SET emoji = $1, text_reason = $2
       WHERE id = $3 AND user_id = $4
       RETURNING id, emoji, text_reason, created_at`,
      [emoji, text_reason ?? null, moodId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Mood not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

async function removeMoodHandler(req, res) {
  try {
    const moodId = Number(req.params.id);
    const userId = Number(req.user.id);
    if (!Number.isFinite(moodId)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    if (!Number.isFinite(userId)) {
      return res.status(401).json({ message: 'Invalid session' });
    }
    const deleted = await pool.query(
      `DELETE FROM mood_logs WHERE id = $1 AND user_id = $2 RETURNING id`,
      [moodId, userId]
    );
    if (deleted.rows.length === 0) {
      return res.status(404).json({ message: 'Запись настроения не найдена' });
    }
    res.json({ ok: true, id: moodId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

app.delete('/api/moods/:id', authenticateToken, removeMoodHandler);
app.post('/api/moods/:id/delete', authenticateToken, removeMoodHandler);

app.post('/api/habits', authenticateToken, async (req, res) => {
  try {
    const { title, type } = req.body;
    if (!title || !type) {
      return res.status(400).json({ message: 'title and type are required' });
    }
    if (!['will_do', 'wont_do'].includes(type)) {
      return res.status(400).json({ message: 'type must be will_do or wont_do' });
    }
    const result = await pool.query(
      `INSERT INTO habits (user_id, title, type)
       VALUES ($1, $2, $3)
       RETURNING id, title, type, logs, thoughts_milestones, created_at`,
      [req.user.id, title, type]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/habits/:id', authenticateToken, async (req, res) => {
  try {
    const habitId = Number(req.params.id);
    const { title, type } = req.body;
    if (!title || !type) {
      return res.status(400).json({ message: 'title and type are required' });
    }
    if (!['will_do', 'wont_do'].includes(type)) {
      return res.status(400).json({ message: 'type must be will_do or wont_do' });
    }
    const result = await pool.query(
      `UPDATE habits
       SET title = $1, type = $2
       WHERE id = $3 AND user_id = $4
       RETURNING id, title, type, logs, thoughts_milestones, created_at`,
      [String(title).trim(), type, habitId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Habit not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/basics', authenticateToken, async (req, res) => {
  try {
    const { title, type } = req.body;
    if (!title || !type) {
      return res.status(400).json({ message: 'title and type are required' });
    }
    if (!['want', 'can'].includes(type)) {
      return res.status(400).json({ message: 'type must be want or can' });
    }
    const result = await pool.query(
      `INSERT INTO basics (user_id, title, type)
       VALUES ($1, $2, $3)
       RETURNING id, type, title, created_at`,
      [req.user.id, title, type]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/basics/:id', authenticateToken, async (req, res) => {
  try {
    const basicId = Number(req.params.id);
    const { title, type } = req.body;
    if (!title || !type) {
      return res.status(400).json({ message: 'title and type are required' });
    }
    if (!['want', 'can'].includes(type)) {
      return res.status(400).json({ message: 'type must be want or can' });
    }
    const result = await pool.query(
      `UPDATE basics
       SET title = $1, type = $2
       WHERE id = $3 AND user_id = $4
       RETURNING id, type, title, created_at`,
      [String(title).trim(), type, basicId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Basic not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

async function removeBasicHandler(req, res) {
  try {
    const basicId = Number(req.params.id);
    const userId = Number(req.user.id);
    if (!Number.isFinite(basicId)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    if (!Number.isFinite(userId)) {
      return res.status(401).json({ message: 'Invalid session' });
    }
    const deleted = await pool.query(
      `DELETE FROM basics WHERE id = $1 AND user_id = $2 RETURNING id`,
      [basicId, userId]
    );
    if (deleted.rows.length === 0) {
      return res.status(404).json({ message: 'Пункт базиса не найден' });
    }
    res.json({ ok: true, id: basicId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

app.delete('/api/basics/:id', authenticateToken, removeBasicHandler);
app.post('/api/basics/:id/delete', authenticateToken, removeBasicHandler);

app.post('/api/achievements', authenticateToken, async (req, res) => {
  try {
    const { title, type } = req.body;
    if (!title || !type) {
      return res.status(400).json({ message: 'title and type are required' });
    }
    if (type !== 'manual_achievement') {
      return res.status(400).json({ message: 'type must be manual_achievement' });
    }
    const result = await pool.query(
      `INSERT INTO achievements (user_id, title, type)
       VALUES ($1, $2, $3)
       RETURNING id, title, type, completed_at`,
      [req.user.id, title, type]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/achievements/:id', authenticateToken, async (req, res) => {
  try {
    const achievementId = Number(req.params.id);
    const { title } = req.body;
    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: 'title is required' });
    }
    const result = await pool.query(
      `UPDATE achievements
       SET title = $1
       WHERE id = $2 AND user_id = $3
       RETURNING id, title, type, completed_at`,
      [String(title).trim(), achievementId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Achievement not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

const DELETABLE_ACHIEVEMENT_TYPES = new Set(['manual_achievement', 'habit_archive']);

async function removeAchievementHandler(req, res) {
  try {
    const achievementId = Number(req.params.id);
    const userId = Number(req.user.id);
    if (!Number.isFinite(achievementId)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    if (!Number.isFinite(userId)) {
      return res.status(401).json({ message: 'Invalid session' });
    }
    const existing = await pool.query(
      `SELECT id, type FROM achievements WHERE id = $1 AND user_id = $2`,
      [achievementId, userId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Достижение не найдено' });
    }
    const type = String(existing.rows[0].type).trim();
    if (!DELETABLE_ACHIEVEMENT_TYPES.has(type)) {
      return res.status(400).json({ message: 'Эту запись нельзя удалить' });
    }
    if (type === 'habit_archive') {
      const hidden = await pool.query(
        `UPDATE achievements SET hidden_from_hall = TRUE
         WHERE id = $1 AND user_id = $2
         RETURNING id, title, type, completed_at, habit_id, milestone_day, habit_snapshot,
                   hidden_from_hall`,
        [achievementId, userId]
      );
      if (hidden.rows.length === 0) {
        return res.status(404).json({ message: 'Достижение не найдено' });
      }
      return res.json({
        ok: true,
        id: achievementId,
        hiddenFromHall: true,
        achievement: hidden.rows[0],
      });
    }
    const deleted = await pool.query(
      `DELETE FROM achievements WHERE id = $1 AND user_id = $2 RETURNING id`,
      [achievementId, userId]
    );
    if (deleted.rows.length === 0) {
      return res.status(404).json({ message: 'Достижение не найдено' });
    }
    res.json({ ok: true, id: achievementId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

app.delete('/api/achievements/:id', authenticateToken, removeAchievementHandler);
app.post('/api/achievements/:id/delete', authenticateToken, removeAchievementHandler);

app.post('/api/day-journal/entry', authenticateToken, async (req, res) => {
  try {
    const section = String(req.body.section || '');
    const text = String(req.body.text ?? '').trim();
    if (!DAY_JOURNAL_SECTIONS.has(section)) {
      return res.status(400).json({ message: 'Invalid section' });
    }
    if (!text) {
      return res.status(400).json({ message: 'Заполните поле перед сохранением' });
    }
    const entryDate = parseEntryDate(req.body.entry_date);
    if (!entryDate) {
      return res.status(400).json({ message: 'Invalid entry_date' });
    }

    const existingRow = await pool.query(
      `SELECT gratitude, stress_text, lesson_text, note_text, stress_entries, lesson_entries, note_entries
       FROM day_journals WHERE user_id = $1 AND entry_date = $2`,
      [req.user.id, entryDate]
    );
    const prev = existingRow.rows[0];
    const stamp = {
      id: String(Date.now()),
      created_at: new Date().toISOString(),
    };

    let gratitude = Array.isArray(prev?.gratitude) ? [...prev.gratitude] : [];
    let stressEntries = parseTextEntries(prev?.stress_entries, prev?.stress_text);
    let lessonEntries = parseTextEntries(prev?.lesson_entries, prev?.lesson_text);
    let noteEntries = parseTextEntries(prev?.note_entries, prev?.note_text);

    if (section === 'gratitude') {
      gratitude.push({ what: text, whom: '', id: stamp.id, created_at: stamp.created_at });
    } else if (section === 'stress') {
      stressEntries.push({ id: stamp.id, text, created_at: stamp.created_at });
    } else if (section === 'lesson') {
      lessonEntries.push({ id: stamp.id, text, created_at: stamp.created_at });
    } else if (section === 'note') {
      noteEntries.push({ id: stamp.id, text, created_at: stamp.created_at });
    }

    const result = await pool.query(
      `INSERT INTO day_journals (
         user_id, entry_date, gratitude, stress_text, lesson_text, note_text,
         stress_entries, lesson_entries, note_entries, updated_at
       )
       VALUES ($1, $2, $3::jsonb, '', '', '', $4::jsonb, $5::jsonb, $6::jsonb, NOW())
       ON CONFLICT (user_id, entry_date)
       DO UPDATE SET
         gratitude = EXCLUDED.gratitude,
         stress_text = '',
         lesson_text = '',
         note_text = '',
         stress_entries = EXCLUDED.stress_entries,
         lesson_entries = EXCLUDED.lesson_entries,
         note_entries = EXCLUDED.note_entries,
         updated_at = NOW()
       RETURNING id, to_char(entry_date, 'YYYY-MM-DD') AS entry_date, gratitude,
                 stress_text, lesson_text, note_text,
                 stress_entries, lesson_entries, note_entries, updated_at`,
      [
        req.user.id,
        entryDate,
        JSON.stringify(gratitude),
        JSON.stringify(stressEntries),
        JSON.stringify(lessonEntries),
        JSON.stringify(noteEntries),
      ]
    );
    res.json(serializeDayJournalRow(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

async function fetchDayJournalRow(pool, userId, entryDate) {
  const result = await pool.query(
    `SELECT id, to_char(entry_date, 'YYYY-MM-DD') AS entry_date, gratitude,
            stress_text, lesson_text, note_text, stress_entries, lesson_entries, note_entries, updated_at
     FROM day_journals WHERE user_id = $1 AND entry_date = $2`,
    [userId, entryDate]
  );
  return result.rows[0];
}

function loadJournalArrays(row) {
  return {
    gratitude: normalizeGratitudeStored(row?.gratitude),
    stressEntries: parseTextEntries(row?.stress_entries, row?.stress_text),
    lessonEntries: parseTextEntries(row?.lesson_entries, row?.lesson_text),
    noteEntries: parseTextEntries(row?.note_entries, row?.note_text),
  };
}

async function persistDayJournalArrays(pool, userId, entryDate, arrays) {
  const { gratitude, stressEntries, lessonEntries, noteEntries } = arrays;
  const result = await pool.query(
    `INSERT INTO day_journals (
       user_id, entry_date, gratitude, stress_text, lesson_text, note_text,
       stress_entries, lesson_entries, note_entries, updated_at
     )
     VALUES ($1, $2, $3::jsonb, '', '', '', $4::jsonb, $5::jsonb, $6::jsonb, NOW())
     ON CONFLICT (user_id, entry_date)
     DO UPDATE SET
       gratitude = EXCLUDED.gratitude,
       stress_text = '',
       lesson_text = '',
       note_text = '',
       stress_entries = EXCLUDED.stress_entries,
       lesson_entries = EXCLUDED.lesson_entries,
       note_entries = EXCLUDED.note_entries,
       updated_at = NOW()
     RETURNING id, to_char(entry_date, 'YYYY-MM-DD') AS entry_date, gratitude,
               stress_text, lesson_text, note_text,
               stress_entries, lesson_entries, note_entries, updated_at`,
    [
      userId,
      entryDate,
      JSON.stringify(gratitude),
      JSON.stringify(stressEntries),
      JSON.stringify(lessonEntries),
      JSON.stringify(noteEntries),
    ]
  );
  return serializeDayJournalRow(result.rows[0]);
}

function removeJournalItem(arrays, section, entryId) {
  if (section === 'gratitude') {
    const idx = resolveJournalEntryIndex(arrays.gratitude, entryId, 'gratitude');
    if (idx < 0) return false;
    arrays.gratitude = arrays.gratitude.filter((_, i) => i !== idx);
    return true;
  }
  const listKey =
    section === 'stress'
      ? 'stressEntries'
      : section === 'lesson'
        ? 'lessonEntries'
        : 'noteEntries';
  const idx = resolveJournalEntryIndex(arrays[listKey], entryId, 'entry');
  if (idx < 0) return false;
  arrays[listKey] = arrays[listKey].filter((_, i) => i !== idx);
  return true;
}

function updateJournalItem(arrays, section, entryId, text) {
  if (section === 'gratitude') {
    const idx = resolveJournalEntryIndex(arrays.gratitude, entryId, 'gratitude');
    if (idx < 0) return false;
    arrays.gratitude = arrays.gratitude.map((g, i) =>
      i === idx
        ? {
            ...g,
            what: text,
            whom: '',
            id: stableJournalEntryId(g.id, i, 'gratitude'),
          }
        : g
    );
    return true;
  }
  const listKey =
    section === 'stress'
      ? 'stressEntries'
      : section === 'lesson'
        ? 'lessonEntries'
        : 'noteEntries';
  const list = arrays[listKey];
  const idx = resolveJournalEntryIndex(list, entryId, 'entry');
  if (idx < 0) return false;
  arrays[listKey] = list.map((e, i) =>
    i === idx ? { ...e, text, id: stableJournalEntryId(e.id, i, 'entry') } : e
  );
  return true;
}

app.put('/api/day-journal/entry', authenticateToken, async (req, res) => {
  try {
    const section = String(req.body.section || '');
    const entryId = String(req.body.entry_id || '');
    const text = String(req.body.text ?? '').trim();
    if (!DAY_JOURNAL_SECTIONS.has(section) || !entryId) {
      return res.status(400).json({ message: 'Invalid section or entry_id' });
    }
    if (!text) {
      return res.status(400).json({ message: 'Заполните поле перед сохранением' });
    }
    const entryDate = parseEntryDate(req.body.entry_date);
    if (!entryDate) {
      return res.status(400).json({ message: 'Invalid entry_date' });
    }

    const row = await fetchDayJournalRow(pool, req.user.id, entryDate);
    if (!row) {
      return res.status(404).json({ message: 'Day journal not found' });
    }

    const arrays = loadJournalArrays(row);
    const updated = updateJournalItem(arrays, section, entryId, text);
    if (!updated) {
      return res.status(404).json({ message: 'Запись не найдена' });
    }
    const serialized = await persistDayJournalArrays(pool, req.user.id, entryDate, arrays);
    res.json(serialized);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/day-journal/entry', authenticateToken, async (req, res) => {
  try {
    const section = String(req.body.section || '');
    const entryId = String(req.body.entry_id || '');
    if (!DAY_JOURNAL_SECTIONS.has(section) || !entryId) {
      return res.status(400).json({ message: 'Invalid section or entry_id' });
    }
    const entryDate = parseEntryDate(req.body.entry_date);
    if (!entryDate) {
      return res.status(400).json({ message: 'Invalid entry_date' });
    }

    const row = await fetchDayJournalRow(pool, req.user.id, entryDate);
    if (!row) {
      return res.status(404).json({ message: 'Day journal not found' });
    }

    const arrays = loadJournalArrays(row);
    const removed = removeJournalItem(arrays, section, entryId);
    if (!removed) {
      return res.status(404).json({ message: 'Запись не найдена' });
    }

    const hasAny =
      arrays.gratitude.length > 0 ||
      arrays.stressEntries.length > 0 ||
      arrays.lessonEntries.length > 0 ||
      arrays.noteEntries.length > 0;

    if (!hasAny) {
      await pool.query('DELETE FROM day_journals WHERE user_id = $1 AND entry_date = $2', [
        req.user.id,
        entryDate,
      ]);
      return res.json({ entry_date: entryDate, deleted: true });
    }

    const serialized = await persistDayJournalArrays(pool, req.user.id, entryDate, arrays);
    res.json(serialized);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/day-journal', authenticateToken, async (req, res) => {
  try {
    const entryDate = parseEntryDate(req.body.entry_date);
    if (!entryDate) {
      return res.status(400).json({ message: 'Invalid entry_date' });
    }
    const existingRow = await pool.query(
      `SELECT gratitude, stress_text, lesson_text, note_text
       FROM day_journals WHERE user_id = $1 AND entry_date = $2`,
      [req.user.id, entryDate]
    );
    const prev = existingRow.rows[0];

    let gratitude = normalizeGratitude(req.body.gratitude);
    let stressText = String(req.body.stress_text ?? '').trim();
    let lessonText = String(req.body.lesson_text ?? '').trim();
    let noteText = String(req.body.note_text ?? '').trim();

    if (prev) {
      if (!gratitude.length && prev.gratitude) {
        gratitude = Array.isArray(prev.gratitude) ? prev.gratitude : [];
      }
      if (!stressText && prev.stress_text) stressText = prev.stress_text;
      if (!lessonText && prev.lesson_text) lessonText = prev.lesson_text;
      if (!noteText && prev.note_text) noteText = prev.note_text;
    }

    const hasContent =
      gratitude.length > 0 || stressText || lessonText || noteText;
    if (!hasContent) {
      return res.status(400).json({ message: 'Заполните хотя бы одно поле' });
    }

    const result = await pool.query(
      `INSERT INTO day_journals (user_id, entry_date, gratitude, stress_text, lesson_text, note_text, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, NOW())
       ON CONFLICT (user_id, entry_date)
       DO UPDATE SET
         gratitude = EXCLUDED.gratitude,
         stress_text = EXCLUDED.stress_text,
         lesson_text = EXCLUDED.lesson_text,
         note_text = EXCLUDED.note_text,
         updated_at = NOW()
       RETURNING id, to_char(entry_date, 'YYYY-MM-DD') AS entry_date, gratitude, stress_text, lesson_text, note_text, updated_at`,
      [
        req.user.id,
        entryDate,
        JSON.stringify(gratitude),
        stressText,
        lessonText,
        noteText,
      ]
    );
    res.json(serializeDayJournalRow(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/diary', authenticateToken, async (req, res) => {
  try {
    const { text_reflection } = req.body;
    if (!text_reflection || !String(text_reflection).trim()) {
      return res.status(400).json({ message: 'text_reflection is required' });
    }
    const result = await pool.query(
      `INSERT INTO diary_entries (user_id, text_reflection)
       VALUES ($1, $2)
       RETURNING id, text_reflection, created_at`,
      [req.user.id, text_reflection]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/diary/:id', authenticateToken, async (req, res) => {
  try {
    const entryId = Number(req.params.id);
    const { text_reflection } = req.body;
    if (!text_reflection || !String(text_reflection).trim()) {
      return res.status(400).json({ message: 'text_reflection is required' });
    }
    const result = await pool.query(
      `UPDATE diary_entries
       SET text_reflection = $1
       WHERE id = $2 AND user_id = $3
       RETURNING id, text_reflection, created_at`,
      [String(text_reflection).trim(), entryId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Diary entry not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// --- Habits business logic ---

app.put('/api/habits/:id/log', authenticateToken, async (req, res) => {
  try {
    const habitId = Number(req.params.id);
    const iso = new Date().toISOString();
    const result = await pool.query(
      `UPDATE habits
       SET logs = array_append(logs, $1)
       WHERE id = $2 AND user_id = $3
       RETURNING id, title, type, logs, thoughts_milestones, created_at`,
      [iso, habitId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Habit not found' });
    }
    const habit = result.rows[0];
    const newAchievements = await ensureHabitMilestoneAchievements(
      pool,
      req.user.id,
      habit
    );
    res.json({ habit, newAchievements });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/habits/:id/milestone', authenticateToken, async (req, res) => {
  try {
    const habitId = Number(req.params.id);
    const { day, text } = req.body;
    const allowedDays = ['7', '14', '21'];
    const dayKey = String(day);
    if (!allowedDays.includes(dayKey)) {
      return res.status(400).json({ message: 'day must be 7, 14, or 21' });
    }
    if (text === undefined) {
      return res.status(400).json({ message: 'text is required' });
    }

    const result = await pool.query(
      `UPDATE habits
       SET thoughts_milestones = jsonb_set(
         COALESCE(thoughts_milestones, '{"7": "", "14": "", "21": ""}'::jsonb),
         $1::text[],
         to_jsonb($2::text)
       )
       WHERE id = $3 AND user_id = $4
       RETURNING id, title, type, logs, thoughts_milestones, created_at`,
      [[dayKey], text, habitId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Habit not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/basics/:id/complete', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const basicId = Number(req.params.id);
    const userId = req.user.id;

    await client.query('BEGIN');

    const basicResult = await client.query(
      'SELECT id, title FROM basics WHERE id = $1 AND user_id = $2',
      [basicId, userId]
    );
    if (basicResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Basic not found' });
    }

    const basic = basicResult.rows[0];
    const achievementResult = await client.query(
      `INSERT INTO achievements (user_id, title, type)
       VALUES ($1, $2, 'manual_achievement')
       RETURNING id, title, type, completed_at`,
      [userId, basic.title]
    );

    await client.query('DELETE FROM basics WHERE id = $1 AND user_id = $2', [basicId, userId]);
    await client.query('COMMIT');

    res.json({
      message: 'Basic completed',
      achievement: achievementResult.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

app.delete('/api/habits/:id/archive', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const habitId = Number(req.params.id);
    const userId = req.user.id;

    await client.query('BEGIN');

    const habitResult = await client.query(
      `SELECT id, title, type, logs, thoughts_milestones, created_at
       FROM habits WHERE id = $1 AND user_id = $2`,
      [habitId, userId]
    );
    if (habitResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Habit not found' });
    }

    const habit = habitResult.rows[0];
    const habitSnapshot = {
      title: habit.title,
      type: habit.type,
      logs: habit.logs ?? [],
      thoughts_milestones: habit.thoughts_milestones ?? { 7: '', 14: '', 21: '' },
      created_at: habit.created_at,
    };
    const achievementResult = await client.query(
      `INSERT INTO achievements (user_id, title, type, habit_snapshot)
       VALUES ($1, $2, 'habit_archive', $3::jsonb)
       RETURNING id, title, type, completed_at, habit_snapshot`,
      [userId, habit.title, JSON.stringify(habitSnapshot)]
    );

    await client.query('DELETE FROM habits WHERE id = $1 AND user_id = $2', [habitId, userId]);
    await client.query('COMMIT');

    res.json({
      message: 'Habit archived',
      achievement: achievementResult.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

app.post('/api/achievements/:id/restore-habit', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const achievementId = Number(req.params.id);
    const userId = req.user.id;

    await client.query('BEGIN');

    const achievementResult = await client.query(
      `SELECT id, title, type, habit_snapshot
       FROM achievements WHERE id = $1 AND user_id = $2`,
      [achievementId, userId]
    );
    if (achievementResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Achievement not found' });
    }
    const achievement = achievementResult.rows[0];
    if (achievement.type !== 'habit_archive') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Эту запись нельзя восстановить как привычку' });
    }

    const snap = achievement.habit_snapshot || {};
    const title = String(snap.title || achievement.title || '').trim();
    const type = snap.type === 'wont_do' ? 'wont_do' : 'will_do';
    const logs = Array.isArray(snap.logs) ? snap.logs : [];
    const thoughtsMilestones =
      snap.thoughts_milestones && typeof snap.thoughts_milestones === 'object'
        ? snap.thoughts_milestones
        : { 7: '', 14: '', 21: '' };

    if (!title) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Нет данных для восстановления привычки' });
    }

    const habitResult = await client.query(
      `INSERT INTO habits (user_id, title, type, logs, thoughts_milestones)
       VALUES ($1, $2, $3, $4::text[], $5::jsonb)
       RETURNING id, title, type, logs, thoughts_milestones, created_at`,
      [userId, title, type, logs, JSON.stringify(thoughtsMilestones)]
    );

    await client.query('DELETE FROM achievements WHERE id = $1 AND user_id = $2', [
      achievementId,
      userId,
    ]);

    await client.query('COMMIT');

    res.json({
      message: 'Habit restored',
      habit: habitResult.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    if (String(err.message || '').includes('habit_snapshot')) {
      return res.status(500).json({
        message: 'Нужна миграция БД: backend/migrate-habit-restore.sql',
      });
    }
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use((err, _req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Файл слишком большой (максимум 10 МБ)' });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
