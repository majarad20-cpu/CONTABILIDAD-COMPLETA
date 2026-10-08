"""Conexión, esquema y migraciones de la base de datos SQLite."""
import sqlite3
from datetime import date

from flask import current_app, g

from .plan_cuentas_chile import PLAN_CUENTAS, TIPO_POR_DIGITO

ESQUEMA = """
CREATE TABLE IF NOT EXISTS empresas (
    id            INTEGER PRIMARY KEY,
    razon_social  TEXT NOT NULL DEFAULT '',
    rut           TEXT NOT NULL DEFAULT '',
    giro          TEXT NOT NULL DEFAULT '',
    direccion     TEXT NOT NULL DEFAULT '',
    comuna        TEXT NOT NULL DEFAULT '',
    representante TEXT NOT NULL DEFAULT '',
    regimen       TEXT NOT NULL DEFAULT '',
    ejercicio     INTEGER NOT NULL,
    ultimo_folio  INTEGER NOT NULL DEFAULT 0, -- último folio usado en los PDF de libros e informes
    tasa_ppm      REAL NOT NULL DEFAULT 0     -- % de PPM sobre los ingresos del giro
);

CREATE TABLE IF NOT EXISTS cuentas (
    id         INTEGER PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas (id) ON DELETE CASCADE,
    codigo     TEXT NOT NULL,
    nombre     TEXT NOT NULL,
    tipo       TEXT NOT NULL CHECK (tipo IN ('ACTIVO','PASIVO','PATRIMONIO','INGRESO','GASTO')),
    imputable  INTEGER NOT NULL DEFAULT 1,
    activa     INTEGER NOT NULL DEFAULT 1,
    -- Cuentas de patrimonio que en el Balance de 8 columnas van en Resultados
    -- (p. ej. Utilidades acumuladas). En el Balance General siguen en patrimonio.
    resultados_en_ocho INTEGER NOT NULL DEFAULT 0,
    UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS asientos (
    id         INTEGER PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas (id) ON DELETE CASCADE,
    tipo       TEXT NOT NULL CHECK (tipo IN ('INGRESO','EGRESO','TRASPASO')),
    numero     INTEGER NOT NULL,
    fecha      TEXT NOT NULL,
    glosa      TEXT NOT NULL,
    cierre     INTEGER NOT NULL DEFAULT 0,
    apertura   INTEGER NOT NULL DEFAULT 0,
    creado_en  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_asientos_empresa_fecha ON asientos (empresa_id, fecha);

CREATE TABLE IF NOT EXISTS lineas (
    id         INTEGER PRIMARY KEY,
    asiento_id INTEGER NOT NULL REFERENCES asientos (id) ON DELETE CASCADE,
    orden      INTEGER NOT NULL,
    cuenta_id  INTEGER NOT NULL REFERENCES cuentas (id),
    glosa      TEXT NOT NULL DEFAULT '',
    debe       INTEGER NOT NULL DEFAULT 0 CHECK (debe >= 0),
    haber      INTEGER NOT NULL DEFAULT 0 CHECK (haber >= 0),
    CHECK ((debe = 0) <> (haber = 0))
);
CREATE INDEX IF NOT EXISTS idx_lineas_asiento ON lineas (asiento_id);
CREATE INDEX IF NOT EXISTS idx_lineas_cuenta ON lineas (cuenta_id);

CREATE TABLE IF NOT EXISTS periodos_cerrados (
    empresa_id INTEGER NOT NULL REFERENCES empresas (id) ON DELETE CASCADE,
    periodo    TEXT NOT NULL,  -- 'AAAA-MM'
    cerrado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    PRIMARY KEY (empresa_id, periodo)
);

-- Constancia de cada cambio confirmado en un mes cerrado
CREATE TABLE IF NOT EXISTS cambios_periodo_cerrado (
    id          INTEGER PRIMARY KEY,
    empresa_id  INTEGER NOT NULL REFERENCES empresas (id) ON DELETE CASCADE,
    fecha_hora  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    accion      TEXT NOT NULL,
    comprobante TEXT NOT NULL,
    periodos    TEXT NOT NULL,
    motivo      TEXT NOT NULL DEFAULT ''
);

-- Registro de Compras y Ventas importado del SII
CREATE TABLE IF NOT EXISTS rcv_documentos (
    id                 INTEGER PRIMARY KEY,
    empresa_id         INTEGER NOT NULL REFERENCES empresas (id) ON DELETE CASCADE,
    registro           TEXT NOT NULL CHECK (registro IN ('COMPRA', 'VENTA')),
    periodo            TEXT NOT NULL,  -- período tributario 'AAAA-MM'
    tipo_doc           INTEGER NOT NULL,
    folio              TEXT NOT NULL,
    fecha              TEXT NOT NULL,
    rut                TEXT NOT NULL,
    razon_social       TEXT NOT NULL DEFAULT '',
    exento             INTEGER NOT NULL DEFAULT 0,
    neto               INTEGER NOT NULL DEFAULT 0,
    iva                INTEGER NOT NULL DEFAULT 0,  -- recuperable (compras) o débito (ventas)
    iva_no_recuperable INTEGER NOT NULL DEFAULT 0,
    otros_impuestos    INTEGER NOT NULL DEFAULT 0,
    total              INTEGER NOT NULL DEFAULT 0,
    activo_fijo        INTEGER NOT NULL DEFAULT 0,
    cantidad           INTEGER NOT NULL DEFAULT 1,  -- documentos que representa (resúmenes de boletas)
    cuenta_id          INTEGER REFERENCES cuentas (id) ON DELETE SET NULL,  -- cuenta del neto elegida
    asiento_id         INTEGER REFERENCES asientos (id) ON DELETE SET NULL,  -- centralización
    UNIQUE (empresa_id, registro, tipo_doc, rut, folio)
);
CREATE INDEX IF NOT EXISTS idx_rcv_periodo ON rcv_documentos (empresa_id, periodo, registro);

-- Cuenta habitual de cada proveedor o cliente (se recuerda al centralizar)
CREATE TABLE IF NOT EXISTS rcv_cuentas_rut (
    empresa_id INTEGER NOT NULL REFERENCES empresas (id) ON DELETE CASCADE,
    registro   TEXT NOT NULL,
    rut        TEXT NOT NULL,
    cuenta_id  INTEGER NOT NULL REFERENCES cuentas (id) ON DELETE CASCADE,
    PRIMARY KEY (empresa_id, registro, rut)
);

-- Cuentas usadas en la centralización y el F29 (concepto → cuenta)
CREATE TABLE IF NOT EXISTS cuentas_tributarias (
    empresa_id INTEGER NOT NULL REFERENCES empresas (id) ON DELETE CASCADE,
    concepto   TEXT NOT NULL,
    cuenta_id  INTEGER NOT NULL REFERENCES cuentas (id) ON DELETE CASCADE,
    PRIMARY KEY (empresa_id, concepto)
);

-- Borradores del F29 guardados (para encadenar el remanente)
CREATE TABLE IF NOT EXISTS f29_borradores (
    empresa_id  INTEGER NOT NULL REFERENCES empresas (id) ON DELETE CASCADE,
    periodo     TEXT NOT NULL,
    datos       TEXT NOT NULL,  -- JSON
    guardado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    PRIMARY KEY (empresa_id, periodo)
);

CREATE TABLE IF NOT EXISTS config (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
);
"""


