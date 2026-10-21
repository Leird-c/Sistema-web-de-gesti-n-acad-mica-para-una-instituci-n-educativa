// /api/horarios  -  horarios por grupo y por docente
const router = require('express').Router();
const config = require('../config/config');
const { query } = require('../config/db');
const auth = require('../middlewares/auth');
const checkRole = require('../middlewares/checkRole');
const { exigirVerEstudiante } = require('../utils/acceso');
const { HttpError, wrap, RE, intParam } = require('../utils/helpers');

router.use(auth);

const SQL = `
  SELECT h.id_horario AS id, h.grupo_id, g.anio AS grupo_anio, g.seccion AS grupo_seccion, g.turno AS grupo_turno,
         h.materia_id, m.nombre AS materia_nombre, h.docente_id, u.nombre AS docente_nombre,
         h.dia, to_char(h.hora_inicio, 'HH24:MI') AS hora_inicio, to_char(h.hora_fin, 'HH24:MI') AS hora_fin
    FROM horario h
    JOIN grupo g ON g.id_grupo = h.grupo_id
    JOIN materia m ON m.id_materia = h.materia_id
    JOIN usuario u ON u.id_usuario = h.docente_id`;
const ORDEN = `ORDER BY g.anio, g.seccion,
  CASE h.dia WHEN 'Lunes' THEN 1 WHEN 'Martes' THEN 2 WHEN 'Miércoles' THEN 3 WHEN 'Jueves' THEN 4 WHEN 'Viernes' THEN 5 ELSE 6 END,
  h.hora_inicio`;

router.get('/', checkRole('admin'), wrap(async (req, res) => {
  const grupoId = req.query.grupo_id ? intParam(req.query.grupo_id, 'El grupo') : null;
  res.json((await query(`${SQL} WHERE ($1::int IS NULL OR h.grupo_id = $1) ${ORDEN}`, [grupoId])).rows);
}));

router.get('/docente', checkRole('docente'), wrap(async (req, res) => {
  res.json((await query(`${SQL} WHERE h.docente_id = $1 ${ORDEN}`, [req.user.id_usuario])).rows);
}));

async function horarioDeEstudiante(estudianteId) {
  return (await query(
    `${SQL} WHERE h.grupo_id = (SELECT grupo_id FROM estudiante WHERE id_usuario = $1) ${ORDEN}`, [estudianteId]
  )).rows;
}

router.get('/mio', checkRole('estudiante'), wrap(async (req, res) => {
  res.json(await horarioDeEstudiante(req.user.id_usuario));
}));

router.get('/estudiante/:id', wrap(async (req, res) => {
  const id = intParam(req.params.id);
  await exigirVerEstudiante(req.user, id);
  res.json(await horarioDeEstudiante(id));
}));

router.post('/', checkRole('admin'), wrap(async (req, res) => {
  const grupoId = intParam(req.body.grupo_id, 'El grupo');
  const materiaId = intParam(req.body.materia_id, 'La materia');
  const docenteId = intParam(req.body.docente_id, 'El docente');
  const { dia, hora_inicio: ini, hora_fin: fin } = req.body;
  if (!config.reglas.dias.includes(dia)) throw new HttpError(400, 'Día no válido');
  if (!RE.hora.test(ini || '') || !RE.hora.test(fin || '')) throw new HttpError(400, 'Las horas deben tener formato HH:MM');
  if (fin <= ini) throw new HttpError(400, 'La hora de fin debe ser posterior a la de inicio');

  const dm = await query(
    'SELECT 1 FROM docente_materia WHERE docente_id = $1 AND materia_id = $2 AND grupo_id = $3',
    [docenteId, materiaId, grupoId]
  );
  if (!dm.rowCount) {
    throw new HttpError(409, 'Ese docente no tiene asignada esa materia en ese grupo. Asígnala primero.');
  }
  // Un horario se solapa si empieza antes de que termine el otro y termina después de que empiece
  const choque = await query(
    `SELECT h.grupo_id, h.docente_id FROM horario h
      WHERE h.dia = $1 AND h.hora_inicio < $3::time AND h.hora_fin > $2::time
        AND (h.grupo_id = $4 OR h.docente_id = $5) LIMIT 1`,
    [dia, ini, fin, grupoId, docenteId]
  );
  if (choque.rowCount) {
    throw new HttpError(409, choque.rows[0].grupo_id === grupoId
      ? 'El grupo ya tiene una clase en ese horario.'
      : 'El docente ya tiene una clase en ese horario.');
  }
  const r = await query(
    `INSERT INTO horario (grupo_id, materia_id, docente_id, dia, hora_inicio, hora_fin)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_horario`,
    [grupoId, materiaId, docenteId, dia, ini, fin]
  );
  res.status(201).json((await query(`${SQL} WHERE h.id_horario = $1`, [r.rows[0].id_horario])).rows[0]);
}));

router.delete('/:id', checkRole('admin'), wrap(async (req, res) => {
  const r = await query('DELETE FROM horario WHERE id_horario = $1', [intParam(req.params.id)]);
  if (!r.rowCount) throw new HttpError(404, 'Horario no encontrado');
  res.json({ mensaje: 'Horario eliminado correctamente' });
}));

module.exports = router;
