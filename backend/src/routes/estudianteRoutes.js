// /api/estudiantes  -  consulta de estudiantes según el rol
const router = require('express').Router();
const { query } = require('../config/db');
const auth = require('../middlewares/auth');
const checkRole = require('../middlewares/checkRole');
const { exigirVerEstudiante } = require('../utils/acceso');
const { HttpError, wrap, intParam } = require('../utils/helpers');

router.use(auth);

const SQL = `
  SELECT e.id_usuario, e.id_usuario AS id, u.nombre, u.correo, u.usuario, u.rol, e.matricula,
         e.grupo_id, g.anio, g.seccion, g.turno, e.taller_id, t.nombre AS taller
    FROM estudiante e
    JOIN usuario u ON u.id_usuario = e.id_usuario
    JOIN grupo g ON g.id_grupo = e.grupo_id
    LEFT JOIN taller t ON t.id_taller = e.taller_id`;

// Admin: todos. Docente: solo los de sus grupos.
router.get('/', checkRole('admin', 'docente'), wrap(async (req, res) => {
  const grupoId = req.query.grupo_id ? intParam(req.query.grupo_id, 'El grupo') : null;
  const r = await query(
    `${SQL}
      WHERE ($1::int IS NULL OR e.grupo_id = $1)
        AND ($2::text = 'admin' OR e.grupo_id IN (SELECT grupo_id FROM docente_materia WHERE docente_id = $3))
      ORDER BY g.anio, g.seccion, u.nombre`,
    [grupoId, req.user.rol, req.user.id_usuario]
  );
  res.json(r.rows);
}));

router.get('/:id', wrap(async (req, res) => {
  const id = intParam(req.params.id);
  await exigirVerEstudiante(req.user, id);
  const r = await query(`${SQL} WHERE e.id_usuario = $1`, [id]);
  if (!r.rowCount) throw new HttpError(404, 'Estudiante no encontrado');
  res.json(r.rows[0]);
}));

module.exports = router;
