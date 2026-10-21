// /api/talleres  -  talleres, cupos e inscripciones
const router = require('express').Router();
const config = require('../config/config');
const { query, tx } = require('../config/db');
const auth = require('../middlewares/auth');
const checkRole = require('../middlewares/checkRole');
const { HttpError, wrap, intParam, texto, hoy } = require('../utils/helpers');

router.use(auth);
const { reglas } = config;

function validarCupo(cupo) {
  const n = Number(cupo);
  if (!Number.isInteger(n) || n < 1 || n > reglas.cupoTallerMaximo) {
    throw new HttpError(400, `El cupo debe ser un número entero entre 1 y ${reglas.cupoTallerMaximo}.`);
  }
  return n;
}

const SQL_LISTA = `
  SELECT t.id_taller AS id, t.nombre, t.descripcion, t.cupo AS cupo_maximo,
         (SELECT COUNT(*) FROM estudiante e WHERE e.taller_id = t.id_taller) AS inscritos
    FROM taller t`;

router.get('/', wrap(async (req, res) => {
  res.json((await query(`${SQL_LISTA} ORDER BY t.id_taller`)).rows);
}));

router.get('/mi-taller', checkRole('estudiante'), wrap(async (req, res) => {
  const r = await query(
    `SELECT t.id_taller AS id, t.nombre, e.taller_inscrito_en AS fecha_inscripcion
       FROM estudiante e JOIN taller t ON t.id_taller = e.taller_id WHERE e.id_usuario = $1`,
    [req.user.id_usuario]
  );
  res.json(r.rows[0] || {});
}));

router.get('/:id/alumnos', checkRole('admin', 'docente'), wrap(async (req, res) => {
  const r = await query(
    `SELECT u.id_usuario, u.nombre, u.correo, e.matricula, e.grupo_id, g.anio, g.seccion
       FROM estudiante e
       JOIN usuario u ON u.id_usuario = e.id_usuario
       JOIN grupo g ON g.id_grupo = e.grupo_id
      WHERE e.taller_id = $1 ORDER BY u.nombre`,
    [intParam(req.params.id)]
  );
  res.json(r.rows);
}));

router.post('/', checkRole('admin'), wrap(async (req, res) => {
  const nombre = texto(req.body.nombre, 'El nombre', { max: 100 });
  const descripcion = texto(req.body.descripcion, 'La descripción', { max: 500, requerido: false });
  const cupo = validarCupo(req.body.cupo);
  const r = await query('INSERT INTO taller (nombre, descripcion, cupo) VALUES ($1, $2, $3) RETURNING id_taller', [nombre, descripcion, cupo]);
  res.status(201).json((await query(`${SQL_LISTA} WHERE t.id_taller = $1`, [r.rows[0].id_taller])).rows[0]);
}));

router.put('/:id', checkRole('admin'), wrap(async (req, res) => {
  const id = intParam(req.params.id);
  const nombre = texto(req.body.nombre, 'El nombre', { max: 100 });
  const descripcion = texto(req.body.descripcion, 'La descripción', { max: 500, requerido: false });
  const cupo = validarCupo(req.body.cupo);
  const n = (await query('SELECT COUNT(*) AS n FROM estudiante WHERE taller_id = $1', [id])).rows[0].n;
  if (n > cupo) throw new HttpError(409, 'No puedes establecer un cupo menor al número de estudiantes ya inscritos.');
  const r = await query('UPDATE taller SET nombre = $1, descripcion = $2, cupo = $3 WHERE id_taller = $4 RETURNING id_taller', [nombre, descripcion, cupo, id]);
  if (!r.rowCount) throw new HttpError(404, 'Taller no encontrado');
  res.json((await query(`${SQL_LISTA} WHERE t.id_taller = $1`, [id])).rows[0]);
}));

router.delete('/:id', checkRole('admin'), wrap(async (req, res) => {
  const id = intParam(req.params.id);
  const n = (await query('SELECT COUNT(*) AS n FROM estudiante WHERE taller_id = $1', [id])).rows[0].n;
  if (n > 0) throw new HttpError(409, 'No se puede eliminar el taller: hay estudiantes inscritos.');
  const r = await query('DELETE FROM taller WHERE id_taller = $1 RETURNING id_taller, nombre', [id]);
  if (!r.rowCount) throw new HttpError(404, 'Taller no encontrado');
  res.json({ mensaje: 'Taller eliminado correctamente', taller: r.rows[0] });
}));

