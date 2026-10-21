// Conexión a PostgreSQL (pool) + helper de transacciones.
const { Pool, types } = require('pg');
const config = require('./config');

// Las fechas se devuelven como texto 'AAAA-MM-DD' (evita desfases de zona horaria).
types.setTypeParser(1082, (v) => v);
// NUMERIC -> number, BIGINT (COUNT) -> number
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(20, (v) => parseInt(v, 10));

const pool = new Pool(config.db);
pool.on('error', (err) => console.error('[db] error inesperado en el pool:', err.message));

const query = (text, params) => pool.query(text, params);

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };
