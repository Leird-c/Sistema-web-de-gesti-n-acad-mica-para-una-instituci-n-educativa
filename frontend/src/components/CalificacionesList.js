import React, { useMemo, useState } from 'react';
import { apiRequest } from '../api';
import { useAuth } from '../AuthContext';
import { useNotification } from '../NotificationContext';
import { useCarga } from '../hooks/useCarga';
import { NOTA_APROBATORIA, NOTA_MAX, etiquetaGrupo, hoyISO } from '../constants';
import Layout from './Layout';
import Modal, { ConfirmModal } from './Modal';
import EstadoCarga from './EstadoCarga';
import SelectorHijo from './SelectorHijo';

const claseNota = (v) => (v === null || v === undefined ? '' : v < NOTA_APROBATORIA ? 'nota nota-baja' : 'nota nota-alta');

export default function CalificacionesList() {
  const { user, hijoActual } = useAuth();
  const { notify } = useNotification();
  const rol = user.rol;
  const esGestor = rol === 'admin' || rol === 'docente';

  const { datos: filas, cargando, error, recargar } = useCarga(async () => {
    if (rol === 'admin') return apiRequest('/calificaciones');
    if (rol === 'docente') return apiRequest('/calificaciones/docente');
    const id = rol === 'estudiante' ? user.id_usuario : hijoActual;
    return id ? apiRequest(`/calificaciones/estudiante/${id}`) : [];
  }, [rol, hijoActual]);

  const { datos: estado, recargar: recargarEstado } = useCarga(() => apiRequest('/calificaciones/estado'));
  const habilitado = !!estado?.sistemaHabilitado;
  const puedeEditar = rol === 'admin' || (rol === 'docente' && habilitado);

  const [filtro, setFiltro] = useState({ grupo: '', materia: '', q: '' });
  const [modal, setModal] = useState(null); // { fila, valor, fecha }
  const [borrar, setBorrar] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const filtradas = useMemo(() => {
    const q = filtro.q.trim().toLowerCase();
    return (filas || []).filter((f) =>
      (!filtro.grupo || String(f.grupo_id) === filtro.grupo) &&
      (!filtro.materia || String(f.materia_id) === filtro.materia) &&
      (!q || (f.estudiante_nombre || '').toLowerCase().includes(q) || (f.matricula || '').toLowerCase().includes(q)));
  }, [filas, filtro]);

  const opcionesGrupo = useMemo(() => {
    const m = new Map();
    (filas || []).forEach((f) => m.set(f.grupo_id, etiquetaGrupo(f.grupo_anio, f.grupo_seccion)));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [filas]);
  const opcionesMateria = useMemo(() => {
    const m = new Map();
    (filas || []).filter((f) => !filtro.grupo || String(f.grupo_id) === filtro.grupo)
      .forEach((f) => m.set(f.materia_id, `${f.materia_nombre} (${f.grupo_anio}°)`));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [filas, filtro.grupo]);

  // Agrupar por grupo (año + sección)
  const porGrupo = useMemo(() => {
    const m = new Map();
    filtradas.forEach((f) => {
      const k = etiquetaGrupo(f.grupo_anio, f.grupo_seccion);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(f);
    });
    return [...m.entries()];
  }, [filtradas]);

  const conNota = (filas || []).filter((f) => f.valor !== null);
  const promedio = conNota.length ? conNota.reduce((s, f) => s + f.valor, 0) / conNota.length : null;

  const alternarSistema = async () => {
    try {
      const r = await apiRequest('/calificaciones/habilitar', { method: 'POST', body: { habilitado: !habilitado } });
      notify(r.mensaje, 'success');
      recargarEstado();
    } catch (e) { notify(e.message, 'error'); }
  };

  const abrir = (fila) => { setErrorForm(''); setModal({ fila, valor: fila.valor ?? '', fecha: fila.fecha || hoyISO() }); };

  const guardar = async (e) => {
    e.preventDefault();
    setOcupado(true);
    setErrorForm('');
    const { fila, valor, fecha } = modal;
    try {
      if (fila.id) {
        await apiRequest(`/calificaciones/${fila.id}`, { method: 'PUT', body: { calificacion: Number(valor), fecha } });
      } else {
        await apiRequest('/calificaciones', { method: 'POST', body: { estudiante_id: fila.estudiante_id, materia_id: fila.materia_id, calificacion: Number(valor), fecha } });
      }
      notify('Calificación guardada', 'success');
      setModal(null);
      recargar();
    } catch (err) { setErrorForm(err.message); } finally { setOcupado(false); }
  };

  const eliminar = async () => {
    setOcupado(true);
    try {
      await apiRequest(`/calificaciones/${borrar.id}`, { method: 'DELETE' });
      notify('Calificación eliminada', 'success');
      recargar();
    } catch (err) { notify(err.message, 'error'); } finally { setOcupado(false); setBorrar(null); }
  };

  const titulo = esGestor ? 'Calificaciones' : 'Mis Calificaciones';

  return (
    <Layout title={titulo}>
      <SelectorHijo />

      {rol === 'admin' && (
        <div className="aviso aviso-info">
          Sistema de calificaciones para docentes: <strong>{habilitado ? 'HABILITADO' : 'DESHABILITADO'}</strong>
          <button type="button" className="btn-sm" onClick={alternarSistema}>{habilitado ? 'Deshabilitar' : 'Habilitar'}</button>
        </div>
      )}
      {rol === 'docente' && !habilitado && (
        <div className="aviso aviso-warn">El registro de calificaciones está deshabilitado por el administrador. Solo puedes consultarlas.</div>
      )}

      {esGestor && (
        <div className="filtros">
          <label>Grupo
            <select value={filtro.grupo} onChange={(e) => setFiltro({ ...filtro, grupo: e.target.value, materia: '' })}>
              <option value="">Todos</option>
              {opcionesGrupo.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
            </select>
          </label>
          <label>Materia
            <select value={filtro.materia} onChange={(e) => setFiltro({ ...filtro, materia: e.target.value })}>
              <option value="">Todas</option>
              {opcionesMateria.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
            </select>
          </label>
          <label>Estudiante
            <input placeholder="Nombre o matrícula" value={filtro.q} onChange={(e) => setFiltro({ ...filtro, q: e.target.value })} />
          </label>
        </div>
      )}

      <EstadoCarga cargando={cargando} error={error} onReintentar={recargar}>
        {!esGestor && (
          <div className="cards-resumen">
            <div className="tarjeta-mini"><strong>{promedio === null ? '—' : promedio.toFixed(1)}</strong><span>Promedio general</span></div>
            <div className="tarjeta-mini"><strong>{conNota.length}/{(filas || []).length}</strong><span>Materias calificadas</span></div>
          </div>
        )}

        {porGrupo.length === 0 && <div className="vacio">No hay calificaciones para mostrar.</div>}
        {porGrupo.map(([grupo, lista]) => (
          <div key={grupo} className="grupo-bloque">
            {esGestor && <h3>Grupo {grupo}</h3>}
            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr>
                    {esGestor && <><th>Estudiante</th><th>Matrícula</th></>}
                    <th>Materia</th><th>Calificación</th><th>Fecha</th>
                    {esGestor && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {lista.map((f) => (
                    <tr key={`${f.estudiante_id}-${f.materia_id}`}>
                      {esGestor && <><td>{f.estudiante_nombre}</td><td>{f.matricula}</td></>}
                      <td>{f.materia_nombre}</td>
                      <td>{f.valor === null ? <span className="sin-dato">Sin calificación</span> : <span className={claseNota(f.valor)}>{f.valor}</span>}</td>
                      <td>{f.fecha || '—'}</td>
                      {esGestor && (
                        <td>
                          <div className="acciones">
                            <button type="button" className="btn-secondary btn-sm" disabled={!puedeEditar} onClick={() => abrir(f)}>
                              {f.id ? '✏️ Editar' : '➕ Registrar'}
                            </button>
                            {f.id && <button type="button" className="btn-danger btn-sm" disabled={!puedeEditar} onClick={() => setBorrar(f)}>🗑️</button>}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </EstadoCarga>

      {modal && (
        <Modal titulo={modal.fila.id ? 'Editar calificación' : 'Registrar calificación'} onClose={() => setModal(null)}>
          <form onSubmit={guardar} style={{ width: '100%' }}>
            <p className="modal-texto"><strong>{modal.fila.estudiante_nombre}</strong><br />{modal.fila.materia_nombre}</p>
            <div className="form-group">
              <label>Calificación (0 a {NOTA_MAX})</label>
              <input type="number" min="0" max={NOTA_MAX} step="0.1" value={modal.valor} required autoFocus
                onChange={(e) => setModal({ ...modal, valor: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Fecha</label>
              <input type="date" max={hoyISO()} value={modal.fecha} required onChange={(e) => setModal({ ...modal, fecha: e.target.value })} />
            </div>
            {errorForm && <div className="aviso aviso-error">{errorForm}</div>}
            <div className="modal-acciones">
              <button type="submit" disabled={ocupado}>Guardar</button>
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
            </div>
          </form>
        </Modal>
      )}

      {borrar && (
        <ConfirmModal titulo="Eliminar calificación" peligro ocupado={ocupado} textoConfirmar="Eliminar"
          mensaje={`¿Eliminar la calificación de ${borrar.estudiante_nombre} en ${borrar.materia_nombre}?`}
          onConfirm={eliminar} onClose={() => setBorrar(null)} />
      )}
    </Layout>
  );
}