def conectar(ruta):
    conn = sqlite3.connect(ruta)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _columnas(conn, tabla):
    return {fila[1] for fila in conn.execute(f"PRAGMA table_info({tabla})")}


def _migrar_a_multiempresa(conn):
    """Convierte una base de la versión de una sola empresa (tabla `empresa`,
    cuentas sin `empresa_id`) al esquema actual, conservando los datos."""
    conn.execute("PRAGMA foreign_keys = OFF")
    try:
        with conn:
            conn.execute("""CREATE TABLE empresas (
                id INTEGER PRIMARY KEY, razon_social TEXT NOT NULL DEFAULT '', rut TEXT NOT NULL DEFAULT '',
                giro TEXT NOT NULL DEFAULT '', direccion TEXT NOT NULL DEFAULT '', comuna TEXT NOT NULL DEFAULT '',
                representante TEXT NOT NULL DEFAULT '', regimen TEXT NOT NULL DEFAULT '', ejercicio INTEGER NOT NULL)""")
            conn.execute("""INSERT INTO empresas (id, razon_social, rut, giro, direccion, comuna, representante, ejercicio)
                            SELECT id, razon_social, rut, giro, direccion, comuna, representante, ejercicio FROM empresa""")
            conn.execute("DROP TABLE empresa")
            conn.execute("""CREATE TABLE cuentas_nueva (
                id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL REFERENCES empresas (id) ON DELETE CASCADE,
                codigo TEXT NOT NULL, nombre TEXT NOT NULL,
                tipo TEXT NOT NULL CHECK (tipo IN ('ACTIVO','PASIVO','PATRIMONIO','INGRESO','GASTO')),
                imputable INTEGER NOT NULL DEFAULT 1, activa INTEGER NOT NULL DEFAULT 1, UNIQUE (empresa_id, codigo))""")
            conn.execute("""INSERT INTO cuentas_nueva (id, empresa_id, codigo, nombre, tipo, imputable, activa)
                            SELECT id, 1, codigo, nombre, tipo, imputable, activa FROM cuentas""")
            conn.execute("DROP TABLE cuentas")
            conn.execute("ALTER TABLE cuentas_nueva RENAME TO cuentas")
            conn.execute("ALTER TABLE asientos ADD COLUMN empresa_id INTEGER NOT NULL DEFAULT 1 REFERENCES empresas (id)")
            conn.execute("ALTER TABLE asientos ADD COLUMN apertura INTEGER NOT NULL DEFAULT 0")
            conn.execute("DROP INDEX IF EXISTS idx_asientos_fecha")
    finally:
        conn.execute("PRAGMA foreign_keys = ON")


