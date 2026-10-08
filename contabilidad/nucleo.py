"""Lógica contable: validaciones, comprobantes e informes.

No depende de Flask; todas las funciones reciben una conexión sqlite3 y el id
de la empresa sobre la que operan. Los montos son enteros en pesos chilenos.

Modelo de saldos:
- El libro puede ser continuo (sin reapertura anual) o con asientos de
  apertura. Un asiento marcado como apertura «corta» la historia: los saldos
  en fechas posteriores se calculan solo con los movimientos desde esa fecha.
- Las cuentas de balance acumulan desde el último corte; las de resultado se
  informan por período.
- El asiento de cierre (cierre=1) traspasa el resultado del año a patrimonio
  y se excluye de los informes de su propio período, para que el Estado de
  Resultados no quede en cero.
"""
import re
from datetime import date

from .plan_cuentas_chile import CODIGO_RESULTADO_EJERCICIO, TIPO_POR_DIGITO

TIPOS_CUENTA = ("ACTIVO", "PASIVO", "PATRIMONIO", "INGRESO", "GASTO")
NOMBRES_TIPO = {"ACTIVO": "Activo", "PASIVO": "Pasivo", "PATRIMONIO": "Patrimonio",
                "INGRESO": "Ingreso (ganancia)", "GASTO": "Gasto (pérdida)"}
TIPOS_RESULTADO = ("INGRESO", "GASTO")
TIPOS_ASIENTO = ("INGRESO", "EGRESO", "TRASPASO")
PREFIJO_ASIENTO = {"INGRESO": "I", "EGRESO": "E", "TRASPASO": "T"}
SIN_CORTE = "0000-00-00"


class ErrorValidacion(ValueError):
    """Error de datos ingresados por el usuario; el mensaje se le muestra."""


# --------------------------------------------------------------------------
# Formatos chilenos
# --------------------------------------------------------------------------

def limpiar_rut(rut):
    return re.sub(r"[^0-9kK]", "", rut or "").upper()


def digito_verificador(cuerpo):
    suma, factor = 0, 2
    for digito in reversed(str(cuerpo)):
        suma += int(digito) * factor
        factor = 2 if factor == 7 else factor + 1
    resto = 11 - suma % 11
    return {11: "0", 10: "K"}.get(resto, str(resto))


def validar_rut(rut):
    r = limpiar_rut(rut)
    if len(r) < 2 or not r[:-1].isdigit():
        return False
    return digito_verificador(int(r[:-1])) == r[-1]


def formatear_rut(rut):
    r = limpiar_rut(rut)
    if len(r) < 2 or not r[:-1].isdigit():
        return rut or ""
    return f"{formato_clp(int(r[:-1]))}-{r[-1]}"


def formato_clp(monto):
    return f"{int(monto):,}".replace(",", ".")


_MONTO_RE = re.compile(r"^(\d{1,3}(\.\d{3})+|\d+)$")


def parse_monto(texto):
    """Convierte '1.234.567', '$ 1234567' o '' en entero. Rechaza decimales."""
    t = (texto or "").strip().replace("$", "").replace(" ", "")
    if t == "":
        return 0
    if not _MONTO_RE.match(t):
        raise ErrorValidacion(
            f"Monto inválido: «{texto}». Usa solo pesos enteros, sin decimales."
        )
    return int(t.replace(".", ""))


def parse_fecha(texto):
    try:
        return date.fromisoformat(texto or "")
    except ValueError:
        raise ErrorValidacion("Fecha inválida.") from None


def saldo_natural(tipo, debe, haber):
    """Saldo con el signo propio de la cuenta (deudora o acreedora)."""
    return debe - haber if tipo in ("ACTIVO", "GASTO") else haber - debe


def numero_comprobante(tipo, numero):
    return f"{PREFIJO_ASIENTO[tipo]}-{numero}"


# --------------------------------------------------------------------------
# Empresas
# --------------------------------------------------------------------------

def validar_datos_empresa(datos):
    """Valida y normaliza los datos de una empresa (dict de formulario)."""
    razon_social = (datos.get("razon_social") or "").strip()
    if not razon_social:
        raise ErrorValidacion("La razón social es obligatoria.")
    rut = (datos.get("rut") or "").strip()
    if rut and not validar_rut(rut):
        raise ErrorValidacion("El RUT no es válido (revisa el dígito verificador).")
    try:
        ejercicio = int(datos.get("ejercicio") or "")
    except ValueError:
        raise ErrorValidacion("El ejercicio debe ser un año, por ejemplo 2026.") from None
    if not 1900 <= ejercicio <= 2100:
        raise ErrorValidacion("El ejercicio debe ser un año válido.")
    extra = {}
    if (datos.get("ultimo_folio") or "") != "":
        try:
            extra["ultimo_folio"] = int(datos.get("ultimo_folio"))
        except (TypeError, ValueError):
            raise ErrorValidacion("El último folio debe ser un número entero.") from None
        if extra["ultimo_folio"] < 0:
            raise ErrorValidacion("El último folio no puede ser negativo.")
    return extra | {
        "razon_social": razon_social,
        "rut": formatear_rut(rut) if rut else "",
        "giro": (datos.get("giro") or "").strip(),
        "direccion": (datos.get("direccion") or "").strip(),
        "comuna": (datos.get("comuna") or "").strip(),
        "representante": (datos.get("representante") or "").strip(),
        "regimen": (datos.get("regimen") or "").strip(),
        "ejercicio": ejercicio,
    }


def _rut_repetido(conn, rut, empresa_id=None):
    if not rut:
        return False
    return conn.execute(
        "SELECT 1 FROM empresas WHERE rut = ? AND id IS NOT ?", (rut, empresa_id)
    ).fetchone() is not None


def crear_empresa(conn, datos, con_plan=True):
    from .db import sembrar_plan

    d = validar_datos_empresa(datos)
    if _rut_repetido(conn, d["rut"]):
        raise ErrorValidacion(f"Ya existe una empresa con el RUT {d['rut']}.")
    with conn:
        empresa_id = conn.execute(
            f"INSERT INTO empresas ({', '.join(d)}) VALUES ({', '.join('?' * len(d))})", list(d.values())
        ).lastrowid
        if con_plan:
            sembrar_plan(conn, empresa_id)
    return empresa_id


