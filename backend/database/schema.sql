-- =====================================================================
--  Sistema de Gestión Escolar - Esquema PostgreSQL
-- =====================================================================

CREATE TABLE IF NOT EXISTS usuario (
  id_usuario               SERIAL PRIMARY KEY,
  usuario                  VARCHAR(30)  NOT NULL,
  nombre                   VARCHAR(100) NOT NULL,
  correo                   VARCHAR(100) NOT NULL,
  contrasena               VARCHAR(100) NOT NULL,                -- hash bcrypt
  rol                      VARCHAR(20)  NOT NULL CHECK (rol IN ('admin','docente','estudiante','padre')),
  tipo_docente             VARCHAR(2)   CHECK (tipo_docente IN ('BA','BB')),
  activo                   BOOLEAN      NOT NULL DEFAULT TRUE,
  password_change_required BOOLEAN      NOT NULL DEFAULT FALSE,
  temp_password_expires    TIMESTAMPTZ,
  first_login              BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT usuario_usuario_key UNIQUE (usuario)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuario_correo ON usuario (LOWER(correo));

CREATE TABLE IF NOT EXISTS grupo (
  id_grupo SERIAL PRIMARY KEY,
  anio     INTEGER     NOT NULL CHECK (anio BETWEEN 1 AND 3),
  seccion  VARCHAR(2)  NOT NULL,
  turno    VARCHAR(20) NOT NULL DEFAULT 'Matutino',
  CONSTRAINT grupo_anio_seccion_key UNIQUE (anio, seccion)
);

CREATE TABLE IF NOT EXISTS materia (
  id_materia SERIAL PRIMARY KEY,
  nombre     VARCHAR(100) NOT NULL,
  anio       INTEGER      NOT NULL CHECK (anio BETWEEN 1 AND 3),
  CONSTRAINT materia_nombre_anio_key UNIQUE (nombre, anio)
);

CREATE TABLE IF NOT EXISTS taller (
  id_taller   SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  descripcion TEXT,
  cupo        INTEGER NOT NULL CHECK (cupo BETWEEN 1 AND 30),
  CONSTRAINT taller_nombre_key UNIQUE (nombre)
);

CREATE TABLE IF NOT EXISTS estudiante (
  id_usuario         INTEGER PRIMARY KEY REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  matricula          VARCHAR(14) NOT NULL CHECK (matricula ~ '^C[0-9]{13}$'),
  grupo_id           INTEGER NOT NULL REFERENCES grupo(id_grupo),
  taller_id          INTEGER REFERENCES taller(id_taller) ON DELETE SET NULL,
  taller_inscrito_en TIMESTAMPTZ,
  CONSTRAINT estudiante_matricula_key UNIQUE (matricula)
);

CREATE TABLE IF NOT EXISTS padre (
  id_usuario INTEGER PRIMARY KEY REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  homoclave  VARCHAR(3),
  telefono   VARCHAR(20),
  direccion  VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS padre_estudiante (
  id_padre      INTEGER NOT NULL REFERENCES padre(id_usuario) ON DELETE CASCADE,
  id_estudiante INTEGER NOT NULL REFERENCES estudiante(id_usuario) ON DELETE CASCADE,
  PRIMARY KEY (id_padre, id_estudiante)
);

CREATE TABLE IF NOT EXISTS docente_materia (
  id         SERIAL PRIMARY KEY,
  docente_id INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  materia_id INTEGER NOT NULL REFERENCES materia(id_materia),
  grupo_id   INTEGER NOT NULL REFERENCES grupo(id_grupo),
  CONSTRAINT docente_materia_docente_materia_grupo_key UNIQUE (docente_id, materia_id, grupo_id),
  CONSTRAINT docente_materia_materia_grupo_key UNIQUE (materia_id, grupo_id)
);

CREATE TABLE IF NOT EXISTS horario (
  id_horario  SERIAL PRIMARY KEY,
  grupo_id    INTEGER NOT NULL,
  materia_id  INTEGER NOT NULL,
  docente_id  INTEGER NOT NULL,
  dia         VARCHAR(10) NOT NULL CHECK (dia IN ('Lunes','Martes','Miércoles','Jueves','Viernes','Sábado')),
  hora_inicio TIME NOT NULL,
  hora_fin    TIME NOT NULL,
  CHECK (hora_fin > hora_inicio),
  -- el horario solo puede usar asignaciones docente-materia-grupo existentes
  FOREIGN KEY (docente_id, materia_id, grupo_id)
    REFERENCES docente_materia (docente_id, materia_id, grupo_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS calificacion (
  id_calificacion SERIAL PRIMARY KEY,
  estudiante_id   INTEGER NOT NULL REFERENCES estudiante(id_usuario),
  materia_id      INTEGER NOT NULL REFERENCES materia(id_materia),
  calificacion    NUMERIC(4,2) NOT NULL CHECK (calificacion BETWEEN 0 AND 10),
  fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
  registrado_por  INTEGER REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  CONSTRAINT calificacion_estudiante_materia_key UNIQUE (estudiante_id, materia_id)
);

CREATE TABLE IF NOT EXISTS asistencia (
  id_asistencia  SERIAL PRIMARY KEY,
  usuario_id     INTEGER NOT NULL REFERENCES estudiante(id_usuario),
  fecha          DATE NOT NULL,
  presente       BOOLEAN NOT NULL,
  justificacion  TEXT,
  registrado_por INTEGER REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  CONSTRAINT asistencia_usuario_fecha_key UNIQUE (usuario_id, fecha)
);

CREATE TABLE IF NOT EXISTS incidencia (
  id_incidencia  SERIAL PRIMARY KEY,
  usuario_id     INTEGER NOT NULL REFERENCES estudiante(id_usuario),
  fecha          DATE NOT NULL,
  descripcion    TEXT NOT NULL,
  tipo           VARCHAR(100) NOT NULL,
  sancion        VARCHAR(20) CHECK (sancion IN ('llamado','suspension','expulsion')),
  materia_id     INTEGER REFERENCES materia(id_materia),
  taller_id      INTEGER REFERENCES taller(id_taller) ON DELETE SET NULL,
  registrado_por INTEGER REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS config_sistema (
  clave VARCHAR(60) PRIMARY KEY,
  valor TEXT NOT NULL
);
INSERT INTO config_sistema (clave, valor) VALUES ('calificaciones_habilitadas', 'false')
ON CONFLICT (clave) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_estudiante_grupo      ON estudiante (grupo_id);
CREATE INDEX IF NOT EXISTS idx_estudiante_taller     ON estudiante (taller_id);
CREATE INDEX IF NOT EXISTS idx_dm_docente            ON docente_materia (docente_id);
CREATE INDEX IF NOT EXISTS idx_dm_grupo              ON docente_materia (grupo_id);
CREATE INDEX IF NOT EXISTS idx_horario_grupo         ON horario (grupo_id);
CREATE INDEX IF NOT EXISTS idx_horario_docente       ON horario (docente_id);
CREATE INDEX IF NOT EXISTS idx_calificacion_materia  ON calificacion (materia_id);
CREATE INDEX IF NOT EXISTS idx_asistencia_fecha      ON asistencia (fecha);
CREATE INDEX IF NOT EXISTS idx_incidencia_usuario    ON incidencia (usuario_id);
CREATE INDEX IF NOT EXISTS idx_incidencia_fecha      ON incidencia (fecha);
