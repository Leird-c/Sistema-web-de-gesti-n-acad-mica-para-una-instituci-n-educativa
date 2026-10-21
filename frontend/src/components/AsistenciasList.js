import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api';
import { useAuth } from '../AuthContext';
import { useNotification } from '../NotificationContext';
import { useCarga } from '../hooks/useCarga';
import { etiquetaGrupo, hoyISO } from '../constants';
import Layout from './Layout';
import Modal, { ConfirmModal } from './Modal';
import EstadoCarga from './EstadoCarga';
import SelectorHijo from './SelectorHijo';

// ---------- Historial ----------
function Historial({ rol, hijoActual, userId, grupos, esGestor }) {
  const { notify } = useNotification();
  const [fecha, setFecha] = useState('');
  const [grupoId, setGrupoId] = useState('');
  const [justificar, setJustificar] = useState(null);
  const [texto, setTexto] = useState('');
  const [borrar, setBorrar] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const { datos, cargando, error, recargar } = useCarga(async () => {
    if (esGestor) {
      const qs = new URLSearchParams();
      if (fecha) qs.set('fecha', fecha);
      if (grupoId) qs.set('grupo_id', grupoId);
      return apiRequest(`${rol === 'admin' ? '/asistencias' : '/asistencias/docente'}?${qs}`);
    }
    const id = rol === 'estudiante' ? userId : hijoActual;
    return id ? apiRequest(`/asistencias/usuario/${id}`) : [];
  }, [rol, hijoActual, fecha, grupoId]);

  const filas = datos || [];
  const faltas = filas.filter((a) => a.estado === 'FALTA').length;
  const porcentaje = filas.length ? Math.round(((filas.length - faltas) / filas.length) * 100) : null;

  const enviarJustificacion = async (e) => {
    e.preventDefault();
    setOcupado(true);
    try {
      await apiRequest(`/asistencias/${justificar.id}/justificar`, { method: 'PUT', body: { justificacion: texto } });
      notify('Falta justificada correctamente', 'success');
      setJustificar(null);
      recargar();
    } catch (err) { notify(err.message, 'error'); } finally { setOcupado(false); }
  };
  const eliminar = async () => {
    setOcupado(true);
    try {
      await apiRequest(`/asistencias/${borrar.id}`, { method: 'DELETE' });
      notify('Registro eliminado', 'success');
      recargar();
    } catch (err) { notify(err.message, 'error'); } finally { setOcupado(false); setBorrar(null); }
  };

  return (
    <>
      {esGestor && (
        <div className="filtros">
          <label>Fecha<input type="date" max={hoyISO()} value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
          <label>Grupo
            <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
              <option value="">Todos</option>
              {grupos.map((g) => <option key={g.id_grupo} value={g.id_grupo}>{etiquetaGrupo(g.anio, g.seccion)}</option>)}
            </select>
          </label>
          <button type="button" className="btn-secondary" onClick={() => { setFecha(''); setGrupoId(''); }}>Limpiar</button>
        </div>
      )}
      <EstadoCarga cargando={cargando} error={error} onReintentar={recargar}>
        {!esGestor && (
          <div className="cards-resumen">
            <div className="tarjeta-mini"><strong>{filas.length}</strong><span>Días registrados</span></div>
            <div className="tarjeta-mini"><strong>{filas.length - faltas}</strong><span>Asistencias</span></div>
            <div className="tarjeta-mini"><strong>{faltas}</strong><span>Faltas</span></div>
            <div className="tarjeta-mini"><strong>{porcentaje === null ? '—' : `${porcentaje}%`}</strong><span>Asistencia</span></div>
          </div>
        )}
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                {esGestor && <><th>Estudiante</th><th>Grupo</th></>}
                <th>Fecha</th><th>Estado</th><th>Justificación</th>
                {esGestor && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && <tr><td colSpan={esGestor ? 6 : 3} className="vacio">No hay registros de asistencia.</td></tr>}
              {filas.map((a) => (
                <tr key={a.id}>
                  {esGestor && <><td>{a.estudiante_nombre}</td><td>{etiquetaGrupo(a.grupo_anio, a.grupo_seccion)}</td></>}
                  <td>{a.fecha}</td>
                  <td><span className={`badge ${a.estado === 'ASISTENCIA' ? 'badge-ok' : 'badge-error'}`}>{a.estado === 'ASISTENCIA' ? 'Asistió' : 'Falta'}</span></td>
                  <td>{a.justificacion || (a.estado === 'FALTA' ? <span className="sin-dato">Sin justificar</span> : '—')}</td>
                  {esGestor && (
                    <td>
                      <div className="acciones">
                        {a.estado === 'FALTA' && !a.justificacion && (
                          <button type="button" className="btn-secondary btn-sm" onClick={() => { setTexto(''); setJustificar(a); }}>Justificar</button>
                        )}
                        {rol === 'admin' && <button type="button" className="btn-danger btn-sm" onClick={() => setBorrar(a)}>🗑️</button>}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </EstadoCarga>

      {justificar && (
        <Modal titulo="Justificar falta" onClose={() => setJustificar(null)}>
          <form onSubmit={enviarJustificacion} style={{ width: '100%' }}>
            <p className="modal-texto">{justificar.estudiante_nombre} — {justificar.fecha}</p>
            <div className="form-group">
              <label>Motivo</label>
              <textarea rows={3} maxLength={500} value={texto} onChange={(e) => setTexto(e.target.value)} required autoFocus />
            </div>
            <div className="modal-acciones">
              <button type="submit" disabled={ocupado}>Guardar</button>
              <button type="button" className="btn-secondary" onClick={() => setJustificar(null)}>Cancelar</button>
            </div>
          </form>
        </Modal>
      )}
      {borrar && (
        <ConfirmModal titulo="Eliminar registro" peligro ocupado={ocupado} textoConfirmar="Eliminar"
          mensaje={`¿Eliminar el registro de ${borrar.estudiante_nombre} del ${borrar.fecha}?`}
          onConfirm={eliminar} onClose={() => setBorrar(null)} />
      )}
    </>
  );
}

// ---------- Tomar asistencia ----------
function TomarAsistencia({ grupos, alGuardar }) {
  const { notify } = useNotification();
  const [grupoId, setGrupoId] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [lista, setLista] = useState([]);
  const [marcas, setMarcas] = useState({});
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [yaRegistrada, setYaRegistrada] = useState(false);

  useEffect(() => {
    if (!grupoId || !fecha) { setLista([]); return undefined; }
    let cancelado = false;
    setCargando(true);
    apiRequest(`/asistencias/grupo/${grupoId}/fecha/${fecha}`)
      .then((r) => {
        if (cancelado) return;
        setLista(r);
        setYaRegistrada(r.some((a) => a.presente !== null));
        setMarcas(Object.fromEntries(r.map((a) => [a.usuario_id, a.presente === null ? true : a.presente])));
      })
      .catch((e) => { if (!cancelado) notify(e.message, 'error'); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [grupoId, fecha, notify]);

  const marcarTodos = (valor) => setMarcas(Object.fromEntries(lista.map((a) => [a.usuario_id, valor])));
  const faltantes = Object.values(marcas).filter((v) => !v).length;

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await apiRequest('/asistencias/lote', {
        method: 'POST',
        body: { grupo_id: Number(grupoId), fecha, registros: lista.map((a) => ({ usuario_id: a.usuario_id, presente: !!marcas[a.usuario_id] })) },
      });
      notify(r.mensaje, 'success');
      setYaRegistrada(true);
      alGuardar();
    } catch (e) { notify(e.message, 'error'); } finally { setGuardando(false); }
  };

  return (
    <>
      <div className="filtros">
        <label>Grupo
          <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
            <option value="">Seleccione…</option>
            {grupos.map((g) => <option key={g.id_grupo} value={g.id_grupo}>{etiquetaGrupo(g.anio, g.seccion)} ({g.alumnos} alumnos)</option>)}
          </select>
        </label>
        <label>Fecha<input type="date" max={hoyISO()} value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
      </div>

      {!grupoId && <div className="vacio">Selecciona un grupo para tomar la asistencia.</div>}
      {cargando && <div className="vacio">Cargando lista…</div>}
      {grupoId && !cargando && lista.length > 0 && (
        <>
          {yaRegistrada && <div className="aviso aviso-info">Ya hay asistencia registrada en esta fecha. Puedes corregirla y guardar de nuevo.</div>}
          <div className="acciones" style={{ marginBottom: 8 }}>
            <button type="button" className="btn-outline btn-sm" onClick={() => marcarTodos(true)}>Marcar todos presentes</button>
            <button type="button" className="btn-outline btn-sm" onClick={() => marcarTodos(false)}>Marcar todos con falta</button>
          </div>
          <div className="lista-asistencia">
            {lista.map((a) => (
              <div key={a.usuario_id} className="fila-asistencia">
                <span>{a.estudiante_nombre} <small className="ayuda">{a.matricula}</small></span>
                <div className="toggle-asis">
                  <button type="button" className={marcas[a.usuario_id] ? 'activo-ok' : ''} onClick={() => setMarcas({ ...marcas, [a.usuario_id]: true })}>Presente</button>
                  <button type="button" className={!marcas[a.usuario_id] ? 'activo-falta' : ''} onClick={() => setMarcas({ ...marcas, [a.usuario_id]: false })}>Falta</button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" disabled={guardando} onClick={guardar}>
            {guardando ? 'Guardando…' : `Guardar asistencia (${lista.length - faltantes} presentes, ${faltantes} faltas)`}
          </button>
        </>
      )}
      {grupoId && !cargando && lista.length === 0 && <div className="vacio">Este grupo no tiene alumnos.</div>}
    </>
  );
}

export default function AsistenciasList() {
  const { user, hijoActual } = useAuth();
  const esGestor = user.rol === 'admin' || user.rol === 'docente';
  const [pestana, setPestana] = useState('historial');
  const [version, setVersion] = useState(0);
  const { datos: grupos } = useCarga(() => (esGestor ? apiRequest('/grupos') : Promise.resolve([])), [esGestor]);

  return (
    <Layout title={esGestor ? 'Control de Asistencia' : 'Mi Asistencia'}>
      <SelectorHijo />
      {esGestor && (
        <div className="tabs">
          <button type="button" className={`tab ${pestana === 'historial' ? 'activo' : ''}`} onClick={() => setPestana('historial')}>Historial</button>
          <button type="button" className={`tab ${pestana === 'tomar' ? 'activo' : ''}`} onClick={() => setPestana('tomar')}>Tomar asistencia</button>
        </div>
      )}
      {pestana === 'tomar' && esGestor
        ? <TomarAsistencia grupos={grupos || []} alGuardar={() => setVersion((v) => v + 1)} />
        : <Historial key={version} rol={user.rol} userId={user.id_usuario} hijoActual={hijoActual} grupos={grupos || []} esGestor={esGestor} />}
    </Layout>
  );
}
