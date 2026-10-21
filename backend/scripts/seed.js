// Datos de demostración: 6 grupos, 18 materias, 7 docentes, 12 alumnos, 2 padres,
// horarios sin choques, calificaciones, asistencias, incidencias y talleres.
const bcrypt = require('bcryptjs');

const CLAVES = { admin: 'Admin123*', docente: 'Docente123*', estudiante: 'Alumno123*', padre: 'Padre123*' };

const MATERIAS = [
  ['Español', 'Matemáticas', 'Geografía', 'Artes', 'Inglés', 'Biología'],
  ['Español', 'Matemáticas', 'Historia Universal', 'Artes', 'Inglés', 'Física'],
  ['Español', 'Matemáticas', 'Historia del Perú', 'Artes', 'Inglés', 'Química'],
];
const DOCENTES = [
  'Rosa Mendoza Valdivia', 'Jorge Salas Huillca', 'Elena Quispe Ccahuana',
  'Pedro Aguilar Soto', 'Patricia Navarro Luna', 'Ricardo Ccoa Ramos',
];
const ALUMNOS = [
  'Ana López Quispe', 'Luis Pérez Huamán', 'María Ruiz Condori', 'Carlos Díaz Mamani',
  'Sofía Torres Álvarez', 'Juan Gómez Ccori', 'Lucía Vargas Ramos', 'Diego Flores Choque',
  'Valeria Castro Ñahui', 'Mateo Rojas Sulca', 'Camila Herrera Paredes', 'Sebastián Ayala Cruz',
];
const TALLERES = [
  ['Programación', 'Introducción a la programación y pensamiento lógico'],
  ['Electricidad', 'Instalaciones eléctricas básicas y seguridad'],
  ['Dibujo Técnico', 'Planos, escalas y vistas'],
  ['Cocina', 'Preparación de alimentos e higiene'],
  ['Textiles', 'Confección y diseño de prendas'],
  ['Carpintería', 'Trabajo en madera y uso de herramientas'],
];
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const PERIODOS = [['07:00', '07:50'], ['07:50', '08:40'], ['08:40', '09:30'], ['09:30', '10:20'], ['10:20', '11:10'], ['11:10', '12:00']];

function ultimosDiasHabiles(n) {
  const out = [];
  const d = new Date();
  while (out.length < n) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      const p = (x) => String(x).padStart(2, '0');
      out.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
    }
    d.setDate(d.getDate() - 1);
  }
  return out.reverse();
}

