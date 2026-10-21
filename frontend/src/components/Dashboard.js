import React from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';
import { useAuth } from '../AuthContext';
import { ROLES } from '../constants';
import { useCarga } from '../hooks/useCarga';
import Layout from './Layout';
import SelectorHijo from './SelectorHijo';
import './Dashboard.css';

// Módulos visibles por rol (cada uno lleva a su pantalla)
const MODULOS = {
  admin: [
    { titulo: 'Gestión de Usuarios', descripcion: 'Administrar docentes, estudiantes y padres', icono: '👥', ruta: '/usuarios' },
    { titulo: 'Calificaciones', descripcion: 'Gestionar calificaciones del sistema', icono: '📊', ruta: '/calificaciones' },
    { titulo: 'Asistencia', descripcion: 'Control de asistencia general', icono: '✓', ruta: '/asistencias' },
    { titulo: 'Talleres', descripcion: 'Administrar talleres y actividades', icono: '🎨', ruta: '/talleres' },
    { titulo: 'Incidencias', descripcion: 'Gestionar reportes e incidencias', icono: '⚠️', ruta: '/incidencias' },
    { titulo: 'Horarios', descripcion: 'Administrar horarios y asignaciones', icono: '📅', ruta: '/horarios' },
  ],
  docente: [
    { titulo: 'Mis Materias', descripcion: 'Mis asignaturas, grupos y horario de clases', icono: '📝', ruta: '/horarios' },
    { titulo: 'Calificaciones', descripcion: 'Registro y seguimiento de notas', icono: '📋', ruta: '/calificaciones' },
    { titulo: 'Asistencia', descripcion: 'Tomar y consultar la asistencia', icono: '✓', ruta: '/asistencias' },
    { titulo: 'Incidencias', descripcion: 'Reportar y gestionar incidencias', icono: '⚠️', ruta: '/incidencias' },
    { titulo: 'Talleres', descripcion: 'Ver alumnos inscritos en talleres', icono: '🎨', ruta: '/talleres' },
  ],
  estudiante: [
    { titulo: 'Mis Materias', descripcion: 'Ver horarios y asignaturas', icono: '📚', ruta: '/horarios' },
    { titulo: 'Mis Calificaciones', descripcion: 'Consultar notas y evaluaciones', icono: '📊', ruta: '/calificaciones' },
    { titulo: 'Mi Asistencia', descripcion: 'Revisar mi historial de asistencia', icono: '✓', ruta: '/asistencias' },
    { titulo: 'Mis Incidencias', descripcion: 'Ver mis reportes y comunicaciones', icono: '⚠️', ruta: '/incidencias' },
    { titulo: 'Talleres', descripcion: 'Ver talleres disponibles e inscribirme', icono: '🎨', ruta: '/talleres' },
  ],
  padre: [
    { titulo: 'Calificaciones', descripcion: 'Seguimiento del rendimiento académico', icono: '📊', ruta: '/calificaciones' },
    { titulo: 'Asistencia', descripcion: 'Historial de asistencia de mi hijo/a', icono: '✓', ruta: '/asistencias' },
    { titulo: 'Incidencias', descripcion: 'Reportes y comunicaciones escolares', icono: '⚠️', ruta: '/incidencias' },
    { titulo: 'Horarios', descripcion: 'Horario de clases de mi hijo/a', icono: '📅', ruta: '/horarios' },
  ],
};

export default function Dashboard() {
  const { user, hijoActual } = useAuth();
  const navigate = useNavigate();
  const modulos = MODULOS[user?.rol] || [];

  const { datos: estadisticas, cargando } = useCarga(
    () => apiRequest(`/dashboard/resumen${user?.rol === 'padre' && hijoActual ? `?estudiante_id=${hijoActual}` : ''}`),
    [user?.rol, hijoActual]
  );

  return (
    <Layout title="Panel de Control" showBackButton={false}>
      <div className="dashboard-container">
        <section className="welcome-section">
          <h2>Bienvenido, {user?.nombre}</h2>
          <p>Accede a las herramientas disponibles para tu perfil de {ROLES[user?.rol]}</p>
          <SelectorHijo />
        </section>

        <section className="modules-section">
          <div className="modules-grid">
            {modulos.map((m) => (
              <div key={m.titulo} className="module-card">
                <div className="module-icon">{m.icono}</div>
                <h3 className="module-title">{m.titulo}</h3>
                <p className="module-description">{m.descripcion}</p>
                <button type="button" className="module-btn" onClick={() => navigate(m.ruta)}>Acceder</button>
              </div>
            ))}
          </div>
        </section>

        <section className="stats-section">
          <div className="stats-grid">
            {(cargando ? [1, 2, 3, 4].map((n) => ({ valor: '…', etiqueta: '', n })) : estadisticas || []).map((s, i) => (
              <div key={i} className="stat-card">
                <div className="stat-number">{s.valor}</div>
                <div className="stat-label">{s.etiqueta || '\u00A0'}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
}
