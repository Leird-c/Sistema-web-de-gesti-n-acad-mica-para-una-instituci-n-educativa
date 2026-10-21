// /api/asistencias  -  toma de asistencia diaria y justificación de faltas
const router = require('express').Router();
const { query, tx } = require('../config/db');
const auth = require('../middlewares/auth');
const checkRole = require('../middlewares/checkRole');
const { exigirVerEstudiante, exigirDocenteEnGrupo } = require('../utils/acceso');
const { HttpError, wrap, intParam, validarFecha, texto } = require('../utils/helpers');

router.use(auth);

const SQL = `
  SELECT a.id_asistencia AS id, a.fecha, a.usuario_id, u.nombre AS estudiante_nombre, e.matricula,
         g.id_grupo AS grupo_id, g.anio AS grupo_anio, g.seccion AS grupo_seccion,
         CASE WHEN a.presente THEN 'ASISTENCIA' ELSE 'FALTA' END AS estado, a.justificacion
    FROM asistencia a
    JOIN estudiante e ON e.id_usuario = a.usuario_id
    JOIN usuario u ON u.id_usuario = a.usuario_id
    JOIN grupo g ON g.id_grupo = e.grupo_id`;
const ORDEN = 'ORDER BY a.fecha DESC, g.anio, g.seccion, u.nombre';

function filtros(req) {
  return [
    req.query.fecha ? validarFecha(req.query.fecha, 'La fecha', { permitirFutura: true }) : null,
    req.query.grupo_id ? intParam(req.query.grupo_id, 'El grupo') : null,
  ];
}

router.get('/', checkRole('admin'), wrap(async (req, res) => {
  const [fecha, grupoId] = filtros(req);
  res.json((await query(
    `${SQL} WHERE ($1::date IS NULL OR a.fecha = $1) AND ($2::int IS NULL OR g.id_grupo = $2) ${ORDEN} LIMIT 1000`,
    [fecha, grupoId]
  )).rows);
}));

router.get('/docente', checkRole('docente'), wrap(async (req, res) => {
  const [fecha, grupoId] = filtros(req);
  res.json((await query(
    `${SQL}
      WHERE g.id_grupo IN (SELECT grupo_id FROM docente_materia WHERE docente_id = $1)
        AND ($2::date IS NULL OR a.fecha = $2) AND ($3::int IS NULL OR g.id_grupo = $3)
      ${ORDEN} LIMIT 1000`,
    [req.user.id_usuario, fecha, grupoId]
  )).rows);
}));

router.get('/usuario/:id', wrap(async (req, res) => {
  const id = intParam(req.params.id);
  await exigirVerEstudiante(req.user, id);
  res.json((await query(`${SQL} WHERE a.usuario_id = $1 ${ORDEN}`, [id])).rows);
}));

// Lista de alumnos de un grupo con su estado en una fecha (para tomar asistencia)
router.get('/grupo/:grupoId/fecha/:fecha', checkRole('admin', 'docente'), wrap(async (req, res) => {
  const grupoId = intParam(req.params.grupoId, 'El grupo');
  const fecha = validarFecha(req.params.fecha);
  await exigirDocenteEnGrupo(req.user, grupoId);
  res.json((await query(
    `SELECT e.id_usuario AS usuario_id, u.nombre AS estudiante_nombre, e.matricula,
            a.id_asistencia AS id, a.presente, a.justificacion
       FROM estudiante e
       JOIN usuario u ON u.id_usuario = e.id_usuario
       LEFT JOIN asistencia a ON a.usuario_id = e.id_usuario AND a.fecha = $2
      WHERE e.grupo_id = $1 ORDER BY u.nombre`,
    [grupoId, fecha]
  )).rows);
}));

