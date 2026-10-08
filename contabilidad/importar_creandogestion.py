"""Importa empresas desde una base de datos SQLite del programa CreandoGestion.

Se importan los datos de la empresa, el plan de cuentas y los asientos.
Remuneraciones, RCV, libro de caja y honorarios no se importan.

Uso:
    python -m contabilidad.importar_creandogestion ORIGEN.db               (lista empresas)
    python -m contabilidad.importar_creandogestion ORIGEN.db ID [ID ...]   (importa)
"""
import argparse
import sqlite3
import sys
from collections import Counter
from datetime import date, datetime
from pathlib import Path

from . import db, nucleo
from .nucleo import ErrorValidacion

TIPOS = {"Activo": "ACTIVO", "Pasivo": "PASIVO", "Patrimonio": "PATRIMONIO",
         "Ganancia": "INGRESO", "Pérdida": "GASTO"}
BALANCE_POR_DIGITO = {"1": "ACTIVO", "2": "PASIVO", "3": "PATRIMONIO"}

# Nombres de grupos del plan estándar de CreandoGestion. Solo se usan si los
# tipos de las cuentas del grupo coinciden con los esperados.
GRUPOS_CONOCIDOS = {
    "1": ("ACTIVO", None), "2": ("PASIVO", None), "3": ("PATRIMONIO", None),
    "1.1": ("ACTIVO CIRCULANTE", None), "1.2": ("ACTIVO FIJO", None), "1.3": ("OTROS ACTIVOS", None),
    "2.1": ("PASIVO CIRCULANTE", None), "2.2": ("PASIVO DE LARGO PLAZO", None),
    "3.1": ("CAPITAL Y RESERVAS", None), "3.2": ("RESULTADOS ACUMULADOS", None),
    "4.1": ("INGRESOS DE EXPLOTACIÓN", {"INGRESO"}),
    "4.2": ("COSTOS DE EXPLOTACIÓN", {"GASTO"}),
    "4.3": ("GASTOS DE ADMINISTRACIÓN Y VENTAS", {"GASTO"}),
    "4.4": ("OTROS INGRESOS NO OPERACIONALES", {"INGRESO"}),
    "4.5": ("OTROS RESULTADOS NO OPERACIONALES", None),
}


