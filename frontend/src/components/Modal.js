import React, { useEffect } from 'react';
import './Modal.css';

export default function Modal({ titulo, onClose, ancho, children }) {
  useEffect(() => {
    const alTeclear = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [onClose]);

  return (
    <div className="modal-bg" role="dialog" aria-modal="true">
      <div className="modal-form" style={ancho ? { width: ancho } : undefined}>
        {titulo && <h3>{titulo}</h3>}
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({ titulo = 'Confirmar', mensaje, textoConfirmar = 'Sí, continuar', peligro, ocupado, onConfirm, onClose }) {
  return (
    <Modal titulo={titulo} onClose={onClose}>
      <p className="modal-texto">{mensaje}</p>
      <div className="modal-acciones">
        <button type="button" className={peligro ? 'btn-danger' : ''} disabled={ocupado} onClick={onConfirm}>
          {textoConfirmar}
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  );
}
