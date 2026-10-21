// /api/grupos  -  grupos (año + sección). El docente solo ve los suyos.
const router = require('express').Router();
const { query } = require('../config/db');
const auth = require('../middlewares/auth');
const checkRole = require('../middlewares/checkRole');
const { wrap } = require('../utils/helpers');

router.get('/', auth, checkRole('admin', 'docente'), wrap(async (req, res) => {
  const r = await query(
    `SELECT g.id_grupo, g.anio, g.seccion, g.turno,
            (SELECT COUNT(*) FROM estudiante e WHERE e.grupo_id = g.id_grupo) AS alumnos
       FROM grupo g
      WHERE $1::text = 'admin' OR g.id_grupo IN (SELECT grupo_id FROM docente_materia WHERE docente_id = $2)
      ORDER BY g.anio, g.seccion`,
    [req.user.rol, req.user.id_usuario]
  );
  res.json(r.rows);
}));

module.exports = router;