// Inscripción (primera vez)
router.post('/:id/inscribir', checkRole('estudiante'), wrap(async (req, res) => {
  const tallerId = intParam(req.params.id, 'El taller');
  await tx(async (c) => {
    const t = await c.query('SELECT cupo FROM taller WHERE id_taller = $1 FOR UPDATE', [tallerId]);
    if (!t.rowCount) throw new HttpError(404, 'Taller no encontrado.');
    const e = await c.query('SELECT taller_id FROM estudiante WHERE id_usuario = $1 FOR UPDATE', [req.user.id_usuario]);
    if (!e.rowCount) throw new HttpError(404, 'No se encontró el estudiante asociado a este usuario.');
    if (e.rows[0].taller_id === tallerId) throw new HttpError(409, 'Ya estás inscrito en este taller.');
    if (e.rows[0].taller_id) throw new HttpError(409, 'Ya estás inscrito en otro taller. Usa la opción de cambio dentro del plazo permitido.');
    const n = (await c.query('SELECT COUNT(*) AS n FROM estudiante WHERE taller_id = $1', [tallerId])).rows[0].n;
    if (n >= t.rows[0].cupo) throw new HttpError(409, 'El taller ya alcanzó el cupo máximo.');
    await c.query('UPDATE estudiante SET taller_id = $1, taller_inscrito_en = NOW() WHERE id_usuario = $2', [tallerId, req.user.id_usuario]);
  });
  res.json({ mensaje: 'Inscripción exitosa al taller.' });
}));

// Cambio de taller: solo durante los primeros N días desde la inscripción
router.post('/:id/cambiar', checkRole('estudiante'), wrap(async (req, res) => {
  const tallerId = intParam(req.params.id, 'El taller');
  await tx(async (c) => {
    const t = await c.query('SELECT cupo FROM taller WHERE id_taller = $1 FOR UPDATE', [tallerId]);
    if (!t.rowCount) throw new HttpError(404, 'Taller no encontrado.');
    const e = await c.query('SELECT taller_id, taller_inscrito_en FROM estudiante WHERE id_usuario = $1 FOR UPDATE', [req.user.id_usuario]);
    if (!e.rowCount) throw new HttpError(404, 'No se encontró el estudiante asociado a este usuario.');
    const { taller_id: actual, taller_inscrito_en: desde } = e.rows[0];
    if (!actual) throw new HttpError(409, 'Aún no estás inscrito en ningún taller.');
    if (actual === tallerId) throw new HttpError(409, 'Ya estás inscrito en este taller.');
    if (config.fechaLimiteCambioTaller && hoy() > config.fechaLimiteCambioTaller) {
      throw new HttpError(403, `El plazo para cambiar de taller venció el ${config.fechaLimiteCambioTaller}.`);
    }
    const dias = (Date.now() - new Date(desde).getTime()) / 86400000;
    if (dias > reglas.diasParaCambiarTaller) {
      throw new HttpError(403, `Solo puedes cambiar de taller durante los primeros ${reglas.diasParaCambiarTaller} días desde tu inscripción.`);
    }
    const n = (await c.query('SELECT COUNT(*) AS n FROM estudiante WHERE taller_id = $1', [tallerId])).rows[0].n;
    if (n >= t.rows[0].cupo) throw new HttpError(409, 'El taller ya alcanzó el cupo máximo.');
    await c.query('UPDATE estudiante SET taller_id = $1 WHERE id_usuario = $2', [tallerId, req.user.id_usuario]);
  });
  res.json({ mensaje: 'Cambio de taller exitoso.' });
}));

// Dar de baja a un estudiante (admin)
router.delete('/:tallerId/estudiante/:estudianteId', checkRole('admin'), wrap(async (req, res) => {
  const tallerId = intParam(req.params.tallerId, 'El taller');
  const estudianteId = intParam(req.params.estudianteId, 'El estudiante');
  const r = await query(
    `UPDATE estudiante SET taller_id = NULL, taller_inscrito_en = NULL
      WHERE id_usuario = $1 AND taller_id = $2 RETURNING id_usuario`,
    [estudianteId, tallerId]
  );
  if (!r.rowCount) throw new HttpError(409, 'El estudiante no está inscrito en este taller.');
  res.json({ mensaje: 'Estudiante dado de baja del taller exitosamente' });
}));

module.exports = router;
