import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [aviso, setAviso] = useState(null);
  const timer = useRef(null);

  const notify = useCallback((message, type = 'info', duracion = 3500) => {
    clearTimeout(timer.current);
    setAviso({ message, type });
    timer.current = setTimeout(() => setAviso(null), duracion);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const value = useMemo(() => ({ notify, showNotification: notify }), [notify]);
  return (
    <NotificationContext.Provider value={value}>
      {children}
      {aviso && (
        <div className={`toast toast-${aviso.type}`} role="status" onClick={() => setAviso(null)}>
          {aviso.message}
        </div>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification debe usarse dentro de NotificationProvider');
  return ctx;
}
