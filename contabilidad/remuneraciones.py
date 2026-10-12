"""Sueldo empresarial de socios y boletas de honorarios (BHE recibidas y BTE emitidas).

- Sueldo empresarial: remuneración que se asigna el socio que trabaja en la
  empresa. Se le retiene el Impuesto Único de Segunda Categoría según la tabla
  mensual y la UTM del mes; si cotiza, las cotizaciones se descuentan de la base.
- Honorarios: retención de impuesto de segunda categoría con la tasa del año.

Las propuestas de asiento no guardan nada: se revisan en el formulario de
comprobante antes de registrarlas.
"""
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal

from .nucleo import MESES, ErrorValidacion, formatear_rut, nombre_periodo, parse_fecha, validar_rut

# Valores oficiales de la UTM publicados por el SII (se pueden agregar o corregir en el programa)
UTM_OFICIALES = {
    "2026-01": 69751, "2026-02": 69611, "2026-03": 69889, "2026-04": 69889, "2026-05": 70588,
    "2026-06": 71506, "2026-07": 71649, "2026-08": 71649, "2026-09": 71721, "2026-10": 72151,
}

# Impuesto Único de Segunda Categoría, tabla mensual en UTM: (hasta, factor, cantidad a rebajar)
TRAMOS_IMPUESTO_UNICO = [
    (Decimal("13.5"), Decimal("0"), Decimal("0")),
    (Decimal("30"), Decimal("0.04"), Decimal("0.54")),
    (Decimal("50"), Decimal("0.08"), Decimal("1.74")),
    (Decimal("70"), Decimal("0.135"), Decimal("4.49")),
    (Decimal("90"), Decimal("0.23"), Decimal("11.14")),
    (Decimal("120"), Decimal("0.304"), Decimal("17.80")),
    (Decimal("310"), Decimal("0.35"), Decimal("23.32")),
    (None, Decimal("0.40"), Decimal("38.82")),
]

# Retención de honorarios (art. 42 N°2 y art. 74 N°2 LIR) según el año de emisión de la boleta
TASAS_RETENCION = {2020: 10.75, 2021: 11.5, 2022: 12.25, 2023: 13.0, 2024: 13.75, 2025: 14.5,
                   2026: 15.25, 2027: 16.0, 2028: 17.0}

TIPOS_BOLETA = {"BHE": "Boleta de honorarios recibida", "BTE": "Boleta de prestación de servicios de terceros emitida"}


