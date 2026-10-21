// /api/dashboard/resumen  -  tarjetas de estadísticas reales según el rol
const router = require('express').Router();
const { query } = require('../config/db');
const auth = require('../middlewares/auth');
const { puedeVerEstudiante } = require('../utils/acceso');
const { HttpError, wrap, intParam } = require('../utils/helpers');

router.use(auth);

const nota = (v) => (v === null || v === undefined ? '—' : String(Math.round(v * 10) / 10));
const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v)}%`);

async function resumenEstudiante(id) {
  const r = await query(
    `SELECT (SELECT AVG(calificacion) FROM calificacion WHERE estudiante_id = $1) AS promedio,
            (SELECT 100.0 * AVG(CASE WHEN presente THEN 1 ELSE 0 END) FROM asistencia WHERE usuario_id = $1) AS asistencia,
            (SELECT COUNT(*) FROM asistencia WHERE usuario_id = $1 AND NOT presente) AS faltas,
            (SELECT COUNT(*) FROM incidencia WHERE usuario_id = $1) AS incidencias`,
    [id]
  );
  const x = r.rows[0];
  return [
    { valor: nota(x.promedio), etiqueta: 'Promedio general' },
    { valor: pct(x.asistencia), etiqueta: 'Asistencia' },
    { valor: String(x.faltas), etiqueta: 'Faltas' },
    { valor: String(x.incidencias), etiqueta: 'Incidencias' },
  ];
}

router.get('/resumen', wrap(async (req, res) => {
  const { rol, id_usuario: uid } = req.user;

  if (rol === 'admin') {
    const x = (await query(
      `SELECT (SELECT COUNT(*) FROM usuario WHERE rol = 'estudiante' AND activo) AS estudiantes,
              (SELECT COUNT(*) FROM usuario WHERE rol = 'docente' AND activo) AS docentes,
              (SELECT COUNT(*) FROM materia) AS materias,
              (SELECT 100.0 * AVG(CASE WHEN presente THEN 1 ELSE 0 END) FROM asistencia WHERE fecha >= CURRENT_DATE - 30) AS asistencia`
    )).rows[0];
    return res.json([
      { valor: String(x.estudiantes), etiqueta: 'Estudiantes Activos' },
      { valor: String(x.docentes), etiqueta: 'Docentes' },
      { valor: String(x.materias), etiqueta: 'Asignaturas' },
      { valor: pct(x.asistencia), etiqueta: 'Asistencia Promedio (30 días)' },
    ]);
  }

  if (rol === 'docente') {
    const x = (await query(
      `SELECT (SELECT COUNT(DISTINCT grupo_id) FROM docente_materia WHERE docente_id = $1) AS grupos,
              (SELECT COUNT(DISTINCT materia_id) FROM docente_materia WHERE docente_id = $1) AS materias,
              (SELECT COUNT(*) FROM estudiante WHERE grupo_id IN (SELECT grupo_id FROM docente_materia WHERE docente_id = $1)) AS alumnos,
              (SELECT COUNT(*) FROM horario WHERE docente_id = $1) AS clases`,
      [uid]
    )).rows[0];
    return res.json([
      { valor: String(x.grupos), etiqueta: 'Grupos a cargo' },
      { valor: String(x.materias), etiqueta: 'Asignaturas' },
      { valor: String(x.alumnos), etiqueta: 'Alumnos a cargo' },
      { valor: String(x.clases), etiqueta: 'Clases por semana' },
    ]);
  }

  if (rol === 'estudiante') return res.json(await resumenEstudiante(uid));

  // padre: del hijo seleccionado (por defecto el primero)
  let hijo = req.query.estudiante_id ? intParam(req.query.estudiante_id, 'El estudiante') : null;
  if (!hijo) {
    const h = await query('SELECT MIN(id_estudiante) AS id FROM padre_estudiante WHERE id_padre = $1', [uid]);
    hijo = h.rows[0].id;
  }
  if (!hijo) return res.json([]);
  if (!(await puedeVerEstudiante(req.user, hijo))) throw new HttpError(403, 'No tienes acceso a este estudiante.');
  res.json(await resumenEstudiante(hijo));
}));

module.exports = router;