def guardar_empresa(conn, empresa_id, datos):
    d = validar_datos_empresa(datos)
    if _rut_repetido(conn, d["rut"], empresa_id):
        raise ErrorValidacion(f"Ya existe otra empresa con el RUT {d['rut']}.")
    with conn:
        conn.execute(
            f"UPDATE empresas SET {', '.join(f'{k} = ?' for k in d)} WHERE id = ?",
            [*d.values(), empresa_id],
        )


def eliminar_empresa(conn, empresa_id):
    if conn.execute("SELECT COUNT(*) FROM empresas").fetchone()[0] <= 1:
        raise ErrorValidacion("No se puede eliminar la única empresa.")
    with conn:
        for tabla in ("rcv_documentos", "rcv_cuentas_rut", "cuentas_tributarias", "f29_borradores"):
            conn.execute(f"DELETE FROM {tabla} WHERE empresa_id = ?", (empresa_id,))
        conn.execute(
            "DELETE FROM lineas WHERE asiento_id IN (SELECT id FROM asientos WHERE empresa_id = ?)", (empresa_id,)
        )
        conn.execute("DELETE FROM asientos WHERE empresa_id = ?", (empresa_id,))
        conn.execute("DELETE FROM cuentas WHERE empresa_id = ?", (empresa_id,))
        conn.execute("DELETE FROM periodos_cerrados WHERE empresa_id = ?", (empresa_id,))
        conn.execute("DELETE FROM cambios_periodo_cerrado WHERE empresa_id = ?", (empresa_id,))
        conn.execute("DELETE FROM empresas WHERE id = ?", (empresa_id,))


def registrar_folios(conn, empresa_id, inicio, cantidad):
    """Registra que se usaron los folios inicio … inicio+cantidad-1. El último
    folio utilizado nunca retrocede (reimprimir páginas antiguas no lo cambia)."""
    with conn:
        conn.execute("UPDATE empresas SET ultimo_folio = MAX(ultimo_folio, ?) WHERE id = ?",
                     (inicio + cantidad - 1, empresa_id))


# --------------------------------------------------------------------------
# Contador (datos comunes a todas las empresas, usados en los informes)
# --------------------------------------------------------------------------

def _config(conn, clave, defecto=""):
    fila = conn.execute("SELECT valor FROM config WHERE clave = ?", (clave,)).fetchone()
    return fila[0] if fila else defecto


def _guardar_config(conn, valores):
    with conn:
        for clave, valor in valores.items():
            if valor is None:
                conn.execute("DELETE FROM config WHERE clave = ?", (clave,))
            else:
                conn.execute("INSERT INTO config (clave, valor) VALUES (?, ?) "
                             "ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor", (clave, valor))


def obtener_contador(conn):
    import base64

    firma = _config(conn, "contador_firma")
    return {"nombre": _config(conn, "contador_nombre"), "rut": _config(conn, "contador_rut"),
            "firma": base64.b64decode(firma) if firma else None}


def guardar_contador(conn, nombre, rut):
    nombre, rut = (nombre or "").strip(), (rut or "").strip()
    if rut and not validar_rut(rut):
        raise ErrorValidacion("El RUT del contador no es válido (revisa el dígito verificador).")
    _guardar_config(conn, {"contador_nombre": nombre, "contador_rut": formatear_rut(rut) if rut else ""})


def guardar_firma(conn, contenido):
    """Guarda la imagen de firma (PNG o JPG). Se normaliza a PNG de máximo
    800 px de ancho, conservando la transparencia."""
    import base64
    import io

    from PIL import Image, UnidentifiedImageError

    if not contenido:
        raise ErrorValidacion("Selecciona una imagen de firma.")
    if len(contenido) > 5 * 1024 * 1024:
        raise ErrorValidacion("La imagen es demasiado grande (máximo 5 MB).")
    try:
        imagen = Image.open(io.BytesIO(contenido))
        imagen.load()
    except (UnidentifiedImageError, OSError):
        raise ErrorValidacion("El archivo no es una imagen válida (usa PNG o JPG).") from None
    imagen = imagen.convert("RGBA")
    if imagen.width > 800:
        imagen = imagen.resize((800, round(imagen.height * 800 / imagen.width)))
    salida = io.BytesIO()
    imagen.save(salida, format="PNG")
    _guardar_config(conn, {"contador_firma": base64.b64encode(salida.getvalue()).decode()})


def eliminar_firma(conn):
    _guardar_config(conn, {"contador_firma": None})


def listar_empresas(conn):
    return conn.execute(
        """SELECT e.*, (SELECT COUNT(*) FROM asientos a WHERE a.empresa_id = e.id) AS asientos,
                  (SELECT MAX(fecha) FROM asientos a WHERE a.empresa_id = e.id) AS ultimo
           FROM empresas e ORDER BY e.razon_social"""
    ).fetchall()


# --------------------------------------------------------------------------
# Plan de cuentas
# --------------------------------------------------------------------------

_CODIGO_RE = re.compile(r"^\d+(\.\d+)*$")


def ancestros(codigo):
    partes = codigo.split(".")
    return [".".join(partes[:i]) for i in range(1, len(partes))]


