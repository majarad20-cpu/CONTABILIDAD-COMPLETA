"""Registro de Compras y Ventas (RCV), centralización y borrador del F29.

- Lee los CSV de detalle del RCV que se descargan del SII (compras o ventas).
- Centraliza los documentos de un mes en un asiento (propuesta editable).
- Calcula el borrador del F29 a partir del RCV y de la contabilidad.

Los códigos del F29 se muestran como referencia; el formulario oficial del SII
es el que vale.
"""
import calendar
import csv
import io
import json
import re
import unicodedata
from collections import defaultdict
from datetime import date

from .nucleo import MESES, ErrorValidacion, formatear_rut, libro_mayor, nombre_periodo, obtener_cuenta

TIPOS_DOCUMENTO = {
    29: "Factura de inicio", 30: "Factura", 32: "Factura exenta", 33: "Factura electrónica",
    34: "Factura exenta electrónica", 35: "Boleta", 38: "Boleta exenta", 39: "Boleta electrónica",
    41: "Boleta exenta electrónica", 43: "Liquidación factura", 45: "Factura de compra",
    46: "Factura de compra electrónica", 48: "Comprobante de pago electrónico", 55: "Nota de débito",
    56: "Nota de débito electrónica", 60: "Nota de crédito", 61: "Nota de crédito electrónica",
    110: "Factura de exportación", 111: "Nota de débito de exportación", 112: "Nota de crédito de exportación",
    914: "Declaración de ingreso (importación)",
}
NOTAS_CREDITO = {60, 61, 112}
NOTAS_DEBITO = {55, 56, 111}
FACTURAS = {29, 30, 33, 43, 45, 46}
FACTURAS_EXENTAS = {32, 34, 110}
BOLETAS = {35, 39}                 # boletas afectas
BOLETAS_EXENTAS = {38, 41}
COMPROBANTES_PAGO = {48}           # vouchers de pago electrónico (tarjetas)
IMPORTACIONES = {914}
# Documentos que el SII informa resumidos por mes (no vienen en el CSV de detalle)
TIPOS_RESUMEN = {39: "Boleta electrónica", 41: "Boleta exenta electrónica",
                 48: "Comprobante de pago electrónico", 35: "Boleta (papel)", 38: "Boleta exenta (papel)"}
RUT_CONSUMIDOR_FINAL = "66.666.666-6"
TASA_IVA = 0.19


def signo(tipo_doc):
    """Las notas de crédito restan."""
    return -1 if tipo_doc in NOTAS_CREDITO else 1


def nombre_tipo(tipo_doc):
    return TIPOS_DOCUMENTO.get(tipo_doc, f"Documento {tipo_doc}")


def validar_periodo(periodo):
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", periodo or ""):
        raise ErrorValidacion("Período inválido; usa el formato AAAA-MM.")
    return periodo


def periodo_anterior(periodo):
    anio, mes = int(periodo[:4]), int(periodo[5:])
    return f"{anio - 1}-12" if mes == 1 else f"{anio}-{mes - 1:02d}"


def ultimo_dia(periodo):
    anio, mes = int(periodo[:4]), int(periodo[5:])
    return f"{periodo}-{calendar.monthrange(anio, mes)[1]:02d}"


# ==========================================================================
# Lectura del CSV del SII
# ==========================================================================

def _normalizar(texto):
    texto = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", texto.lower()).strip()


def _entero(valor):
    t = (valor or "").strip().replace("$", "").replace(" ", "")
    if t in ("", "-"):
        return 0
    if re.fullmatch(r"-?\d{1,3}(\.\d{3})+", t):  # 1.234.567
        t = t.replace(".", "")
    try:
        return round(float(t.replace(",", ".")))
    except ValueError:
        raise ErrorValidacion(f"Monto inválido en el archivo: «{valor}».") from None


