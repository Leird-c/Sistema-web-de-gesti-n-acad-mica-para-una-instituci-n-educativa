// /api/incidencias  -  reportes de conducta
const router = require('express').Router();
const config = require('../config/config');
const { query } = require('../config/db');
const auth = require('../middlewares/auth');
const checkRole = require('../middlewares/checkRole');
const { exigirVerEstudiante } = require('../utils/acceso');
const { HttpError, wrap, intParam, texto, validarFecha, hoy } = require('../utils/helpers');

router.use(auth);

const SQL = `
  SELECT i.id_incidencia AS id, i.id_incidencia, i.usuario_id, i.usuario_id AS estudiante_id,
         u.nombre AS estudiante_nombre, e.matricula AS estudiante_matricula,
         g.anio AS grupo_anio, g.seccion AS grupo_seccion,
         i.tipo, i.descripcion, i.fecha, i.sancion,
         i.materia_id, m.nombre AS materia_nombre, i.taller_id, t.nombre AS taller_nombre,
         i.registrado_por, ur.nombre AS registrado_por_nombre
    FROM incidencia i
    JOIN estudiante e ON e.id_usuario = i.usuario_id
    JOIN usuario u ON u.id_usuario = i.usuario_id
    JOIN grupo g ON g.id_grupo = e.grupo_id
    LEFT JOIN materia m ON m.id_materia = i.materia_id
    LEFT JOIN taller t ON t.id_taller = i.taller_id
    LEFT JOIN usuario ur ON ur.id_usuario = i.registrado_por`;
const ORDEN = 'ORDER BY i.fecha DESC, i.id_incidencia DESC';

function datos(body) {
  const tipo = texto(body.tipo, 'El tipo de incidencia', { max: 100 });
  const descripcion = texto(body.descripcion, 'La descripción', { max: 1000 });
  const sancion = body.sancion ? String(body.sancion) : null;
  if (sancion && !config.reglas.sanciones.includes(sancion)) throw new HttpError(400, 'Sanción no válida');
  const materiaId = body.materia_id ? intParam(body.materia_id, 'La materia') : null;
  const tallerId = body.taller_id ? intParam(body.taller_id, 'El taller') : null;
  if (!materiaId && !tallerId) throw new HttpError(400, 'Debe indicar una materia o un taller');
  return { tipo, descripcion, sancion, materiaId, tallerId };
}

router.get('/', checkRole('admin'), wrap(async (req, res) => {
  res.json((await query(`${SQL} ${ORDEN}`)).rows);
}));

router.get('/docente', checkRole('docente'), wrap(async (req, res) => {
  res.json((await query(
    `${SQL} WHERE e.grupo_id IN (SELECT grupo_id FROM docente_materia WHERE docente_id = $1) ${ORDEN}`,
    [req.user.id_usuario]
  )).rows);
}));

router.get('/usuario/:id', wrap(async (req, res) => {
  const id = intParam(req.params.id);
  await exigirVerEstudiante(req.user, id);
  res.json((await query(`${SQL} WHERE i.usuario_id = $1 ${ORDEN}`, [id])).rows);
}));

router.post('/', checkRole('admin', 'docente'), wrap(async (req, res) => {
  const usuarioId = intParam(req.body.usuario_id ?? req.body.estudiante_id, 'El estudiante');
  const fecha = req.body.fecha ? validarFecha(req.body.fecha, 'La fecha de la incidencia') : hoy();
  const d = datos(req.body);
  const e = await query('SELECT 1 FROM estudiante WHERE id_usuario = $1', [usuarioId]);
  if (!e.rowCount) throw new HttpError(404, 'Estudiante no encontrado');
  await exigirVerEstudiante(req.user, usuarioId);

  const r = await query(
    `INSERT INTO incidencia (usuario_id, fecha, descripcion, tipo, sancion, materia_id, taller_id, registrado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id_incidencia`,
    [usuarioId, fecha, d.descripcion, d.tipo, d.sancion, d.materiaId, d.tallerId, req.user.id_usuario]
  );
  res.status(201).json((await query(`${SQL} WHERE i.id_incidencia = $1`, [r.rows[0].id_incidencia])).rows[0]);
}));

router.put('/:id', checkRole('admin', 'docente'), wrap(async (req, res) => {
  const id = intParam(req.params.id);
  const d = datos(req.body);
  const cur = await query('SELECT registrado_por FROM incidencia WHERE id_incidencia = $1', [id]);
  if (!cur.rowCount) throw new HttpError(404, 'Incidencia no encontrada');
  if (req.user.rol === 'docente' && cur.rows[0].registrado_por !== req.user.id_usuario) {
    throw new HttpError(403, 'Solo puedes editar las incidencias que tú registraste.');
  }
  const fecha = req.body.fecha ? validarFecha(req.body.fecha, 'La fecha de la incidencia') : null;
  await query(
    `UPDATE incidencia SET tipo = $1, descripcion = $2, sancion = $3, materia_id = $4, taller_id = $5,
            fecha = COALESCE($6::date, fecha) WHERE id_incidencia = $7`,
    [d.tipo, d.descripcion, d.sancion, d.materiaId, d.tallerId, fecha, id]
  );
  res.json((await query(`${SQL} WHERE i.id_incidencia = $1`, [id])).rows[0]);
}));

router.delete('/:id', checkRole('admin'), wrap(async (req, res) => {
  const r = await query('DELETE FROM incidencia WHERE id_incidencia = $1 RETURNING id_incidencia', [intParam(req.params.id)]);
  if (!r.rowCount) throw new HttpError(404, 'Incidencia no encontrada');
  res.json({ mensaje: 'Incidencia eliminada correctamente' });
}));

module.exports = router;