def guardar_cuenta(conn, empresa_id, codigo, nombre, tipo, imputable, activa, cuenta_id=None,
                   resultados_en_ocho=False):
    codigo = (codigo or "").strip()
    nombre = (nombre or "").strip()
    if not _CODIGO_RE.match(codigo):
        raise ErrorValidacion("El código debe tener el formato 1.1.01 (números separados por puntos).")
    if not nombre:
        raise ErrorValidacion("El nombre es obligatorio.")

    superiores = conn.execute(
        f"SELECT codigo, tipo, imputable FROM cuentas WHERE empresa_id = ? AND codigo IN ({','.join('?' * len(ancestros(codigo)))}) ORDER BY codigo",
        (empresa_id, *ancestros(codigo)),
    ).fetchall() if "." in codigo else []
    for s in superiores:
        if s["imputable"]:
            raise ErrorValidacion(f"La cuenta {s['codigo']} es imputable; no puede tener subcuentas.")
    if "." in codigo and not superiores:
        raise ErrorValidacion(f"No existe una cuenta de grupo superior para {codigo} (por ejemplo {ancestros(codigo)[-1]}). Créala primero.")

    if not tipo:
        tipo = superiores[-1]["tipo"] if superiores else TIPO_POR_DIGITO.get(codigo[0])
    if tipo not in TIPOS_CUENTA:
        raise ErrorValidacion("Selecciona el tipo de cuenta.")
    if resultados_en_ocho and (tipo != "PATRIMONIO" or not imputable):
        raise ErrorValidacion("Solo una cuenta imputable de patrimonio puede mostrarse en Resultados "
                              "del Balance de 8 columnas.")

    repetida = conn.execute(
        "SELECT id FROM cuentas WHERE empresa_id = ? AND codigo = ? AND id IS NOT ?", (empresa_id, codigo, cuenta_id)
    ).fetchone()
    if repetida:
        raise ErrorValidacion(f"Ya existe una cuenta con el código {codigo}.")

    if cuenta_id is not None:
        actual = obtener_cuenta(conn, empresa_id, cuenta_id)
        if actual is None:
            raise ErrorValidacion("La cuenta no existe.")
        hijos = _tiene_subcuentas(conn, empresa_id, actual["codigo"])
        if hijos and codigo != actual["codigo"]:
            raise ErrorValidacion("No se puede cambiar el código de una cuenta que tiene subcuentas.")
        if hijos and imputable:
            raise ErrorValidacion("Una cuenta con subcuentas debe ser de grupo (no imputable).")
        if not imputable and _tiene_movimientos(conn, cuenta_id):
            raise ErrorValidacion("La cuenta tiene movimientos; no puede pasar a ser de grupo.")

    with conn:
        if cuenta_id is None:
            return conn.execute(
                """INSERT INTO cuentas (empresa_id, codigo, nombre, tipo, imputable, activa, resultados_en_ocho)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (empresa_id, codigo, nombre, tipo, int(imputable), int(activa), int(resultados_en_ocho)),
            ).lastrowid
        conn.execute(
            """UPDATE cuentas SET codigo = ?, nombre = ?, tipo = ?, imputable = ?, activa = ?,
               resultados_en_ocho = ? WHERE id = ?""",
            (codigo, nombre, tipo, int(imputable), int(activa), int(resultados_en_ocho), cuenta_id),
        )
        return cuenta_id


def obtener_cuenta(conn, empresa_id, cuenta_id):
    return conn.execute(
        "SELECT * FROM cuentas WHERE id = ? AND empresa_id = ?", (cuenta_id, empresa_id)
    ).fetchone()


def eliminar_cuenta(conn, empresa_id, cuenta_id):
    cuenta = obtener_cuenta(conn, empresa_id, cuenta_id)
    if cuenta is None:
        raise ErrorValidacion("La cuenta no existe.")
    if _tiene_subcuentas(conn, empresa_id, cuenta["codigo"]):
        raise ErrorValidacion("La cuenta tiene subcuentas; elimínalas primero.")
    if _tiene_movimientos(conn, cuenta_id):
        raise ErrorValidacion("La cuenta tiene movimientos; puedes desactivarla en lugar de eliminarla.")
    with conn:
        conn.execute("DELETE FROM cuentas WHERE id = ?", (cuenta_id,))


def _tiene_subcuentas(conn, empresa_id, codigo):
    return conn.execute(
        "SELECT 1 FROM cuentas WHERE empresa_id = ? AND codigo LIKE ? LIMIT 1", (empresa_id, codigo + ".%")
    ).fetchone() is not None


def _tiene_movimientos(conn, cuenta_id):
    return conn.execute(
        "SELECT 1 FROM lineas WHERE cuenta_id = ? LIMIT 1", (cuenta_id,)
    ).fetchone() is not None


# --------------------------------------------------------------------------
# Cierre de meses
# --------------------------------------------------------------------------

MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]


def nombre_periodo(periodo):
    """'2026-03' → 'marzo 2026'."""
    return f"{MESES[int(periodo[5:7]) - 1]} {periodo[:4]}"


class PeriodoCerrado(ErrorValidacion):
    """La operación afecta meses cerrados y requiere confirmación."""

    def __init__(self, periodos):
        self.periodos = periodos
        nombres = ", ".join(nombre_periodo(p) for p in periodos)
        verbo = "está cerrado" if len(periodos) == 1 else "están cerrados"
        super().__init__(f"{nombres[0].upper()}{nombres[1:]} {verbo}. Confirma si de todas formas quieres "
                         "realizar este cambio en un período cerrado.")


def periodos_cerrados(conn, empresa_id):
    return {r[0] for r in conn.execute(
        "SELECT periodo FROM periodos_cerrados WHERE empresa_id = ?", (empresa_id,))}


def verificar_periodos(conn, empresa_id, fechas, confirmado):
    """Devuelve los meses cerrados afectados por las fechas. Si hay alguno y
    no se confirmó, lanza PeriodoCerrado."""
    cerrados = sorted({x[:7] for x in fechas if x} & periodos_cerrados(conn, empresa_id))
    if cerrados and not confirmado:
        raise PeriodoCerrado(cerrados)
    return cerrados


def _describir_asiento(tipo, numero, fecha, glosa):
    return f"{numero_comprobante(tipo, numero)} del {fecha[8:10]}/{fecha[5:7]}/{fecha[:4]} · {glosa}"


def _registrar_cambio(conn, empresa_id, accion, comprobante, periodos, motivo):
    conn.execute(
        """INSERT INTO cambios_periodo_cerrado (empresa_id, accion, comprobante, periodos, motivo)
           VALUES (?, ?, ?, ?, ?)""",
        (empresa_id, accion, comprobante, ", ".join(nombre_periodo(p) for p in periodos), (motivo or "").strip()),
    )


def _validar_mes(anio, mes):
    try:
        anio, mes = int(anio), int(mes)
    except (TypeError, ValueError):
        raise ErrorValidacion("Mes inválido.") from None
    if not (1900 <= anio <= 2100 and 1 <= mes <= 12):
        raise ErrorValidacion("Mes inválido.")
    return f"{anio:04d}-{mes:02d}"


def cerrar_mes(conn, empresa_id, anio, mes):
    with conn:
        conn.execute("INSERT OR IGNORE INTO periodos_cerrados (empresa_id, periodo) VALUES (?, ?)",
                     (empresa_id, _validar_mes(anio, mes)))


def reabrir_mes(conn, empresa_id, anio, mes):
    with conn:
        conn.execute("DELETE FROM periodos_cerrados WHERE empresa_id = ? AND periodo = ?",
                     (empresa_id, _validar_mes(anio, mes)))


def cerrar_hasta(conn, empresa_id, anio, mes):
    """Cierra todos los meses del año, desde enero hasta el mes indicado."""
    _validar_mes(anio, mes)
    for m in range(1, int(mes) + 1):
        cerrar_mes(conn, empresa_id, anio, m)


def resumen_periodos(conn, empresa_id, anio):
    """Los 12 meses del año con su estado y movimiento."""
    cerrados = {r["periodo"]: r["cerrado_en"] for r in conn.execute(
        "SELECT periodo, cerrado_en FROM periodos_cerrados WHERE empresa_id = ? AND periodo LIKE ?",
        (empresa_id, f"{anio}-%"))}
    movimiento = {r[0]: (r[1], r[2]) for r in conn.execute(
        """SELECT substr(a.fecha, 1, 7), COUNT(DISTINCT a.id), COALESCE(SUM(l.debe), 0)
           FROM asientos a LEFT JOIN lineas l ON l.asiento_id = a.id
           WHERE a.empresa_id = ? AND substr(a.fecha, 1, 4) = ? GROUP BY 1""",
        (empresa_id, str(anio)))}
    meses = []
    for m in range(1, 13):
        periodo = f"{anio}-{m:02d}"
        comprobantes, total = movimiento.get(periodo, (0, 0))
        meses.append({"mes": m, "periodo": periodo, "nombre": MESES[m - 1].capitalize(),
                      "cerrado_en": cerrados.get(periodo), "comprobantes": comprobantes, "total": total})
    return meses


def cambios_en_periodos_cerrados(conn, empresa_id, limite=100):
    return conn.execute(
        "SELECT * FROM cambios_periodo_cerrado WHERE empresa_id = ? ORDER BY id DESC LIMIT ?",
        (empresa_id, limite)).fetchall()


# --------------------------------------------------------------------------
# Comprobantes (asientos)
# --------------------------------------------------------------------------

def siguiente_numero(conn, empresa_id, tipo, anio):
    fila = conn.execute(
        """SELECT COALESCE(MAX(numero), 0) FROM asientos
           WHERE empresa_id = ? AND tipo = ? AND substr(fecha, 1, 4) = ?""",
        (empresa_id, tipo, str(anio)),
    ).fetchone()
    return fila[0] + 1


def guardar_asiento(conn, empresa_id, tipo, fecha, glosa, lineas, asiento_id=None,
                    cierre=False, apertura=False, numero=None, confirmado=False, motivo=""):
    """Valida y guarda un comprobante. `lineas` es una lista de dicts con
    cuenta_id, glosa, debe y haber (enteros). Devuelve el id del asiento.
    `numero` fuerza el correlativo (se usa al importar).

    Si la fecha nueva o la original caen en un mes cerrado, lanza
    PeriodoCerrado salvo que `confirmado` sea verdadero; en ese caso el cambio
    queda registrado con su `motivo`."""
    if tipo not in TIPOS_ASIENTO:
        raise ErrorValidacion("Tipo de comprobante inválido.")
    f = parse_fecha(fecha)
    glosa = (glosa or "").strip()
    if not glosa:
        raise ErrorValidacion("La glosa del comprobante es obligatoria.")
    if len(lineas) < 2:
        raise ErrorValidacion("El comprobante debe tener al menos dos líneas.")
    if cierre and apertura:
        raise ErrorValidacion("Un comprobante no puede ser de apertura y de cierre a la vez.")

    imputables = {r[0] for r in conn.execute(
        "SELECT id FROM cuentas WHERE empresa_id = ? AND imputable = 1", (empresa_id,))}
    for i, linea in enumerate(lineas, 1):
        if linea["cuenta_id"] not in imputables:
            raise ErrorValidacion(f"Línea {i}: selecciona una cuenta imputable.")
        if linea["debe"] < 0 or linea["haber"] < 0:
            raise ErrorValidacion(f"Línea {i}: los montos no pueden ser negativos.")
        if (linea["debe"] > 0) == (linea["haber"] > 0):
            raise ErrorValidacion(f"Línea {i}: ingresa un monto en Debe o en Haber (solo uno).")

    total_debe = sum(l["debe"] for l in lineas)
    total_haber = sum(l["haber"] for l in lineas)
    if total_debe != total_haber:
        raise ErrorValidacion(
            f"El comprobante no cuadra: Debe ${formato_clp(total_debe)} "
            f"≠ Haber ${formato_clp(total_haber)}."
        )

    actual = None
    if asiento_id is not None:
        actual = conn.execute(
            "SELECT * FROM asientos WHERE id = ? AND empresa_id = ?", (asiento_id, empresa_id)
        ).fetchone()
        if actual is None:
            raise ErrorValidacion("El comprobante no existe.")
    fechas = [f.isoformat()] + ([actual["fecha"]] if actual else [])
    cerrados = verificar_periodos(conn, empresa_id, fechas, confirmado)

    with conn:
        if actual is None:
            if numero is None:
                numero = siguiente_numero(conn, empresa_id, tipo, f.year)
            asiento_id = conn.execute(
                """INSERT INTO asientos (empresa_id, tipo, numero, fecha, glosa, cierre, apertura)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (empresa_id, tipo, numero, f.isoformat(), glosa, int(cierre), int(apertura)),
            ).lastrowid
        else:
            mismo_correlativo = actual["tipo"] == tipo and actual["fecha"][:4] == str(f.year)
            numero = actual["numero"] if mismo_correlativo else siguiente_numero(conn, empresa_id, tipo, f.year)
            conn.execute(
                "UPDATE asientos SET tipo = ?, numero = ?, fecha = ?, glosa = ?, apertura = ? WHERE id = ?",
                (tipo, numero, f.isoformat(), glosa, int(apertura), asiento_id),
            )
            conn.execute("DELETE FROM lineas WHERE asiento_id = ?", (asiento_id,))
        conn.executemany(
            "INSERT INTO lineas (asiento_id, orden, cuenta_id, glosa, debe, haber) VALUES (?, ?, ?, ?, ?, ?)",
            [
                (asiento_id, i, l["cuenta_id"], (l.get("glosa") or "").strip(), l["debe"], l["haber"])
                for i, l in enumerate(lineas, 1)
            ],
        )
        if cerrados:
            descripcion = _describir_asiento(tipo, numero, f.isoformat(), glosa)
            if actual is not None and (actual["fecha"], actual["tipo"], actual["numero"]) != (f.isoformat(), tipo, numero):
                anterior = _describir_asiento(actual["tipo"], actual["numero"], actual["fecha"], actual["glosa"])
                descripcion = f"{anterior} → {descripcion}"
            _registrar_cambio(conn, empresa_id, "Modificación" if actual else "Creación", descripcion, cerrados, motivo)
    return asiento_id


