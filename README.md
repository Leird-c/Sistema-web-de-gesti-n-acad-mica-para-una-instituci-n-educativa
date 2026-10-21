# Sistema de Gestión Escolar

Plataforma web para una institución de educación secundaria con **cuatro perfiles**
(administrador, docente, estudiante y padre/tutor). Cada rol inicia sesión y ve únicamente
las herramientas que le corresponden.

- **Frontend:** React 18 + React Router 6 (modo claro/oscuro)
- **Backend:** Node.js + Express (API REST), autenticación JWT
- **Base de datos:** PostgreSQL

## Requisitos

- Node.js 18 o superior
- PostgreSQL 13 o superior en ejecución

## Puesta en marcha

```bash
# 1) Backend
cd backend
npm install
cp .env.example .env        # en Windows: copy .env.example .env
#   edita .env: DB_PASSWORD (tu clave de PostgreSQL) y JWT_SECRET
#   (genera uno con: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
npm run db:init             # crea la base, las tablas y datos de demostración
npm start                   # API en http://localhost:3001

# 2) Frontend (en otra terminal)
cd frontend
npm install
npm start                   # App en http://localhost:3000
```

`npm run db:reset` borra todo y vuelve a cargar los datos de demostración.

## Usuarios de demostración

| Rol | Usuario (o correo) | Contraseña |
|---|---|---|
| Administrador | `A01` / admin1@correo.com | `Admin123*` |
| Docente | `BA000001` / docente1@correo.com | `Docente123*` |
| Estudiante | `C2026000000001` / alumno1@correo.com | `Alumno123*` |
| Padre/Tutor (2 hijos) | `C20260000000011AB` / padre1@correo.com | `Padre123*` |

> Son solo para pruebas. En producción usa `node scripts/init-db.js --sin-datos`
> (crea únicamente el esquema y un administrador con contraseña temporal) y `NODE_ENV=production`.

## Qué puede hacer cada rol

| Módulo | Admin | Docente | Estudiante | Padre |
|---|:-:|:-:|:-:|:-:|
| Usuarios (altas, bajas, edición, nueva contraseña temporal, vincular hijos) | ✔ | | | |
| Calificaciones | todas; habilita/deshabilita el registro | registra/edita las de sus materias y grupos | las suyas | las de su hijo (selector) |
| Asistencia | historial, toma por grupo, justifica, elimina | toma por grupo y justifica (sus grupos) | la suya | la de su hijo |
| Horarios | ve y administra horarios y asignaciones docente-materia | el suyo | el de su grupo | el de su hijo |
| Talleres | crea, edita cupo, elimina, da de baja | ve alumnos inscritos | se inscribe y puede cambiar (7 días) | |
| Incidencias | todas; edita y elimina | registra y edita las suyas | las suyas | las de su hijo |
| Panel con estadísticas reales | ✔ | ✔ | ✔ | ✔ |

## Reglas de negocio

- **Usuarios:** admin `A01…`, docente `BA000001`/`BB000001` (se generan solos), estudiante = su matrícula
  (`C` + 13 dígitos), padre = matrícula del hijo + homoclave (ej. `C20260000000011AB`).
- **Padres:** se registran con una contraseña temporal (4 letras + 4 números) que **vence en 3 días**
  y deben cambiarla en el primer ingreso. Si el correo (SMTP) no está configurado, el sistema muestra
  la contraseña al administrador en pantalla (solo en desarrollo).
- **Grupos:** años 1° a 3°, secciones A y B, máximo 30 alumnos por grupo.
- **Calificaciones:** de 0 a 10, una por alumno y materia; la materia debe ser del año del alumno.
- **Docentes:** máximo 4 materias distintas; cada materia de un grupo tiene un solo docente;
  los horarios no pueden chocar (ni por grupo ni por docente).
- **Talleres:** cupo de 1 a 30; un alumno, un taller; cambio permitido durante los primeros 7 días
  (y hasta `FECHA_LIMITE_CAMBIO_TALLER` si se define).
- **Incidencias:** sanciones llamado / suspensión / expulsión; deben indicar materia o taller.

Las reglas están en `backend/src/config/config.js`.

## Correo (opcional)

Define en `backend/.env` `EMAIL_SERVICE=gmail`, `EMAIL_USER` y `EMAIL_PASSWORD` (contraseña de aplicación),
o bien `EMAIL_HOST`/`EMAIL_PORT`. Sin esto la app funciona igual, pero no envía correos.

## Pruebas

```bash
cd backend
npm run db:reset && npm run test:api   # 91 pruebas de la API (permisos por rol, reglas, flujos)
```

Estas pruebas modifican datos de demostración: ejecuta `npm run db:reset` después.

## Estructura

```
backend/
  database/schema.sql          esquema completo de PostgreSQL
  scripts/                     init-db.js, seed.js (datos demo), test-api.js
  src/
    config/                    configuración y conexión
    middlewares/               auth (JWT), checkRole, errorHandler
    routes/                    usuarios, padres, estudiantes, grupos, materias, docente-materia,
                               horarios, calificaciones, asistencias, incidencias, talleres, dashboard
    services/emailService.js   envío de credenciales
    utils/                     validaciones y reglas de acceso por rol
frontend/
  src/components/              Bienvenida, Login, Dashboard, Layout y una pantalla por módulo
  src/                         api.js, contextos (sesión, tema, notificaciones), constants.js
```

## Seguridad

Contraseñas con bcrypt; JWT de 8 h (la sesión se cierra sola al vencer); la cuenta se revalida en cada
petición (una cuenta desactivada pierde el acceso al instante); límite de intentos de login;
permisos verificados en el servidor para cada dato (un padre solo ve a sus hijos, un docente solo
sus grupos); consultas SQL parametrizadas; cabeceras de seguridad con Helmet.
No subas `backend/.env` a un repositorio público.
