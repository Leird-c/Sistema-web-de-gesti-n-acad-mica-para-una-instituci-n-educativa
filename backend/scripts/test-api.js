// Pruebas de integración de la API. Requiere la BD con datos de demo (npm run db:reset).
// Uso: npm run test:api
process.env.NODE_ENV = 'development';
const app = require('../src/index');
const { pool } = require('../src/config/db');
const { CLAVES } = require('./seed');

let base;
let ok = 0;
const fallos = [];

async function api(metodo, ruta, token, cuerpo) {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
function chequear(nombre, condicion, detalle = '') {
  if (condicion) { ok++; console.log(`  ✔ ${nombre}`); }
  else { fallos.push(nombre); console.log(`  ✖ ${nombre} ${detalle}`); }
}
const estado = (nombre, r, esperado) => chequear(nombre, r.status === esperado, `(esperado ${esperado}, obtuvo ${r.status}: ${JSON.stringify(r.data).slice(0, 160)})`);
const login = async (usuario, contrasena, rol) => (await api('POST', '/api/usuarios/login', null, { login: usuario, contrasena, rol })).data.token;

async function main() {
  const server = app.listen(0);
  base = `http://localhost:${server.address().port}`;
  const sufijo = Date.now().toString().slice(-6);

  console.log('\nAutenticación');
  estado('health', await api('GET', '/api/health'), 200);
  const admin = await login('A01', CLAVES.admin, 'admin');
  const docente = await login('BA000001', CLAVES.docente, 'docente');
  const alumno = await login('alumno1@correo.com', CLAVES.estudiante, 'estudiante');
  const padre = await login('C20260000000011AB', CLAVES.padre, 'padre');
  chequear('login de los 4 roles', admin && docente && alumno && padre);
  estado('contraseña incorrecta → 401', await api('POST', '/api/usuarios/login', null, { login: 'A01', contrasena: 'mala', rol: 'admin' }), 401);
  estado('rol equivocado → 401', await api('POST', '/api/usuarios/login', null, { login: 'A01', contrasena: CLAVES.admin, rol: 'docente' }), 401);
  estado('sin token → 401', await api('GET', '/api/calificaciones/docente'), 401);

  console.log('\nPermisos por rol');
  estado('alumno no lista usuarios', await api('GET', '/api/usuarios', alumno), 403);
  estado('docente no crea usuarios', await api('POST', '/api/usuarios', docente, {}), 403);
  const hijos = (await api('POST', '/api/usuarios/login', null, { login: 'C20260000000011AB', contrasena: CLAVES.padre })).data.estudiantes;
  chequear('padre 1 tiene 2 hijos', hijos.length === 2);
  estado('padre ve notas de su hijo', await api('GET', `/api/calificaciones/estudiante/${hijos[0].id_usuario}`, padre), 200);
  const todos = (await api('GET', '/api/estudiantes', admin)).data;
  const ajeno = todos.find((e) => !hijos.some((h) => h.id_usuario === e.id_usuario));
  estado('padre NO ve notas de otro alumno', await api('GET', `/api/calificaciones/estudiante/${ajeno.id_usuario}`, padre), 403);
  estado('alumno NO ve incidencias ajenas', await api('GET', `/api/incidencias/usuario/${ajeno.id_usuario}`, alumno), 403);
  const yo = todos.find((e) => e.matricula === 'C2026000000001');
  estado('alumno ve sus asistencias', await api('GET', `/api/asistencias/usuario/${yo.id_usuario}`, alumno), 200);

  console.log('\nAlta de usuarios y contraseña temporal');
  const matricula = `C${2027000000000 + Number(sufijo)}`;
  estado('admin crea estudiante', await api('POST', '/api/usuarios', admin, { nombre: 'Alumno Prueba', correo: `al${sufijo}@correo.com`, contrasena: 'Prueba1234', rol: 'estudiante', matricula, anio: '1', grupo: 'A' }), 201);
  estado('matrícula inválida → 400', await api('POST', '/api/usuarios', admin, { nombre: 'X', correo: `x${sufijo}@correo.com`, contrasena: 'Prueba1234', rol: 'estudiante', matricula: 'C123', anio: '1', grupo: 'A' }), 400);
  estado('correo duplicado → 409', await api('POST', '/api/usuarios', admin, { nombre: 'Y', correo: `al${sufijo}@correo.com`, contrasena: 'Prueba1234', rol: 'admin' }), 409);
  const nuevoDoc = await api('POST', '/api/usuarios', admin, { nombre: 'Docente Prueba', correo: `doc${sufijo}@correo.com`, contrasena: 'Prueba1234', rol: 'docente', tipo_docente: 'BA' });
  estado('admin crea docente', nuevoDoc, 201);
  chequear('usuario docente autogenerado (BA######)', /^BA\d{6}$/.test(nuevoDoc.data.usuario), nuevoDoc.data.usuario);
  const est = (await api('GET', '/api/estudiantes', admin)).data.find((e) => e.matricula === matricula);
  const pr = await api('POST', '/api/padres/completo', admin, { nombre: 'Padre Prueba', correo: `pa${sufijo}@correo.com`, estudiante_id: est.id_usuario, homoclave: '2CD' });
  estado('admin registra padre', pr, 201);
  chequear('usuario padre = matrícula + homoclave', pr.data.usuario.usuario === `${matricula}2CD`);
  const temp = pr.data.password_temporal;
  chequear('sin SMTP se entrega la contraseña temporal', /^[A-Z]{4}\d{4}$/.test(temp));
  const l1 = await api('POST', '/api/usuarios/login', null, { login: `${matricula}2CD`, contrasena: temp, rol: 'padre' });
  chequear('login temporal exige cambio', l1.data.passwordChangeRequired === true);
  estado('token temporal no accede a otros recursos', await api('GET', '/api/calificaciones/estado', l1.data.token), 403);
  estado('contraseña nueva muy corta → 400', await api('POST', '/api/usuarios/cambiar-password-temporal', l1.data.token, { nuevaContrasena: '123' }), 400);
  estado('cambia la contraseña temporal', await api('POST', '/api/usuarios/cambiar-password-temporal', l1.data.token, { nuevaContrasena: 'NuevaClave9' }), 200);
  estado('login con la nueva contraseña', await api('POST', '/api/usuarios/login', null, { login: `${matricula}2CD`, contrasena: 'NuevaClave9', rol: 'padre' }), 200);
  // vencer la contraseña temporal y reactivar
  const idPadre = pr.data.usuario.id_usuario;
  await pool.query("UPDATE usuario SET password_change_required = TRUE, temp_password_expires = NOW() - INTERVAL '1 hour' WHERE id_usuario = $1", [idPadre]);
  const exp = await api('POST', '/api/usuarios/login', null, { login: `${matricula}2CD`, contrasena: 'NuevaClave9' });
  chequear('contraseña temporal vencida → expired', exp.status === 401 && exp.data.expired === true);
  const re = await api('POST', `/api/usuarios/${idPadre}/reactivar`, admin);
  estado('admin reactiva la cuenta', re, 200);
  estado('login con la nueva temporal', await api('POST', '/api/usuarios/login', null, { login: `${matricula}2CD`, contrasena: re.data.password_temporal }), 200);
  estado('vincular segundo hijo', await api('POST', `/api/padres/${idPadre}/estudiantes`, admin, { estudiante_id: yo.id_usuario }), 201);
  estado('vínculo duplicado → 409', await api('POST', `/api/padres/${idPadre}/estudiantes`, admin, { estudiante_id: yo.id_usuario }), 409);
  estado('cambiar su propia contraseña', await api('PUT', '/api/usuarios/cambiar-contrasena', alumno, { contrasenaActual: CLAVES.estudiante, nuevaContrasena: CLAVES.estudiante }), 200);

  console.log('\nCalificaciones');
  const filas = (await api('GET', '/api/calificaciones/docente', docente)).data;
  chequear('docente ve filas de sus materias (Español)', filas.length > 0 && filas.every((f) => f.materia_nombre === 'Español'));
  const sinNota = filas.find((f) => f.id === null);
  chequear('hay alumnos sin nota para registrar', !!sinNota);
  estado('nota fuera de rango → 400', await api('POST', '/api/calificaciones', docente, { estudiante_id: sinNota.estudiante_id, materia_id: sinNota.materia_id, calificacion: 11 }), 400);
  const nueva = await api('POST', '/api/calificaciones', docente, { estudiante_id: sinNota.estudiante_id, materia_id: sinNota.materia_id, calificacion: 8.5 });
  estado('docente registra nota', nueva, 201);
  estado('nota duplicada → 409', await api('POST', '/api/calificaciones', docente, { estudiante_id: sinNota.estudiante_id, materia_id: sinNota.materia_id, calificacion: 9 }), 409);
  estado('docente edita su nota', await api('PUT', `/api/calificaciones/${nueva.data.id}`, docente, { calificacion: 9, fecha: '2026-10-01' }), 200);
  const mate = (await api('GET', `/api/calificaciones/estudiante/${sinNota.estudiante_id}`, admin)).data.find((f) => f.materia_nombre === 'Matemáticas');
  estado('docente NO califica materia ajena → 403', await api('POST', '/api/calificaciones', docente, { estudiante_id: mate.estudiante_id, materia_id: mate.materia_id, calificacion: 7 }), 403);
  estado('admin deshabilita el sistema', await api('POST', '/api/calificaciones/habilitar', admin, { habilitado: false }), 200);
  estado('docente bloqueado con sistema deshabilitado', await api('PUT', `/api/calificaciones/${nueva.data.id}`, docente, { calificacion: 8 }), 403);
  estado('admin sí puede', await api('PUT', `/api/calificaciones/${nueva.data.id}`, admin, { calificacion: 8 }), 200);
  await api('POST', '/api/calificaciones/habilitar', admin, { habilitado: true });
  estado('docente elimina su nota', await api('DELETE', `/api/calificaciones/${nueva.data.id}`, docente), 200);

  console.log('\nAsistencias');
  const grupos = (await api('GET', '/api/grupos', docente)).data;
  chequear('docente ve sus 6 grupos', grupos.length === 6);
  const hoy = new Date().toISOString().slice(0, 10);
  const lista = (await api('GET', `/api/asistencias/grupo/${grupos[0].id_grupo}/fecha/${hoy}`, docente)).data;
  estado('lista de alumnos del grupo', { status: lista.length ? 200 : 500, data: {} }, 200);
  const lote = await api('POST', '/api/asistencias/lote', docente, { grupo_id: grupos[0].id_grupo, fecha: hoy, registros: lista.map((a, i) => ({ usuario_id: a.usuario_id, presente: i !== 0 })) });
  estado('docente toma asistencia (lote)', lote, 201);
  const otroGrupo = lista.length && (await api('GET', `/api/asistencias/grupo/${grupos[1].id_grupo}/fecha/${hoy}`, docente)).data;
  estado('alumno de otro grupo en el lote → 400', await api('POST', '/api/asistencias/lote', docente, { grupo_id: grupos[0].id_grupo, fecha: hoy, registros: [{ usuario_id: otroGrupo[0].usuario_id, presente: true }] }), 400);
  estado('fecha futura → 400', await api('POST', '/api/asistencias/lote', docente, { grupo_id: grupos[0].id_grupo, fecha: '2999-01-01', registros: [{ usuario_id: lista[0].usuario_id, presente: true }] }), 400);
  const falta = (await api('GET', `/api/asistencias/docente?fecha=${hoy}&grupo_id=${grupos[0].id_grupo}`, docente)).data.find((a) => a.estado === 'FALTA');
  chequear('queda registrada la falta', !!falta);
  estado('docente justifica la falta', await api('PUT', `/api/asistencias/${falta.id}/justificar`, docente, { justificacion: 'Enfermedad' }), 200);
  const presente = (await api('GET', `/api/asistencias/docente?fecha=${hoy}`, docente)).data.find((a) => a.estado === 'ASISTENCIA');
  estado('no se justifica una asistencia → 409', await api('PUT', `/api/asistencias/${presente.id}/justificar`, docente, { justificacion: 'x' }), 409);

  console.log('\nIncidencias');
  const materias = (await api('GET', '/api/materias', admin)).data;
  const inc = await api('POST', '/api/incidencias', docente, { usuario_id: yo.id_usuario, tipo: 'bullying', descripcion: 'Prueba', materia_id: materias[0].id_materia, sancion: 'llamado' });
  estado('docente registra incidencia', inc, 201);
  estado('sin materia ni taller → 400', await api('POST', '/api/incidencias', docente, { usuario_id: yo.id_usuario, tipo: 'bullying', descripcion: 'Prueba' }), 400);
  estado('sanción inválida → 400', await api('POST', '/api/incidencias', docente, { usuario_id: yo.id_usuario, tipo: 'x', descripcion: 'p', materia_id: materias[0].id_materia, sancion: 'fusilamiento' }), 400);
  estado('docente edita la suya', await api('PUT', `/api/incidencias/${inc.data.id}`, docente, { tipo: 'bullying', descripcion: 'Editada', materia_id: materias[0].id_materia, sancion: 'suspension' }), 200);
  const ajena = (await api('GET', '/api/incidencias', admin)).data.find((i) => i.registrado_por !== inc.data.registrado_por);
  estado('docente NO edita incidencia ajena → 403', await api('PUT', `/api/incidencias/${ajena.id}`, docente, { tipo: 'x', descripcion: 'y', materia_id: materias[0].id_materia }), 403);
  chequear('alumno ve su incidencia', (await api('GET', `/api/incidencias/usuario/${yo.id_usuario}`, alumno)).data.some((i) => i.id === inc.data.id));
  estado('docente no elimina incidencias', await api('DELETE', `/api/incidencias/${inc.data.id}`, docente), 403);
  estado('admin elimina incidencia', await api('DELETE', `/api/incidencias/${inc.data.id}`, admin), 200);

  console.log('\nTalleres');
  const alumno7 = await login('alumno7@correo.com', CLAVES.estudiante, 'estudiante');
  const talleres = (await api('GET', '/api/talleres', alumno7)).data;
  chequear('alumno sin taller: mi-taller vacío', Object.keys((await api('GET', '/api/talleres/mi-taller', alumno7)).data).length === 0);
  estado('alumno se inscribe', await api('POST', `/api/talleres/${talleres[0].id}/inscribir`, alumno7), 200);
  estado('doble inscripción → 409', await api('POST', `/api/talleres/${talleres[1].id}/inscribir`, alumno7), 409);
  estado('alumno cambia de taller (≤7 días)', await api('POST', `/api/talleres/${talleres[1].id}/cambiar`, alumno7), 200);
  await pool.query("UPDATE estudiante SET taller_inscrito_en = NOW() - INTERVAL '10 days' WHERE id_usuario = (SELECT id_usuario FROM usuario WHERE usuario = 'C2026000000007')");
  estado('cambio fuera de plazo → 403', await api('POST', `/api/talleres/${talleres[2].id}/cambiar`, alumno7), 403);
  const nt = await api('POST', '/api/talleres', admin, { nombre: `Robótica ${sufijo}`, descripcion: 'Prueba', cupo: 1 });
  estado('admin crea taller', nt, 201);
  estado('cupo > 30 → 400', await api('POST', '/api/talleres', admin, { nombre: 'Z', cupo: 99 }), 400);
  const alumno8 = await login('alumno8@correo.com', CLAVES.estudiante, 'estudiante');
  const alumno9 = await login('alumno9@correo.com', CLAVES.estudiante, 'estudiante');
  estado('inscribe al taller con cupo 1', await api('POST', `/api/talleres/${nt.data.id}/inscribir`, alumno8), 200);
  estado('taller lleno → 409', await api('POST', `/api/talleres/${nt.data.id}/inscribir`, alumno9), 409);
  estado('no se elimina taller con alumnos → 409', await api('DELETE', `/api/talleres/${nt.data.id}`, admin), 409);
  estado('admin da de baja al alumno', await api('DELETE', `/api/talleres/${nt.data.id}/estudiante/${(await api('GET', '/api/estudiantes', admin)).data.find((e) => e.matricula === 'C2026000000008').id_usuario}`, admin), 200);
  estado('admin elimina el taller', await api('DELETE', `/api/talleres/${nt.data.id}`, admin), 200);
  estado('docente ve alumnos del taller', await api('GET', `/api/talleres/${talleres[0].id}/alumnos`, docente), 200);
  estado('alumno NO ve lista de alumnos', await api('GET', `/api/talleres/${talleres[0].id}/alumnos`, alumno), 403);

  console.log('\nHorarios y asignaciones');
  chequear('alumno ve su horario (30 clases)', (await api('GET', '/api/horarios/mio', alumno)).data.length === 30);
  chequear('docente ve su horario (30 clases)', (await api('GET', '/api/horarios/docente', docente)).data.length === 30);
  estado('padre ve horario del hijo', await api('GET', `/api/horarios/estudiante/${hijos[0].id_usuario}`, padre), 200);
  estado('alumno no lista todos los horarios', await api('GET', '/api/horarios', alumno), 403);
  const dm = (await api('GET', '/api/docente-materia', admin)).data;
  const hor = (await api('GET', '/api/horarios', admin)).data;
  const choque = hor[0];
  estado('horario con choque de grupo → 409', await api('POST', '/api/horarios', admin, { grupo_id: choque.grupo_id, materia_id: choque.materia_id, docente_id: choque.docente_id, dia: choque.dia, hora_inicio: choque.hora_inicio, hora_fin: choque.hora_fin }), 409);
  estado('horas invertidas → 400', await api('POST', '/api/horarios', admin, { grupo_id: choque.grupo_id, materia_id: choque.materia_id, docente_id: choque.docente_id, dia: 'Sábado', hora_inicio: '10:00', hora_fin: '09:00' }), 400);
  const libre = await api('POST', '/api/horarios', admin, { grupo_id: choque.grupo_id, materia_id: choque.materia_id, docente_id: choque.docente_id, dia: 'Sábado', hora_inicio: '08:00', hora_fin: '08:45' });
  estado('horario válido (sábado)', libre, 201);
  estado('elimina el horario', await api('DELETE', `/api/horarios/${libre.data.id}`, admin), 200);
  const docNuevo = nuevoDoc.data.id_usuario;
  const mats1 = materias.filter((m) => m.anio === 1);
  const g1 = (await api('GET', '/api/grupos', admin)).data.find((g) => g.anio === 1 && g.seccion === 'A');
  estado('materia ya asignada a otro docente → 409', await api('POST', '/api/docente-materia', admin, { docente_id: docNuevo, materia_id: mats1[0].id_materia, grupo_id: g1.id_grupo }), 409); // ya la tiene otro docente
  const g3 = (await api('GET', '/api/grupos', admin)).data.find((g) => g.anio === 3 && g.seccion === 'A');
  estado('materia de otro año → 400', await api('POST', '/api/docente-materia', admin, { docente_id: docNuevo, materia_id: mats1[0].id_materia, grupo_id: g3.id_grupo }), 400);
  chequear('hay asignaciones listadas', dm.length === 36);

  console.log('\nResumen y eliminación');
  chequear('resumen admin con 4 tarjetas', (await api('GET', '/api/dashboard/resumen', admin)).data.length === 4);
  const rs = (await api('GET', '/api/dashboard/resumen', padre)).data;
  chequear('resumen padre con 4 tarjetas', rs.length === 4);
  estado('no se elimina alumno con notas → 409', await api('DELETE', `/api/usuarios/${yo.id_usuario}`, admin), 409);
  estado('se elimina docente sin asignaciones', await api('DELETE', `/api/usuarios/${docNuevo}`, admin), 200);
  estado('se elimina padre (con vínculos)', await api('DELETE', `/api/usuarios/${idPadre}`, admin), 200);
  estado('alumno con asistencias no se elimina → 409', await api('DELETE', `/api/usuarios/${est.id_usuario}`, admin), 409);
  await pool.query('DELETE FROM asistencia WHERE usuario_id = $1', [est.id_usuario]);
  estado('se elimina alumno de prueba', await api('DELETE', `/api/usuarios/${est.id_usuario}`, admin), 200);
  estado('admin no se elimina a sí mismo', await api('DELETE', '/api/usuarios/1', admin), 409);

  server.close();
  await pool.end();
  console.log(`\n${ok} pruebas correctas, ${fallos.length} fallidas`);
  if (fallos.length) { console.log('Fallidas:\n - ' + fallos.join('\n - ')); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
