import React, { useMemo, useState } from 'react';
import { apiRequest } from '../api';
import { useNotification } from '../NotificationContext';
import { useCarga } from '../hooks/useCarga';
import { ANIOS, ROLES, SECCIONES, TIPO_DOCENTE, etiquetaGrupo } from '../constants';
import Layout from './Layout';
import Modal, { ConfirmModal } from './Modal';
import EstadoCarga from './EstadoCarga';

const FORM_VACIO = {
  nombre: '', correo: '', rol: 'estudiante', contrasena: '', tipo_docente: 'BA', matricula: '',
  anio: '1', grupo: 'A', estudiante_id: '', homoclave: '', telefono: '', activo: true,
};

export default function UsuariosList() {
  const { notify } = useNotification();
  const { datos: usuarios, cargando, error, recargar } = useCarga(() => apiRequest('/usuarios'));
  const [filtros, setFiltros] = useState({ q: '', rol: '', anio: '', grupo: '', taller: '' });
  const [formulario, setFormulario] = useState(null); // { editar: usuario|null, form }
  const [estudiantes, setEstudiantes] = useState([]);
  const [eliminar, setEliminar] = useState(null);
  const [reactivar, setReactivar] = useState(null);
  const [vincular, setVincular] = useState(null);
  const [credenciales, setCredenciales] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const filtrados = useMemo(() => {
    const q = filtros.q.trim().toLowerCase();
    return (usuarios || []).filter((u) => {
      if (filtros.rol && u.rol !== filtros.rol) return false;
      if (q && ![u.nombre, u.usuario, u.correo, u.matricula].some((v) => (v || '').toLowerCase().includes(q))) return false;
      if (filtros.anio && String(u.anio) !== filtros.anio) return false;
      if (filtros.grupo && u.grupo !== filtros.grupo) return false;
      if (filtros.taller && !(u.taller || '').toLowerCase().includes(filtros.taller.toLowerCase())) return false;
      return true;
    });
  }, [usuarios, filtros]);

  const cargarEstudiantes = async () => {
    try { setEstudiantes(await apiRequest('/estudiantes')); } catch (e) { notify(e.message, 'error'); }
  };

  const abrirNuevo = () => {
    setErrorForm('');
    setFormulario({ editar: null, form: { ...FORM_VACIO } });
    cargarEstudiantes();
  };
  const abrirEditar = (u) => {
    setErrorForm('');
    setFormulario({
      editar: u,
      form: { ...FORM_VACIO, nombre: u.nombre, correo: u.correo, rol: u.rol, tipo_docente: u.tipo_docente || 'BA',
        anio: String(u.anio || 1), grupo: u.grupo || 'A', activo: u.activo },
    });
  };
  const setCampo = (campo, valor) => setFormulario((f) => ({ ...f, form: { ...f.form, [campo]: valor } }));

  const guardar = async (e) => {
    e.preventDefault();
    setErrorForm('');
    const { editar, form } = formulario;
    setOcupado(true);
    try {
      if (editar) {
        await apiRequest(`/usuarios/${editar.id_usuario}`, {
          method: 'PUT',
          body: {
            nombre: form.nombre, correo: form.correo, activo: form.activo,
            ...(editar.rol === 'docente' ? { tipo_docente: form.tipo_docente } : {}),
            ...(editar.rol === 'estudiante' ? { anio: form.anio, grupo: form.grupo } : {}),
          },
        });
        notify('Usuario actualizado correctamente', 'success');
      } else if (form.rol === 'padre') {
        const r = await apiRequest('/padres/completo', {
          method: 'POST',
          body: { nombre: form.nombre, correo: form.correo, estudiante_id: Number(form.estudiante_id), homoclave: form.homoclave, telefono: form.telefono },
        });
        setCredenciales({ titulo: 'Padre/tutor registrado', ...r, usuarioTexto: r.usuario.usuario });
      } else {
        const r = await apiRequest('/usuarios', {
          method: 'POST',
          body: {
            nombre: form.nombre, correo: form.correo, contrasena: form.contrasena, rol: form.rol,
            ...(form.rol === 'docente' ? { tipo_docente: form.tipo_docente } : {}),
            ...(form.rol === 'estudiante' ? { matricula: form.matricula, anio: form.anio, grupo: form.grupo } : {}),
          },
        });
        notify(`Usuario creado. Su usuario de acceso es: ${r.usuario}`, 'success', 6000);
      }
      setFormulario(null);
      recargar();
    } catch (err) {
      setErrorForm(err.message);
    } finally {
      setOcupado(false);
    }
  };

  const confirmarEliminar = async () => {
    setOcupado(true);
    try {
      await apiRequest(`/usuarios/${eliminar.id_usuario}`, { method: 'DELETE' });
      notify('Usuario eliminado correctamente', 'success');
      setEliminar(null);
      recargar();
    } catch (err) {
      notify(err.message, 'error', 6000);
      setEliminar(null);
    } finally {
      setOcupado(false);
    }
  };

  const confirmarReactivar = async () => {
    setOcupado(true);
    try {
      const r = await apiRequest(`/usuarios/${reactivar.id_usuario}/reactivar`, { method: 'POST' });
      setCredenciales({ titulo: 'Cuenta reactivada', ...r, usuarioTexto: r.usuario });
      setReactivar(null);
      recargar();
    } catch (err) {
      notify(err.message, 'error');
      setReactivar(null);
    } finally {
      setOcupado(false);
    }
  };

  const abrirVincular = (padre) => { setVincular({ padre, estudiante_id: '' }); cargarEstudiantes(); };
  const confirmarVincular = async (e) => {
    e.preventDefault();
    setOcupado(true);
    try {
      const r = await apiRequest(`/padres/${vincular.padre.id_usuario}/estudiantes`, {
        method: 'POST', body: { estudiante_id: Number(vincular.estudiante_id) },
      });
      notify(r.mensaje, 'success', 5000);
      setVincular(null);
      recargar();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setOcupado(false);
    }
  };

  // Columnas según el rol filtrado
  const columnas = {
    '': ['ID', 'Usuario', 'Nombre', 'Correo', 'Rol', 'Estado', 'Acciones'],
    admin: ['ID', 'Usuario', 'Nombre', 'Correo', 'Estado', 'Acciones'],
    docente: ['ID', 'Usuario', 'Nombre', 'Correo', 'Tipo de docente', 'Estado', 'Acciones'],
    estudiante: ['ID', 'Usuario (matrícula)', 'Nombre', 'Correo', 'Grupo', 'Taller', 'Estado', 'Acciones'],
    padre: ['ID', 'Usuario', 'Nombre', 'Correo', 'Estudiantes a cargo', 'Homoclave', 'Estado', 'Acciones'],
  }[filtros.rol];

  const celdas = (u) => {
    const estado = <span className={`badge ${u.activo ? 'badge-ok' : 'badge-error'}`}>{u.activo ? 'Activo' : 'Inactivo'}</span>;
    const base = [u.id_usuario, u.usuario, u.nombre, u.correo];
    switch (filtros.rol) {
      case 'admin': return [...base, estado];
      case 'docente': return [...base, TIPO_DOCENTE[u.tipo_docente] || '-', estado];
      case 'estudiante': return [...base, u.anio ? etiquetaGrupo(u.anio, u.grupo) : '-', u.taller || <span className="sin-dato">Sin taller</span>, estado];
      case 'padre': return [...base, u.estudiantes_nombres || '-', u.homoclave || '-', estado];
      default: return [...base, ROLES[u.rol], estado];
    }
  };

  const f = formulario?.form;
  const editando = !!formulario?.editar;

  return (
    <Layout title="Gestión de Usuarios">
      <div className="page-head">
        <h2>Usuarios del sistema</h2>
        <button type="button" onClick={abrirNuevo}>+ Agregar usuario</button>
      </div>

      <div className="filtros">
        <label>Buscar
          <input type="text" placeholder="Nombre, usuario, correo…" value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} />
        </label>
        <label>Rol
          <select value={filtros.rol} onChange={(e) => setFiltros({ ...filtros, rol: e.target.value })}>
            <option value="">Todos</option>
            {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {(filtros.rol === '' || filtros.rol === 'estudiante') && (
          <>
            <label>Año
              <select value={filtros.anio} onChange={(e) => setFiltros({ ...filtros, anio: e.target.value })}>
                <option value="">Todos</option>
                {ANIOS.map((a) => <option key={a} value={a}>{a}°</option>)}
              </select>
            </label>
            <label>Grupo
              <select value={filtros.grupo} onChange={(e) => setFiltros({ ...filtros, grupo: e.target.value })}>
                <option value="">Todos</option>
                {SECCIONES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>Taller
              <input type="text" value={filtros.taller} onChange={(e) => setFiltros({ ...filtros, taller: e.target.value })} />
            </label>
          </>
        )}
        <button type="button" className="btn-secondary" onClick={() => setFiltros({ q: '', rol: '', anio: '', grupo: '', taller: '' })}>Limpiar</button>
      </div>

      <EstadoCarga cargando={cargando} error={error} onReintentar={recargar}>
        <p className="conteo">{filtrados.length} usuario(s)</p>
        <div className="tabla-scroll">
          <table>
            <thead><tr>{columnas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {filtrados.length === 0 && <tr><td colSpan={columnas.length} className="vacio">No hay usuarios con esos filtros.</td></tr>}
              {filtrados.map((u) => (
                <tr key={u.id_usuario}>
                  {celdas(u).map((c, i) => <td key={i}>{c}</td>)}
                  <td>
                    <div className="acciones">
                      <button type="button" className="btn-secondary btn-sm" onClick={() => abrirEditar(u)}>Editar</button>
                      <button type="button" className="btn-outline btn-sm" onClick={() => setReactivar(u)} title="Genera una contraseña temporal nueva">Nueva clave</button>
                      {u.rol === 'padre' && <button type="button" className="btn-outline btn-sm" onClick={() => abrirVincular(u)}>Vincular hijo</button>}
                      <button type="button" className="btn-danger btn-sm" onClick={() => setEliminar(u)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </EstadoCarga>

      {formulario && (
        <Modal titulo={editando ? 'Editar usuario' : 'Agregar usuario'} onClose={() => setFormulario(null)}>
          <form onSubmit={guardar} style={{ width: '100%' }}>
            {!editando && (
              <div className="form-group">
                <label>Rol</label>
                <select value={f.rol} onChange={(e) => setCampo('rol', e.target.value)}>
                  {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label>Nombre completo</label>
              <input value={f.nombre} onChange={(e) => setCampo('nombre', e.target.value)} required maxLength={100} />
            </div>
            <div className="form-group">
              <label>Correo electrónico</label>
              <input type="email" value={f.correo} onChange={(e) => setCampo('correo', e.target.value)} required maxLength={100} />
            </div>

            {!editando && f.rol !== 'padre' && (
              <div className="form-group">
                <label>Contraseña inicial (mínimo 8 caracteres)</label>
                <input type="password" value={f.contrasena} onChange={(e) => setCampo('contrasena', e.target.value)} required minLength={8} autoComplete="new-password" />
              </div>
            )}

            {f.rol === 'docente' && (
              <div className="form-group">
                <label>Tipo de docente</label>
                <select value={f.tipo_docente} onChange={(e) => setCampo('tipo_docente', e.target.value)}>
                  {Object.entries(TIPO_DOCENTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {!editando && <p className="ayuda">El usuario se genera solo (BA000001, BB000001…).</p>}
              </div>
            )}

            {f.rol === 'estudiante' && (
              <>
                {!editando && (
                  <div className="form-group">
                    <label>Matrícula (será su usuario)</label>
                    <input value={f.matricula} onChange={(e) => setCampo('matricula', e.target.value.toUpperCase())}
                      placeholder="C1234567890123" pattern="C[0-9]{13}" title="C seguida de 13 dígitos" required maxLength={14} />
                    <p className="ayuda">Formato: C seguida de 13 dígitos.</p>
                  </div>
                )}
                <div className="form-grid">
                  <div className="form-group">
                    <label>Año</label>
                    <select value={f.anio} onChange={(e) => setCampo('anio', e.target.value)}>
                      {ANIOS.map((a) => <option key={a} value={a}>{a}°</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Grupo</label>
                    <select value={f.grupo} onChange={(e) => setCampo('grupo', e.target.value)}>
                      {SECCIONES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}

            {f.rol === 'padre' && !editando && (
              <>
                <div className="form-group">
                  <label>Estudiante a tutorar</label>
                  <select value={f.estudiante_id} onChange={(e) => setCampo('estudiante_id', e.target.value)} required>
                    <option value="">Seleccione…</option>
                    {estudiantes.map((s) => <option key={s.id_usuario} value={s.id_usuario}>{s.nombre} — {s.matricula} ({etiquetaGrupo(s.anio, s.seccion)})</option>)}
                  </select>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Homoclave</label>
                    <input value={f.homoclave} onChange={(e) => setCampo('homoclave', e.target.value.toUpperCase())} placeholder="1AB" maxLength={3} required />
                  </div>
                  <div className="form-group">
                    <label>Teléfono (opcional)</label>
                    <input value={f.telefono} onChange={(e) => setCampo('telefono', e.target.value)} maxLength={20} />
                  </div>
                </div>
                <p className="ayuda">Su usuario será matrícula + homoclave. Se genera una contraseña temporal (vence en 3 días).</p>
              </>
            )}

            {editando && (
              <div className="form-group">
                <label><input type="checkbox" checked={f.activo} onChange={(e) => setCampo('activo', e.target.checked)} /> Cuenta activa</label>
              </div>
            )}

            {errorForm && <div className="aviso aviso-error">{errorForm}</div>}
            <div className="modal-acciones">
              <button type="submit" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
              <button type="button" className="btn-secondary" onClick={() => setFormulario(null)}>Cancelar</button>
            </div>
          </form>
        </Modal>
      )}

      {eliminar && (
        <ConfirmModal titulo="Eliminar usuario" peligro ocupado={ocupado} textoConfirmar="Eliminar"
          mensaje={`¿Seguro que deseas eliminar a ${eliminar.nombre}? Esta acción no se puede deshacer.`}
          onConfirm={confirmarEliminar} onClose={() => setEliminar(null)} />
      )}

      {reactivar && (
        <ConfirmModal titulo="Generar contraseña temporal" ocupado={ocupado} textoConfirmar="Generar"
          mensaje={`Se creará una nueva contraseña temporal para ${reactivar.nombre} (vence en 3 días) y la actual dejará de funcionar.`}
          onConfirm={confirmarReactivar} onClose={() => setReactivar(null)} />
      )}

      {vincular && (
        <Modal titulo={`Vincular hijo a ${vincular.padre.nombre}`} onClose={() => setVincular(null)}>
          <form onSubmit={confirmarVincular} style={{ width: '100%' }}>
            <div className="form-group">
              <label>Estudiante</label>
              <select value={vincular.estudiante_id} onChange={(e) => setVincular({ ...vincular, estudiante_id: e.target.value })} required>
                <option value="">Seleccione…</option>
                {estudiantes.map((s) => <option key={s.id_usuario} value={s.id_usuario}>{s.nombre} — {s.matricula}</option>)}
              </select>
            </div>
            <div className="modal-acciones">
              <button type="submit" disabled={ocupado}>Vincular</button>
              <button type="button" className="btn-secondary" onClick={() => setVincular(null)}>Cancelar</button>
            </div>
          </form>
        </Modal>
      )}

      {credenciales && (
        <Modal titulo={credenciales.titulo} onClose={() => setCredenciales(null)}>
          <div className="credencial">Usuario: <strong>{credenciales.usuarioTexto}</strong></div>
          {credenciales.password_temporal ? (
            <>
              <div className="credencial">Contraseña temporal: <strong>{credenciales.password_temporal}</strong></div>
              <div className="aviso aviso-warn">
                No se pudo enviar el correo (SMTP no configurado). Entregue estas credenciales al usuario; la contraseña se muestra solo ahora.
              </div>
            </>
          ) : (
            <div className="aviso aviso-ok">✔ Las credenciales fueron enviadas al correo registrado.
              {credenciales.preview_url && <a href={credenciales.preview_url} target="_blank" rel="noreferrer">Ver correo</a>}
            </div>
          )}
          {credenciales.expira && <p className="ayuda">Vence el {new Date(credenciales.expira).toLocaleString('es-PE')}</p>}
          <div className="modal-acciones"><button type="button" onClick={() => setCredenciales(null)}>Entendido</button></div>
        </Modal>
      )}
    </Layout>
  );
}
