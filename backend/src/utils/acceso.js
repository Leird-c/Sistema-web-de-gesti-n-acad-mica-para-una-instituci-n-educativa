// Reglas de acceso a datos de estudiantes y grupos según el rol.
const { query } = require('../config/db');
const { HttpError } = require('./helpers');

async function docenteImparteEnGrupo(docenteId, grupoId, materiaId = null) {
  const r = await query(
    `SELECT 1 FROM docente_materia
      WHERE docente_id = $1 AND grupo_id = $2 AND ($3::int IS NULL OR materia_id = $3) LIMIT 1`,
    [docenteId, grupoId, materiaId]
  );
  return r.rowCount > 0;
}

async function puedeVerEstudiante(user, estudianteId) {
  switch (user.rol) {
    case 'admin':
      return true;
    case 'estudiante':
      return user.id_usuario === estudianteId;
    case 'padre': {
      const r = await query(
        'SELECT 1 FROM padre_estudiante WHERE id_padre = $1 AND id_estudiante = $2',
        [user.id_usuario, estudianteId]
      );
      return r.rowCount > 0;
    }
    case 'docente': {
      const r = await query(
        `SELECT 1 FROM estudiante e
           JOIN docente_materia dm ON dm.grupo_id = e.grupo_id
          WHERE e.id_usuario = $1 AND dm.docente_id = $2 LIMIT 1`,
        [estudianteId, user.id_usuario]
      );
      return r.rowCount > 0;
    }
    default:
      return false;
  }
}

async function exigirVerEstudiante(user, estudianteId) {
  if (!(await puedeVerEstudiante(user, estudianteId))) {
    throw new HttpError(403, 'No tienes acceso a la información de este estudiante.');
  }
}

async function exigirDocenteEnGrupo(user, grupoId, materiaId = null) {
  if (user.rol === 'admin') return;
  if (user.rol !== 'docente' || !(await docenteImparteEnGrupo(user.id_usuario, grupoId, materiaId))) {
    throw new HttpError(403, 'No tienes asignado este grupo/materia.');
  }
}

module.exports = { docenteImparteEnGrupo, puedeVerEstudiante, exigirVerEstudiante, exigirDocenteEnGrupo };
