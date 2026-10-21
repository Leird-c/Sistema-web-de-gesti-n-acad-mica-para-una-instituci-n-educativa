import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { ROLES } from '../constants';
import ThemeToggle from './ThemeToggle';
import CambiarContrasenaModal from './CambiarContrasenaModal';
import './Layout.css';

export default function Layout({ children, title, showBackButton = true }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [cambiarPassword, setCambiarPassword] = useState(false);

  const nombre = user?.nombre || '';
  const rol = ROLES[user?.rol] || user?.rol || '';

  const cerrarSesion = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout-container">
      <header className="layout-header">
        <div className="layout-header-left">
          <div className="layout-logo">
            <span className="layout-logo-icon">🎓</span>
            <div className="layout-logo-text">
              <h1>Sistema Escolar</h1>
              <span className="layout-subtitle">Gestión Académica</span>
            </div>
          </div>
        </div>

        <div className="layout-header-center">{title && <h2 className="layout-page-title">{title}</h2>}</div>

        <div className="layout-header-right">
          <div className="layout-user-info">
            <div className="layout-user-details">
              <span className="layout-user-name">{nombre}</span>
              <span className="layout-user-role">{rol}</span>
            </div>
            <div className="layout-user-avatar">{nombre.charAt(0).toUpperCase()}</div>
          </div>
          <ThemeToggle />
          <button type="button" className="layout-logout-btn" onClick={() => setCambiarPassword(true)} title="Cambiar contraseña">🔑</button>
          <button type="button" className="layout-logout-btn" onClick={cerrarSesion} title="Cerrar sesión">Salir</button>
        </div>
      </header>

      <main className="layout-main">
        {showBackButton && (
          <div className="layout-back-section">
            <button type="button" className="layout-back-btn" onClick={() => navigate('/dashboard')}>
              ← Volver al Panel Principal
            </button>
          </div>
        )}
        <div className="layout-content">{children}</div>
      </main>

      {cambiarPassword && <CambiarContrasenaModal onClose={() => setCambiarPassword(false)} />}
    </div>
  );
}
