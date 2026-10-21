// /api/usuarios  -  login, cambio de contraseña y gestión de usuarios (admin)
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { query, tx } = require('../config/db');
const auth = require('../middlewares/auth');
const checkRole = require('../middlewares/checkRole');
const email = require('../services/emailService');
const { puedeVerEstudiante } = require('../utils/acceso');
const {
  HttpError, wrap, RE, intParam, texto, validarCorreo, generarPasswordTemporal, limitador,
} = require('../utils/helpers');

const { reglas } = config;
const limiteLogin = limitador({ max: 10 });

// ---------- utilidades ----------
const hash = (p) => bcrypt.hash(p, 10);

function validarPassword(p, etiqueta = 'La contraseña') {
  if (typeof p !== 'string' || p.length < reglas.passwordMinimo) {
    throw new HttpError(400, `${etiqueta} debe tener al menos ${reglas.passwordMinimo} caracteres`);
  }
  return p;
}

async function siguienteUsuario(c, prefijo, digitos) {
  const r = await c.query(
    `SELECT COALESCE(MAX(SUBSTRING(usuario FROM '[0-9]+$')::int), 0) + 1 AS n
       FROM usuario WHERE usuario ~ $1`,
    [`^${prefijo}[0-9]+$`]
  );
  return prefijo + String(r.rows[0].n).padStart(digitos, '0');
}

async function obtenerOCrearGrupo(c, anio, seccion) {
  const a = Number(anio);
  const s = String(seccion || '').trim().toUpperCase();
  if (!reglas.anios.includes(a)) throw new HttpError(400, `Año escolar inválido. Solo se permiten: ${reglas.anios.join(', ')}`);
  if (!reglas.secciones.includes(s)) throw new HttpError(400, `Grupo inválido. Solo se permiten: ${reglas.secciones.join(', ')}`);
  let r = await c.query('SELECT id_grupo FROM grupo WHERE anio = $1 AND seccion = $2', [a, s]);
  if (r.rowCount === 0) r = await c.query('INSERT INTO grupo (anio, seccion) VALUES ($1, $2) RETURNING id_grupo', [a, s]);
  return r.rows[0].id_grupo;
}

async function verificarCupoGrupo(c, grupoId, excluirEstudianteId = null) {
  const r = await c.query(
    'SELECT COUNT(*) AS n FROM estudiante WHERE grupo_id = $1 AND ($2::int IS NULL OR id_usuario <> $2)',
    [grupoId, excluirEstudianteId]
  );
  if (r.rows[0].n >= reglas.cupoGrupo) {
    throw new HttpError(409, `El grupo ya alcanzó el cupo máximo de ${reglas.cupoGrupo} alumnos.`);
  }
}

const firmar = (payload, expira = config.jwtExpira) => jwt.sign(payload, config.jwtSecret, { expiresIn: expira });

// ---------- login ----------
router.post('/login', wrap(async (req, res) => {
  const login = typeof req.body.login === 'string' ? req.body.login.trim() : '';
  const contrasena = typeof req.body.contrasena === 'string' ? req.body.contrasena : '';
  const rolPedido = typeof req.body.rol === 'string' ? req.body.rol.trim().toLowerCase() : null;
  if (!login || !contrasena) throw new HttpError(400, 'Usuario/correo y contraseña requeridos');

  const clave = `${req.ip}|${login.toLowerCase()}`;
  limiteLogin.revisar(clave);

  const r = await query(
    `SELECT * FROM usuario
      WHERE LOWER(usuario) = LOWER($1) OR LOWER(correo) = LOWER($1)
      ORDER BY (LOWER(usuario) = LOWER($1)) DESC LIMIT 1`,
    [login]
  );
  const u = r.rows[0];
  if (!u || !(await bcrypt.compare(contrasena, u.contrasena))) {
    limiteLogin.fallo(clave);
    throw new HttpError(401, 'Credenciales inválidas');
  }
  if (!u.activo) throw new HttpError(403, 'Su cuenta está desactivada. Contacte al administrador.');
  if (rolPedido && rolPedido !== u.rol) {
    throw new HttpError(401, 'El rol seleccionado no corresponde a este usuario.');
  }
  limiteLogin.limpiar(clave);

  // Contraseña temporal: solo permite cambiarla (token corto y restringido)
  if (u.password_change_required) {
    if (u.temp_password_expires && new Date() > new Date(u.temp_password_expires)) {
      return res.status(401).json({
        error: 'Su contraseña temporal ha expirado. Contacte al administrador para reactivar su cuenta.',
        expired: true,
      });
    }
    const token = firmar(
      { id_usuario: u.id_usuario, rol: u.rol, nombre: u.nombre, correo: u.correo, cambio_password: true },
      '15m'
    );
    return res.json({
      token,
      passwordChangeRequired: true,
      message: 'Debe cambiar su contraseña antes de continuar',
      tempPasswordExpires: u.temp_password_expires,
    });
  }

  let estudiantes = null;
  if (u.rol === 'padre') {
    const hijos = await query(
      `SELECT e.id_usuario, us.nombre
         FROM padre_estudiante pe
         JOIN estudiante e ON e.id_usuario = pe.id_estudiante
         JOIN usuario us ON us.id_usuario = e.id_usuario
        WHERE pe.id_padre = $1 ORDER BY us.nombre`,
      [u.id_usuario]
    );
    estudiantes = hijos.rows;
  }
  if (u.first_login) await query('UPDATE usuario SET first_login = FALSE WHERE id_usuario = $1', [u.id_usuario]);

  const token = firmar({
    id_usuario: u.id_usuario, rol: u.rol, nombre: u.nombre, correo: u.correo,
    ...(estudiantes ? { estudiantes } : {}),
  });
  res.json({ token, estudiantes });
}));

