// Configuración central: variables de entorno y reglas de negocio del colegio.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const isProd = process.env.NODE_ENV === 'production';

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (isProd) throw new Error('Falta JWT_SECRET en producción.');
  jwtSecret = 'secreto-solo-para-desarrollo';
  console.warn('[config] JWT_SECRET no definido: se usa un secreto de desarrollo.');
}

module.exports = {
  isProd,
  port: Number(process.env.PORT) || 3001,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'gestion_escolar',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  },
  jwtSecret,
  jwtExpira: process.env.JWT_EXPIRA || '8h',
  fechaLimiteCambioTaller: process.env.FECHA_LIMITE_CAMBIO_TALLER || null,
  reglas: {
    anios: [1, 2, 3],
    secciones: ['A', 'B'],
    notaMaxima: 10,
    cupoGrupo: 30,
    cupoTallerMaximo: 30,
    maxMateriasPorDocente: 4,
    diasParaCambiarTaller: 7,
    vigenciaPasswordTemporalDias: 3,
    passwordMinimo: 8,
    dias: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    sanciones: ['llamado', 'suspension', 'expulsion'],
  },
  email: {
    service: process.env.EMAIL_SERVICE || '',
    host: process.env.EMAIL_HOST || '',
    port: Number(process.env.EMAIL_PORT) || 587,
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASSWORD || '',
    from: process.env.EMAIL_FROM || '"Sistema de Gestión Escolar" <no-reply@colegio.edu.pe>',
  },
};
