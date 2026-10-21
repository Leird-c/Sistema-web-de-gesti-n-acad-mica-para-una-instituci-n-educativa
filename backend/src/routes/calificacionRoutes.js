// /api/calificaciones  -  registro y consulta de notas
const router = require('express').Router();
const config = require('../config/config');
const { query } = require('../config/db');
const auth = require('../middlewares/auth');
const checkRole = require('../middlewares/checkRole');
const { exigirVerEstudiante, exigirDocenteEnGrupo } = require('../utils/acceso');
const { HttpError, wrap, intParam, validarFecha, hoy } = require('../utils/helpers');

router.use(auth);

// Una fila por alumno x materia de su año (con o sin nota), para poder registrar las faltantes.
const SQL = `
  SELECT e.id_usuario AS estudiante_id, u.nombre AS estudiante_nombre,
         e.matricula, e.matricula AS estudiante_matricula,
         e.grupo_id, g.anio AS grupo_anio, g.seccion AS grupo_seccion, g.turno AS grupo_turno,
         m.id_materia AS materia_id, m.nombre AS materia_nombre,
         c.id_calificacion AS id, c.calificacion AS valor, c.fecha
    FROM estudiante e
    JOIN usuario u ON u.id_usuario = e.id_usuario
    JOIN grupo g ON g.id_grupo = e.grupo_id
    JOIN materia m ON m.anio = g.anio
    LEFT JOIN calificacion c ON c.estudiante_id = e.id_usuario AND c.materia_id = m.id_materia`;
const ORDEN = 'ORDER BY g.anio, g.seccion, u.nombre, m.id_materia';

async function habilitado() {
  const r = await query("SELECT valor FROM config_sistema WHERE clave = 'calificaciones_habilitadas'");
  return r.rows[0]?.valor === 'true';
}

async function exigirHabilitado(user) {
  if (user.rol === 'docente' && !(await habilitado())) {
    throw new HttpError(403, 'El registro de calificaciones está deshabilitado por el administrador.');
  }
}

function validarNota(valor) {
  if (valor === undefined || valor === null || valor === '' || typeof valor === 'boolean') {
    throw new HttpError(400, 'La calificación es obligatoria');
  }
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0 || n > config.reglas.notaMaxima) {
    throw new HttpError(400, `La calificación debe ser un número entre 0 y ${config.reglas.notaMaxima}`);
  }
  return Math.round(n * 100) / 100;
}

router.get('/estado', wrap(async (req, res) => {
  res.json({ sistemaHabilitado: await habilitado() });
}));

router.post('/habilitar', checkRole('admin'), wrap(async (req, res) => {
  if (typeof req.body.habilitado !== 'boolean') throw new HttpError(400, 'Se requiere el campo habilitado (boolean)');
  await query(
    `INSERT INTO config_sistema (clave, valor) VALUES ('calificaciones_habilitadas', $1)
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`,
    [String(req.body.habilitado)]
  );
  res.json({ mensaje: `Sistema de calificaciones ${req.body.habilitado ? 'habilitado' : 'deshabilitado'}`, sistemaHabilitado: req.body.habilitado });
}));

router.get('/', checkRole('admin'), wrap(async (req, res) => {
  const grupoId = req.query.grupo_id ? intParam(req.query.grupo_id, 'El grupo') : null;
  const materiaId = req.query.materia_id ? intParam(req.query.materia_id, 'La materia') : null;
  res.json((await query(
    `${SQL} WHERE ($1::int IS NULL OR e.grupo_id = $1) AND ($2::int IS NULL OR m.id_materia = $2) ${ORDEN}`,
    [grupoId, materiaId]
  )).rows);
}));

router.get('/docente', checkRole('docente'), wrap(async (req, res) => {
  res.json((await query(
    `${SQL}
     JOIN docente_materia dm ON dm.grupo_id = g.id_grupo AND dm.materia_id = m.id_materia AND dm.docente_id = $1
     ${ORDEN}`,
    [req.user.id_usuario]
  )).rows);
}));

router.get('/estudiante/:id', wrap(async (req, res) => {
  const id = intParam(req.params.id);
  await exigirVerEstudiante(req.user, id);
  res.json((await query(`${SQL} WHERE e.id_usuario = $1 ${ORDEN}`, [id])).rows);
}));

router.post('/', checkRole('admin', 'docente'), wrap(async (req, res) => {
  const estudianteId = intParam(req.body.estudiante_id, 'El estudiante');
  const materiaId = intParam(req.body.materia_id, 'La materia');
  const valor = validarNota(req.body.calificacion);
  const fecha = req.body.fecha ? validarFecha(req.body.fecha, 'La fecha de la calificación') : hoy();
  await exigirHabilitado(req.user);

  const info = await query(
    `SELECT e.grupo_id, g.anio AS grupo_anio, m.anio AS materia_anio
       FROM estudiante e JOIN grupo g ON g.id_grupo = e.grupo_id
       JOIN materia m ON m.id_materia = $2 WHERE e.id_usuario = $1`,
    [estudianteId, materiaId]
  );
  if (!info.rowCount) throw new HttpError(404, 'Estudiante o materia no encontrados');
  if (info.rows[0].grupo_anio !== info.rows[0].materia_anio) {
    throw new HttpError(400, 'La materia no corresponde al año del estudiante');
  }
  await exigirDocenteEnGrupo(req.user, info.rows[0].grupo_id, materiaId);

  const r = await query(
    `INSERT INTO calificacion (estudiante_id, materia_id, calificacion, fecha, registrado_por)
     VALUES ($1, $2, $3, $4, $5) RETURNING id_calificacion AS id, estudiante_id, materia_id, calificacion, calificacion AS valor, fecha`,
    [estudianteId, materiaId, valor, fecha, req.user.id_usuario]
  );
  res.status(201).json(r.rows[0]);
}));

async function cargarCalificacion(id) {
  const r = await query(
    `SELECT c.id_calificacion, c.materia_id, e.grupo_id FROM calificacion c
       JOIN estudiante e ON e.id_usuario = c.estudiante_id WHERE c.id_calificacion = $1`,
    [id]
  );
  if (!r.rowCount) throw new HttpError(404, 'Calificación no encontrada');
  return r.rows[0];
}

router.put('/:id', checkRole('admin', 'docente'), wrap(async (req, res) => {
  const id = intParam(req.params.id);
  const valor = validarNota(req.body.calificacion ?? req.body.valor);
  const fecha = req.body.fecha ? validarFecha(req.body.fecha, 'La fecha de la calificación') : hoy();
  const cal = await cargarCalificacion(id);
  await exigirDocenteEnGrupo(req.user, cal.grupo_id, cal.materia_id);
  await exigirHabilitado(req.user);
  const r = await query(
    `UPDATE calificacion SET calificacion = $1, fecha = $2, registrado_por = $3 WHERE id_calificacion = $4
     RETURNING id_calificacion AS id, calificacion, calificacion AS valor, fecha`,
    [valor, fecha, req.user.id_usuario, id]
  );
  res.json(r.rows[0]);
}));

router.delete('/:id', checkRole('admin', 'docente'), wrap(async (req, res) => {
  const id = intParam(req.params.id);
  const cal = await cargarCalificacion(id);
  await exigirDocenteEnGrupo(req.user, cal.grupo_id, cal.materia_id);
  await exigirHabilitado(req.user);
  await query('DELETE FROM calificacion WHERE id_calificacion = $1', [id]);
  res.json({ mensaje: 'Calificación eliminada correctamente' });
}));

module.exports = router;
