// Restringe una ruta a ciertos roles: checkRole('admin', 'docente')
module.exports = (...roles) => (req, res, next) => {
  const permitidos = roles.flat();
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  if (!permitidos.includes(req.user.rol)) {
    return res.status(403).json({ error: 'No tienes permisos para realizar esta acción' });
  }
  next();
};
