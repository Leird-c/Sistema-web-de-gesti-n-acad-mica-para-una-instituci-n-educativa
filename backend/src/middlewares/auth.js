// Autenticación JWT. Verifica el token y que la cuenta siga activa.
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { query } = require('../config/db');

function crear(permitirTemporal) {
  return (req, res, next) => {
    const [tipo, token] = (req.headers.authorization || '').split(' ');
    if (tipo !== 'Bearer' || !token) return res.status(401).json({ error: 'Token no proporcionado' });

    jwt.verify(token, config.jwtSecret, async (err, payload) => {
      if (err) return res.status(401).json({ error: 'Token inválido o expirado' });
      if (payload.cambio_password && !permitirTemporal) {
        return res.status(403).json({
          error: 'Debe cambiar su contraseña temporal antes de continuar',
          cambioPasswordRequerido: true,
        });
      }
      try {
        const r = await query('SELECT rol, activo FROM usuario WHERE id_usuario = $1', [payload.id_usuario]);
        if (r.rowCount === 0 || !r.rows[0].activo) {
          return res.status(401).json({ error: 'Cuenta inexistente o desactivada' });
        }
        req.user = { ...payload, rol: r.rows[0].rol };
        next();
      } catch (e) {
        next(e);
      }
    });
  };
}

module.exports = crear(false);
module.exports.temporal = crear(true);
