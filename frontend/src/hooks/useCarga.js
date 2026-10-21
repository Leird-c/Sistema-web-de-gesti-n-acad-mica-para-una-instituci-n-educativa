import { useCallback, useEffect, useRef, useState } from 'react';

// Carga datos asíncronos con estados de carga/error y recarga manual.
export function useCarga(funcion, deps = []) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const ref = useRef(funcion);
  ref.current = funcion;

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError('');
    Promise.resolve()
      .then(() => ref.current())
      .then((d) => { if (!cancelado) setDatos(d); })
      .catch((e) => { if (!cancelado) setError(e.message); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { datos, setDatos, cargando, error, recargar };
}
