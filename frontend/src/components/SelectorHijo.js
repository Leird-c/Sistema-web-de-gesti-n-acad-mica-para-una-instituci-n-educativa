import React from 'react';
import { useAuth } from '../AuthContext';

// Para padres: elegir de qué hijo se muestra la información.
export default function SelectorHijo() {
  const { user, hijos, hijoActual, elegirHijo } = useAuth();
  if (user?.rol !== 'padre') return null;
  if (hijos.length === 0) {
    return <div className="aviso aviso-warn">Tu cuenta aún no tiene estudiantes vinculados. Comunícate con la dirección.</div>;
  }
  if (hijos.length === 1) {
    return <div className="student-selector"><label>Estudiante:</label> <strong>{hijos[0].nombre}</strong></div>;
  }
  return (
    <div className="student-selector">
      <label htmlFor="sel-hijo">Selecciona estudiante: </label>
      <select id="sel-hijo" value={hijoActual || ''} onChange={(e) => elegirHijo(Number(e.target.value))}>
        {hijos.map((h) => <option key={h.id_usuario} value={h.id_usuario}>{h.nombre}</option>)}
      </select>
    </div>
  );
}
