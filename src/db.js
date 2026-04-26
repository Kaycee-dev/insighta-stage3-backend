const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const ssl = /sslmode=require/i.test(connectionString) || process.env.PGSSL === 'true'
    ? { rejectUnauthorized: false }
    : false;
  pool = new Pool({ connectionString, ssl });
  return pool;
}

function setPool(p) {
  pool = p;
}

async function query(text, params) {
  return getPool().query(text, params);
}

module.exports = { getPool, setPool, query };