def eliminar_asiento(conn, empresa_id, asiento_id, confirmado=False, motivo=""):
    actual = conn.execute(
        "SELECT * FROM asientos WHERE id = ? AND empresa_id = ?", (asiento_id, empresa_id)
    ).fetchone()
    if actual is None:
        return
    cerrados = verificar_periodos(conn, empresa_id, [actual["fecha"]], confirmado)
    with conn:
        conn.execute("DELETE FROM asientos WHERE id = ? AND empresa_id = ?", (asiento_id, empresa_id))
        if cerrados:
            _registrar_cambio(conn, empresa_id, "Eliminación",
                              _describir_asiento(actual["tipo"], actual["numero"], actual["fecha"], actual["glosa"]),
                              cerrados, motivo)


def obtener_asiento(conn, empresa_id, asiento_id):
    asiento = conn.execute(
        "SELECT * FROM asientos WHERE id = ? AND empresa_id = ?", (asiento_id, empresa_id)
    ).fetchone()
    if asiento is None:
        return None
    lineas = conn.execute(
        """SELECT l.*, c.codigo, c.nombre FROM lineas l JOIN cuentas c ON c.id = l.cuenta_id
           WHERE l.asiento_id = ? ORDER BY l.orden""",
        (asiento_id,),
    ).fetchall()
    return {"asiento": asiento, "lineas": lineas}


