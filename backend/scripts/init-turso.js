require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

async function initTurso() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    console.error('Ошибка: Переменная TURSO_DATABASE_URL не задана в .env');
    process.exit(1);
  }

  console.log(`Подключение к Turso: ${url}...`);
  const client = createClient({ url, authToken });

  const sqlFile = path.resolve(__dirname, '../schema-turso.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  const cleanSql = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');
  const statements = cleanSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log(`Применение схемы (${statements.length} инструкций)...`);

  for (const stmt of statements) {
    try {
      await client.execute(stmt);
    } catch (err) {
      console.error(`Ошибка при выполнении инструкции:\n${stmt}\n-> ${err.message}`);
      process.exit(1);
    }
  }

  console.log('✅ Схема базы данных Turso успешно инициализирована!');
}

initTurso().catch((err) => {
  console.error('Непредвиденная ошибка:', err);
  process.exit(1);
});
