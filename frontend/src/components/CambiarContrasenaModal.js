import React, { useState } from 'react';
import { apiRequest } from '../api';
import { useNotification } from '../NotificationContext';
import Modal from './Modal';

// Cambio voluntario de contraseña (cualquier usuario autenticado).
export default function CambiarContrasenaModal({ onClose }) {
  const { notify } = useNotification();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    if (nueva.length < 8) return setError('La nueva contraseña debe tener al menos 8 caracteres');
    if (nueva !== confirmar) return setError('Las contraseñas no coinciden');
    setCargando(true);
    try {
      await apiRequest('/usuarios/cambiar-contrasena', { method: 'PUT', body: { contrasenaActual: actual, nuevaContrasena: nueva } });
      notify('Contraseña actualizada correctamente', 'success');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <Modal titulo="Cambiar contraseña" onClose={onClose}>
      <form onSubmit={enviar} style={{ width: '100%' }}>
        <div className="form-group">
          <label htmlFor="cc-actual">Contraseña actual</label>
          <input id="cc-actual" type="password" value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" required />
        </div>
        <div className="form-group">
          <label htmlFor="cc-nueva">Nueva contraseña (mínimo 8 caracteres)</label>
          <input id="cc-nueva" type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password" required />
        </div>
        <div className="form-group">
          <label htmlFor="cc-conf">Confirmar nueva contraseña</label>
          <input id="cc-conf" type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="new-password" required />
        </div>
        {error && <div className="aviso aviso-error">{error}</div>}
        <div className="modal-acciones">
          <button type="submit" disabled={cargando}>Guardar</button>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}
