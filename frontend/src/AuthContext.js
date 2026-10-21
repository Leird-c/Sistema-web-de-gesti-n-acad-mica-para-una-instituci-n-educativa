import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { registrarCierreSesion } from './api';

const AuthContext = createContext(null);

// Decodifica el payload del JWT respetando UTF-8 (tildes y ñ).
function decodificar(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function usuarioDeToken(token) {
  const p = token ? decodificar(token) : null;
  if (!p || p.cambio_password || (p.exp && p.exp * 1000 <= Date.now())) return null;
  return p;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    const t = localStorage.getItem('token');
    return usuarioDeToken(t) ? t : null;
  });
  const [hijoId, setHijoId] = useState(() => Number(sessionStorage.getItem('hijoId')) || null);
  const user = useMemo(() => usuarioDeToken(token), [token]);

  const login = useCallback((t) => {
    localStorage.setItem('token', t);
    setToken(t);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('hijoId');
    setToken(null);
    setHijoId(null);
  }, []);

  useEffect(() => { registrarCierreSesion(logout); }, [logout]);

  // Cierra la sesión automáticamente cuando vence el token
  useEffect(() => {
    if (!user?.exp) return undefined;
    const ms = user.exp * 1000 - Date.now();
    if (ms <= 0) { logout(); return undefined; }
    const t = setTimeout(logout, Math.min(ms, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [user, logout]);

  const hijos = useMemo(() => (user?.rol === 'padre' ? user.estudiantes || [] : []), [user]);
  const hijoActual = hijos.find((h) => h.id_usuario === hijoId)?.id_usuario ?? hijos[0]?.id_usuario ?? null;
  const elegirHijo = useCallback((id) => {
    setHijoId(id);
    sessionStorage.setItem('hijoId', String(id));
  }, []);

  const value = useMemo(
    () => ({ isAuthenticated: !!user, user, login, logout, hijos, hijoActual, elegirHijo }),
    [user, login, logout, hijos, hijoActual, elegirHijo]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