def abrir_origen(ruta):
    conn = sqlite3.connect(f"file:{ruta}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    tablas = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    if not {"companies", "accounts", "entries", "entry_details"} <= tablas:
        conn.close()
        raise ErrorValidacion("El archivo no parece una base de datos de CreandoGestion.")
    return conn


def listar_empresas_origen(origen):
    return origen.execute(
        """SELECT c.*, (SELECT COUNT(*) FROM entries e WHERE e.company_id = c.id) AS asientos,
                  (SELECT COUNT(*) FROM accounts a WHERE a.company_id = c.id) AS cuentas
           FROM companies c ORDER BY c.name"""
    ).fetchall()


def _tipo_cuenta(codigo, tipo_origen, correcciones):
    """Devuelve (tipo, resultados_en_ocho). Las cuentas 1, 2 y 3 son de balance.
    Una cuenta de patrimonio marcada en el origen como Ganancia o Pérdida (p. ej.
    Utilidades acumuladas) queda como patrimonio en el Balance General y en la
    columna de Resultados del Balance de 8 columnas."""
    esperado = BALANCE_POR_DIGITO.get(codigo[0])
    tipo = TIPOS.get(tipo_origen)
    if tipo is None:
        raise ErrorValidacion(f"Tipo de cuenta desconocido «{tipo_origen}» en la cuenta {codigo}.")
    if esperado == "PATRIMONIO" and tipo in nucleo.TIPOS_RESULTADO:
        correcciones.append(f"{codigo}: «{tipo_origen}» → Patrimonio (en Resultados del Balance de 8 columnas)")
        return esperado, True
    if esperado and tipo != esperado:
        correcciones.append(f"{codigo}: «{tipo_origen}» → {nucleo.NOMBRES_TIPO[esperado]}")
        return esperado, False
    return tipo, False


def _grupos(hojas):
    """Cuentas de grupo de nivel 1 y 2 (p. ej. «1» y «1.1») para las cuentas
    imputables dadas como {codigo: tipo}."""
    grupos = {}
    for prefijo in sorted({".".join(c.split(".")[:n]) for c in hojas for n in (1, 2) if c.count(".") >= n}):
        tipos = {t for c, t in hojas.items() if c.startswith(prefijo + ".")}
        nombre, esperados = GRUPOS_CONOCIDOS.get(prefijo, (None, None))
        if nombre is None or (esperados is not None and tipos != esperados):
            if tipos <= {"INGRESO"}:
                nombre = "INGRESOS"
            elif tipos <= {"GASTO"}:
                nombre = "GASTOS"
            elif tipos <= {"INGRESO", "GASTO"}:
                nombre = "RESULTADOS"
            else:
                nombre = f"GRUPO {prefijo}"
        tipo = Counter(t for c, t in hojas.items() if c.startswith(prefijo + ".")).most_common(1)[0][0]
        grupos[prefijo] = (nombre, tipo)
    return grupos


def _quitar_empresa_inicial_vacia(conn):
    """Si la base solo tiene la empresa de inicio sin nombre ni comprobantes,
    se elimina para que no quede vacía en el listado."""
    vacias = conn.execute(
        """SELECT id FROM empresas e WHERE razon_social = '' AND rut = ''
           AND NOT EXISTS (SELECT 1 FROM asientos a WHERE a.empresa_id = e.id)"""
    ).fetchall()
    total = conn.execute("SELECT COUNT(*) FROM empresas").fetchone()[0]
    eliminadas = 0
    for v in vacias:
        if total - eliminadas > 1:
            nucleo.eliminar_empresa(conn, v["id"])
            eliminadas += 1
    return eliminadas


def importar_empresa(conn, origen, company_id):
    """Importa una empresa. Si algo falla, no deja datos a medias."""
    c = origen.execute("SELECT * FROM companies WHERE id = ?", (company_id,)).fetchone()
    if c is None:
        raise ErrorValidacion(f"No existe la empresa {company_id} en el archivo de origen.")
    rut = nucleo.formatear_rut(c["rut"])
    if conn.execute("SELECT 1 FROM empresas WHERE rut = ?", (rut,)).fetchone():
        raise ErrorValidacion(f"{c['name']}: ya existe una empresa con el RUT {rut}; no se importó de nuevo.")

    entradas = origen.execute(
        "SELECT * FROM entries WHERE company_id = ? ORDER BY date, number", (company_id,)
    ).fetchall()
    ultimo_anio = int(entradas[-1]["date"][:4]) if entradas else date.today().year
    avisos, correcciones = [], []
    if not nucleo.validar_rut(rut):
        avisos.append(f"El RUT {rut} no tiene un dígito verificador válido; se importó igual.")

    with conn:
        empresa_id = conn.execute(
            """INSERT INTO empresas (razon_social, rut, giro, direccion, comuna, regimen, ejercicio)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (c["name"].strip(), rut, c["giro"], c["direccion"], c["ciudad"], c["regime"], ultimo_anio),
        ).lastrowid
    try:
        cuentas_origen = origen.execute(
            "SELECT * FROM accounts WHERE company_id = ? ORDER BY code", (company_id,)
        ).fetchall()
        clasificacion = {a["code"]: _tipo_cuenta(a["code"], a["type"], correcciones) for a in cuentas_origen}
        hojas = {codigo: tipo for codigo, (tipo, _) in clasificacion.items()}
        ids = {}
        with conn:
            for codigo, (nombre, tipo) in _grupos(hojas).items():
                if codigo not in hojas:
                    ids[codigo] = conn.execute(
                        "INSERT INTO cuentas (empresa_id, codigo, nombre, tipo, imputable) VALUES (?, ?, ?, ?, 0)",
                        (empresa_id, codigo, nombre, tipo),
                    ).lastrowid
            for a in cuentas_origen:
                ids[a["code"]] = conn.execute(
                    """INSERT INTO cuentas (empresa_id, codigo, nombre, tipo, imputable, activa, resultados_en_ocho)
                       VALUES (?, ?, ?, ?, 1, ?, ?)""",
                    (empresa_id, a["code"], a["name"].strip(), hojas[a["code"]],
                     1 if str(a["active"]) == "1" else 0, int(clasificacion[a["code"]][1])),
                ).lastrowid

        aperturas = 0
        for e in entradas:
            lineas = []
            for d in origen.execute("SELECT * FROM entry_details WHERE entry_id = ? ORDER BY rowid", (e["id"],)):
                debe, haber = round(d["debit"] or 0), round(d["credit"] or 0)
                if d["account_code"] not in ids:
                    raise ErrorValidacion(f"Asiento {e['number']}: la cuenta {d['account_code']} no existe en el plan.")
                for monto, lado in ((debe, "debe"), (haber, "haber")):
                    if monto:
                        lineas.append({"cuenta_id": ids[d["account_code"]], "glosa": "",
                                       "debe": monto if lado == "debe" else 0,
                                       "haber": monto if lado == "haber" else 0})
            glosa = (e["description"] or "").strip() or "(sin glosa)"
            es_apertura = glosa.upper().startswith("APERTURA")
            aperturas += es_apertura
            try:
                nucleo.guardar_asiento(conn, empresa_id, "TRASPASO", e["date"], glosa, lineas,
                                       apertura=es_apertura, numero=e["number"])
            except ErrorValidacion as error:
                raise ErrorValidacion(f"Asiento {e['number']} del {e['date']}: {error}") from None

        verificar(conn, origen, company_id, empresa_id)
    except Exception:
        nucleo.eliminar_empresa(conn, empresa_id)
        raise

    return {"empresa_id": empresa_id, "razon_social": c["name"].strip(), "rut": rut,
            "cuentas": len(cuentas_origen), "grupos_creados": len(ids) - len(cuentas_origen),
            "asientos": len(entradas), "aperturas": aperturas, "ejercicio": ultimo_anio,
            "correcciones": correcciones, "avisos": avisos,
            "total": conn.execute(
                """SELECT COALESCE(SUM(l.debe), 0) FROM lineas l JOIN asientos a ON a.id = l.asiento_id
                   WHERE a.empresa_id = ?""", (empresa_id,)).fetchone()[0]}


def verificar(conn, origen, company_id, empresa_id):
    """Compara los saldos por cuenta y la cantidad de asientos con el origen."""
    esperado = {r[0]: round(r[1]) for r in origen.execute(
        """SELECT d.account_code, SUM(d.debit) - SUM(d.credit) FROM entry_details d
           JOIN entries e ON e.id = d.entry_id WHERE e.company_id = ? GROUP BY d.account_code""",
        (company_id,))}
    obtenido = {r[0]: r[1] for r in conn.execute(
        """SELECT c.codigo, SUM(l.debe) - SUM(l.haber) FROM lineas l JOIN cuentas c ON c.id = l.cuenta_id
           WHERE c.empresa_id = ? GROUP BY c.codigo""",
        (empresa_id,))}
    diferencias = {k: (esperado.get(k, 0), obtenido.get(k, 0)) for k in esperado.keys() | obtenido.keys()
                   if esperado.get(k, 0) != obtenido.get(k, 0)}
    if diferencias:
        raise ErrorValidacion(f"Los saldos importados no coinciden con el origen: {diferencias}")
    n_origen = origen.execute("SELECT COUNT(*) FROM entries WHERE company_id = ?", (company_id,)).fetchone()[0]
    n_destino = conn.execute("SELECT COUNT(*) FROM asientos WHERE empresa_id = ?", (empresa_id,)).fetchone()[0]
    if n_origen != n_destino:
        raise ErrorValidacion(f"Se esperaban {n_origen} asientos y se importaron {n_destino}.")


def importar(conn, ruta_origen, ids_empresas):
    origen = abrir_origen(ruta_origen)
    try:
        resultados = [importar_empresa(conn, origen, cid) for cid in ids_empresas]
    finally:
        origen.close()
    eliminadas = _quitar_empresa_inicial_vacia(conn)
    return resultados, eliminadas


def main(argv=None):
    from . import RAIZ

    p = argparse.ArgumentParser(description="Importa empresas desde CreandoGestion.")
    p.add_argument("origen", help="Archivo .db de CreandoGestion")
    p.add_argument("empresas", nargs="*", help="Ids de las empresas a importar (sin ids: se listan)")
    p.add_argument("--destino", default=str(RAIZ / "datos" / "contabilidad.db"))
    args = p.parse_args(argv)

    origen = abrir_origen(args.origen)
    if not args.empresas:
        for c in listar_empresas_origen(origen):
            print(f"{c['id']:22} {c['name'][:45]:45} {c['rut']:14} {c['accounting']:12} "
                  f"cuentas={c['cuentas']:<4} asientos={c['asientos']}")
        return 0
    origen.close()

    conn = db.conectar(args.destino)
    db.inicializar(conn)
    carpeta = Path(args.destino).parent / "respaldos"
    carpeta.mkdir(exist_ok=True)
    copia = carpeta / f"antes_de_importar_{datetime.now():%Y-%m-%d_%H%M%S}.db"
    db.respaldar_en(conn, copia)
    print(f"Copia de seguridad previa: {copia}")

    try:
        resultados, eliminadas = importar(conn, args.origen, args.empresas)
    except ErrorValidacion as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    for r in resultados:
        print(f"\n✔ {r['razon_social']} ({r['rut']})")
        print(f"   cuentas: {r['cuentas']} (+{r['grupos_creados']} grupos)   asientos: {r['asientos']} "
              f"(aperturas: {r['aperturas']})   total debe = total haber = ${nucleo.formato_clp(r['total'])}")
        for x in r["correcciones"]:
            print(f"   corrección de tipo: {x}")
        for x in r["avisos"]:
            print(f"   aviso: {x}")
    if eliminadas:
        print(f"\nSe quitó la empresa inicial vacía (sin nombre ni comprobantes).")
    if resultados:
        with conn:
            conn.execute("INSERT INTO config (clave, valor) VALUES ('empresa_activa', ?) "
                         "ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor",
                         (str(resultados[0]["empresa_id"]),))
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