// ---------- cambio de contraseña ----------
router.post('/cambiar-password-temporal', auth.temporal, wrap(async (req, res) => {
  const nueva = validarPassword(req.body.nuevaContrasena, 'La nueva contraseña');
  const r = await query(
    'SELECT contrasena, password_change_required, temp_password_expires FROM usuario WHERE id_usuario = $1',
    [req.user.id_usuario]
  );
  const u = r.rows[0];
  if (!u) throw new HttpError(404, 'Usuario no encontrado');
  if (!u.password_change_required) throw new HttpError(400, 'No es necesario cambiar la contraseña');
  if (u.temp_password_expires && new Date() > new Date(u.temp_password_expires)) {
    throw new HttpError(401, 'Su contraseña temporal ha expirado. Contacte al administrador.');
  }
  if (await bcrypt.compare(nueva, u.contrasena)) {
    throw new HttpError(400, 'La nueva contraseña debe ser distinta de la temporal');
  }
  await query(
    `UPDATE usuario SET contrasena = $1, password_change_required = FALSE,
            temp_password_expires = NULL, first_login = FALSE WHERE id_usuario = $2`,
    [await hash(nueva), req.user.id_usuario]
  );
  res.json({ mensaje: 'Contraseña actualizada correctamente. Ya puede iniciar sesión con su nueva contraseña.' });
}));

router.put('/cambiar-contrasena', auth, wrap(async (req, res) => {
  const { contrasenaActual } = req.body;
  const nueva = validarPassword(req.body.nuevaContrasena, 'La nueva contraseña');
  const r = await query('SELECT contrasena FROM usuario WHERE id_usuario = $1', [req.user.id_usuario]);
  if (!r.rowCount || !(await bcrypt.compare(String(contrasenaActual || ''), r.rows[0].contrasena))) {
    throw new HttpError(400, 'La contraseña actual no es correcta');
  }
  await query('UPDATE usuario SET contrasena = $1 WHERE id_usuario = $2', [await hash(nueva), req.user.id_usuario]);
  res.json({ mensaje: 'Contraseña actualizada correctamente' });
}));

// ---------- gestión de usuarios (admin) ----------
const SQL_LISTA = `
  SELECT u.id_usuario, u.usuario, u.nombre, u.correo, u.rol, u.tipo_docente, u.activo,
         e.matricula, e.grupo_id, g.anio, g.seccion, g.seccion AS grupo,
         e.taller_id, t.nombre AS taller, p.homoclave,
         (SELECT string_agg(ue.nombre, ', ' ORDER BY ue.nombre)
            FROM padre_estudiante pe JOIN usuario ue ON ue.id_usuario = pe.id_estudiante
           WHERE pe.id_padre = u.id_usuario) AS estudiantes_nombres,
         (SELECT MIN(pe.id_estudiante) FROM padre_estudiante pe WHERE pe.id_padre = u.id_usuario) AS estudiante_id
    FROM usuario u
    LEFT JOIN estudiante e ON e.id_usuario = u.id_usuario
    LEFT JOIN grupo g ON g.id_grupo = e.grupo_id
    LEFT JOIN taller t ON t.id_taller = e.taller_id
    LEFT JOIN padre p ON p.id_usuario = u.id_usuario`;

