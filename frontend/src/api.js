// Cliente HTTP centralizado: añade el JWT y normaliza los errores.
export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

let alCerrarSesion = null;
export const registrarCierreSesion = (fn) => { alCerrarSesion = fn; };

async function llamar(endpoint, { method = 'GET', body, token, headers } = {}) {
  let resp;
  try {
    resp = await fetch(`${API_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor. Verifica que el backend esté en ejecución.');
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data.error || 'Error en la petición');
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Petición autenticada. Si no se pasa `token`, usa el de la sesión.
export async function apiRequest(endpoint, opciones = {}) {
  const usaSesion = opciones.token === undefined;
  const token = usaSesion ? localStorage.getItem('token') : opciones.token;
  if (!token) throw new Error('Sesión no iniciada');
  try {
    return await llamar(endpoint, { ...opciones, token });
  } catch (err) {
    if (err.status === 401 && usaSesion && alCerrarSesion) alCerrarSesion();
    throw err;
  }
}

// Petición pública (login).
export const apiPublica = (endpoint, opciones = {}) => llamar(endpoint, opciones);