const UPSERT = `
  INSERT INTO asistencia (usuario_id, fecha, presente, registrado_por) VALUES ($1, $2, $3, $4)
  ON CONFLICT (usuario_id, fecha) DO UPDATE
    SET presente = EXCLUDED.presente, registrado_por = EXCLUDED.registrado_por,
        justificacion = CASE WHEN EXCLUDED.presente THEN NULL ELSE asistencia.justificacion END
  RETURNING id_asistencia AS id`;

// Registrar/actualizar la asistencia de un alumno
router.post('/', checkRole('admin', 'docente'), wrap(async (req, res) => {
  const usuarioId = intParam(req.body.usuario_id, 'El estudiante');
  const fecha = validarFecha(req.body.fecha);
  if (typeof req.body.presente !== 'boolean') throw new HttpError(400, 'El campo presente debe ser booleano');
  const e = await query('SELECT grupo_id FROM estudiante WHERE id_usuario = $1', [usuarioId]);
  if (!e.rowCount) throw new HttpError(404, 'Estudiante no encontrado');
  await exigirDocenteEnGrupo(req.user, e.rows[0].grupo_id);
  const r = await query(UPSERT, [usuarioId, fecha, req.body.presente, req.user.id_usuario]);
  res.status(201).json({ id: r.rows[0].id, mensaje: 'Asistencia registrada' });
}));

// Registrar la asistencia de todo un grupo en una fecha
router.post('/lote', checkRole('admin', 'docente'), wrap(async (req, res) => {
  const grupoId = intParam(req.body.grupo_id, 'El grupo');
  const fecha = validarFecha(req.body.fecha);
  const registros = req.body.registros;
  if (!Array.isArray(registros) || registros.length === 0) throw new HttpError(400, 'No hay registros de asistencia');
  await exigirDocenteEnGrupo(req.user, grupoId);

  const total = await tx(async (c) => {
    const alumnos = new Set((await c.query('SELECT id_usuario FROM estudiante WHERE grupo_id = $1', [grupoId])).rows.map((x) => x.id_usuario));
    for (const reg of registros) {
      const uid = intParam(reg.usuario_id, 'El estudiante');
      if (!alumnos.has(uid)) throw new HttpError(400, 'Hay estudiantes que no pertenecen al grupo seleccionado');
      if (typeof reg.presente !== 'boolean') throw new HttpError(400, 'El campo presente debe ser booleano');
      await c.query(UPSERT, [uid, fecha, reg.presente, req.user.id_usuario]);
    }
    return registros.length;
  });
  res.status(201).json({ mensaje: `Asistencia guardada (${total} alumnos)`, total });
}));

async function cargar(id) {
  const r = await query(
    `SELECT a.id_asistencia, a.presente, e.grupo_id FROM asistencia a
       JOIN estudiante e ON e.id_usuario = a.usuario_id WHERE a.id_asistencia = $1`, [id]);
  if (!r.rowCount) throw new HttpError(404, 'Asistencia no encontrada');
  return r.rows[0];
}

router.put('/:id/justificar', checkRole('admin', 'docente'), wrap(async (req, res) => {
  const id = intParam(req.params.id);
  const justificacion = texto(req.body.justificacion, 'La justificación', { max: 500 });
  const a = await cargar(id);
  await exigirDocenteEnGrupo(req.user, a.grupo_id);
  if (a.presente) throw new HttpError(409, 'Solo se pueden justificar faltas.');
  await query('UPDATE asistencia SET justificacion = $1 WHERE id_asistencia = $2', [justificacion, id]);
  res.json({ mensaje: 'Falta justificada correctamente', justificacion });
}));

router.delete('/:id', checkRole('admin', 'docente'), wrap(async (req, res) => {
  const id = intParam(req.params.id);
  const a = await cargar(id);
  await exigirDocenteEnGrupo(req.user, a.grupo_id);
  await query('DELETE FROM asistencia WHERE id_asistencia = $1', [id]);
  res.json({ mensaje: 'Asistencia eliminada correctamente' });
}));

module.exports = router;