router.get('/', auth, checkRole('admin'), wrap(async (req, res) => {
  const { rol } = req.query;
  const r = await query(
    `${SQL_LISTA} WHERE ($1::text IS NULL OR u.rol = $1)
      ORDER BY CASE u.rol WHEN 'admin' THEN 1 WHEN 'docente' THEN 2 WHEN 'estudiante' THEN 3 ELSE 4 END,
               g.anio, g.seccion, u.nombre`,
    [rol || null]
  );
  res.json(r.rows);
}));

router.get('/:id', auth, wrap(async (req, res) => {
  const id = intParam(req.params.id);
  if (req.user.rol !== 'admin' && req.user.id_usuario !== id) {
    throw new HttpError(403, 'Solo puedes acceder a tu propia información.');
  }
  const r = await query(`${SQL_LISTA} WHERE u.id_usuario = $1`, [id]);
  if (!r.rowCount) throw new HttpError(404, 'Usuario no encontrado');
  res.json(r.rows[0]);
}));

router.post('/', auth, checkRole('admin'), wrap(async (req, res) => {
  const rol = req.body.rol;
  if (rol === 'padre') {
    throw new HttpError(400, 'Los padres/tutores se registran en /api/padres/completo (se genera contraseña temporal).');
  }
  if (!['admin', 'docente', 'estudiante'].includes(rol)) throw new HttpError(400, 'Rol no válido');

  const nombre = texto(req.body.nombre, 'El nombre', { max: 100 });
  const correo = validarCorreo(req.body.correo);
  const password = validarPassword(req.body.contrasena || req.body.password);

  const creado = await tx(async (c) => {
    let usuario;
    let tipoDocente = null;
    let matricula = null;
    let grupoId = null;

    if (rol === 'admin') {
      usuario = await siguienteUsuario(c, 'A', 2);
    } else if (rol === 'docente') {
      tipoDocente = req.body.tipo_docente;
      if (!['BA', 'BB'].includes(tipoDocente)) throw new HttpError(400, 'Tipo de docente inválido (BA o BB)');
      usuario = await siguienteUsuario(c, tipoDocente, 6);
    } else {
      matricula = String(req.body.matricula || '').trim().toUpperCase();
      if (!RE.matricula.test(matricula)) {
        throw new HttpError(400, 'Formato de matrícula inválido. Debe ser: C seguido de 13 dígitos (ej: C1234567890123)');
      }
      grupoId = await obtenerOCrearGrupo(c, req.body.anio, req.body.grupo);
      await verificarCupoGrupo(c, grupoId);
      usuario = matricula; // el alumno inicia sesión con su matrícula
    }

    const u = await c.query(
      `INSERT INTO usuario (usuario, nombre, correo, contrasena, rol, tipo_docente)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id_usuario, usuario, nombre, correo, rol, tipo_docente, activo`,
      [usuario, nombre, correo, await hash(password), rol, tipoDocente]
    );
    if (rol === 'estudiante') {
      await c.query('INSERT INTO estudiante (id_usuario, matricula, grupo_id) VALUES ($1, $2, $3)',
        [u.rows[0].id_usuario, matricula, grupoId]);
    }
    return u.rows[0];
  });
  res.status(201).json(creado);
}));

router.put('/:id', auth, checkRole('admin'), wrap(async (req, res) => {
  const id = intParam(req.params.id);
  const nombre = texto(req.body.nombre, 'El nombre', { max: 100 });
  const correo = validarCorreo(req.body.correo);

  const actualizado = await tx(async (c) => {
    const cur = await c.query('SELECT rol FROM usuario WHERE id_usuario = $1 FOR UPDATE', [id]);
    if (!cur.rowCount) throw new HttpError(404, 'Usuario no encontrado');
    const rol = cur.rows[0].rol;

    let tipoDocente = null;
    if (rol === 'docente') {
      tipoDocente = req.body.tipo_docente;
      if (!['BA', 'BB'].includes(tipoDocente)) throw new HttpError(400, 'Tipo de docente inválido (BA o BB)');
    }
    let activo = null;
    if (typeof req.body.activo === 'boolean') {
      if (!req.body.activo && id === req.user.id_usuario) throw new HttpError(400, 'No puedes desactivar tu propia cuenta.');
      activo = req.body.activo;
    }
    const r = await c.query(
      `UPDATE usuario SET nombre = $1, correo = $2, tipo_docente = $3, activo = COALESCE($4, activo)
        WHERE id_usuario = $5
        RETURNING id_usuario, usuario, nombre, correo, rol, tipo_docente, activo`,
      [nombre, correo, tipoDocente, activo, id]
    );
    if (rol === 'estudiante' && req.body.anio && req.body.grupo) {
      const grupoId = await obtenerOCrearGrupo(c, req.body.anio, req.body.grupo);
      await verificarCupoGrupo(c, grupoId, id);
      await c.query('UPDATE estudiante SET grupo_id = $1 WHERE id_usuario = $2', [grupoId, id]);
    }
    return r.rows[0];
  });
  res.json({ mensaje: 'Usuario actualizado correctamente', usuario: actualizado });
}));

