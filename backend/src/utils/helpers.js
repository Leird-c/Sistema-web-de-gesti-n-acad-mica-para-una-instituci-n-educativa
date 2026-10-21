// Utilidades compartidas: errores HTTP, validaciones y generadores.
const crypto = require('crypto');

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// Envuelve handlers async para que los errores lleguen al manejador global.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const RE = {
  matricula: /^C\d{13}$/,
  homoclave: /^(\d[A-Za-z]{2}|[A-Za-z]{2}\d)$/,
  correo: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  fecha: /^\d{4}-\d{2}-\d{2}$/,
  hora: /^([01]\d|2[0-3]):[0-5]\d$/,
  usuario: /^[A-Za-z0-9_.-]{3,30}$/,
};

function intParam(valor, nombre = 'ID') {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${nombre} inválido`);
  return n;
}

// Fecha local del servidor en formato AAAA-MM-DD.
function hoy() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function validarFecha(fecha, etiqueta = 'La fecha', { permitirFutura = false } = {}) {
  if (typeof fecha !== 'string' || !RE.fecha.test(fecha)) {
    throw new HttpError(400, `${etiqueta} debe tener formato AAAA-MM-DD`);
  }
  const [y, m, d] = fecha.split('-').map(Number);
  const real = new Date(Date.UTC(y, m - 1, d));
  if (real.getUTCFullYear() !== y || real.getUTCMonth() !== m - 1 || real.getUTCDate() !== d) {
    throw new HttpError(400, `${etiqueta} no es una fecha válida`);
  }
  if (y < 2000) throw new HttpError(400, `${etiqueta} no puede ser anterior al año 2000`);
  if (!permitirFutura && fecha > hoy()) throw new HttpError(400, `${etiqueta} no puede ser futura`);
  return fecha;
}

function texto(valor, etiqueta, { min = 1, max = 255, requerido = true } = {}) {
  const t = typeof valor === 'string' ? valor.trim() : '';
  if (!t) {
    if (requerido) throw new HttpError(400, `${etiqueta} es obligatorio`);
    return null;
  }
  if (t.length < min || t.length > max) {
    throw new HttpError(400, `${etiqueta} debe tener entre ${min} y ${max} caracteres`);
  }
  return t;
}

function validarCorreo(correo) {
  const c = texto(correo, 'El correo', { max: 100 }).toLowerCase();
  if (!RE.correo.test(c)) throw new HttpError(400, 'Correo electrónico no válido');
  return c;
}

// Contraseña temporal: 4 letras + 4 números (ej. ABCD1234), sin caracteres ambiguos.
function generarPasswordTemporal() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < 4; i++) out += letras[crypto.randomInt(letras.length)];
  for (let i = 0; i < 4; i++) out += crypto.randomInt(10);
  return out;
}

// Limitador simple de intentos (en memoria) para el login.
function limitador({ max = 10, ventanaMs = 15 * 60 * 1000 } = {}) {
  const intentos = new Map();
  return {
    revisar(clave) {
      const ahora = Date.now();
      const r = intentos.get(clave);
      if (r && r.reinicio > ahora && r.cuenta >= max) {
        const min = Math.ceil((r.reinicio - ahora) / 60000);
        throw new HttpError(429, `Demasiados intentos fallidos. Intente nuevamente en ${min} min.`);
      }
    },
    fallo(clave) {
      const ahora = Date.now();
      const r = intentos.get(clave);
      if (!r || r.reinicio <= ahora) intentos.set(clave, { cuenta: 1, reinicio: ahora + ventanaMs });
      else r.cuenta += 1;
    },
    limpiar(clave) { intentos.delete(clave); },
  };
}

module.exports = {
  HttpError, wrap, RE, intParam, hoy, validarFecha, texto, validarCorreo,
  generarPasswordTemporal, limitador,
};
