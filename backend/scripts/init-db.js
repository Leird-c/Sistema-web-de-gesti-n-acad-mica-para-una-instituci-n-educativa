// Crea la base de datos (si no existe), aplica el esquema y carga datos de demostración.
//   npm run db:init              -> crea todo y siembra datos de demo (si la BD está vacía)
//   npm run db:reset             -> BORRA todo y vuelve a crear con datos de demo
//   node scripts/init-db.js --sin-datos  -> solo esquema + un administrador inicial (producción)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');
const config = require('../src/config/config');
const { sembrar, CLAVES } = require('./seed');

async function main() {
  const reset = process.argv.includes('--reset');
  const sinDatos = process.argv.includes('--sin-datos');
  const nombreBD = config.db.database;
  if (!/^[A-Za-z0-9_]+$/.test(nombreBD)) throw new Error('DB_NAME solo puede contener letras, números y guion bajo');

  const admin = new Client({ ...config.db, database: 'postgres' });
  await admin.connect();
  const existe = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [nombreBD]);
  if (!existe.rowCount) {
    await admin.query(`CREATE DATABASE "${nombreBD}"`);
    console.log(`✔ Base de datos "${nombreBD}" creada`);
  }
  await admin.end();

  const c = new Client(config.db);
  await c.connect();
  if (reset) {
    await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('✔ Esquema anterior eliminado');
  }
  await c.query(fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8'));
  console.log('✔ Esquema aplicado');

  const vacia = Number((await c.query('SELECT COUNT(*) AS n FROM usuario')).rows[0].n) === 0;
  if (vacia && !sinDatos) {
    await sembrar(c);
    console.log('✔ Datos de demostración cargados\n');
    console.log('  Usuarios de prueba (usuario o correo / contraseña):');
    console.log(`   Admin       A01 | admin1@correo.com        / ${CLAVES.admin}`);
    console.log(`   Docente     BA000001 | docente1@correo.com / ${CLAVES.docente}`);
    console.log(`   Estudiante  C2026000000001 | alumno1@correo.com / ${CLAVES.estudiante}`);
    console.log(`   Padre       C20260000000011AB | padre1@correo.com / ${CLAVES.padre}`);
  } else if (vacia) {
    const clave = process.env.ADMIN_INICIAL_PASSWORD || crypto.randomBytes(9).toString('base64url');
    await c.query(
      `INSERT INTO usuario (usuario, nombre, correo, contrasena, rol, password_change_required)
       VALUES ('A01', 'Administrador', $1, $2, 'admin', TRUE)`,
      [process.env.ADMIN_INICIAL_CORREO || 'admin@colegio.edu.pe', await bcrypt.hash(clave, 10)]
    );
    console.log('✔ Administrador inicial creado (usuario A01).');
    if (!process.env.ADMIN_INICIAL_PASSWORD) console.log(`  Contraseña temporal (cámbiala al ingresar): ${clave}`);
  } else {
    console.log('ℹ La base de datos ya tiene datos; no se sembró nada.');
  }
  await c.end();
}

main().catch((e) => { console.error('✖ Error:', e.message); process.exit(1); });
