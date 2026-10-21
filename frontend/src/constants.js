// Constantes compartidas por las pantallas (alineadas con las reglas del backend).
export const ROLES = {
  admin: 'Administrador',
  docente: 'Docente',
  estudiante: 'Estudiante',
  padre: 'Padre/Tutor',
};

export const ANIOS = [1, 2, 3];
export const SECCIONES = ['A', 'B'];
export const NOTA_MAX = 10;
export const NOTA_APROBATORIA = 6;
export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export const TIPOS_INCIDENCIA = [
  'maltrato al inmobiliario',
  'bullying',
  'posesión de armas blancas',
  'uniforme modificado',
  'exhibicionismo',
  'otro',
];

export const SANCIONES = [
  { valor: '', texto: 'Sin sanción asignada' },
  { valor: 'llamado', texto: 'Llamado de atención' },
  { valor: 'suspension', texto: 'Suspensión' },
  { valor: 'expulsion', texto: 'Expulsión' },
];
export const NOMBRE_SANCION = { llamado: 'Llamado de atención', suspension: 'Suspensión', expulsion: 'Expulsión' };

export const TIPO_DOCENTE = { BA: 'Frente a grupo (BA)', BB: 'Administrativo (BB)' };

// Fecha local AAAA-MM-DD
export function hoyISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const etiquetaGrupo = (anio, seccion) => `${anio}° ${seccion}`;
