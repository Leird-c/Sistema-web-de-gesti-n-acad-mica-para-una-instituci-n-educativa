// /api/docente-materia  -  asignación de materias y grupos a docentes
const router = require('express').Router();
const config = require('../config/config');
const { query, tx } = require('../config/db');
const auth = require('../middlewares/auth');
const checkRole = require('../middlewares/checkRole');
const { HttpError, wrap, intParam } = require('../utils/helpers');

router.use(auth);

const SQL = `
  SELECT dm.id, dm.docente_id, u.nombre AS docente_nombre, dm.materia_id, m.nombre AS materia_nombre,
         dm.grupo_id, g.anio AS grupo_anio, g.seccion AS grupo_seccion
    FROM docente_materia dm
    JOIN usuario u ON u.id_usuario = dm.docente_id
    JOIN materia m ON m.id_materia = dm.materia_id
    JOIN grupo g ON g.id_grupo = dm.grupo_id`;

router.get('/', checkRole('admin'), wrap(async (req, res) => {
  res.json((await query(`${SQL} ORDER BY u.nombre, g.anio, g.seccion, m.nombre`)).rows);
}));

router.get('/mias', checkRole('docente'), wrap(async (req, res) => {
  res.json((await query(`${SQL} WHERE dm.docente_id = $1 ORDER BY g.anio, g.seccion, m.nombre`, [req.user.id_usuario])).rows);
}));

router.post('/', checkRole('admin'), wrap(async (req, res) => {
  const docenteId = intParam(req.body.docente_id ?? req.body.id_docente, 'El docente');
  const materiaId = intParam(req.body.materia_id ?? req.body.id_materia, 'La materia');
  const grupoId = intParam(req.body.grupo_id, 'El grupo');

  const creado = await tx(async (c) => {
    const d = await c.query("SELECT 1 FROM usuario WHERE id_usuario = $1 AND rol = 'docente' AND activo FOR UPDATE", [docenteId]);
    if (!d.rowCount) throw new HttpError(404, 'Docente no encontrado');
    const m = await c.query('SELECT anio FROM materia WHERE id_materia = $1', [materiaId]);
    if (!m.rowCount) throw new HttpError(404, 'Materia no encontrada');
    const g = await c.query('SELECT anio FROM grupo WHERE id_grupo = $1', [grupoId]);
    if (!g.rowCount) throw new HttpError(404, 'Grupo no encontrado');
    if (m.rows[0].anio !== g.rows[0].anio) {
      throw new HttpError(400, 'La materia no corresponde al año del grupo seleccionado.');
    }
    const ya = await c.query('SELECT 1 FROM docente_materia WHERE docente_id = $1 AND materia_id = $2 LIMIT 1', [docenteId, materiaId]);
    if (!ya.rowCount) {
      const n = await c.query('SELECT COUNT(DISTINCT materia_id) AS n FROM docente_materia WHERE docente_id = $1', [docenteId]);
      if (n.rows[0].n >= config.reglas.maxMateriasPorDocente) {
        throw new HttpError(409, `Un docente no puede tener más de ${config.reglas.maxMateriasPorDocente} materias asignadas.`);
      }
    }
    const r = await c.query(
      'INSERT INTO docente_materia (docente_id, materia_id, grupo_id) VALUES ($1, $2, $3) RETURNING id',
      [docenteId, materiaId, grupoId]
    );
    return r.rows[0].id;
  });
  res.status(201).json((await query(`${SQL} WHERE dm.id = $1`, [creado])).rows[0]);
}));

router.delete('/:id', checkRole('admin'), wrap(async (req, res) => {
  const id = intParam(req.params.id);
  const dm = await query('SELECT docente_id, materia_id, grupo_id FROM docente_materia WHERE id = $1', [id]);
  if (!dm.rowCount) throw new HttpError(404, 'Asignación no encontrada');
  const { docente_id, materia_id, grupo_id } = dm.rows[0];
  const h = await query('SELECT COUNT(*) AS n FROM horario WHERE docente_id = $1 AND materia_id = $2 AND grupo_id = $3',
    [docente_id, materia_id, grupo_id]);
  if (h.rows[0].n > 0) throw new HttpError(409, 'No se puede quitar la asignación: tiene horarios registrados. Elimínalos primero.');
  await query('DELETE FROM docente_materia WHERE id = $1', [id]);
  res.json({ mensaje: 'Asignación eliminada correctamente' });
}));

module.exports = router;