def sembrar_plan(conn, empresa_id):
    """Carga el plan de cuentas base en una empresa."""
    conn.executemany(
        "INSERT INTO cuentas (empresa_id, codigo, nombre, tipo, imputable) VALUES (?, ?, ?, ?, ?)",
        [(empresa_id, codigo, nombre, TIPO_POR_DIGITO[codigo[0]], int(imputable))
         for codigo, nombre, imputable in PLAN_CUENTAS],
    )


def inicializar(conn):
    """Crea o actualiza las tablas y deja al menos una empresa disponible."""
    tablas = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    if "empresa" in tablas and "empresas" not in tablas:
        _migrar_a_multiempresa(conn)
    conn.executescript(ESQUEMA)
    columnas_nuevas = [
        ("cuentas", "resultados_en_ocho", "INTEGER NOT NULL DEFAULT 0"),
        ("empresas", "ultimo_folio", "INTEGER NOT NULL DEFAULT 0"),
        ("empresas", "tasa_ppm", "REAL NOT NULL DEFAULT 0"),  # % de PPM sobre los ingresos del giro
        ("rcv_documentos", "cantidad", "INTEGER NOT NULL DEFAULT 1"),
    ]
    for tabla, columna, definicion in columnas_nuevas:
        if columna not in _columnas(conn, tabla):
            with conn:
                conn.execute(f"ALTER TABLE {tabla} ADD COLUMN {columna} {definicion}")
    with conn:
        if conn.execute("SELECT COUNT(*) FROM empresas").fetchone()[0] == 0:
            empresa_id = conn.execute(
                "INSERT INTO empresas (ejercicio) VALUES (?)", (date.today().year,)
            ).lastrowid
            sembrar_plan(conn, empresa_id)


