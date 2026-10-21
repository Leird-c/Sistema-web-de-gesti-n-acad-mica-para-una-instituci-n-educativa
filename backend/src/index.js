// Punto de entrada de la API del Sistema de Gestión Escolar
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config/config');
const db = require('./config/db');
const errorHandler = require('./middlewares/errorHandler');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: config.frontendUrl.split(',').map((s) => s.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '100kb' }));

app.get('/', (req, res) => res.send('API de Gestión Escolar funcionando'));
app.get('/api/health', async (req, res) => {
  try { await db.query('SELECT 1'); res.json({ estado: 'ok' }); }
  catch { res.status(503).json({ estado: 'sin conexión a la base de datos' }); }
});

app.use('/api/usuarios', require('./routes/usuarioRoutes'));
app.use('/api/padres', require('./routes/padreRoutes'));
app.use('/api/estudiantes', require('./routes/estudianteRoutes'));
app.use('/api/grupos', require('./routes/grupoRoutes'));
app.use('/api/materias', require('./routes/materiaRoutes'));
app.use('/api/docente-materia', require('./routes/docenteMateriaRoutes'));
app.use('/api/horarios', require('./routes/horarioRoutes'));
app.use('/api/calificaciones', require('./routes/calificacionRoutes'));
app.use('/api/asistencias', require('./routes/asistenciaRoutes'));
app.use('/api/incidencias', require('./routes/incidenciaRoutes'));
app.use('/api/talleres', require('./routes/tallerRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use(errorHandler);

module.exports = app;

if (require.main === module) {
  app.listen(config.port, async () => {
    console.log(`Servidor backend escuchando en http://localhost:${config.port}`);
    try {
      await db.query('SELECT NOW()');
      console.log('Conexión a PostgreSQL exitosa');
    } catch (err) {
      console.error('No se pudo conectar a PostgreSQL:', err.message);
      console.error('Revisa backend/.env y ejecuta: npm run db:init');
    }
  });
}