def listar_asientos(conn, empresa_id, desde, hasta, tipo=None, texto=None, limite=None):
    condiciones, params = ["a.empresa_id = ?", "a.fecha BETWEEN ? AND ?"], [empresa_id, desde, hasta]
    if tipo:
        condiciones.append("a.tipo = ?")
        params.append(tipo)
    if texto:
        condiciones.append("(a.glosa LIKE ? OR EXISTS (SELECT 1 FROM lineas x WHERE x.asiento_id = a.id AND x.glosa LIKE ?))")
        params += [f"%{texto}%"] * 2
    orden = "a.fecha DESC, a.id DESC" if limite else "a.fecha, a.tipo, a.numero"
    return conn.execute(
        f"""SELECT a.*, COALESCE(SUM(l.debe), 0) AS total
            FROM asientos a LEFT JOIN lineas l ON l.asiento_id = a.id
            WHERE {' AND '.join(condiciones)}
            GROUP BY a.id ORDER BY {orden} {f'LIMIT {int(limite)}' if limite else ''}""",
        params,
    ).fetchall()


# --------------------------------------------------------------------------
# Libros
# --------------------------------------------------------------------------

def corte(conn, empresa_id, fecha, incluida=True):
    """Fecha del último asiento de apertura hasta `fecha` (o antes de ella si
    incluida=False). Devuelve SIN_CORTE si no hay ninguno."""
    op = "<=" if incluida else "<"
    fila = conn.execute(
        f"SELECT MAX(fecha) FROM asientos WHERE empresa_id = ? AND apertura = 1 AND fecha {op} ?",
        (empresa_id, fecha),
    ).fetchone()
    return fila[0] or SIN_CORTE


def libro_diario(conn, empresa_id, desde, hasta):
    asientos = conn.execute(
        "SELECT * FROM asientos WHERE empresa_id = ? AND fecha BETWEEN ? AND ? ORDER BY fecha, tipo, numero",
        (empresa_id, desde, hasta),
    ).fetchall()
    lineas = conn.execute(
        """SELECT l.*, c.codigo, c.nombre FROM lineas l
           JOIN asientos a ON a.id = l.asiento_id JOIN cuentas c ON c.id = l.cuenta_id
           WHERE a.empresa_id = ? AND a.fecha BETWEEN ? AND ? ORDER BY l.asiento_id, l.orden""",
        (empresa_id, desde, hasta),
    ).fetchall()
    por_asiento = {}
    for l in lineas:
        por_asiento.setdefault(l["asiento_id"], []).append(l)
    resultado = [{"asiento": a, "lineas": por_asiento.get(a["id"], [])} for a in asientos]
    return {"asientos": resultado, "total_debe": sum(l["debe"] for l in lineas),
            "total_haber": sum(l["haber"] for l in lineas)}


def libro_mayor(conn, empresa_id, cuenta_id, desde, hasta):
    """Movimientos de una cuenta con saldo acumulado. El saldo se reinicia en
    cada asiento de apertura."""
    cuenta = obtener_cuenta(conn, empresa_id, cuenta_id)
    if cuenta is None:
        return None
    corte_inicial = corte(conn, empresa_id, desde, incluida=False)
    previo = conn.execute(
        """SELECT COALESCE(SUM(l.debe), 0), COALESCE(SUM(l.haber), 0) FROM lineas l
           JOIN asientos a ON a.id = l.asiento_id
           WHERE l.cuenta_id = ? AND a.fecha >= ? AND a.fecha < ?""",
        (cuenta_id, corte_inicial, desde),
    ).fetchone()
    saldo = saldo_inicial = saldo_natural(cuenta["tipo"], previo[0], previo[1])
    aperturas = [r[0] for r in conn.execute(
        """SELECT DISTINCT fecha FROM asientos WHERE empresa_id = ? AND apertura = 1
           AND fecha BETWEEN ? AND ? ORDER BY fecha""", (empresa_id, desde, hasta))]
    movimientos = []
    total_debe = total_haber = 0
    for m in conn.execute(
        """SELECT a.id AS asiento_id, a.fecha, a.tipo, a.numero, a.apertura, a.glosa AS glosa_asiento,
                  l.glosa, l.debe, l.haber
           FROM lineas l JOIN asientos a ON a.id = l.asiento_id
           WHERE l.cuenta_id = ? AND a.fecha BETWEEN ? AND ?
           ORDER BY a.fecha, a.apertura DESC, a.tipo, a.numero, l.orden""",
        (cuenta_id, desde, hasta),
    ):
        while aperturas and m["fecha"] >= aperturas[0]:
            aperturas.pop(0)
            if saldo:
                movimientos.append({"reinicio": True, "fecha": m["fecha"], "saldo_anterior": saldo})
            saldo = 0
        saldo += saldo_natural(cuenta["tipo"], m["debe"], m["haber"])
        total_debe += m["debe"]
        total_haber += m["haber"]
        movimientos.append({**dict(m), "saldo": saldo})
    return {
        "cuenta": cuenta,
        "saldo_inicial": saldo_inicial,
        "movimientos": movimientos,
        "total_debe": total_debe,
        "total_haber": total_haber,
        "saldo_final": saldo,
    }