# --------------------------------------------------------------------------
# Respaldos
# --------------------------------------------------------------------------

COLUMNAS_REQUERIDAS = {
    "cuentas": {"id", "codigo", "nombre", "tipo", "imputable", "activa"},
    "asientos": {"id", "tipo", "numero", "fecha", "glosa", "cierre"},
    "lineas": {"id", "asiento_id", "orden", "cuenta_id", "glosa", "debe", "haber"},
}


def validar_respaldo(ruta):
    """Comprueba que el archivo sea un respaldo válido de este programa (de
    cualquier versión) y devuelve un resumen. Lanza ErrorValidacion si no."""
    from .nucleo import ErrorValidacion

    with open(ruta, "rb") as f:
        if f.read(16) != b"SQLite format 3\x00":
            raise ErrorValidacion("El archivo no es una base de datos SQLite (.db).")
    conn = sqlite3.connect(f"file:{ruta}?mode=ro", uri=True)
    try:
        if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ErrorValidacion("El archivo está dañado (falló la verificación de integridad).")
        tablas = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        tabla_empresas = "empresas" if "empresas" in tablas else "empresa" if "empresa" in tablas else None
        if tabla_empresas is None:
            raise ErrorValidacion("El archivo no es un respaldo de este programa (no tiene datos de empresa).")
        for tabla, columnas in COLUMNAS_REQUERIDAS.items():
            existentes = _columnas(conn, tabla)
            if not existentes:
                raise ErrorValidacion(f"El archivo no es un respaldo de este programa (falta la tabla «{tabla}»).")
            faltantes = columnas - existentes
            if faltantes:
                raise ErrorValidacion(f"La tabla «{tabla}» no tiene las columnas: {', '.join(sorted(faltantes))}.")
        descuadrados = conn.execute(
            "SELECT COUNT(*) FROM (SELECT asiento_id FROM lineas GROUP BY asiento_id HAVING SUM(debe) <> SUM(haber))"
        ).fetchone()[0]
        if descuadrados:
            raise ErrorValidacion(f"El respaldo tiene {descuadrados} comprobante(s) descuadrado(s); no se cargó.")
        empresas = [
            (r[0] or "(sin nombre)") + (f" ({r[1]})" if r[1] else "")
            for r in conn.execute(f"SELECT razon_social, rut FROM {tabla_empresas} ORDER BY razon_social")
        ]
        fechas = conn.execute("SELECT MIN(fecha), MAX(fecha), COUNT(*) FROM asientos").fetchone()
        return {
            "empresas": empresas,
            "cuentas": conn.execute("SELECT COUNT(*) FROM cuentas").fetchone()[0],
            "asientos": fechas[2],
            "desde": fechas[0],
            "hasta": fechas[1],
        }
    except sqlite3.DatabaseError as e:
        raise ErrorValidacion(f"No se pudo leer el archivo: {e}") from None
    finally:
        conn.close()


def respaldar_en(conn, ruta_destino):
    """Copia la base abierta en `conn` a un archivo nuevo."""
    destino = sqlite3.connect(ruta_destino)
    try:
        conn.backup(destino)
    finally:
        destino.close()


def restaurar(conn, ruta_origen):
    """Reemplaza el contenido de la base abierta en `conn` con el del archivo."""
    origen = sqlite3.connect(f"file:{ruta_origen}?mode=ro", uri=True)
    try:
        origen.backup(conn)
    finally:
        origen.close()
    inicializar(conn)  # migra respaldos de versiones anteriores


# --------------------------------------------------------------------------
# Conexión por petición (Flask)
# --------------------------------------------------------------------------

def get_db():
    if "db" not in g:
        g.db = conectar(current_app.config["DATABASE"])
    return g.db


def cerrar_db(_error=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()