def _pesos(valor):
    return int(Decimal(valor).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _mes(periodo):
    return f"{MESES[int(periodo[5:]) - 1].upper()} {periodo[:4]}"


def _monto(valor, nombre):
    if not isinstance(valor, int) or valor < 0:
        raise ErrorValidacion(f"{nombre}: ingresa un monto en pesos enteros, sin decimales.")
    return valor


# ==========================================================================
# UTM
# ==========================================================================

def utm(conn, periodo):
    fila = conn.execute("SELECT valor FROM valores_utm WHERE periodo = ?", (periodo,)).fetchone()
    return fila[0] if fila else None


def guardar_utm(conn, periodo, valor):
    if not isinstance(valor, int) or not 1_000 <= valor <= 1_000_000:
        raise ErrorValidacion("Ingresa el valor de la UTM en pesos, por ejemplo 72.151.")
    with conn:
        conn.execute("INSERT INTO valores_utm (periodo, valor) VALUES (?, ?) "
                     "ON CONFLICT (periodo) DO UPDATE SET valor = excluded.valor", (periodo, valor))


def cargar_utm_oficiales(conn):
    conn.executemany("INSERT OR IGNORE INTO valores_utm (periodo, valor) VALUES (?, ?)", UTM_OFICIALES.items())


# ==========================================================================
# Sueldo empresarial
# ==========================================================================

def impuesto_unico(base, valor_utm):
    """Impuesto Único de Segunda Categoría mensual: base × factor − rebaja × UTM."""
    if base <= 0:
        return 0
    base_utm = Decimal(base) / Decimal(valor_utm)
    for hasta, factor, rebaja in TRAMOS_IMPUESTO_UNICO:
        if hasta is None or base_utm <= hasta:
            return max(_pesos(Decimal(base) * factor - rebaja * Decimal(valor_utm)), 0)


def calcular_liquidacion(bruto, afp, salud, valor_utm):
    base = bruto - afp - salud
    if base < 0:
        raise ErrorValidacion("Las cotizaciones no pueden superar el sueldo bruto.")
    impuesto = impuesto_unico(base, valor_utm)
    return {"bruto": bruto, "afp": afp, "salud": salud, "base": base, "utm": valor_utm,
            "impuesto_unico": impuesto, "liquido": base - impuesto}


def guardar_socio(conn, empresa_id, datos, socio_id=None):
    nombre = (datos.get("nombre") or "").strip()
    rut = (datos.get("rut") or "").strip()
    if not nombre:
        raise ErrorValidacion("Ingresa el nombre del socio.")
    if not validar_rut(rut):
        raise ErrorValidacion("El RUT del socio no es válido (revisa el dígito verificador).")
    rut = formatear_rut(rut)
    sueldo = _monto(datos.get("sueldo_bruto") or 0, "Sueldo bruto")
    repetido = conn.execute("SELECT 1 FROM socios WHERE empresa_id = ? AND rut = ? AND id IS NOT ?",
                            (empresa_id, rut, socio_id)).fetchone()
    if repetido:
        raise ErrorValidacion(f"Ya existe un socio con el RUT {rut}.")
    with conn:
        if socio_id is None:
            return conn.execute("INSERT INTO socios (empresa_id, nombre, rut, sueldo_bruto, activo) VALUES (?, ?, ?, ?, ?)",
                                (empresa_id, nombre, rut, sueldo, int(datos.get("activo", True)))).lastrowid
        conn.execute("UPDATE socios SET nombre = ?, rut = ?, sueldo_bruto = ?, activo = ? WHERE id = ? AND empresa_id = ?",
                     (nombre, rut, sueldo, int(datos.get("activo", True)), socio_id, empresa_id))
        return socio_id


def socios(conn, empresa_id, solo_activos=False):
    filtro = " AND activo = 1" if solo_activos else ""
    return conn.execute(f"SELECT * FROM socios WHERE empresa_id = ?{filtro} ORDER BY nombre", (empresa_id,)).fetchall()


def eliminar_socio(conn, empresa_id, socio_id):
    if conn.execute("SELECT 1 FROM sueldos_empresariales WHERE socio_id = ?", (socio_id,)).fetchone():
        raise ErrorValidacion("El socio tiene liquidaciones registradas; desactívalo en lugar de eliminarlo.")
    with conn:
        conn.execute("DELETE FROM socios WHERE id = ? AND empresa_id = ?", (socio_id, empresa_id))


def liquidaciones(conn, empresa_id, periodo):
    return conn.execute(
        """SELECT s.*, so.nombre, so.rut, a.tipo AS asiento_tipo, a.numero AS asiento_numero
           FROM sueldos_empresariales s JOIN socios so ON so.id = s.socio_id
           LEFT JOIN asientos a ON a.id = s.asiento_id
           WHERE s.empresa_id = ? AND s.periodo = ? ORDER BY so.nombre""", (empresa_id, periodo)).fetchall()


def guardar_liquidacion(conn, empresa_id, socio_id, periodo, bruto, afp=0, salud=0, valor_utm=None):
    """Calcula y guarda (o reemplaza) la liquidación del socio en el mes."""
    socio = conn.execute("SELECT * FROM socios WHERE id = ? AND empresa_id = ?", (socio_id, empresa_id)).fetchone()
    if socio is None:
        raise ErrorValidacion("El socio no existe.")
    valor_utm = valor_utm or utm(conn, periodo)
    if not valor_utm:
        raise ErrorValidacion(f"Falta el valor de la UTM de {nombre_periodo(periodo)}.")
    for nombre, valor in (("Sueldo bruto", bruto), ("AFP", afp), ("Salud", salud)):
        _monto(valor, nombre)
    if bruto <= 0:
        raise ErrorValidacion(f"{socio['nombre']}: el sueldo bruto debe ser mayor que cero.")
    actual = conn.execute("SELECT id, asiento_id FROM sueldos_empresariales WHERE socio_id = ? AND periodo = ?",
                          (socio_id, periodo)).fetchone()
    if actual and actual["asiento_id"] is not None:
        raise ErrorValidacion(f"La liquidación de {socio['nombre']} de {nombre_periodo(periodo)} ya está contabilizada; "
                              "elimina primero su asiento para modificarla.")
    l = calcular_liquidacion(bruto, afp, salud, valor_utm)
    with conn:
        if actual:
            conn.execute("""UPDATE sueldos_empresariales SET bruto = ?, afp = ?, salud = ?, base = ?, utm = ?,
                            impuesto_unico = ?, liquido = ? WHERE id = ?""",
                         (l["bruto"], l["afp"], l["salud"], l["base"], l["utm"], l["impuesto_unico"], l["liquido"],
                          actual["id"]))
            return actual["id"]
        return conn.execute(
            """INSERT INTO sueldos_empresariales (empresa_id, socio_id, periodo, bruto, afp, salud, base, utm,
               impuesto_unico, liquido) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (empresa_id, socio_id, periodo, l["bruto"], l["afp"], l["salud"], l["base"], l["utm"],
             l["impuesto_unico"], l["liquido"])).lastrowid


def eliminar_liquidacion(conn, empresa_id, liquidacion_id):
    with conn:
        return conn.execute("DELETE FROM sueldos_empresariales WHERE id = ? AND empresa_id = ? AND asiento_id IS NULL",
                            (liquidacion_id, empresa_id)).rowcount


# ==========================================================================
# Honorarios
# ==========================================================================

def tasa_retencion(anio):
    if anio in TASAS_RETENCION:
        return TASAS_RETENCION[anio]
    return TASAS_RETENCION[max(TASAS_RETENCION)] if anio > max(TASAS_RETENCION) else TASAS_RETENCION[min(TASAS_RETENCION)]


def calcular_boleta(monto, es_liquido, tasa):
    """Devuelve (bruto, retención, líquido). Con `es_liquido`, el monto es lo que
    se paga y el bruto se calcula como líquido / (1 − tasa)."""
    t = Decimal(str(tasa)) / 100
    if es_liquido:
        bruto = _pesos(Decimal(monto) / (1 - t))
        retencion = bruto - monto
    else:
        bruto = monto
        retencion = _pesos(Decimal(monto) * t)
    return bruto, retencion, bruto - retencion


def boletas(conn, empresa_id, periodo):
    return conn.execute(
        """SELECT h.*, a.tipo AS asiento_tipo, a.numero AS asiento_numero FROM honorarios h
           LEFT JOIN asientos a ON a.id = h.asiento_id
           WHERE h.empresa_id = ? AND h.periodo = ? ORDER BY h.fecha, h.folio""", (empresa_id, periodo)).fetchall()


def guardar_boleta(conn, empresa_id, periodo, datos, boleta_id=None):
    """Agrega o modifica una boleta. `datos`: tipo (BHE/BTE), folio, fecha, rut,
    nombre, monto (entero), es_liquido, sin_retencion, glosa."""
    tipo = datos.get("tipo")
    if tipo not in TIPOS_BOLETA:
        raise ErrorValidacion("Indica si es una boleta de honorarios recibida o una de prestación de servicios de terceros.")
    folio = str(datos.get("folio") or "").strip()
    if not folio:
        raise ErrorValidacion("El folio es obligatorio.")
    fecha = parse_fecha(datos.get("fecha"))
    rut = str(datos.get("rut") or "").strip()
    if not validar_rut(rut):
        raise ErrorValidacion("El RUT del prestador no es válido (revisa el dígito verificador).")
    rut = formatear_rut(rut)
    nombre = str(datos.get("nombre") or "").strip()
    if not nombre:
        raise ErrorValidacion("Ingresa el nombre del prestador.")
    monto = _monto(datos.get("monto") or 0, "Monto")
    if monto <= 0:
        raise ErrorValidacion("Ingresa el monto de la boleta.")
    tasa = 0.0 if datos.get("sin_retencion") else tasa_retencion(fecha.year)
    bruto, retencion, liquido = calcular_boleta(monto, bool(datos.get("es_liquido")) and tasa > 0, tasa)
    if boleta_id is not None:
        actual = conn.execute("SELECT asiento_id FROM honorarios WHERE id = ? AND empresa_id = ?",
                              (boleta_id, empresa_id)).fetchone()
        if actual is None:
            raise ErrorValidacion("La boleta no existe.")
        if actual["asiento_id"] is not None:
            raise ErrorValidacion("La boleta ya está contabilizada; elimina primero su asiento para modificarla.")
    repetida = conn.execute("SELECT 1 FROM honorarios WHERE empresa_id = ? AND tipo = ? AND rut = ? AND folio = ? "
                            "AND id IS NOT ?", (empresa_id, tipo, rut, folio, boleta_id)).fetchone()
    if repetida:
        raise ErrorValidacion(f"Ya existe la boleta folio {folio} del RUT {rut}.")
    valores = (periodo, tipo, folio, fecha.isoformat(), rut, nombre, bruto, tasa, retencion, liquido,
               str(datos.get("glosa") or "").strip())
    with conn:
        if boleta_id is None:
            return conn.execute(
                """INSERT INTO honorarios (empresa_id, periodo, tipo, folio, fecha, rut, nombre, bruto, tasa, retencion,
                   liquido, glosa) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", (empresa_id, *valores)).lastrowid
        conn.execute("""UPDATE honorarios SET periodo = ?, tipo = ?, folio = ?, fecha = ?, rut = ?, nombre = ?, bruto = ?,
                        tasa = ?, retencion = ?, liquido = ?, glosa = ? WHERE id = ?""", (*valores, boleta_id))
        return boleta_id


def eliminar_boleta(conn, empresa_id, boleta_id):
    with conn:
        return conn.execute("DELETE FROM honorarios WHERE id = ? AND empresa_id = ? AND asiento_id IS NULL",
                            (boleta_id, empresa_id)).rowcount


# ==========================================================================
# Propuestas de asiento
# ==========================================================================

def _cuenta(cuentas, concepto):
    from .tributario import CONCEPTOS

    if not cuentas.get(concepto):
        raise ErrorValidacion(f"Falta configurar la cuenta «{CONCEPTOS[concepto][0]}» en Tributario → Cuentas tributarias.")
    return cuentas[concepto]


def _lineas(conn, empresa_id, netos):
    codigos = {r[0]: r[1] for r in conn.execute("SELECT id, codigo FROM cuentas WHERE empresa_id = ?", (empresa_id,))}
    deudoras = sorted((c for c, n in netos.items() if n > 0), key=lambda c: codigos[c])
    acreedoras = sorted((c for c, n in netos.items() if n < 0), key=lambda c: codigos[c])
    return ([{"cuenta_id": c, "debe": netos[c], "haber": 0, "glosa": ""} for c in deudoras]
            + [{"cuenta_id": c, "debe": 0, "haber": -netos[c], "glosa": ""} for c in acreedoras])


def propuesta_sueldos(conn, empresa_id, periodo):
    from .tributario import cuentas_tributarias, ultimo_dia

    pendientes = [l for l in liquidaciones(conn, empresa_id, periodo) if l["asiento_id"] is None]
    if not pendientes:
        raise ErrorValidacion(f"No hay liquidaciones de sueldo empresarial pendientes en {nombre_periodo(periodo)}.")
    cuentas = cuentas_tributarias(conn, empresa_id)
    netos = defaultdict(int)
    for l in pendientes:
        netos[_cuenta(cuentas, "sueldo_empresarial")] += l["bruto"]
        if l["impuesto_unico"]:
            netos[_cuenta(cuentas, "impuesto_unico")] -= l["impuesto_unico"]
        if l["afp"]:
            netos[_cuenta(cuentas, "afp_por_pagar")] -= l["afp"]
        if l["salud"]:
            netos[_cuenta(cuentas, "salud_por_pagar")] -= l["salud"]
        netos[_cuenta(cuentas, "pago_sueldos")] -= l["liquido"]
    return {"ids": [l["id"] for l in pendientes], "lineas": _lineas(conn, empresa_id, netos),
            "fecha": ultimo_dia(periodo), "glosa": f"SUELDO EMPRESARIAL {_mes(periodo)}",
            "cantidad": len(pendientes), "periodo": periodo}


def propuesta_honorarios(conn, empresa_id, periodo):
    from .tributario import cuentas_tributarias, ultimo_dia

    pendientes = [b for b in boletas(conn, empresa_id, periodo) if b["asiento_id"] is None]
    if not pendientes:
        raise ErrorValidacion(f"No hay boletas de honorarios pendientes en {nombre_periodo(periodo)}.")
    cuentas = cuentas_tributarias(conn, empresa_id)
    netos = defaultdict(int)
    for b in pendientes:
        netos[_cuenta(cuentas, "honorarios_gasto")] += b["bruto"]
        if b["retencion"]:
            netos[_cuenta(cuentas, "retencion_honorarios")] -= b["retencion"]
        netos[_cuenta(cuentas, "honorarios_pago")] -= b["liquido"]
    return {"ids": [b["id"] for b in pendientes], "lineas": _lineas(conn, empresa_id, netos),
            "fecha": ultimo_dia(periodo), "glosa": f"HONORARIOS {_mes(periodo)}",
            "cantidad": len(pendientes), "periodo": periodo}


def marcar_contabilizados(conn, empresa_id, tabla, ids, asiento_id):
    assert tabla in ("sueldos_empresariales", "honorarios")
    with conn:
        for i in ids:
            conn.execute(f"UPDATE {tabla} SET asiento_id = ? WHERE id = ? AND empresa_id = ? AND asiento_id IS NULL",
                         (asiento_id, i, empresa_id))


def totales_del_mes(conn, empresa_id, periodo):
    """Retenciones e impuesto único del mes según estos módulos (para el F29)."""
    ret = conn.execute("SELECT COALESCE(SUM(retencion), 0), COUNT(*) FROM honorarios WHERE empresa_id = ? AND periodo = ?",
                       (empresa_id, periodo)).fetchone()
    iu = conn.execute("SELECT COALESCE(SUM(impuesto_unico), 0), COUNT(*) FROM sueldos_empresariales "
                      "WHERE empresa_id = ? AND periodo = ?", (empresa_id, periodo)).fetchone()
    return {"retencion_honorarios": ret[0], "boletas": ret[1], "impuesto_unico": iu[0], "liquidaciones": iu[1]}


# ==========================================================================
# Historiales
# ==========================================================================

def historial_liquidaciones(conn, empresa_id, anio=None):
    """Liquidaciones de todos los meses (o de un año), del mes más reciente al más antiguo."""
    filtro, params = "", [empresa_id]
    if anio:
        filtro, params = " AND s.periodo LIKE ?", [empresa_id, f"{anio}-%"]
    return conn.execute(
        f"""SELECT s.*, so.nombre, so.rut, a.numero AS asiento_numero
            FROM sueldos_empresariales s JOIN socios so ON so.id = s.socio_id
            LEFT JOIN asientos a ON a.id = s.asiento_id
            WHERE s.empresa_id = ?{filtro} ORDER BY s.periodo DESC, so.nombre""", params).fetchall()


def historial_boletas(conn, empresa_id, anio=None):
    """Boletas de honorarios de todos los meses (o de un año), del mes más reciente al más antiguo."""
    filtro, params = "", [empresa_id]
    if anio:
        filtro, params = " AND h.periodo LIKE ?", [empresa_id, f"{anio}-%"]
    return conn.execute(
        f"""SELECT h.*, a.numero AS asiento_numero FROM honorarios h LEFT JOIN asientos a ON a.id = h.asiento_id
            WHERE h.empresa_id = ?{filtro} ORDER BY h.periodo DESC, h.fecha, h.folio""", params).fetchall()


def anios_historial(conn, empresa_id, tabla):
    assert tabla in ("sueldos_empresariales", "honorarios")
    return [r[0] for r in conn.execute(f"SELECT DISTINCT substr(periodo, 1, 4) FROM {tabla} WHERE empresa_id = ? "
                                       "ORDER BY 1 DESC", (empresa_id,))]


def agrupar_por_mes(filas):
    """[(periodo, [filas])] conservando el orden."""
    grupos = []
    for f in filas:
        if not grupos or grupos[-1][0] != f["periodo"]:
            grupos.append((f["periodo"], []))
        grupos[-1][1].append(f)
    return grupos
