import React, { useState } from 'react';
import { apiRequest } from '../api';
import { useAuth } from '../AuthContext';
import { useNotification } from '../NotificationContext';
import { useCarga } from '../hooks/useCarga';
import { etiquetaGrupo } from '../constants';
import Layout from './Layout';
import Modal, { ConfirmModal } from './Modal';
import EstadoCarga from './EstadoCarga';

const DIAS_CAMBIO = 7;

export default function TalleresList() {
  const { user } = useAuth();
  const { notify } = useNotification();
  const rol = user.rol;
  const esAdmin = rol === 'admin';
  const verAlumnos = rol === 'admin' || rol === 'docente';

  const { datos: talleres, cargando, error, recargar } = useCarga(() => apiRequest('/talleres'));
  const { datos: miTaller, recargar: recargarMi } = useCarga(
    () => (rol === 'estudiante' ? apiRequest('/talleres/mi-taller') : Promise.resolve({})), [rol]);

  const [form, setForm] = useState(null); // { id?, nombre, descripcion, cupo }
  const [errorForm, setErrorForm] = useState('');
  const [alumnos, setAlumnos] = useState(null); // { taller, lista }
  const [confirmar, setConfirmar] = useState(null); // { tipo, taller, alumno? }
  const [ocupado, setOcupado] = useState(false);

  const actualizar = () => { recargar(); recargarMi(); };
  const tieneTaller = !!miTaller?.id;
  const diasDesde = tieneTaller ? (Date.now() - new Date(miTaller.fecha_inscripcion).getTime()) / 86400000 : 0;
  const puedeCambiar = tieneTaller && diasDesde <= DIAS_CAMBIO;
  const limiteCambio = tieneTaller ? new Date(new Date(miTaller.fecha_inscripcion).getTime() + DIAS_CAMBIO * 86400000) : null;

  const accion = async (fn, exito) => {
    setOcupado(true);
    try { const r = await fn(); notify(exito || r?.mensaje, 'success'); actualizar(); }
    catch (err) { notify(err.message, 'error', 6000); }
    finally { setOcupado(false); setConfirmar(null); }
  };

  const guardarTaller = async (e) => {
    e.preventDefault();
    setOcupado(true);
    setErrorForm('');
    try {
      const body = { nombre: form.nombre, descripcion: form.descripcion, cupo: Number(form.cupo) };
      if (form.id) await apiRequest(`/talleres/${form.id}`, { method: 'PUT', body });
      else await apiRequest('/talleres', { method: 'POST', body });
      notify('Taller guardado', 'success');
      setForm(null);
      actualizar();
    } catch (err) { setErrorForm(err.message); } finally { setOcupado(false); }
  };

  const abrirAlumnos = async (t) => {
    try { setAlumnos({ taller: t, lista: await apiRequest(`/talleres/${t.id}/alumnos`) }); }
    catch (err) { notify(err.message, 'error'); }
  };

  const ejecutarConfirmacion = () => {
    const { tipo, taller, alumno } = confirmar;
    if (tipo === 'inscribir') return accion(() => apiRequest(`/talleres/${taller.id}/inscribir`, { method: 'POST' }));
    if (tipo === 'cambiar') return accion(() => apiRequest(`/talleres/${taller.id}/cambiar`, { method: 'POST' }));
    if (tipo === 'eliminar') return accion(() => apiRequest(`/talleres/${taller.id}`, { method: 'DELETE' }));
    return accion(async () => {
      const r = await apiRequest(`/talleres/${taller.id}/estudiante/${alumno.id_usuario}`, { method: 'DELETE' });
      setAlumnos(null);
      return r;
    });
  };

  const textoConfirmacion = () => {
    const { tipo, taller, alumno } = confirmar;
    if (tipo === 'inscribir') return `¿Inscribirte al taller “${taller.nombre}”? Podrás cambiarlo solo durante ${DIAS_CAMBIO} días.`;
    if (tipo === 'cambiar') return `¿Cambiarte al taller “${taller.nombre}”? Esta acción solo está disponible durante los primeros ${DIAS_CAMBIO} días.`;
    if (tipo === 'eliminar') return `¿Eliminar el taller “${taller.nombre}”?`;
    return `¿Dar de baja a ${alumno.nombre} del taller “${taller.nombre}”?`;
  };

  return (
    <Layout title="Talleres">
      <div className="page-head">
        <h2>{rol === 'estudiante' ? 'Talleres disponibles' : 'Talleres y actividades'}</h2>
        {esAdmin && <button type="button" onClick={() => { setErrorForm(''); setForm({ nombre: '', descripcion: '', cupo: 30 }); }}>+ Nuevo taller</button>}
      </div>

      {rol === 'estudiante' && (
        tieneTaller ? (
          <div className="aviso aviso-ok">
            Tu taller actual: <strong>{miTaller.nombre}</strong>.{' '}
            {puedeCambiar
              ? `Puedes cambiarte hasta el ${limiteCambio.toLocaleDateString('es-PE')}.`
              : 'El plazo para cambiar de taller ya terminó.'}
          </div>
        ) : <div className="aviso aviso-info">Aún no estás inscrito en ningún taller. Elige uno de la lista.</div>
      )}

      <EstadoCarga cargando={cargando} error={error} onReintentar={recargar}>
        <div className="tabla-scroll">
          <table>
            <thead><tr><th>Taller</th><th>Descripción</th><th>Cupo</th><th>Disponibles</th><th>Acciones</th></tr></thead>
            <tbody>
              {(talleres || []).length === 0 && <tr><td colSpan={5} className="vacio">No hay talleres registrados.</td></tr>}
              {(talleres || []).map((t) => {
                const libres = t.cupo_maximo - t.inscritos;
                const esMio = miTaller?.id === t.id;
                return (
                  <tr key={t.id}>
                    <td><strong>{t.nombre}</strong></td>
                    <td>{t.descripcion || <span className="sin-dato">—</span>}</td>
                    <td>{t.inscritos} / {t.cupo_maximo}</td>
                    <td><span className={`badge ${libres > 0 ? 'badge-ok' : 'badge-error'}`}>{libres > 0 ? `${libres} lugares` : 'Lleno'}</span></td>
                    <td>
                      <div className="acciones">
                        {rol === 'estudiante' && esMio && <span className="badge badge-info">Inscrito</span>}
                        {rol === 'estudiante' && !tieneTaller && (
                          <button type="button" className="btn-sm" disabled={libres <= 0} onClick={() => setConfirmar({ tipo: 'inscribir', taller: t })}>Inscribirme</button>
                        )}
                        {rol === 'estudiante' && tieneTaller && !esMio && puedeCambiar && (
                          <button type="button" className="btn-outline btn-sm" disabled={libres <= 0} onClick={() => setConfirmar({ tipo: 'cambiar', taller: t })}>Cambiarme</button>
                        )}
                        {verAlumnos && <button type="button" className="btn-secondary btn-sm" onClick={() => abrirAlumnos(t)}>Ver alumnos</button>}
                        {esAdmin && <button type="button" className="btn-secondary btn-sm" onClick={() => { setErrorForm(''); setForm({ id: t.id, nombre: t.nombre, descripcion: t.descripcion || '', cupo: t.cupo_maximo }); }}>Editar</button>}
                        {esAdmin && <button type="button" className="btn-danger btn-sm" onClick={() => setConfirmar({ tipo: 'eliminar', taller: t })}>Eliminar</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </EstadoCarga>

      {form && (
        <Modal titulo={form.id ? 'Editar taller' : 'Nuevo taller'} onClose={() => setForm(null)}>
          <form onSubmit={guardarTaller} style={{ width: '100%' }}>
            <div className="form-group"><label>Nombre</label><input value={form.nombre} maxLength={100} required onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
            <div className="form-group"><label>Descripción</label><textarea rows={3} maxLength={500} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></div>
            <div className="form-group"><label>Cupo máximo (1 a 30)</label><input type="number" min="1" max="30" required value={form.cupo} onChange={(e) => setForm({ ...form, cupo: e.target.value })} /></div>
            {errorForm && <div className="aviso aviso-error">{errorForm}</div>}
            <div className="modal-acciones">
              <button type="submit" disabled={ocupado}>Guardar</button>
              <button type="button" className="btn-secondary" onClick={() => setForm(null)}>Cancelar</button>
            </div>
          </form>
        </Modal>
      )}

      {alumnos && (
        <Modal titulo={`Alumnos de ${alumnos.taller.nombre}`} onClose={() => setAlumnos(null)} ancho={560}>
          {alumnos.lista.length === 0 ? <p className="modal-texto">No hay alumnos inscritos.</p> : (
            <div className="tabla-scroll" style={{ width: '100%' }}>
              <table>
                <thead><tr><th>Nombre</th><th>Matrícula</th><th>Grupo</th>{esAdmin && <th />}</tr></thead>
                <tbody>
                  {alumnos.lista.map((a) => (
                    <tr key={a.id_usuario}>
                      <td>{a.nombre}</td><td>{a.matricula}</td><td>{etiquetaGrupo(a.anio, a.seccion)}</td>
                      {esAdmin && <td><button type="button" className="btn-danger btn-sm" onClick={() => setConfirmar({ tipo: 'baja', taller: alumnos.taller, alumno: a })}>Dar de baja</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="modal-acciones"><button type="button" className="btn-secondary" onClick={() => setAlumnos(null)}>Cerrar</button></div>
        </Modal>
      )}

      {confirmar && (
        <ConfirmModal titulo="Confirmar" peligro={confirmar.tipo === 'eliminar' || confirmar.tipo === 'baja'} ocupado={ocupado}
          mensaje={textoConfirmacion()} onConfirm={ejecutarConfirmacion} onClose={() => setConfirmar(null)} />
      )}
    </Layout>
  );
}
