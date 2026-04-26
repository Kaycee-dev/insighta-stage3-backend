const fs = require('fs');
const path = require('path');
const { getPool } = require('./db');

async function runMigrations() {
  const pool = getPool();
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    console.log(`[migrate] applying ${f}`);
    await pool.query(sql);
  }
  console.log('[migrate] done');
}

if (require.main === module) {
  runMigrations().then(() => process.exit(0)).catch((err) => {
    console.error('[migrate] error:', err);
    process.exit(1);
  });
}

module.exports = { runMigrations };
