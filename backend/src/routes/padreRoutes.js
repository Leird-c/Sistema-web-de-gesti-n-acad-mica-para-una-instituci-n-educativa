// /api/padres  -  registro de padres/tutores y vínculo con sus hijos
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const config = require('../config/config');
const { query, tx } = require('../config/db');
const auth = require('../middlewares/auth');
const checkRole = require('../middlewares/checkRole');
const email = require('../services/emailService');
const { HttpError, wrap, RE, intParam, texto, validarCorreo, generarPasswordTemporal } = require('../utils/helpers');

router.use(auth);

// Registro completo: crea usuario (matrícula + homoclave), contraseña temporal y vínculo con el hijo.
router.post('/completo', checkRole('admin'), wrap(async (req, res) => {
  const nombre = texto(req.body.nombre, 'El nombre', { max: 100 });
  const correo = validarCorreo(req.body.correo);
  const estudianteId = intParam(req.body.estudiante_id, 'El ID del estudiante');
  const homoclave = String(req.body.homoclave || '').trim().toUpperCase();
  if (!RE.homoclave.test(homoclave)) {
    throw new HttpError(400, 'Formato de homoclave inválido (1 dígito y 2 letras, o 2 letras y 1 dígito; ej. 1AB o AB2)');
  }
  const telefono = texto(req.body.telefono, 'El teléfono', { max: 20, requerido: false });
  const direccion = texto(req.body.direccion, 'La dirección', { max: 200, requerido: false });

  const passwordTemporal = generarPasswordTemporal();
  const expira = new Date(Date.now() + config.reglas.vigenciaPasswordTemporalDias * 24 * 3600 * 1000);

  const { usuario, estudiante, id } = await tx(async (c) => {
    const est = await c.query(
      'SELECT e.id_usuario, e.matricula, u.nombre FROM estudiante e JOIN usuario u ON u.id_usuario = e.id_usuario WHERE e.id_usuario = $1',
      [estudianteId]
    );
    if (!est.rowCount) throw new HttpError(404, 'El estudiante asociado no existe.');
    const usuario = `${est.rows[0].matricula}${homoclave}`;

    const u = await c.query(
      `INSERT INTO usuario (usuario, nombre, correo, contrasena, rol, password_change_required, temp_password_expires, first_login)
       VALUES ($1, $2, $3, $4, 'padre', TRUE, $5, TRUE) RETURNING id_usuario`,
      [usuario, nombre, correo, await bcrypt.hash(passwordTemporal, 10), expira]
    );
    const id = u.rows[0].id_usuario;
    await c.query('INSERT INTO padre (id_usuario, homoclave, telefono, direccion) VALUES ($1, $2, $3, $4)',
      [id, homoclave, telefono, direccion]);
    await c.query('INSERT INTO padre_estudiante (id_padre, id_estudiante) VALUES ($1, $2)', [id, estudianteId]);
    return { usuario, estudiante: est.rows[0], id };
  });

  const envio = await email.enviarCredenciales({
    nombre, correo, usuario, passwordTemporal, expira,
    estudianteNombre: estudiante.nombre, matricula: estudiante.matricula, motivo: 'bienvenida',
  });
  if (!envio.success) {
    console.warn(`[padres] correo no enviado (${envio.error}). Usuario: ${usuario}`);
  }

  res.status(201).json({
    mensaje: 'Padre registrado exitosamente',
    usuario: { id_usuario: id, usuario, nombre, correo, rol: 'padre' },
    estudiante: { nombre: estudiante.nombre, matricula: estudiante.matricula },
    correo_enviado: envio.success,
    preview_url: envio.previewUrl || null,
    expira,
    ...(!envio.success && !config.isProd ? { password_temporal: passwordTemporal } : {}),
  });
}));

// Vincular un hijo adicional a un padre existente
router.post('/:id/estudiantes', checkRole('admin'), wrap(async (req, res) => {
  const id = intParam(req.params.id);
  const estudianteId = intParam(req.body.estudiante_id, 'El ID del estudiante');
  const padre = await query('SELECT 1 FROM padre WHERE id_usuario = $1', [id]);
  if (!padre.rowCount) throw new HttpError(404, 'Padre/tutor no encontrado');
  const est = await query('SELECT 1 FROM estudiante WHERE id_usuario = $1', [estudianteId]);
  if (!est.rowCount) throw new HttpError(404, 'Estudiante no encontrado');
  const r = await query(
    'INSERT INTO padre_estudiante (id_padre, id_estudiante) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [id, estudianteId]
  );
  if (!r.rowCount) throw new HttpError(409, 'Ese estudiante ya está vinculado a este padre/tutor.');
  res.status(201).json({ mensaje: 'Estudiante vinculado. El padre verá el cambio al volver a iniciar sesión.' });
}));

router.delete('/:id/estudiantes/:estudianteId', checkRole('admin'), wrap(async (req, res) => {
  const r = await query('DELETE FROM padre_estudiante WHERE id_padre = $1 AND id_estudiante = $2',
    [intParam(req.params.id), intParam(req.params.estudianteId)]);
  if (!r.rowCount) throw new HttpError(404, 'Vínculo no encontrado');
  res.json({ mensaje: 'Vínculo eliminado' });
}));

const SQL_PADRE = `
  SELECT u.id_usuario, u.usuario, u.nombre, u.correo, p.homoclave, p.telefono, p.direccion,
         COALESCE((SELECT json_agg(json_build_object('id_usuario', e.id_usuario, 'nombre', ue.nombre, 'matricula', e.matricula) ORDER BY ue.nombre)
                     FROM padre_estudiante pe
                     JOIN estudiante e ON e.id_usuario = pe.id_estudiante
                     JOIN usuario ue ON ue.id_usuario = e.id_usuario
                    WHERE pe.id_padre = u.id_usuario), '[]'::json) AS estudiantes
    FROM padre p JOIN usuario u ON u.id_usuario = p.id_usuario`;

router.get('/', checkRole('admin'), wrap(async (req, res) => {
  res.json((await query(`${SQL_PADRE} ORDER BY u.nombre`)).rows);
}));

router.get('/:id', checkRole('admin', 'padre'), wrap(async (req, res) => {
  const id = intParam(req.params.id);
  if (req.user.rol !== 'admin' && req.user.id_usuario !== id) {
    throw new HttpError(403, 'Solo puedes acceder a tu propia información de tutor.');
  }
  const r = await query(`${SQL_PADRE} WHERE u.id_usuario = $1`, [id]);
  if (!r.rowCount) throw new HttpError(404, 'Tutor no encontrado');
  res.json(r.rows[0]);
}));

module.exports = router;
