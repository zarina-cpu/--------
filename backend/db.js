const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config();

const isTurso = Boolean(process.env.TURSO_DATABASE_URL);

if (process.env.VERCEL && !isTurso) {
  console.error(
    'Vercel: задайте TURSO_DATABASE_URL и TURSO_AUTH_TOKEN в переменных окружения backend.'
  );
}

let pool;

if (isTurso) {
  const { createClient } = require('@libsql/client');
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  function normalizeRow(row) {
    if (!row || typeof row !== 'object') return row;
    const copy = { ...row };
    const jsonFields = [
      'logs',
      'thoughts_milestones',
      'gratitude',
      'stress_entries',
      'lesson_entries',
      'note_entries',
      'habit_snapshot',
    ];
    for (const field of jsonFields) {
      if (typeof copy[field] === 'string') {
        try {
          copy[field] = JSON.parse(copy[field]);
        } catch {
          // Keep string if not parseable
        }
      }
    }
    if ('hidden_from_hall' in copy) {
      copy.hidden_from_hall = Boolean(copy.hidden_from_hall);
    }
    return copy;
  }

  function prepareSqlAndArgs(sql, params = []) {
    let cleanSql = sql
      .replace(/::\w+(\[\])?/g, '')
      .replace(/to_char\s*\(\s*entry_date\s*,\s*'YYYY-MM-DD'\s*\)/gi, 'entry_date')
      .replace(/\bNOW\(\)/gi, 'CURRENT_TIMESTAMP');

    const cleanArgs = (params || []).map((arg) => {
      if (arg !== null && typeof arg === 'object') {
        return JSON.stringify(arg);
      }
      return arg;
    });

    return { sql: cleanSql, args: cleanArgs };
  }

  pool = {
    isTurso: true,
    rawClient: client,
    async query(sqlText, params = []) {
      const { sql, args } = prepareSqlAndArgs(sqlText, params);
      const result = await client.execute({ sql, args });
      const rows = (result.rows || []).map(normalizeRow);
      return {
        rows,
        rowCount: result.rowsAffected ?? rows.length,
      };
    },
    async connect() {
      let tx = null;
      return {
        async query(sqlText, params = []) {
          const trimmed = sqlText.trim().toUpperCase();
          if (trimmed === 'BEGIN') {
            tx = await client.transaction('write');
            return { rows: [], rowCount: 0 };
          }
          if (trimmed === 'COMMIT') {
            if (tx) {
              await tx.commit();
              tx = null;
            }
            return { rows: [], rowCount: 0 };
          }
          if (trimmed === 'ROLLBACK') {
            if (tx) {
              try {
                await tx.rollback();
              } catch {}
              tx = null;
            }
            return { rows: [], rowCount: 0 };
          }
          const executor = tx || client;
          const { sql, args } = prepareSqlAndArgs(sqlText, params);
          const result = await executor.execute({ sql, args });
          const rows = (result.rows || []).map(normalizeRow);
          return {
            rows,
            rowCount: result.rowsAffected ?? rows.length,
          };
        },
        release() {
          tx = null;
        },
      };
    },
    on() {},
  };
} else {
  const { Pool } = require('pg');
  const pgPool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT) || 5432,
  });

  pgPool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
  });

  pool = pgPool;
}

module.exports = pool;