def _fecha(valor):
    t = (valor or "").strip()
    m = re.fullmatch(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", t)
    if m:
        d, mes, a = map(int, m.groups())
    else:
        m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", t[:10])
        if not m:
            raise ErrorValidacion(f"Fecha inválida en el archivo: «{valor}».")
        a, mes, d = map(int, m.groups())
    try:
        return date(a, mes, d).isoformat()
    except ValueError:
        raise ErrorValidacion(f"Fecha inválida en el archivo: «{valor}».") from None


COLUMNAS = {
    "tipo_doc": ["tipo doc", "tipo documento", "tipo dte"],
    "rut_proveedor": ["rut proveedor"],
    "rut_cliente": ["rut cliente", "rut receptor"],
    "razon_social": ["razon social"],
    "folio": ["folio"],
    "fecha": ["fecha docto", "fecha documento", "fecha emision"],
    "exento": ["monto exento"],
    "neto": ["monto neto"],
    "iva_recuperable": ["monto iva recuperable"],
    "iva": ["monto iva"],
    "iva_no_recuperable": ["monto iva no recuperable"],
    "total": ["monto total"],
    "neto_activo_fijo": ["monto neto activo fijo"],
    "otro_impuesto": ["valor otro impuesto", "valor otro imp"],
    "sin_credito": ["impto sin derecho a credito"],
}


def _leer_resumen(filas, encabezado):
    """Lee el CSV de resumen de ventas del RCV (una línea por tipo de documento,
    con el código entre paréntesis, p. ej. «Total Oper. del mes Boleta Electr.(39)»)."""
    if {"iva recuperable", "monto iva recuperable", "iva no recuperable", "monto iva no recuperable"} & set(encabezado):
        raise ErrorValidacion("Es un resumen de compras: para las compras importa el CSV de detalle, que trae "
                              "cada documento.")
    necesarias = {"tipo documento": None, "total documentos": None, "monto exento": None, "monto neto": None,
                  "monto iva": None, "monto total": None}
    for nombre in necesarias:
        if nombre not in encabezado:
            raise ErrorValidacion(f"El resumen no tiene la columna «{nombre}».")
        necesarias[nombre] = encabezado.index(nombre)
    resumenes = []
    for numero, fila in enumerate(filas[1:], start=2):
        if not any(c.strip() for c in fila):
            continue
        codigo = re.search(r"\((\d+)\)", fila[necesarias["tipo documento"]] if fila else "")
        if not codigo:
            continue  # líneas de totales u otras sin tipo de documento
        try:
            d = {"tipo_doc": int(codigo.group(1)),
                 "descripcion": fila[necesarias["tipo documento"]].strip(),
                 "cantidad": _entero(fila[necesarias["total documentos"]]),
                 "exento": _entero(fila[necesarias["monto exento"]]),
                 "neto": _entero(fila[necesarias["monto neto"]]),
                 "iva": _entero(fila[necesarias["monto iva"]]),
                 "total": _entero(fila[necesarias["monto total"]])}
        except (ErrorValidacion, IndexError) as e:
            raise ErrorValidacion(f"Fila {numero}: {e or 'faltan columnas'}") from None
        if d["cantidad"] > 0 and d["total"]:
            resumenes.append(d)
    return resumenes


def leer_csv_rcv(contenido):
    """Lee un CSV del RCV del SII. Devuelve (registro, documentos): registro es
    'COMPRA' o 'VENTA' para los CSV de detalle, o 'RESUMEN' para el resumen de
    ventas (una línea por tipo de documento)."""
    if not contenido:
        raise ErrorValidacion("El archivo está vacío.")
    for codificacion in ("utf-8-sig", "cp1252"):
        try:
            texto = contenido.decode(codificacion)
            break
        except UnicodeDecodeError:
            continue
    primera = texto.splitlines()[0] if texto.splitlines() else ""
    separador = ";" if primera.count(";") >= primera.count(",") else ","
    filas = list(csv.reader(io.StringIO(texto), delimiter=separador))
    if len(filas) < 2:
        raise ErrorValidacion("El archivo no tiene documentos.")
    encabezado = [_normalizar(c) for c in filas[0]]
    if "total documentos" in encabezado and not ({"rut proveedor", "rut cliente"} & set(encabezado)):
        return "RESUMEN", _leer_resumen(filas, encabezado)

    def columna(clave, obligatoria=True):
        for candidato in COLUMNAS[clave]:
            if candidato in encabezado:
                return encabezado.index(candidato)
        if obligatoria:
            raise ErrorValidacion(f"No se encontró la columna «{COLUMNAS[clave][0]}». "
                                  "¿Es el CSV de detalle del Registro de Compras y Ventas del SII?")
        return None

    if columna("rut_proveedor", False) is not None:
        registro, rut_col = "COMPRA", columna("rut_proveedor")
        iva_col = columna("iva_recuperable")
    elif columna("rut_cliente", False) is not None:
        registro, rut_col = "VENTA", columna("rut_cliente")
        iva_col = columna("iva")
    else:
        raise ErrorValidacion("No se reconoce el archivo: debe tener la columna «RUT Proveedor» (compras) "
                              "o «Rut cliente» (ventas), como el CSV del Registro de Compras y Ventas del SII.")
    idx = {clave: columna(clave) for clave in ("tipo_doc", "razon_social", "folio", "fecha", "exento", "neto", "total")}
    opcionales = {clave: columna(clave, False) for clave in
                  ("iva_no_recuperable", "neto_activo_fijo", "otro_impuesto", "sin_credito")}

    def valor(fila, i):
        return fila[i] if i is not None and i < len(fila) else ""

    documentos = []
    for numero, fila in enumerate(filas[1:], start=2):
        if not any(c.strip() for c in fila):
            continue
        try:
            tipo_doc = int(_entero(valor(fila, idx["tipo_doc"])))
            d = {
                "tipo_doc": tipo_doc,
                "rut": formatear_rut(valor(fila, rut_col).strip()),
                "razon_social": valor(fila, idx["razon_social"]).strip(),
                "folio": valor(fila, idx["folio"]).strip(),
                "fecha": _fecha(valor(fila, idx["fecha"])),
                "exento": _entero(valor(fila, idx["exento"])),
                "neto": _entero(valor(fila, idx["neto"])),
                "iva": _entero(valor(fila, iva_col)),
                "iva_no_recuperable": _entero(valor(fila, opcionales["iva_no_recuperable"])),
                "otros_impuestos": (_entero(valor(fila, opcionales["otro_impuesto"]))
                                    + _entero(valor(fila, opcionales["sin_credito"]))),
                "total": _entero(valor(fila, idx["total"])),
                "activo_fijo": int(_entero(valor(fila, opcionales["neto_activo_fijo"])) > 0),
            }
        except ErrorValidacion as e:
            raise ErrorValidacion(f"Fila {numero}: {e}") from None
        if not d["folio"]:
            raise ErrorValidacion(f"Fila {numero}: falta el folio.")
        # Lo que no calce con el total (p. ej. IVA de uso común o impuestos
        # adicionales) se registra como otros impuestos, para que el total cuadre.
        d["otros_impuestos"] += d["total"] - (d["exento"] + d["neto"] + d["iva"] + d["iva_no_recuperable"]
                                              + d["otros_impuestos"])
        documentos.append(d)
    if not documentos:
        raise ErrorValidacion("El archivo no tiene documentos.")
    return registro, documentos


# ==========================================================================
# Cuentas de centralización y del F29
# ==========================================================================

CONCEPTOS = {
    # concepto: (descripción, tipos de cuenta aceptados, patrones de nombre para sugerirla)
    "compras_neto": ("Compras: neto y exento (cuenta por defecto)", ("ACTIVO", "GASTO"),
                     (r"insumos", r"^compras", r"mercader", r"costo de ventas?", r"gastos generales")),
    "compras_activo_fijo": ("Compras de activo fijo", ("ACTIVO",),
                            (r"maquinarias?", r"activo fijo", r"equipos")),
    "iva_credito": ("IVA crédito fiscal", ("ACTIVO",), (r"^iva cr[ée]dito", r"cr[ée]dito fiscal")),
    "compras_otros_impuestos": ("Compras: otros impuestos (específico, sin derecho a crédito)", ("ACTIVO", "GASTO"),
                                (r"impuestos? no recuperables?", r"impuesto espec[ií]fico", r"otros impuestos")),
    "proveedores": ("Proveedores", ("PASIVO",), (r"^proveedores",)),
    "ventas_neto": ("Ventas: neto (cuenta por defecto)", ("INGRESO",), (r"^ventas$", r"^ventas", r"ingresos por servicios")),
    "ventas_exento": ("Ventas exentas", ("INGRESO",), (r"ventas? exentas?", r"^ventas$", r"^ventas")),
    "iva_debito": ("IVA débito fiscal", ("PASIVO",), (r"^iva d[ée]bito", r"d[ée]bito fiscal")),
    "ventas_otros_impuestos": ("Ventas: otros impuestos", ("PASIVO",),
                               (r"impuestos? (adicional|por pagar)", r"^iva d[ée]bito")),
    "clientes": ("Clientes", ("ACTIVO",), (r"^clientes", r"deudores por ventas?")),
    "ventas_boletas": ("Ventas con boleta y comprobantes de pago: cuenta del total (caja, banco o clientes)",
                       ("ACTIVO",), (r"^clientes", r"deudores por ventas?", r"^caja")),
    "remanente_iva": ("Remanente de crédito fiscal (F29)", ("ACTIVO",), (r"remanente",)),
    "retencion_honorarios": ("Retención de honorarios por pagar (F29)", ("PASIVO",),
                             (r"retenci[oó]n.*(honorario|2da|segunda)",)),
    "impuesto_unico": ("Impuesto único por pagar (F29)", ("PASIVO",), (r"imp(uesto|to\.?) [uú]nico",)),
}
CONCEPTOS_COMPRA = ("compras_neto", "compras_activo_fijo", "iva_credito", "compras_otros_impuestos", "proveedores")
CONCEPTOS_VENTA = ("ventas_neto", "ventas_exento", "iva_debito", "ventas_otros_impuestos", "clientes",
                   "ventas_boletas")
CONCEPTOS_F29 = ("remanente_iva", "retencion_honorarios", "impuesto_unico")


def _sugerir(cuentas, concepto):
    _, tipos, patrones = CONCEPTOS[concepto]
    for patron in patrones:
        for c in cuentas:
            if c["tipo"] in tipos and re.search(patron, c["nombre"], re.IGNORECASE):
                return c["id"]
    return None


def cuentas_tributarias(conn, empresa_id):
    """concepto → cuenta_id (configurada o sugerida por nombre; None si no hay)."""
    cuentas = conn.execute(
        "SELECT id, codigo, nombre, tipo FROM cuentas WHERE empresa_id = ? AND imputable = 1 ORDER BY codigo",
        (empresa_id,)).fetchall()
    configuradas = {r[0]: r[1] for r in conn.execute(
        "SELECT concepto, cuenta_id FROM cuentas_tributarias WHERE empresa_id = ?", (empresa_id,))}
    return {concepto: configuradas.get(concepto) or _sugerir(cuentas, concepto) for concepto in CONCEPTOS}


def guardar_cuentas_tributarias(conn, empresa_id, asignacion, tasa_ppm=None):
    """`asignacion` es concepto → cuenta_id (o None para quitarla)."""
    for concepto, cuenta_id in asignacion.items():
        if concepto not in CONCEPTOS:
            continue
        if cuenta_id:
            cuenta = obtener_cuenta(conn, empresa_id, cuenta_id)
            if cuenta is None or not cuenta["imputable"]:
                raise ErrorValidacion(f"{CONCEPTOS[concepto][0]}: selecciona una cuenta imputable.")
    if tasa_ppm is not None:
        try:
            tasa = float(str(tasa_ppm).replace(",", "."))
        except ValueError:
            raise ErrorValidacion("La tasa de PPM debe ser un número, por ejemplo 0,25.") from None
        if not 0 <= tasa <= 100:
            raise ErrorValidacion("La tasa de PPM debe estar entre 0 y 100 %.")
    with conn:
        for concepto, cuenta_id in asignacion.items():
            if concepto not in CONCEPTOS:
                continue
            if cuenta_id:
                conn.execute("INSERT INTO cuentas_tributarias (empresa_id, concepto, cuenta_id) VALUES (?, ?, ?) "
                             "ON CONFLICT (empresa_id, concepto) DO UPDATE SET cuenta_id = excluded.cuenta_id",
                             (empresa_id, concepto, cuenta_id))
            else:
                conn.execute("DELETE FROM cuentas_tributarias WHERE empresa_id = ? AND concepto = ?",
                             (empresa_id, concepto))
        if tasa_ppm is not None:
            conn.execute("UPDATE empresas SET tasa_ppm = ? WHERE id = ?", (tasa, empresa_id))


# ==========================================================================
# Documentos del RCV
# ==========================================================================

def importar_rcv(conn, empresa_id, periodo, contenido):
    """Importa un CSV del RCV al período. Devuelve (registro, nuevos, repetidos).
    Para el resumen de ventas devuelve ('RESUMEN', resúmenes registrados,
    líneas omitidas porque esos documentos vienen en el CSV de detalle)."""
    validar_periodo(periodo)
    registro, documentos = leer_csv_rcv(contenido)
    if registro == "RESUMEN":
        resumenes = [d for d in documentos if d["tipo_doc"] in TIPOS_RESUMEN]
        for d in resumenes:  # verificar todo antes de escribir
            centralizado = conn.execute(
                "SELECT 1 FROM rcv_documentos WHERE empresa_id = ? AND registro = 'VENTA' AND tipo_doc = ? "
                "AND folio = ? AND asiento_id IS NOT NULL", (empresa_id, d["tipo_doc"], f"RESUMEN {periodo}")).fetchone()
            if centralizado:
                raise ErrorValidacion(f"El resumen de {TIPOS_RESUMEN[d['tipo_doc']].lower()} de {nombre_periodo(periodo)} "
                                      "ya está centralizado; elimina primero el asiento de centralización.")
        for d in resumenes:
            registrar_resumen_ventas(conn, empresa_id, periodo, d["tipo_doc"], d["cantidad"], d["total"],
                                     exento=d["exento"], neto=d["neto"], iva=d["iva"])
        return "RESUMEN", len(resumenes), len(documentos) - len(resumenes)
    cuentas_rut = {r[0]: r[1] for r in conn.execute(
        "SELECT rut, cuenta_id FROM rcv_cuentas_rut WHERE empresa_id = ? AND registro = ?", (empresa_id, registro))}
    nuevos = 0
    with conn:
        for d in documentos:
            cur = conn.execute(
                """INSERT OR IGNORE INTO rcv_documentos
                   (empresa_id, registro, periodo, tipo_doc, folio, fecha, rut, razon_social, exento, neto, iva,
                    iva_no_recuperable, otros_impuestos, total, activo_fijo, cuenta_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (empresa_id, registro, periodo, d["tipo_doc"], d["folio"], d["fecha"], d["rut"], d["razon_social"],
                 d["exento"], d["neto"], d["iva"], d["iva_no_recuperable"], d["otros_impuestos"], d["total"],
                 d["activo_fijo"], cuentas_rut.get(d["rut"])))
            nuevos += cur.rowcount
    return registro, nuevos, len(documentos) - nuevos


def documentos_rcv(conn, empresa_id, periodo, registro=None):
    condicion, params = "d.empresa_id = ? AND d.periodo = ?", [empresa_id, periodo]
    if registro:
        condicion += " AND d.registro = ?"
        params.append(registro)
    return conn.execute(
        f"""SELECT d.*, a.tipo AS asiento_tipo, a.numero AS asiento_numero
            FROM rcv_documentos d LEFT JOIN asientos a ON a.id = d.asiento_id
            WHERE {condicion} ORDER BY d.registro, d.fecha, d.tipo_doc, d.folio""", params).fetchall()


def totales_rcv(documentos):
    """Totales con signo (las notas de crédito restan) y cantidad de documentos."""
    t = defaultdict(int)
    for d in documentos:
        s = signo(d["tipo_doc"])
        for campo in ("exento", "neto", "iva", "iva_no_recuperable", "otros_impuestos", "total"):
            t[campo] += s * d[campo]
        t["cantidad"] += d["cantidad"]
        t["pendientes"] += d["asiento_id"] is None
    return dict(t)


def registrar_resumen_ventas(conn, empresa_id, periodo, tipo_doc, cantidad, total, exento=0, neto=None, iva=None):
    """Registra (o reemplaza) el resumen mensual de boletas o comprobantes de
    pago electrónico de un tipo. Si no se indican neto e IVA, se calculan
    desde el total con la tasa de IVA vigente. Devuelve el id del documento."""
    validar_periodo(periodo)
    if tipo_doc not in TIPOS_RESUMEN:
        raise ErrorValidacion("Tipo de documento inválido para un resumen de ventas.")
    if cantidad is None or cantidad < 1:
        raise ErrorValidacion("Indica la cantidad de documentos emitidos en el mes.")
    if total is None or total <= 0:
        raise ErrorValidacion("Indica el monto total del mes.")
    exento = exento or 0
    if tipo_doc in BOLETAS_EXENTAS:
        exento, neto, iva = total, 0, 0
    elif neto is None and iva is None:
        if not 0 <= exento <= total:
            raise ErrorValidacion("El monto exento no puede ser mayor que el total.")
        neto = round((total - exento) / (1 + TASA_IVA))
        iva = total - exento - neto
    elif neto is None or iva is None:
        raise ErrorValidacion("Si ingresas el neto o el IVA, ingresa ambos.")
    if exento + neto + iva != total:
        raise ErrorValidacion(f"Exento + neto + IVA (${exento + neto + iva:,.0f}) no coincide con el total "
                              f"(${total:,.0f}).".replace(",", "."))
    folio = f"RESUMEN {periodo}"
    existente = conn.execute(
        "SELECT id, asiento_id FROM rcv_documentos WHERE empresa_id = ? AND registro = 'VENTA' AND tipo_doc = ? "
        "AND rut = ? AND folio = ?", (empresa_id, tipo_doc, RUT_CONSUMIDOR_FINAL, folio)).fetchone()
    if existente and existente["asiento_id"] is not None:
        raise ErrorValidacion(f"El resumen de {TIPOS_RESUMEN[tipo_doc].lower()} de {nombre_periodo(periodo)} ya "
                              "está centralizado; elimina primero el asiento de centralización para cambiarlo.")
    with conn:
        if existente:
            conn.execute("UPDATE rcv_documentos SET cantidad = ?, exento = ?, neto = ?, iva = ?, total = ? WHERE id = ?",
                         (cantidad, exento, neto, iva, total, existente["id"]))
            return existente["id"]
        return conn.execute(
            """INSERT INTO rcv_documentos (empresa_id, registro, periodo, tipo_doc, folio, fecha, rut, razon_social,
               exento, neto, iva, total, cantidad) VALUES (?, 'VENTA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (empresa_id, periodo, tipo_doc, folio, ultimo_dia(periodo), RUT_CONSUMIDOR_FINAL,
             f"Resumen {TIPOS_RESUMEN[tipo_doc].lower()}", exento, neto, iva, total, cantidad)).lastrowid


def asignar_cuentas(conn, empresa_id, asignacion, recordar=True):
    """`asignacion` es documento_id → cuenta_id (None = cuenta por defecto).
    Si `recordar`, la cuenta queda como habitual del RUT."""
    with conn:
        for doc_id, cuenta_id in asignacion.items():
            doc = conn.execute("SELECT * FROM rcv_documentos WHERE id = ? AND empresa_id = ?",
                               (doc_id, empresa_id)).fetchone()
            if doc is None or doc["asiento_id"] is not None:
                continue  # los centralizados no se tocan
            if cuenta_id and obtener_cuenta(conn, empresa_id, cuenta_id) is None:
                continue
            conn.execute("UPDATE rcv_documentos SET cuenta_id = ? WHERE id = ?", (cuenta_id, doc_id))
            if recordar and cuenta_id:
                conn.execute("INSERT INTO rcv_cuentas_rut (empresa_id, registro, rut, cuenta_id) VALUES (?, ?, ?, ?) "
                             "ON CONFLICT (empresa_id, registro, rut) DO UPDATE SET cuenta_id = excluded.cuenta_id",
                             (empresa_id, doc["registro"], doc["rut"], cuenta_id))


def eliminar_documentos(conn, empresa_id, ids):
    """Elimina documentos pendientes (no centralizados). Devuelve cuántos."""
    with conn:
        total = 0
        for doc_id in ids:
            total += conn.execute(
                "DELETE FROM rcv_documentos WHERE id = ? AND empresa_id = ? AND asiento_id IS NULL",
                (doc_id, empresa_id)).rowcount
    return total


def marcar_centralizados(conn, empresa_id, ids, asiento_id):
    with conn:
        for doc_id in ids:
            conn.execute("UPDATE rcv_documentos SET asiento_id = ? WHERE id = ? AND empresa_id = ? "
                         "AND asiento_id IS NULL", (asiento_id, doc_id, empresa_id))


# ==========================================================================
# Centralización
# ==========================================================================

def propuesta_centralizacion(conn, empresa_id, periodo, registro):
    """Propone el asiento que centraliza los documentos pendientes del mes.
    No guarda nada."""
    validar_periodo(periodo)
    docs = [d for d in documentos_rcv(conn, empresa_id, periodo, registro) if d["asiento_id"] is None]
    nombre_registro = "compras" if registro == "COMPRA" else "ventas"
    if not docs:
        raise ErrorValidacion(f"No hay documentos de {nombre_registro} pendientes de centralizar en "
                              f"{nombre_periodo(periodo)}.")
    cuentas = cuentas_tributarias(conn, empresa_id)

    def cuenta(concepto):
        if not cuentas.get(concepto):
            raise ErrorValidacion(f"Falta configurar la cuenta «{CONCEPTOS[concepto][0]}» "
                                  "en Tributario → Cuentas tributarias.")
        return cuentas[concepto]

    netos = defaultdict(int)  # cuenta_id → debe - haber
    for d in docs:
        s = signo(d["tipo_doc"])
        if registro == "COMPRA":
            gasto = d["cuenta_id"] or cuenta("compras_activo_fijo" if d["activo_fijo"] else "compras_neto")
            netos[gasto] += s * (d["neto"] + d["exento"] + d["iva_no_recuperable"])
            if d["iva"]:
                netos[cuenta("iva_credito")] += s * d["iva"]
            if d["otros_impuestos"]:
                netos[cuenta("compras_otros_impuestos")] += s * d["otros_impuestos"]
            netos[cuenta("proveedores")] -= s * d["total"]
        else:
            es_resumen = d["tipo_doc"] in TIPOS_RESUMEN
            netos[cuenta("ventas_boletas" if es_resumen else "clientes")] += s * d["total"]
            if d["neto"]:
                netos[d["cuenta_id"] or cuenta("ventas_neto")] -= s * d["neto"]
            if d["exento"]:
                netos[d["cuenta_id"] or cuenta("ventas_exento")] -= s * d["exento"]
            if d["iva"]:
                netos[cuenta("iva_debito")] -= s * d["iva"]
            if d["otros_impuestos"]:
                netos[cuenta("ventas_otros_impuestos")] -= s * d["otros_impuestos"]

    codigos = {r[0]: r[1] for r in conn.execute("SELECT id, codigo FROM cuentas WHERE empresa_id = ?", (empresa_id,))}
    deudoras = sorted((c for c, n in netos.items() if n > 0), key=lambda c: codigos[c])
    acreedoras = sorted((c for c, n in netos.items() if n < 0), key=lambda c: codigos[c])
    lineas = ([{"cuenta_id": c, "debe": netos[c], "haber": 0, "glosa": ""} for c in deudoras]
              + [{"cuenta_id": c, "debe": 0, "haber": -netos[c], "glosa": ""} for c in acreedoras])
    mes = MESES[int(periodo[5:]) - 1].upper()
    return {
        "registro": registro, "periodo": periodo, "documentos": [d["id"] for d in docs],
        "cantidad": len(docs), "totales": totales_rcv(docs), "lineas": lineas,
        "fecha": ultimo_dia(periodo),
        "glosa": f"CENTRALIZACIÓN {'COMPRAS' if registro == 'COMPRA' else 'VENTAS'} {mes} {periodo[:4]}",
    }


# ==========================================================================
# Borrador del F29
# ==========================================================================

def _movimiento(conn, empresa_id, cuenta_id, periodo, excluir_solo_iva=None):
    """(debe, haber) de la cuenta en el mes. Con `excluir_solo_iva` (conjunto de
    cuentas) se omiten los asientos cuyas líneas usan solo esas cuentas, es
    decir, los ajustes que traspasan IVA entre cuentas de IVA."""
    if not cuenta_id:
        return 0, 0
    filtro, params = "", [cuenta_id, empresa_id, f"{periodo}-01", ultimo_dia(periodo)]
    if excluir_solo_iva:
        marcas = ",".join("?" * len(excluir_solo_iva))
        filtro = f"""AND EXISTS (SELECT 1 FROM lineas x WHERE x.asiento_id = a.id
                                 AND x.cuenta_id NOT IN ({marcas}))"""
        params += list(excluir_solo_iva)
    fila = conn.execute(
        f"""SELECT COALESCE(SUM(l.debe), 0), COALESCE(SUM(l.haber), 0) FROM lineas l
            JOIN asientos a ON a.id = l.asiento_id
            WHERE l.cuenta_id = ? AND a.empresa_id = ? AND a.fecha BETWEEN ? AND ? {filtro}""", params).fetchone()
    return fila[0], fila[1]


def borrador_guardado(conn, empresa_id, periodo):
    fila = conn.execute("SELECT datos, guardado_en FROM f29_borradores WHERE empresa_id = ? AND periodo = ?",
                        (empresa_id, periodo)).fetchone()
    if fila is None:
        return None
    return json.loads(fila[0]) | {"guardado_en": fila[1]}


def guardar_borrador(conn, empresa_id, periodo, datos):
    with conn:
        conn.execute("INSERT INTO f29_borradores (empresa_id, periodo, datos) VALUES (?, ?, ?) "
                     "ON CONFLICT (empresa_id, periodo) DO UPDATE SET datos = excluded.datos, "
                     "guardado_en = datetime('now', 'localtime')",
                     (empresa_id, periodo, json.dumps(datos, ensure_ascii=False)))


def valores_iniciales_f29(conn, empresa_id, periodo):
    """Remanente anterior y UTM sugeridos: del borrador guardado del período,
    del borrador del mes anterior o, si no hay, del saldo contable de la
    cuenta de remanente al cierre del mes anterior."""
    propio = borrador_guardado(conn, empresa_id, periodo)
    if propio:
        return {k: propio["entradas"].get(k) for k in ("remanente_anterior", "utm_anterior", "utm_actual")} | {
            "origen_remanente": propio["entradas"].get("origen_remanente", "borrador guardado")}
    anterior = periodo_anterior(periodo)
    previo = borrador_guardado(conn, empresa_id, anterior)
    if previo:
        return {"remanente_anterior": previo["codigos"].get("77", 0),
                "utm_anterior": previo["entradas"].get("utm_actual"), "utm_actual": None,
                "origen_remanente": f"código 77 del borrador de {nombre_periodo(anterior)}"}
    cuenta = cuentas_tributarias(conn, empresa_id)["remanente_iva"]
    remanente = 0
    if cuenta:
        m = libro_mayor(conn, empresa_id, cuenta, f"{anterior}-01", ultimo_dia(anterior))
        remanente = max(m["saldo_final"], 0) if m else 0
    return {"remanente_anterior": remanente, "utm_anterior": None, "utm_actual": None,
            "origen_remanente": f"saldo contable de la cuenta de remanente al {ultimo_dia(anterior)[8:]}/"
                                f"{anterior[5:]}/{anterior[:4]}"}


def calcular_f29(conn, empresa_id, periodo, remanente_anterior=0, utm_anterior=None, utm_actual=None,
                 tasa_ppm=None):
    """Calcula el borrador del F29 del período. Devuelve un dict con las
    líneas (código, concepto, cantidad, monto), los totales y las alertas."""
    validar_periodo(periodo)
    empresa = conn.execute("SELECT * FROM empresas WHERE id = ?", (empresa_id,)).fetchone()
    tasa = float(empresa["tasa_ppm"] if tasa_ppm is None else tasa_ppm)
    docs = documentos_rcv(conn, empresa_id, periodo)
    ventas = [d for d in docs if d["registro"] == "VENTA"]
    compras = [d for d in docs if d["registro"] == "COMPRA"]

    def suma(lista, tipos, campo="iva", condicion=lambda d: True):
        elegidos = [d for d in lista if d["tipo_doc"] in tipos and condicion(d)]
        return sum(d["cantidad"] for d in elegidos), sum(d[campo] for d in elegidos)

    c = {}
    # Débitos
    c["503"], c["502"] = suma(ventas, FACTURAS)
    c["110"], c["111"] = suma(ventas, BOLETAS)
    c["758"], c["759"] = suma(ventas, COMPROBANTES_PAGO)
    c["512"], c["513"] = suma(ventas, NOTAS_DEBITO)
    c["509"], c["510"] = suma(ventas, NOTAS_CREDITO)
    c["538"] = c["502"] + c["111"] + c["759"] + c["513"] - c["510"]
    c["142"] = sum(signo(d["tipo_doc"]) * d["exento"] for d in ventas)
    # Créditos
    c["519"], c["520"] = suma(compras, FACTURAS, condicion=lambda d: not d["activo_fijo"])
    c["524"], c["525"] = suma(compras, FACTURAS, condicion=lambda d: d["activo_fijo"])
    c["531"], c["532"] = suma(compras, NOTAS_DEBITO)
    c["527"], c["528"] = suma(compras, NOTAS_CREDITO)
    c["534"], c["535"] = suma(compras, IMPORTACIONES)
    remanente = int(remanente_anterior or 0)
    reajuste = 0
    if remanente and utm_anterior and utm_actual:
        reajuste = round(remanente * float(utm_actual) / float(utm_anterior)) - remanente
    c["504"] = remanente + reajuste
    c["537"] = c["520"] + c["525"] + c["532"] + c["535"] - c["528"] + c["504"]
    c["89"] = max(c["538"] - c["537"], 0)
    c["77"] = max(c["537"] - c["538"], 0)
    # PPM sobre los ingresos del giro (neto + exento de las ventas; las NC restan)
    c["563"] = sum(signo(d["tipo_doc"]) * (d["neto"] + d["exento"]) for d in ventas)
    c["115"] = tasa
    c["62"] = max(round(c["563"] * tasa / 100), 0)
    # Retenciones del mes según la contabilidad
    cuentas = cuentas_tributarias(conn, empresa_id)
    c["151"] = _movimiento(conn, empresa_id, cuentas["retencion_honorarios"], periodo)[1]
    c["48"] = _movimiento(conn, empresa_id, cuentas["impuesto_unico"], periodo)[1]
    c["91"] = c["89"] + c["62"] + c["151"] + c["48"]

    lineas = [
        ("titulo", "DÉBITOS (VENTAS)"),
        ("503", "502", "Facturas emitidas"),
        ("110", "111", "Boletas"),
        ("758", "759", "Comprobantes de pago electrónico (vouchers)"),
        ("512", "513", "Notas de débito emitidas"),
        ("509", "510", "Notas de crédito emitidas (restan)"),
        ("total", "538", "TOTAL DÉBITOS"),
        (None, "142", "Ventas exentas o no gravadas del giro (informativo)"),
        ("titulo", "CRÉDITOS (COMPRAS)"),
        ("519", "520", "Facturas recibidas del giro"),
        ("524", "525", "Facturas de activo fijo"),
        ("531", "532", "Notas de débito recibidas"),
        ("527", "528", "Notas de crédito recibidas (restan)"),
        ("534", "535", "Declaraciones de ingreso (importaciones)"),
        (None, "504", "Remanente de crédito fiscal del mes anterior (reajustado)"),
        ("total", "537", "TOTAL CRÉDITOS"),
        ("titulo", "IMPUESTO AL VALOR AGREGADO"),
        (None, "89", "IVA determinado (débitos − créditos)"),
        (None, "77", "Remanente de crédito fiscal para el período siguiente"),
        ("titulo", "PAGOS PROVISIONALES MENSUALES"),
        (None, "563", "Base imponible (ingresos del giro)"),
        (None, "115", "Tasa PPM (%)"),
        (None, "62", "PPM neto determinado"),
        ("titulo", "RETENCIONES"),
        (None, "151", "Retención de impuesto de 2ª categoría (honorarios)"),
        (None, "48", "Impuesto único de 2ª categoría (trabajadores)"),
        ("total", "91", "TOTAL A PAGAR"),
    ]

    # Comparación con la contabilidad
    alertas = []
    pendientes = [d for d in docs if d["asiento_id"] is None]
    if pendientes:
        alertas.append(f"Hay {len(pendientes)} documento(s) del RCV sin centralizar en {nombre_periodo(periodo)}.")
    if not docs:
        alertas.append(f"No hay documentos del RCV importados para {nombre_periodo(periodo)}.")
    cuentas_iva = {cuentas[k] for k in ("iva_debito", "iva_credito", "remanente_iva") if cuentas.get(k)}
    comparacion = []
    if cuentas.get("iva_debito"):
        debe, haber = _movimiento(conn, empresa_id, cuentas["iva_debito"], periodo, cuentas_iva)
        comparacion.append(("IVA débito fiscal", c["538"], haber - debe))
    if cuentas.get("iva_credito"):
        debe, haber = _movimiento(conn, empresa_id, cuentas["iva_credito"], periodo, cuentas_iva)
        comparacion.append(("IVA crédito fiscal del mes", c["537"] - c["504"], debe - haber))
    for concepto, segun_rcv, segun_contabilidad in comparacion:
        if segun_rcv != segun_contabilidad:
            alertas.append(f"{concepto}: el RCV indica ${segun_rcv:,.0f}".replace(",", ".")
                           + f" y la contabilidad ${segun_contabilidad:,.0f}".replace(",", ".")
                           + f" (diferencia ${segun_rcv - segun_contabilidad:,.0f}).".replace(",", "."))
    for concepto in ("iva_debito", "iva_credito"):
        if not cuentas.get(concepto):
            alertas.append(f"Falta configurar la cuenta «{CONCEPTOS[concepto][0]}» para comparar con la contabilidad.")
    if not tasa:
        alertas.append("La tasa de PPM es 0 %. Configúrala en Tributario → Cuentas tributarias.")
    if remanente and not (utm_anterior and utm_actual):
        alertas.append("Ingresa la UTM del mes anterior y la del mes actual para reajustar el remanente.")

    return {
        "periodo": periodo, "codigos": c, "lineas": lineas, "alertas": alertas, "comparacion": comparacion,
        "reajuste": reajuste, "documentos": len(docs), "pendientes": len(pendientes),
        "entradas": {"remanente_anterior": remanente, "utm_anterior": utm_anterior, "utm_actual": utm_actual,
                     "tasa_ppm": tasa},
    }
