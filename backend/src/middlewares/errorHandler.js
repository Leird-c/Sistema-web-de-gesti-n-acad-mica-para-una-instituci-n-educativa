// Manejo global de errores: respuestas JSON consistentes.
const config = require('../config/config');
const { HttpError } = require('../utils/helpers');

const RESTRICCIONES = {
  ux_usuario_correo: 'El correo ya está registrado por otro usuario.',
  usuario_usuario_key: 'El nombre de usuario ya existe.',
  estudiante_matricula_key: 'La matrícula ya está registrada.',
  calificacion_estudiante_materia_key: 'Ya existe una calificación para ese estudiante en esa materia. Edítala en lugar de crearla de nuevo.',
  taller_nombre_key: 'Ya existe un taller con ese nombre.',
  docente_materia_materia_grupo_key: 'Esa materia ya tiene un docente asignado en ese grupo.',
  docente_materia_docente_materia_grupo_key: 'El docente ya tiene asignada esa materia en ese grupo.',
};

module.exports = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }
  if (err.code === '23505') {
    return res.status(409).json({ error: RESTRICCIONES[err.constraint] || 'Ya existe un registro con esos datos.' });
  }
  if (err.code === '23503') {
    return res.status(409).json({ error: 'No se puede completar la acción: hay registros relacionados.' });
  }
  if (err.code === '23514' || err.code === '22P02' || err.code === '22003') {
    return res.status(400).json({ error: 'Datos con formato o rango no válido.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON mal formado.' });
  }
  console.error('[error]', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    ...(config.isProd ? {} : { detalle: err.message }),
  });
};
