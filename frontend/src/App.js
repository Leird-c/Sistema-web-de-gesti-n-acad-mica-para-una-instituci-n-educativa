import React, { useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { NotificationProvider } from './NotificationContext';
import { ThemeProvider } from './ThemeContext';
import Bienvenida from './components/Bienvenida';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import UsuariosList from './components/UsuariosList';
import CalificacionesList from './components/CalificacionesList';
import AsistenciasList from './components/AsistenciasList';
import TalleresList from './components/TalleresList';
import IncidenciasList from './components/IncidenciasList';
import HorariosList from './components/HorariosList';
// Estilos globales al final: tienen prioridad sobre los de cada componente.
import './estilos-institucionales.css';
import './ComponentStyles.css';
import './extras.css';

// Solo deja pasar a los roles indicados.
function RutaRol({ roles, children }) {
  const { user } = useAuth();
  return roles.includes(user.rol) ? children : <Navigate to="/dashboard" replace />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  const [mostrarLogin, setMostrarLogin] = useState(false);

  if (!isAuthenticated) {
    if (!mostrarLogin) return <Bienvenida onLogin={() => setMostrarLogin(true)} />;
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const TODOS = ['admin', 'docente', 'estudiante', 'padre'];
  const noPadre = ['admin', 'docente', 'estudiante'];
  return (
    <Routes>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/usuarios" element={<RutaRol roles={['admin']}><UsuariosList /></RutaRol>} />
      <Route path="/calificaciones" element={<RutaRol roles={TODOS}><CalificacionesList /></RutaRol>} />
      <Route path="/asistencias" element={<RutaRol roles={TODOS}><AsistenciasList /></RutaRol>} />
      <Route path="/talleres" element={<RutaRol roles={noPadre}><TalleresList /></RutaRol>} />
      <Route path="/incidencias" element={<RutaRol roles={TODOS}><IncidenciasList /></RutaRol>} />
      <Route path="/horarios" element={<RutaRol roles={TODOS}><HorariosList /></RutaRol>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