def libro_mayor_completo(conn, empresa_id, desde, hasta):
    """Libro Mayor de todas las cuentas con movimientos en el período o con
    saldo anterior distinto de cero."""
    ids = [r[0] for r in conn.execute(
        """SELECT DISTINCT c.id, c.codigo FROM cuentas c JOIN lineas l ON l.cuenta_id = c.id
           JOIN asientos a ON a.id = l.asiento_id
           WHERE c.empresa_id = ? AND a.fecha <= ? ORDER BY c.codigo""", (empresa_id, hasta))]
    cuentas = []
    for cuenta_id in ids:
        m = libro_mayor(conn, empresa_id, cuenta_id, desde, hasta)
        if m["movimientos"] or m["saldo_inicial"]:
            cuentas.append(m)
    return {"cuentas": cuentas,
            "total_debe": sum(m["total_debe"] for m in cuentas),
            "total_haber": sum(m["total_haber"] for m in cuentas)}


# --------------------------------------------------------------------------
# Saldos e informes financieros
# --------------------------------------------------------------------------

def saldos_periodo(conn, empresa_id, desde, hasta):
    """Saldos para informes del período [desde, hasta].

    - Cuentas de balance: movimientos desde el último corte (apertura) hasta
      `hasta`, sin los asientos de cierre del propio período.
    - Cuentas de resultado: movimientos del período (y desde el corte), sin cierres.
    - `resultado_anterior`: resultado entre el corte y `desde` que no se
      traspasó a patrimonio (+ utilidad, - pérdida).

    Con estas reglas el balance siempre cuadra.
    """
    inicio = corte(conn, empresa_id, hasta)
    filas = conn.execute(
        """SELECT c.id, c.codigo, c.nombre, c.tipo, c.resultados_en_ocho,
                  SUM(l.debe) AS debe, SUM(l.haber) AS haber
           FROM lineas l JOIN asientos a ON a.id = l.asiento_id JOIN cuentas c ON c.id = l.cuenta_id
           WHERE a.empresa_id = :empresa AND a.fecha >= :inicio AND a.fecha <= :hasta AND (
                 (c.tipo IN ('ACTIVO','PASIVO','PATRIMONIO') AND NOT (a.cierre = 1 AND a.fecha >= :desde))
              OR (c.tipo IN ('INGRESO','GASTO') AND a.fecha >= :desde AND a.cierre = 0))
           GROUP BY c.id ORDER BY c.codigo""",
        {"empresa": empresa_id, "inicio": inicio, "desde": desde, "hasta": hasta},
    ).fetchall()
    anterior = conn.execute(
        """SELECT COALESCE(SUM(l.haber - l.debe), 0) FROM lineas l
           JOIN asientos a ON a.id = l.asiento_id JOIN cuentas c ON c.id = l.cuenta_id
           WHERE a.empresa_id = ? AND c.tipo IN ('INGRESO','GASTO') AND a.fecha >= ? AND a.fecha < ?""",
        (empresa_id, inicio, desde),
    ).fetchone()[0]
    return {"cuentas": filas, "resultado_anterior": anterior}


def balance_ocho_columnas(conn, empresa_id, desde, hasta):
    """Balance de 8 columnas. Las cuentas de patrimonio marcadas con
    `resultados_en_ocho` van en las columnas de Resultados; por eso el
    resultado de las columnas (`resultado`) puede diferir del resultado del
    ejercicio (`resultado_ejercicio`) en `patrimonio_en_resultados`."""
    columnas = ("debitos", "creditos", "deudor", "acreedor", "activo", "pasivo", "perdidas", "ganancias")
    datos = saldos_periodo(conn, empresa_id, desde, hasta)
    filas = []

    def agregar(codigo, nombre, en_resultados, debe, haber):
        deudor, acreedor = max(debe - haber, 0), max(haber - debe, 0)
        fila = dict.fromkeys(columnas, 0)
        fila.update(codigo=codigo, nombre=nombre, debitos=debe, creditos=haber, deudor=deudor, acreedor=acreedor)
        if en_resultados:
            fila["perdidas"], fila["ganancias"] = deudor, acreedor
        else:
            fila["activo"], fila["pasivo"] = deudor, acreedor
        filas.append(fila)

    patrimonio_en_resultados = 0
    resultado_ejercicio = 0
    for c in datos["cuentas"]:
        if c["tipo"] in TIPOS_RESULTADO:
            resultado_ejercicio += c["haber"] - c["debe"]
        elif c["resultados_en_ocho"]:
            patrimonio_en_resultados += c["haber"] - c["debe"]
        agregar(c["codigo"], c["nombre"], c["tipo"] in TIPOS_RESULTADO or c["resultados_en_ocho"],
                c["debe"], c["haber"])
    ant = datos["resultado_anterior"]
    if ant:
        agregar("", "Resultados de ejercicios anteriores no cerrados", False,
                max(-ant, 0), max(ant, 0))

    totales = {k: sum(f[k] for f in filas) for k in columnas}
    resultado = totales["ganancias"] - totales["perdidas"]
    ajuste = dict.fromkeys(columnas, 0)
    if resultado >= 0:
        ajuste["pasivo"] = ajuste["perdidas"] = resultado
    else:
        ajuste["activo"] = ajuste["ganancias"] = -resultado
    sumas_iguales = {k: totales[k] + ajuste[k] for k in columnas}
    return {"filas": filas, "totales": totales, "resultado": resultado,
            "ajuste": ajuste, "sumas_iguales": sumas_iguales,
            "resultado_ejercicio": resultado_ejercicio, "patrimonio_en_resultados": patrimonio_en_resultados}


