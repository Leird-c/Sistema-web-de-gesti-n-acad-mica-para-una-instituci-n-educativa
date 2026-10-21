import React from 'react';

// Muestra "cargando"/"error" y, si todo va bien, el contenido.
export default function EstadoCarga({ cargando, error, onReintentar, children }) {
  if (cargando) return <div className="vacio">Cargando…</div>;
  if (error) {
    return (
      <div className="aviso aviso-error">
        <strong>No se pudo cargar la información.</strong> {error}
        {onReintentar && <button type="button" className="btn-secondary btn-sm" onClick={onReintentar}>Reintentar</button>}
      </div>
    );
  }
  return children;
}
