import React from 'react';
import ThemeToggle from './ThemeToggle';
import './Bienvenida.css';

export default function Bienvenida({ onLogin }) {
  return (
    <div className="bienvenida-bg">
      <div className="theme-toggle-bienvenida">
        <ThemeToggle />
      </div>
      <div className="bienvenida-container">
        <img src="/logo_institucion.png" alt="Logo institucional" className="bienvenida-logo" />
        <h1 className="bienvenida-titulo">I.E.S. Micaela Bastidas Puyucahua</h1>
        <p className="bienvenida-mensaje">
          Bienvenido al sistema de gestión escolar para estudiantes, docentes y padres.
        </p>
        <button className="bienvenida-boton" onClick={onLogin}>
          Iniciar sesión
        </button>
        <footer className="bienvenida-footer">📍 Abancay 2026</footer>
      </div>
    </div>
  );
}
