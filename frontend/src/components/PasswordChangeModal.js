import React, { useState } from 'react';
import { apiRequest } from '../api';
import Modal from './Modal';

// Cambio obligatorio de la contraseña temporal (usa el token temporal recibido en el login).
export default function PasswordChangeModal({ token, expira, onClose }) {
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const vence = (() => {
    try { return new Date(expira).toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short' }); }
    catch { return null; }
  })();

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    if (nueva.length < 8) return setError('La contraseña debe tener al menos 8 caracteres');
    if (nueva !== confirmar) return setError('Las contraseñas no coinciden');
    setCargando(true);
    try {
      await apiRequest('/usuarios/cambiar-password-temporal', { method: 'POST', token, body: { nuevaContrasena: nueva } });
      onClose(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <Modal titulo="🔒 Cambio de contraseña requerido" ancho={460}>
      <p className="modal-texto">Debe cambiar su contraseña temporal antes de continuar.</p>
      {vence && <div className="aviso aviso-warn">⏰ Su contraseña temporal expira el <strong>{vence}</strong></div>}
      <form onSubmit={enviar} style={{ width: '100%' }}>
        <div className="form-group">
          <label htmlFor="pw-nueva">Nueva contraseña *</label>
          <input id="pw-nueva" type="password" value={nueva} onChange={(e) => setNueva(e.target.value)}
            placeholder="Mínimo 8 caracteres" autoComplete="new-password" required disabled={cargando} />
        </div>
        <div className="form-group">
          <label htmlFor="pw-conf">Confirmar nueva contraseña *</label>
          <input id="pw-conf" type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)}
            autoComplete="new-password" required disabled={cargando} />
        </div>
        {error && <div className="aviso aviso-error">{error}</div>}
        <div className="aviso aviso-info">
          💡 Use letras mayúsculas y minúsculas, números y símbolos. No use datos personales.
        </div>
        <div className="modal-acciones">
          <button type="submit" disabled={cargando}>{cargando ? 'Cambiando…' : 'Cambiar contraseña'}</button>
          <button type="button" className="btn-secondary" onClick={() => onClose(false)} disabled={cargando}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}
