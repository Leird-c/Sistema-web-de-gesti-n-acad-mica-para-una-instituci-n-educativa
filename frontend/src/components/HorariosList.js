import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api';
import { useAuth } from '../AuthContext';
import { useNotification } from '../NotificationContext';
import { useCarga } from '../hooks/useCarga';
import { DIAS, etiquetaGrupo } from '../constants';
import Layout from './Layout';
import { ConfirmModal } from './Modal';
import EstadoCarga from './EstadoCarga';
import SelectorHijo from './SelectorHijo';

// Cuadrícula semanal: filas = bloques horarios, columnas = días.
function Grilla({ filas, mostrar }) {
  const dias = DIAS.filter((d, i) => i < 5 || filas.some((f) => f.dia === d));
  const bloques = [...new Set(filas.map((f) => `${f.hora_inicio}-${f.hora_fin}`))].sort();
  if (filas.length === 0) return <div className="vacio">No hay clases en el horario.</div>;
  return (
    <div className="tabla-scroll">
      <table className="grilla-horario">
        <thead><tr><th>Hora</th>{dias.map((d) => <th key={d}>{d}</th>)}</tr></thead>
        <tbody>
          {bloques.map((b) => (
            <tr key={b}>
              <td className="hora">{b.replace('-', ' – ')}</td>
              {dias.map((d) => (
                <td key={d}>
                  {filas.filter((f) => f.dia === d && `${f.hora_inicio}-${f.hora_fin}` === b).map((f) => (
                    <div className="clase" key={f.id}>
                      <strong>{f.materia_nombre}</strong>
                      <small>{mostrar === 'grupo' ? etiquetaGrupo(f.grupo_anio, f.grupo_seccion) : f.docente_nombre}</small>
                    </div>
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Administración (solo admin) ----------
function AdminHorarios() {
  const { notify } = useNotification();
  const [pestana, setPestana] = useState('horarios');
  const { datos: grupos } = useCarga(() => apiRequest('/grupos'));
  const [grupoId, setGrupoId] = useState('');
  const { datos: asignaciones, recargar: recargarAsig } = useCarga(() => apiRequest('/docente-materia'));
  const { datos: materias } = useCarga(() => apiRequest('/materias'));
  const { datos: docentes } = useCarga(() => apiRequest('/usuarios?rol=docente'));
  const { datos: filas, cargando, error, recargar } = useCarga(
    () => (grupoId ? apiRequest(`/horarios?grupo_id=${grupoId}`) : Promise.resolve([])), [grupoId]);

  useEffect(() => { if (!grupoId && grupos?.length) setGrupoId(String(grupos[0].id_grupo)); }, [grupos, grupoId]);

  const [form, setForm] = useState({ asignacion: '', dia: 'Lunes', hora_inicio: '07:00', hora_fin: '07:50' });
  const [formAsig, setFormAsig] = useState({ docente_id: '', grupo_id: '', materia_id: '' });
  const [borrar, setBorrar] = useState(null); // { tipo, item }
  const [ocupado, setOcupado] = useState(false);

  const asigDelGrupo = (asignaciones || []).filter((a) => String(a.grupo_id) === grupoId);
  const grupoSel = (grupos || []).find((g) => String(g.id_grupo) === grupoId);
  const grupoAsig = (grupos || []).find((g) => String(g.id_grupo) === formAsig.grupo_id);
  const materiasAsig = (materias || []).filter((m) => grupoAsig && m.anio === grupoAsig.anio);

  const agregarHorario = async (e) => {
    e.preventDefault();
    const a = (asignaciones || []).find((x) => String(x.id) === form.asignacion);
    setOcupado(true);
    try {
      await apiRequest('/horarios', { method: 'POST', body: { grupo_id: a.grupo_id, materia_id: a.materia_id, docente_id: a.docente_id, dia: form.dia, hora_inicio: form.hora_inicio, hora_fin: form.hora_fin } });
      notify('Horario agregado', 'success');
      recargar();
    } catch (err) { notify(err.message, 'error', 6000); } finally { setOcupado(false); }
  };

  const agregarAsignacion = async (e) => {
    e.preventDefault();
    setOcupado(true);
    try {
      await apiRequest('/docente-materia', { method: 'POST', body: { docente_id: Number(formAsig.docente_id), grupo_id: Number(formAsig.grupo_id), materia_id: Number(formAsig.materia_id) } });
      notify('Materia asignada al docente', 'success');
      setFormAsig({ ...formAsig, materia_id: '' });
      recargarAsig();
    } catch (err) { notify(err.message, 'error', 6000); } finally { setOcupado(false); }
  };

  const confirmarBorrar = async () => {
    setOcupado(true);
    try {
      await apiRequest(borrar.tipo === 'horario' ? `/horarios/${borrar.item.id}` : `/docente-materia/${borrar.item.id}`, { method: 'DELETE' });
      notify('Eliminado correctamente', 'success');
      borrar.tipo === 'horario' ? recargar() : recargarAsig();
    } catch (err) { notify(err.message, 'error', 6000); } finally { setOcupado(false); setBorrar(null); }
  };

  return (
    <>
      <div className="tabs">
        <button type="button" className={`tab ${pestana === 'horarios' ? 'activo' : ''}`} onClick={() => setPestana('horarios')}>Horarios por grupo</button>
        <button type="button" className={`tab ${pestana === 'asignaciones' ? 'activo' : ''}`} onClick={() => setPestana('asignaciones')}>Asignaciones docente-materia</button>
      </div>

      {pestana === 'horarios' && (
        <>
          <div className="filtros">
            <label>Grupo
              <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
                {(grupos || []).map((g) => <option key={g.id_grupo} value={g.id_grupo}>{etiquetaGrupo(g.anio, g.seccion)}</option>)}
              </select>
            </label>
          </div>

          <form className="caja-form" onSubmit={agregarHorario}>
            <h3>Agregar clase al horario de {grupoSel ? etiquetaGrupo(grupoSel.anio, grupoSel.seccion) : '…'}</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Materia — docente</label>
                <select required value={form.asignacion} onChange={(e) => setForm({ ...form, asignacion: e.target.value })}>
                  <option value="">Seleccione…</option>
                  {asigDelGrupo.map((a) => <option key={a.id} value={a.id}>{a.materia_nombre} — {a.docente_nombre}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Día</label>
                <select value={form.dia} onChange={(e) => setForm({ ...form, dia: e.target.value })}>{DIAS.map((d) => <option key={d}>{d}</option>)}</select>
              </div>
              <div className="form-group"><label>Inicio</label><input type="time" required value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} /></div>
              <div className="form-group"><label>Fin</label><input type="time" required value={form.hora_fin} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} /></div>
            </div>
            {asigDelGrupo.length === 0 && <p className="ayuda">Este grupo aún no tiene materias asignadas a docentes (pestaña “Asignaciones”).</p>}
            <button type="submit" disabled={ocupado || !form.asignacion}>Agregar</button>
          </form>

          <EstadoCarga cargando={cargando} error={error} onReintentar={recargar}>
            <Grilla filas={filas || []} mostrar="docente" />
            {(filas || []).length > 0 && (
              <details style={{ marginTop: 14 }}>
                <summary>Ver lista y eliminar clases</summary>
                <div className="tabla-scroll">
                  <table>
                    <thead><tr><th>Día</th><th>Hora</th><th>Materia</th><th>Docente</th><th /></tr></thead>
                    <tbody>
                      {filas.map((f) => (
                        <tr key={f.id}>
                          <td>{f.dia}</td><td>{f.hora_inicio} – {f.hora_fin}</td><td>{f.materia_nombre}</td><td>{f.docente_nombre}</td>
                          <td><button type="button" className="btn-danger btn-sm" onClick={() => setBorrar({ tipo: 'horario', item: f })}>Eliminar</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </EstadoCarga>
        </>
      )}

      {pestana === 'asignaciones' && (
        <>
          <form className="caja-form" onSubmit={agregarAsignacion}>
            <h3>Asignar materia a un docente</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Docente</label>
                <select required value={formAsig.docente_id} onChange={(e) => setFormAsig({ ...formAsig, docente_id: e.target.value })}>
                  <option value="">Seleccione…</option>
                  {(docentes || []).filter((d) => d.activo).map((d) => <option key={d.id_usuario} value={d.id_usuario}>{d.nombre} ({d.usuario})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Grupo</label>
                <select required value={formAsig.grupo_id} onChange={(e) => setFormAsig({ ...formAsig, grupo_id: e.target.value, materia_id: '' })}>
                  <option value="">Seleccione…</option>
                  {(grupos || []).map((g) => <option key={g.id_grupo} value={g.id_grupo}>{etiquetaGrupo(g.anio, g.seccion)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Materia</label>
                <select required value={formAsig.materia_id} onChange={(e) => setFormAsig({ ...formAsig, materia_id: e.target.value })} disabled={!grupoAsig}>
                  <option value="">Seleccione…</option>
                  {materiasAsig.map((m) => <option key={m.id_materia} value={m.id_materia}>{m.nombre}</option>)}
                </select>
              </div>
            </div>
            <p className="ayuda">Un docente puede tener como máximo 4 materias distintas; cada materia de un grupo tiene un solo docente.</p>
            <button type="submit" disabled={ocupado}>Asignar</button>
          </form>

          <div className="tabla-scroll">
            <table>
              <thead><tr><th>Docente</th><th>Materia</th><th>Grupo</th><th /></tr></thead>
              <tbody>
                {(asignaciones || []).map((a) => (
                  <tr key={a.id}>
                    <td>{a.docente_nombre}</td><td>{a.materia_nombre}</td><td>{etiquetaGrupo(a.grupo_anio, a.grupo_seccion)}</td>
                    <td><button type="button" className="btn-danger btn-sm" onClick={() => setBorrar({ tipo: 'asignacion', item: a })}>Quitar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {borrar && (
        <ConfirmModal titulo="Confirmar eliminación" peligro ocupado={ocupado} textoConfirmar="Eliminar"
          mensaje={borrar.tipo === 'horario' ? `¿Eliminar la clase de ${borrar.item.materia_nombre} del ${borrar.item.dia}?` : `¿Quitar ${borrar.item.materia_nombre} (${etiquetaGrupo(borrar.item.grupo_anio, borrar.item.grupo_seccion)}) a ${borrar.item.docente_nombre}?`}
          onConfirm={confirmarBorrar} onClose={() => setBorrar(null)} />
      )}
    </>
  );
}

export default function HorariosList() {
  const { user, hijoActual } = useAuth();
  const rol = user.rol;
  const { datos: filas, cargando, error, recargar } = useCarga(async () => {
    if (rol === 'admin') return [];
    if (rol === 'docente') return apiRequest('/horarios/docente');
    if (rol === 'estudiante') return apiRequest('/horarios/mio');
    return hijoActual ? apiRequest(`/horarios/estudiante/${hijoActual}`) : [];
  }, [rol, hijoActual]);

  const titulo = { admin: 'Horarios y Asignaciones', docente: 'Mis Materias y Horario', estudiante: 'Mi Horario', padre: 'Horario de mi hijo/a' }[rol];

  return (
    <Layout title={titulo}>
      <SelectorHijo />
      {rol === 'admin' ? <AdminHorarios /> : (
        <EstadoCarga cargando={cargando} error={error} onReintentar={recargar}>
          <Grilla filas={filas || []} mostrar={rol === 'docente' ? 'grupo' : 'docente'} />
        </EstadoCarga>
      )}
    </Layout>
  );
}