def _arbol(conn, empresa_id, tipos, montos):
    """Filas jerárquicas (grupos y cuentas) de las cuentas imputables de los
    tipos indicados. `montos` es {cuenta_id: monto}. Los grupos suman a sus
    descendientes por prefijo de código, sin importar el tipo del grupo (un
    grupo puede contener ganancias y pérdidas)."""
    marcas = ",".join("?" * len(tipos))
    cuentas = conn.execute(
        f"""SELECT id, codigo, nombre, imputable FROM cuentas
            WHERE empresa_id = ? AND (imputable = 0 OR tipo IN ({marcas})) ORDER BY codigo""",
        (empresa_id, *tipos),
    ).fetchall()
    hojas = {c["codigo"]: montos[c["id"]] for c in cuentas if c["imputable"] and c["id"] in montos}
    filas = []
    for c in cuentas:
        if c["imputable"]:
            if c["codigo"] not in hojas:
                continue
            monto = hojas[c["codigo"]]
        else:
            descendientes = [v for cod, v in hojas.items() if cod.startswith(c["codigo"] + ".")]
            if not descendientes:
                continue
            monto = sum(descendientes)
        filas.append({"codigo": c["codigo"], "nombre": c["nombre"], "nivel": c["codigo"].count("."),
                      "grupo": not c["imputable"], "monto": monto})
    return filas, sum(hojas.values())


def estado_resultados(conn, empresa_id, desde, hasta):
    datos = saldos_periodo(conn, empresa_id, desde, hasta)
    montos = {c["id"]: saldo_natural(c["tipo"], c["debe"], c["haber"])
              for c in datos["cuentas"] if c["tipo"] in TIPOS_RESULTADO}
    ingresos, total_ingresos = _arbol(conn, empresa_id, ("INGRESO",), montos)
    gastos, total_gastos = _arbol(conn, empresa_id, ("GASTO",), montos)
    return {"ingresos": ingresos, "total_ingresos": total_ingresos,
            "gastos": gastos, "total_gastos": total_gastos,
            "resultado": total_ingresos - total_gastos}


def balance_general(conn, empresa_id, hasta):
    desde = f"{hasta[:4]}-01-01"
    datos = saldos_periodo(conn, empresa_id, desde, hasta)
    montos = {c["id"]: saldo_natural(c["tipo"], c["debe"], c["haber"]) for c in datos["cuentas"]}
    activo, total_activo = _arbol(conn, empresa_id, ("ACTIVO",), montos)
    pasivo, total_pasivo = _arbol(conn, empresa_id, ("PASIVO",), montos)
    patrimonio, total_patrimonio = _arbol(conn, empresa_id, ("PATRIMONIO",), montos)
    resultado = sum(montos[c["id"]] * (1 if c["tipo"] == "INGRESO" else -1)
                    for c in datos["cuentas"] if c["tipo"] in TIPOS_RESULTADO)
    anterior = datos["resultado_anterior"]
    total_patrimonio_final = total_patrimonio + anterior + resultado
    return {"desde": desde, "activo": activo, "total_activo": total_activo,
            "pasivo": pasivo, "total_pasivo": total_pasivo,
            "patrimonio": patrimonio, "resultado_anterior": anterior,
            "resultado": resultado, "total_patrimonio": total_patrimonio_final,
            "total_pasivo_patrimonio": total_pasivo + total_patrimonio_final}


def disponible(conn, empresa_id, hasta):
    """Saldo de caja y bancos (cuentas de activo cuyo nombre empieza con
    «Caja» o «Banco») a la fecha."""
    datos = saldos_periodo(conn, empresa_id, f"{hasta[:4]}-01-01", hasta)
    return sum(c["debe"] - c["haber"] for c in datos["cuentas"]
               if c["tipo"] == "ACTIVO" and re.match(r"(caja|banco)", c["nombre"], re.IGNORECASE))


# --------------------------------------------------------------------------
# Cierre del ejercicio
# --------------------------------------------------------------------------

def asiento_cierre(conn, empresa_id, anio):
    return conn.execute(
        "SELECT * FROM asientos WHERE empresa_id = ? AND cierre = 1 AND substr(fecha, 1, 4) = ?",
        (empresa_id, str(anio)),
    ).fetchone()


def cuentas_patrimonio(conn, empresa_id):
    return conn.execute(
        """SELECT id, codigo, nombre FROM cuentas
           WHERE empresa_id = ? AND tipo = 'PATRIMONIO' AND imputable = 1 ORDER BY codigo""",
        (empresa_id,),
    ).fetchall()


def cuenta_resultado_sugerida(conn, empresa_id):
    """Cuenta de patrimonio más probable para recibir el resultado del ejercicio."""
    cuentas = cuentas_patrimonio(conn, empresa_id)
    for c in cuentas:
        if c["codigo"] == CODIGO_RESULTADO_EJERCICIO:
            return c["id"]
    for patron in (r"resultado del ejercicio", r"utilidad.*del ejercicio", r"p[ée]rdida y ganancia",
                   r"utilidades? acumuladas?"):
        for c in cuentas:
            if re.search(patron, c["nombre"], re.IGNORECASE):
                return c["id"]
    return cuentas[0]["id"] if cuentas else None


# --------------------------------------------------------------------------
# Apertura automática del ejercicio
# --------------------------------------------------------------------------

def _cuenta_por_nombre(conn, empresa_id, patrones):
    cuentas = cuentas_patrimonio(conn, empresa_id)
    for patron in patrones:
        for c in cuentas:
            if re.search(patron, c["nombre"], re.IGNORECASE):
                return c["id"]
    return cuenta_resultado_sugerida(conn, empresa_id)