async function sembrar(c) {
  const h = (p) => bcrypt.hashSync(p, 10);
  const usuario = async (usr, nombre, correo, rol, clave, tipo = null) =>
    (await c.query(
      'INSERT INTO usuario (usuario, nombre, correo, contrasena, rol, tipo_docente) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_usuario',
      [usr, nombre, correo, h(clave), rol, tipo]
    )).rows[0].id_usuario;

  await c.query('BEGIN');
  try {
    // Administradores
    await usuario('A01', 'Administrador General', 'admin1@correo.com', 'admin', CLAVES.admin);
    await usuario('A02', 'Administrador Académico', 'admin2@correo.com', 'admin', CLAVES.admin);

    // Grupos y materias
    const grupos = [];
    for (let anio = 1; anio <= 3; anio++) {
      for (const seccion of ['A', 'B']) {
        grupos.push({ id: (await c.query('INSERT INTO grupo (anio, seccion) VALUES ($1,$2) RETURNING id_grupo', [anio, seccion])).rows[0].id_grupo, anio });
      }
    }
    const materias = []; // materias[anio-1][s] = id
    for (let a = 0; a < 3; a++) {
      materias.push([]);
      for (const nombre of MATERIAS[a]) {
        materias[a].push((await c.query('INSERT INTO materia (nombre, anio) VALUES ($1,$2) RETURNING id_materia', [nombre, a + 1])).rows[0].id_materia);
      }
    }

    // Docentes (6 frente a grupo, uno por área + 1 administrativo)
    const docentes = [];
    for (let i = 0; i < DOCENTES.length; i++) {
      docentes.push(await usuario(`BA${String(i + 1).padStart(6, '0')}`, DOCENTES[i], `docente${i + 1}@correo.com`, 'docente', CLAVES.docente, 'BA'));
    }
    await usuario('BB000001', 'Marta Gutiérrez Olarte', 'docente7@correo.com', 'docente', CLAVES.docente, 'BB');

    // Asignaciones y horarios (cuadrado latino: sin choques de grupo ni docente)
    grupos.forEach((g, gi) => { for (let s = 0; s < 6; s++) { g.dm = g.dm || []; g.dm.push(s); } });
    for (const g of grupos) {
      for (let s = 0; s < 6; s++) {
        await c.query('INSERT INTO docente_materia (docente_id, materia_id, grupo_id) VALUES ($1,$2,$3)', [docentes[s], materias[g.anio - 1][s], g.id]);
      }
    }
    for (let gi = 0; gi < grupos.length; gi++) {
      const g = grupos[gi];
      for (let d = 0; d < DIAS.length; d++) {
        for (let p = 0; p < PERIODOS.length; p++) {
          const s = (p + d + gi) % 6;
          await c.query(
            'INSERT INTO horario (grupo_id, materia_id, docente_id, dia, hora_inicio, hora_fin) VALUES ($1,$2,$3,$4,$5,$6)',
            [g.id, materias[g.anio - 1][s], docentes[s], DIAS[d], PERIODOS[p][0], PERIODOS[p][1]]
          );
        }
      }
    }

    // Talleres
    const talleres = [];
    for (const [n, d] of TALLERES) {
      talleres.push((await c.query('INSERT INTO taller (nombre, descripcion, cupo) VALUES ($1,$2,30) RETURNING id_taller', [n, d])).rows[0].id_taller);
    }

    // Alumnos (2 por grupo)
    const alumnos = [];
    for (let i = 0; i < ALUMNOS.length; i++) {
      const matricula = `C${2026000000000 + i + 1}`;
      const g = grupos[Math.floor(i / 2)];
      const id = await usuario(matricula, ALUMNOS[i], `alumno${i + 1}@correo.com`, 'estudiante', CLAVES.estudiante);
      const conTaller = i < 6;
      await c.query(
        'INSERT INTO estudiante (id_usuario, matricula, grupo_id, taller_id, taller_inscrito_en) VALUES ($1,$2,$3,$4,$5)',
        [id, matricula, g.id, conTaller ? talleres[i % 6] : null, conTaller ? new Date() : null]
      );
      alumnos.push({ id, matricula, anio: g.anio, idx: i + 1 });
    }

    // Padres (el primero con dos hijos para probar el selector)
    const padres = [
      { nombre: 'Pedro López Rojas', correo: 'padre1@correo.com', homoclave: '1AB', hijos: [0, 1] },
      { nombre: 'Marta Pérez Soto', correo: 'padre2@correo.com', homoclave: 'AB2', hijos: [2] },
    ];
    for (const p of padres) {
      const id = await usuario(`${alumnos[p.hijos[0]].matricula}${p.homoclave}`, p.nombre, p.correo, 'padre', CLAVES.padre);
      await c.query('INSERT INTO padre (id_usuario, homoclave, telefono) VALUES ($1,$2,$3)', [id, p.homoclave, '999111222']);
      for (const hi of p.hijos) await c.query('INSERT INTO padre_estudiante (id_padre, id_estudiante) VALUES ($1,$2)', [id, alumnos[hi].id]);
    }

    // Calificaciones (se dejan algunas materias sin nota para probar el registro)
    for (const a of alumnos) {
      for (let s = 0; s < 6; s++) {
        if ((a.idx + s) % 5 === 0) continue;
        const nota = 6 + ((a.idx * 5 + s * 3) % 9) * 0.5;
        await c.query('INSERT INTO calificacion (estudiante_id, materia_id, calificacion, registrado_por) VALUES ($1,$2,$3,$4)',
          [a.id, materias[a.anio - 1][s], nota, docentes[s]]);
      }
    }

    // Asistencias de los últimos 5 días hábiles
    const dias = ultimosDiasHabiles(5);
    for (const a of alumnos) {
      for (let k = 0; k < dias.length; k++) {
        const presente = (a.idx * 3 + k) % 7 !== 0;
        await c.query(
          'INSERT INTO asistencia (usuario_id, fecha, presente, justificacion, registrado_por) VALUES ($1,$2,$3,$4,$5)',
          [a.id, dias[k], presente, !presente && a.idx % 2 === 0 ? 'Cita médica presentada por el padre' : null, docentes[0]]
        );
      }
    }

    // Incidencias
    const hoyStr = dias[dias.length - 1];
    const inc = [
      [alumnos[1], 'uniforme modificado', 'Asistió con una prenda que no corresponde al uniforme.', 'llamado', materias[0][0], null, docentes[0]],
      [alumnos[3], 'bullying', 'Reporte de burlas reiteradas hacia un compañero.', 'suspension', materias[0][1], null, docentes[1]],
      [alumnos[4], 'maltrato al inmobiliario', 'Rayó una carpeta del aula.', null, null, talleres[0], docentes[0]],
      [alumnos[7], 'uniforme modificado', 'Calzado no reglamentario.', 'llamado', materias[1][3], null, docentes[3]],
    ];
    for (const [a, tipo, desc, sancion, mat, tal, por] of inc) {
      await c.query(
        'INSERT INTO incidencia (usuario_id, fecha, descripcion, tipo, sancion, materia_id, taller_id, registrado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [a.id, hoyStr, desc, tipo, sancion, mat, tal, por]
      );
    }

    await c.query("UPDATE config_sistema SET valor = 'true' WHERE clave = 'calificaciones_habilitadas'");
    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK');
    throw err;
  }
}

module.exports = { sembrar, CLAVES };
