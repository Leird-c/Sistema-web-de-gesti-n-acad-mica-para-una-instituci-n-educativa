import React, { useMemo, useState } from 'react';
import { apiRequest } from '../api';
import { useAuth } from '../AuthContext';
import { useNotification } from '../NotificationContext';
import { useCarga } from '../hooks/useCarga';
import { NOMBRE_SANCION, SANCIONES, TIPOS_INCIDENCIA, etiquetaGrupo, hoyISO } from '../constants';
import Layout from './Layout';
import Modal, { ConfirmModal } from './Modal';
import EstadoCarga from './EstadoCarga';
import SelectorHijo from './SelectorHijo';

const claseSancion = { llamado: 'badge-warn', suspension: 'badge-error', expulsion: 'badge-error' };

// Formulario de alta / edición
function IncidenciaModal({ inicial, onClose, onGuardado }) {
  const { notify } = useNotification();
  const editando = !!inicial;
  const { datos: estudiantes } = useCarga(() => (editando ? Promise.resolve([]) : apiRequest('/estudiantes')), [editando]);
  const { datos: materias } = useCarga(() => apiRequest('/materias'));
  const { datos: talleres } = useCarga(() => apiRequest('/talleres'));
  const [f, setF] = useState({
    usuario_id: inicial?.usuario_id || '',
    tipo: inicial?.tipo || TIPOS_INCIDENCIA[0],
    descripcion: inicial?.descripcion || '',
    fecha: inicial?.fecha || hoyISO(),
    sancion: inicial?.sancion || '',
    donde: inicial?.taller_id ? 'taller' : 'materia',
    materia_id: inicial?.materia_id || '',
    taller_id: inicial?.taller_id || '',
  });
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    setOcupado(true);
    const body = {
      tipo: f.tipo, descripcion: f.descripcion, fecha: f.fecha, sancion: f.sancion || null,
      materia_id: f.donde === 'materia' ? Number(f.materia_id) || null : null,
      taller_id: f.donde === 'taller' ? Number(f.taller_id) || null : null,
      ...(editando ? {} : { usuario_id: Number(f.usuario_id) }),
    };
    try {
      if (editando) await apiRequest(`/incidencias/${inicial.id}`, { method: 'PUT', body });
      else await apiRequest('/incidencias', { method: 'POST', body });
      notify('Incidencia guardada', 'success');
      onGuardado();
    } catch (err) { setError(err.message); } finally { setOcupado(false); }
  };

  return (
    <Modal titulo={editando ? 'Editar incidencia' : 'Registrar incidencia'} onClose={onClose} ancho={500}>
      <form onSubmit={guardar} style={{ width: '100%' }}>
        <div className="form-group">
          <label>Estudiante</label>
          {editando
            ? <input value={inicial.estudiante_nombre} disabled />
            : (
              <select required value={f.usuario_id} onChange={(e) => set('usuario_id', e.target.value)}>
                <option value="">Seleccione…</option>
                {(estudiantes || []).map((s) => <option key={s.id_usuario} value={s.id_usuario}>{s.nombre} ({etiquetaGrupo(s.anio, s.seccion)})</option>)}
              </select>
            )}
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label>Tipo</label>
            <select value={f.tipo} onChange={(e) => set('tipo', e.target.value)}>
              {[...new Set([f.tipo, ...TIPOS_INCIDENCIA])].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Fecha</label>
            <input type="date" max={hoyISO()} required value={f.fecha} onChange={(e) => set('fecha', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label>Ocurrió en</label>
          <select value={f.donde} onChange={(e) => set('donde', e.target.value)}>
            <option value="materia">Una materia</option>
            <option value="taller">Un taller</option>
          </select>
        </div>
        {f.donde === 'materia' ? (
          <div className="form-group">
            <label>Materia</label>
            <select required value={f.materia_id} onChange={(e) => set('materia_id', e.target.value)}>
              <option value="">Seleccione…</option>
              {(materias || []).map((m) => <option key={m.id_materia} value={m.id_materia}>{m.nombre} ({m.anio}°)</option>)}
            </select>
          </div>
        ) : (
          <div className="form-group">
            <label>Taller</label>
            <select required value={f.taller_id} onChange={(e) => set('taller_id', e.target.value)}>
              <option value="">Seleccione…</option>
              {(talleres || []).map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
        )}
        <div className="form-group">
          <label>Sanción</label>
          <select value={f.sancion} onChange={(e) => set('sancion', e.target.value)}>
            {SANCIONES.map((s) => <option key={s.valor} value={s.valor}>{s.texto}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Descripción</label>
          <textarea rows={3} maxLength={1000} required value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} />
        </div>
        {error && <div className="aviso aviso-error">{error}</div>}
        <div className="modal-acciones">
          <button type="submit" disabled={ocupado}>Guardar</button>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

export default function IncidenciasList() {
  const { user, hijoActual } = useAuth();
  const { notify } = useNotification();
  const rol = user.rol;
  const esGestor = rol === 'admin' || rol === 'docente';

  const { datos, cargando, error, recargar } = useCarga(async () => {
    if (rol === 'admin') return apiRequest('/incidencias');
    if (rol === 'docente') return apiRequest('/incidencias/docente');
    const id = rol === 'estudiante' ? user.id_usuario : hijoActual;
    return id ? apiRequest(`/incidencias/usuario/${id}`) : [];
  }, [rol, hijoActual]);

  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null); // 'nueva' | incidencia
  const [borrar, setBorrar] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (datos || []).filter((i) => !t || (i.estudiante_nombre || '').toLowerCase().includes(t) || (i.tipo || '').toLowerCase().includes(t));
  }, [datos, q]);

  const puedeEditar = (i) => rol === 'admin' || (rol === 'docente' && i.registrado_por === user.id_usuario);

  const eliminar = async () => {
    setOcupado(true);
    try {
      await apiRequest(`/incidencias/${borrar.id}`, { method: 'DELETE' });
      notify('Incidencia eliminada', 'success');
      recargar();
    } catch (err) { notify(err.message, 'error'); } finally { setOcupado(false); setBorrar(null); }
  };

  return (
    <Layout title={esGestor ? 'Incidencias' : 'Mis Incidencias'}>
      <SelectorHijo />
      {esGestor && (
        <div className="page-head">
          <div className="filtros" style={{ margin: 0 }}>
            <label>Buscar<input placeholder="Estudiante o tipo" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          </div>
          <button type="button" onClick={() => setModal('nueva')}>+ Registrar incidencia</button>
        </div>
      )}

      <EstadoCarga cargando={cargando} error={error} onReintentar={recargar}>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                {esGestor && <th>Estudiante</th>}
                <th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Materia / Taller</th><th>Sanción</th>
                {esGestor && <th>Registró</th>}
                {esGestor && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && <tr><td colSpan={esGestor ? 8 : 5} className="vacio">No hay incidencias registradas.</td></tr>}
              {filas.map((i) => (
                <tr key={i.id}>
                  {esGestor && <td>{i.estudiante_nombre}<br /><small className="ayuda">{etiquetaGrupo(i.grupo_anio, i.grupo_seccion)}</small></td>}
                  <td>{i.fecha}</td>
                  <td>{i.tipo}</td>
                  <td>{i.descripcion}</td>
                  <td>{i.materia_nombre || i.taller_nombre || '—'}</td>
                  <td>{i.sancion ? <span className={`badge ${claseSancion[i.sancion]}`}>{NOMBRE_SANCION[i.sancion]}</span> : '—'}</td>
                  {esGestor && <td>{i.registrado_por_nombre || '—'}</td>}
                  {esGestor && (
                    <td>
                      <div className="acciones">
                        {puedeEditar(i) && <button type="button" className="btn-secondary btn-sm" onClick={() => setModal(i)}>Editar</button>}
                        {rol === 'admin' && <button type="button" className="btn-danger btn-sm" onClick={() => setBorrar(i)}>🗑️</button>}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </EstadoCarga>

      {modal && (
        <IncidenciaModal inicial={modal === 'nueva' ? null : modal} onClose={() => setModal(null)}
          onGuardado={() => { setModal(null); recargar(); }} />
      )}
      {borrar && (
        <ConfirmModal titulo="Eliminar incidencia" peligro ocupado={ocupado} textoConfirmar="Eliminar"
          mensaje={`¿Eliminar la incidencia de ${borrar.estudiante_nombre} (${borrar.tipo})?`}
          onConfirm={eliminar} onClose={() => setBorrar(null)} />
      )}
    </Layout>
  );
}