router.delete('/:id', auth, checkRole('admin'), wrap(async (req, res) => {
  const id = intParam(req.params.id);
  if (id === req.user.id_usuario) throw new HttpError(409, 'No puedes eliminar tu propia cuenta.');
  const u = await query('SELECT rol FROM usuario WHERE id_usuario = $1', [id]);
  if (!u.rowCount) throw new HttpError(404, 'Usuario no encontrado');
  const { rol } = u.rows[0];

  const cuenta = async (sql) => (await query(sql, [id])).rows[0].n;
  if (rol === 'estudiante') {
    if (await cuenta('SELECT COUNT(*) AS n FROM calificacion WHERE estudiante_id = $1')) {
      throw new HttpError(409, 'No se puede eliminar el usuario: el estudiante tiene calificaciones registradas.');
    }
    if (await cuenta('SELECT COUNT(*) AS n FROM asistencia WHERE usuario_id = $1')) {
      throw new HttpError(409, 'No se puede eliminar el usuario: el estudiante tiene asistencias registradas.');
    }
    if (await cuenta('SELECT COUNT(*) AS n FROM incidencia WHERE usuario_id = $1')) {
      throw new HttpError(409, 'No se puede eliminar el usuario: el estudiante tiene incidencias registradas.');
    }
  }
  if (rol === 'docente') {
    if (await cuenta('SELECT COUNT(*) AS n FROM horario WHERE docente_id = $1')) {
      throw new HttpError(409, 'No se puede eliminar el usuario: es docente con horarios asignados.');
    }
    if (await cuenta('SELECT COUNT(*) AS n FROM docente_materia WHERE docente_id = $1')) {
      throw new HttpError(409, 'No se puede eliminar el usuario: es docente con materias asignadas. Retira primero las asignaciones.');
    }
  }
  if (rol === 'admin' && (await query("SELECT COUNT(*) AS n FROM usuario WHERE rol = 'admin' AND activo")).rows[0].n <= 1) {
    throw new HttpError(409, 'No se puede eliminar al único administrador activo.');
  }
  const r = await query('DELETE FROM usuario WHERE id_usuario = $1 RETURNING id_usuario, usuario, nombre', [id]);
  res.json({ mensaje: 'Usuario eliminado correctamente', usuario: r.rows[0] });
}));

// Genera una nueva contraseña temporal (reactiva cuentas con contraseña vencida)
router.post('/:id/reactivar', auth, checkRole('admin'), wrap(async (req, res) => {
  const id = intParam(req.params.id);
  const passwordTemporal = generarPasswordTemporal();
  const expira = new Date(Date.now() + reglas.vigenciaPasswordTemporalDias * 24 * 3600 * 1000);
  const r = await query(
    `UPDATE usuario SET contrasena = $1, password_change_required = TRUE, temp_password_expires = $2, activo = TRUE
      WHERE id_usuario = $3 RETURNING usuario, nombre, correo`,
    [await hash(passwordTemporal), expira, id]
  );
  if (!r.rowCount) throw new HttpError(404, 'Usuario no encontrado');
  const u = r.rows[0];
  const envio = await email.enviarCredenciales({
    nombre: u.nombre, correo: u.correo, usuario: u.usuario, passwordTemporal, expira, motivo: 'reactivacion',
  });
  res.json({
    mensaje: 'Cuenta reactivada con una nueva contraseña temporal',
    usuario: u.usuario,
    expira,
    correo_enviado: envio.success,
    ...(!envio.success && !config.isProd ? { password_temporal: passwordTemporal } : {}),
  });
}));

module.exports = router;
module.exports.helpers = { hash, validarPassword };
