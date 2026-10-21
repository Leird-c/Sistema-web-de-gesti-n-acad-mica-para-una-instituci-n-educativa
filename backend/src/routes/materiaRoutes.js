// /api/materias  -  catálogo de materias
const router = require('express').Router();
const { query } = require('../config/db');
const auth = require('../middlewares/auth');
const { wrap } = require('../utils/helpers');

router.get('/', auth, wrap(async (req, res) => {
  const anio = req.query.anio ? Number(req.query.anio) : null;
  const r = await query(
    'SELECT id_materia, nombre, anio FROM materia WHERE ($1::int IS NULL OR anio = $1) ORDER BY anio, id_materia',
    [Number.isInteger(anio) ? anio : null]
  );
  res.json(r.rows);
}));

module.exports = router;
