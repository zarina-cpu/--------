require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const pool = require('../db');

async function main() {
  if (!process.env.TURSO_DATABASE_URL) {
    console.error('Нет TURSO_DATABASE_URL в backend/.env');
    process.exit(1);
  }
  try {
    await pool.query('SELECT 1');
    const tables = await pool.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    );
    const hasUsers = tables.rows.length > 0;
    console.log('Turso: подключение OK');
    console.log(hasUsers ? 'Таблица users: есть' : 'Таблица users: нет — запустите npm run db:init-turso');
    process.exit(hasUsers ? 0 : 2);
  } catch (err) {
    console.error('Turso: ошибка', err.message);
    process.exit(1);
  }
}

main();
