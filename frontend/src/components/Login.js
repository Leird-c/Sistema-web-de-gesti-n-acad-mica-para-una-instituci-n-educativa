import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPublica } from '../api';
import { useAuth } from '../AuthContext';
import { useNotification } from '../NotificationContext';
import ThemeToggle from './ThemeToggle';
import PasswordChangeModal from './PasswordChangeModal';
import './Login.css';

export default function Login() {
  const [rol, setRol] = useState('Estudiante');
  const [loginInput, setLoginInput] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [cambio, setCambio] = useState(null); // { token, expira } cuando hay contraseña temporal
  const navigate = useNavigate();
  const { login } = useAuth();
  const { notify } = useNotification();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const data = await apiPublica('/usuarios/login', {
        method: 'POST',
        body: { rol, login: loginInput.trim(), contrasena },
      });
      if (data.passwordChangeRequired) {
        // El token temporal solo sirve para cambiar la contraseña: no se guarda como sesión.
        setCambio({ token: data.token, expira: data.tempPasswordExpires });
        notify(data.message || 'Debe cambiar su contraseña temporal', 'warning');
        return;
      }
      login(data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.status ? `Error ${err.status}: ${err.message}` : err.message);
    } finally {
      setEnviando(false);
    }
  };

  const alCambiarPassword = (exito) => {
    setCambio(null);
    if (exito) {
      setLoginInput('');
      setContrasena('');
      notify('Contraseña actualizada correctamente. Ya puede iniciar sesión con su nueva contraseña.', 'success', 5000);
    }
  };

  return (
    <>
      <div className="login-bg-modern">
        <div className="theme-toggle-login">
          <ThemeToggle />
        </div>
        <div className="login-container-modern">
          <div className="login-header-modern">
            <img src="/logo_institucion.png" alt="Logo Institución" className="login-logo-img" style={{ width: '80px', marginBottom: '10px' }} />
            <h2 style={{ color: '#6d28d9', margin: '5px 0' }}>I.E.S. Micaela Bastidas Puyucahua</h2>
            <p className="login-subtitle-modern">Accede a tu panel de control</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group-modern">
              <label htmlFor="rol-select">SELECCIONAR ROL:</label>
              <select
                id="rol-select"
                value={rol}
                onChange={(e) => setRol(e.target.value)}
                className="select-modern"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #ccc', marginBottom: '15px', fontSize: '0.95rem' }}
              >
                <option value="Admin">🛠️ Admin</option>
                <option value="Docente">👨‍🏫 Docente</option>
                <option value="Estudiante">👨‍🎓 Estudiante</option>
                <option value="Padre">👨‍👩‍👧 Padre</option>
              </select>
            </div>

            <div className="form-group-modern">
              <label htmlFor="login-usuario">Usuario o correo:</label>
              <input id="login-usuario" type="text" value={loginInput} onChange={(e) => setLoginInput(e.target.value)}
                autoComplete="username" required />
            </div>

            <div className="form-group-modern">
              <label htmlFor="login-clave">Contraseña:</label>
              <input id="login-clave" type="password" value={contrasena} onChange={(e) => setContrasena(e.target.value)}
                autoComplete="current-password" required />
            </div>

            {error && <div className="error-modern">{error}</div>}

            <button type="submit" disabled={enviando} style={{ marginTop: '10px' }}>
              {enviando ? 'Ingresando…' : 'Iniciar Sesión'}
            </button>
          </form>
        </div>
      </div>

      {cambio && <PasswordChangeModal token={cambio.token} expira={cambio.expira} onClose={alCambiarPassword} />}
    </>
  );
}