def cuentas_destino_sugeridas(conn, empresa_id):
    """Cuentas de patrimonio sugeridas para recibir la utilidad y la pérdida
    del ejercicio anterior en la apertura."""
    return {"utilidad": _cuenta_por_nombre(conn, empresa_id, (r"utilidades? acumuladas?", r"utilidades? retenidas?")),
            "perdida": _cuenta_por_nombre(conn, empresa_id, (r"p[ée]rdidas? acumuladas?",))}


def aperturas_del_anio(conn, empresa_id, anio):
    return conn.execute(
        "SELECT * FROM asientos WHERE empresa_id = ? AND apertura = 1 AND substr(fecha, 1, 4) = ? ORDER BY fecha",
        (empresa_id, str(anio))).fetchall()


def propuesta_apertura(conn, empresa_id, anio, destino_utilidad=None, destino_perdida=None):
    """Propone el asiento de apertura del año `anio` con los saldos de las
    cuentas de balance al 31/12 del año anterior. El resultado del año anterior
    (y el de años previos no cerrados) se suma a la cuenta de patrimonio de
    destino: `destino_utilidad` si es utilidad, `destino_perdida` si es pérdida.

    No guarda nada: devuelve las líneas para revisarlas y editarlas."""
    anterior = int(anio) - 1
    bg = balance_general(conn, empresa_id, f"{anterior}-12-31")
    datos = saldos_periodo(conn, empresa_id, f"{anterior}-01-01", f"{anterior}-12-31")
    netos = {}  # cuenta_id → debe - haber
    for c in datos["cuentas"]:
        if c["tipo"] not in TIPOS_RESULTADO and c["debe"] != c["haber"]:
            netos[c["id"]] = c["debe"] - c["haber"]
    if not netos:
        raise ErrorValidacion(f"No hay saldos de cuentas de balance al 31/12/{anterior} para abrir {anio}.")

    resultado = bg["resultado"] + bg["resultado_anterior"]  # + utilidad / - pérdida
    destino = None
    if resultado:
        destino_id = destino_utilidad if resultado > 0 else destino_perdida
        destino = obtener_cuenta(conn, empresa_id, destino_id) if destino_id else None
        if destino is None or destino["tipo"] != "PATRIMONIO" or not destino["imputable"]:
            raise ErrorValidacion("Selecciona una cuenta imputable de patrimonio para el resultado del año anterior.")
        netos[destino["id"]] = netos.get(destino["id"], 0) - resultado

    cuentas = {c["id"]: c for c in conn.execute(
        "SELECT id, codigo, nombre FROM cuentas WHERE empresa_id = ?", (empresa_id,))}
    deudoras = sorted((cid for cid, n in netos.items() if n > 0), key=lambda cid: cuentas[cid]["codigo"])
    acreedoras = sorted((cid for cid, n in netos.items() if n < 0), key=lambda cid: cuentas[cid]["codigo"])
    lineas = ([{"cuenta_id": cid, "debe": netos[cid], "haber": 0, "glosa": ""} for cid in deudoras]
              + [{"cuenta_id": cid, "debe": 0, "haber": -netos[cid], "glosa": ""} for cid in acreedoras])
    return {
        "anio": int(anio), "anterior": anterior, "lineas": lineas,
        "total": sum(l["debe"] for l in lineas),
        "resultado": resultado, "destino": destino,
        "total_activo": bg["total_activo"], "total_pasivo": bg["total_pasivo"],
        "total_patrimonio": bg["total_patrimonio"],
        "existentes": aperturas_del_anio(conn, empresa_id, anio),
        "glosa": f"APERTURA CUENTAS DE BALANCE AÑO COMERCIAL {anio}",
    }


def cerrar_ejercicio(conn, empresa_id, anio, cuenta_destino_id, confirmado=False, motivo=""):
    """Crea el asiento que salda las cuentas de resultado del año contra la
    cuenta de patrimonio indicada. Devuelve (id del asiento, resultado)."""
    if asiento_cierre(conn, empresa_id, anio):
        raise ErrorValidacion(f"El ejercicio {anio} ya tiene un asiento de cierre.")
    destino = obtener_cuenta(conn, empresa_id, cuenta_destino_id) if cuenta_destino_id else None
    if destino is None or destino["tipo"] != "PATRIMONIO" or not destino["imputable"]:
        raise ErrorValidacion("Selecciona una cuenta imputable de patrimonio para traspasar el resultado.")
    inicio = max(f"{anio}-01-01", corte(conn, empresa_id, f"{anio}-12-31"))
    saldos = conn.execute(
        """SELECT l.cuenta_id, SUM(l.debe) AS debe, SUM(l.haber) AS haber
           FROM lineas l JOIN asientos a ON a.id = l.asiento_id JOIN cuentas c ON c.id = l.cuenta_id
           WHERE a.empresa_id = ? AND c.tipo IN ('INGRESO','GASTO') AND a.fecha BETWEEN ? AND ? AND a.cierre = 0
           GROUP BY l.cuenta_id""",
        (empresa_id, inicio, f"{anio}-12-31"),
    ).fetchall()
    lineas = []
    for s in saldos:
        neto = s["debe"] - s["haber"]
        if neto > 0:
            lineas.append({"cuenta_id": s["cuenta_id"], "glosa": "Cierre", "debe": 0, "haber": neto})
        elif neto < 0:
            lineas.append({"cuenta_id": s["cuenta_id"], "glosa": "Cierre", "debe": -neto, "haber": 0})
    if not lineas:
        raise ErrorValidacion(f"No hay movimientos en cuentas de resultado en {anio}.")
    resultado = sum(l["debe"] for l in lineas) - sum(l["haber"] for l in lineas)
    if resultado > 0:
        lineas.append({"cuenta_id": destino["id"], "glosa": "Utilidad del ejercicio", "debe": 0, "haber": resultado})
    elif resultado < 0:
        lineas.append({"cuenta_id": destino["id"], "glosa": "Pérdida del ejercicio", "debe": -resultado, "haber": 0})
    asiento_id = guardar_asiento(conn, empresa_id, "TRASPASO", f"{anio}-12-31", f"Cierre del ejercicio {anio}",
                                 lineas, cierre=True, confirmado=confirmado, motivo=motivo)
    return asiento_id, resultado
