"""Aplicación web de contabilidad general para empresas chilenas."""
import io
import os
import re
import shutil
import sqlite3
from datetime import date, datetime
from pathlib import Path

from flask import (Flask, Response, abort, flash, g, redirect, render_template,
                   request, send_file, url_for)

from . import db, exportacion, nucleo, remuneraciones, tributario
from .nucleo import ErrorValidacion

RAIZ = Path(__file__).resolve().parent.parent


def create_app(ruta_db=None):
    app = Flask(__name__)
    app.config["DATABASE"] = str(
        ruta_db or os.environ.get("CONTABILIDAD_DB") or RAIZ / "datos" / "contabilidad.db"
    )
    app.config["SECRET_KEY"] = os.urandom(24)
    app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024  # tamaño máximo de un respaldo subido
    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)

    conn = db.conectar(app.config["DATABASE"])
    db.inicializar(conn)
    conn.close()
    app.teardown_appcontext(db.cerrar_db)

    app.add_template_filter(nucleo.formato_clp, "clp")
    app.add_template_filter(nucleo.formatear_rut, "rut")
    app.add_template_filter(lambda f: f"{f[8:10]}-{f[5:7]}-{f[:4]}" if f else "", "fecha")
    app.add_template_global(nucleo.numero_comprobante, "comprobante")
    app.add_template_global(nucleo.NOMBRES_TIPO, "nombres_tipo")
    app.add_template_global(url_exportar)
    app.add_template_global(mes_cerrado)
    app.add_template_global(nucleo.nombre_periodo, "nombre_periodo")

    @app.context_processor
    def contexto_global():
        return {"empresa": empresa_activa(), "empresas": nucleo.listar_empresas(db.get_db())}

    registrar_rutas(app)
    return app


def empresa_activa():
    """Empresa seleccionada (guardada en la tabla config); si no es válida,
    la primera por razón social."""
    conn = db.get_db()
    fila = conn.execute(
        """SELECT e.* FROM empresas e JOIN config c ON c.clave = 'empresa_activa'
           AND CAST(c.valor AS INTEGER) = e.id"""
    ).fetchone()
    return fila or conn.execute("SELECT * FROM empresas ORDER BY razon_social LIMIT 1").fetchone()


def activar_empresa(empresa_id):
    conn = db.get_db()
    with conn:
        conn.execute(
            "INSERT INTO config (clave, valor) VALUES ('empresa_activa', ?) "
            "ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor",
            (str(empresa_id),),
        )


def eid():
    return empresa_activa()["id"]


def rango_fechas():
    """Fechas desde/hasta de la URL; por defecto, el ejercicio vigente."""
    anio = empresa_activa()["ejercicio"]
    desde, hasta = f"{anio}-01-01", f"{anio}-12-31"
    try:
        desde = nucleo.parse_fecha(request.args.get("desde") or desde).isoformat()
        hasta = nucleo.parse_fecha(request.args.get("hasta") or hasta).isoformat()
    except ErrorValidacion:
        flash("Fecha inválida en el filtro; se usa el ejercicio completo.", "error")
    return desde, hasta


def pide_exportacion():
    return request.args.get("formato") in exportacion.FORMATOS


def respuesta_exportada(informe):
    """Descarga el informe en el formato pedido en la URL (?formato=pdf|xlsx|csv).
    Los PDF de libros e informes oficiales llevan folio: el indicado en ?folio=
    (la pantalla lo pregunta antes de generar) o, si no viene, el siguiente al
    último utilizado por la empresa."""
    conn = db.get_db()
    empresa = empresa_activa()
    formato = request.args["formato"]
    folio = None
    if formato == "pdf" and informe.oficial:
        pedido = request.args.get("folio", type=int)
        folio = pedido if pedido and pedido >= 1 else empresa["ultimo_folio"] + 1
    contenido, tipo, nombre, paginas = exportacion.exportar(
        informe, empresa, nucleo.obtener_contador(conn), formato, folio_inicial=folio)
    cabeceras = {"Content-Disposition": f'attachment; filename="{nombre}"'}
    if folio is not None:
        nucleo.registrar_folios(conn, empresa["id"], folio, paginas)
        cabeceras["X-Folios"] = f"{folio}-{folio + paginas - 1}"
    return Response(contenido, mimetype=tipo, headers=cabeceras)


def mes_cerrado(fecha):
    """¿La fecha cae en un mes cerrado de la empresa activa? (para las plantillas)"""
    if "periodos_cerrados" not in g:
        g.periodos_cerrados = nucleo.periodos_cerrados(db.get_db(), eid())
    return bool(fecha) and fecha[:7] in g.periodos_cerrados


def confirmacion_periodo():
    """Datos de confirmación de cambios en meses cerrados enviados por el formulario."""
    return {"confirmado": request.form.get("confirmar_cerrado") == "1",
            "motivo": request.form.get("motivo_cerrado", "")}


def url_exportar(formato):
    """URL de la página actual, con sus filtros, pidiendo el formato indicado."""
    args = request.args.to_dict()
    args["formato"] = formato
    return url_for(request.endpoint, **(request.view_args or {}), **args)


def cuentas_imputables():
    return db.get_db().execute(
        "SELECT id, codigo, nombre FROM cuentas WHERE empresa_id = ? AND imputable = 1 AND activa = 1 ORDER BY codigo",
        (eid(),),
    ).fetchall()


def lineas_desde_formulario():
    """Lee las líneas del formulario. Devuelve (lineas_validas, lineas_crudas)."""
    crudas = [
        {"cuenta_id": c, "glosa": g, "debe": d, "haber": h}
        for c, g, d, h in zip(
            request.form.getlist("cuenta_id"), request.form.getlist("glosa_linea"),
            request.form.getlist("debe"), request.form.getlist("haber"),
        )
    ]
    validas = []
    for i, l in enumerate(crudas, 1):
        if not l["cuenta_id"] and not l["debe"].strip() and not l["haber"].strip():
            continue  # fila vacía
        try:
            cuenta_id = int(l["cuenta_id"])
        except ValueError:
            raise ErrorValidacion(f"Línea {i}: selecciona una cuenta.") from None
        validas.append({"cuenta_id": cuenta_id, "glosa": l["glosa"],
                        "debe": nucleo.parse_monto(l["debe"]), "haber": nucleo.parse_monto(l["haber"])})
    return validas, crudas


def carpeta_respaldos(app):
    carpeta = Path(app.config["DATABASE"]).parent / "respaldos"
    carpeta.mkdir(exist_ok=True)
    return carpeta


def copia_automatica(app, motivo):
    """Guarda una copia de toda la base antes de una operación delicada."""
    marca = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    copia = carpeta_respaldos(app) / f"antes_de_{motivo}_{marca}.db"
    db.respaldar_en(db.get_db(), copia)
    return copia


def registrar_rutas(app):

    # ---------------------------------------------------------------- inicio
    @app.route("/")
    def inicio():
        conn = db.get_db()
        anio = empresa_activa()["ejercicio"]
        desde, hasta = f"{anio}-01-01", f"{anio}-12-31"
        er = nucleo.estado_resultados(conn, eid(), desde, hasta)
        ultimos = nucleo.listar_asientos(conn, eid(), "0000-00-00", "9999-12-31", limite=8)
        cantidad = len(nucleo.listar_asientos(conn, eid(), desde, hasta))
        return render_template("inicio.html", er=er, disponible=nucleo.disponible(conn, eid(), hasta),
                               ultimos=ultimos, cantidad=cantidad, anio=anio)

    # -------------------------------------------------------------- empresas
    @app.route("/empresas")
    def empresas():
        return render_template("empresas.html")

    @app.post("/empresas/activar")
    def cambiar_empresa():
        empresa_id = request.form.get("empresa_id", type=int)
        if db.get_db().execute("SELECT 1 FROM empresas WHERE id = ?", (empresa_id,)).fetchone():
            activar_empresa(empresa_id)
        destino = request.form.get("volver") or url_for("inicio")
        return redirect(destino if destino.startswith("/") else url_for("inicio"))

    @app.route("/empresas/nueva", methods=["GET", "POST"])
    def nueva_empresa():
        if request.method == "POST":
            try:
                nuevo_id = nucleo.crear_empresa(db.get_db(), request.form)
            except ErrorValidacion as e:
                flash(str(e), "error")
                return render_template("empresa.html", datos=request.form, nueva=True)
            activar_empresa(nuevo_id)
            flash("Empresa creada con el plan de cuentas base. Ya está seleccionada.", "ok")
            return redirect(url_for("inicio"))
        return render_template("empresa.html", datos={"ejercicio": date.today().year}, nueva=True)

    @app.route("/empresa", methods=["GET", "POST"])
    def empresa():
        if request.method == "POST":
            try:
                nucleo.guardar_empresa(db.get_db(), eid(), request.form)
            except ErrorValidacion as e:
                flash(str(e), "error")
                return render_template("empresa.html", datos=request.form, nueva=False)
            flash("Datos de la empresa guardados.", "ok")
            return redirect(url_for("empresa"))
        return render_template("empresa.html", datos=empresa_activa(), nueva=False)

    @app.route("/contador", methods=["GET", "POST"])
    def contador():
        conn = db.get_db()
        if request.method == "POST":
            try:
                nucleo.guardar_contador(conn, request.form.get("nombre"), request.form.get("rut"))
                archivo = request.files.get("firma")
                if archivo and archivo.filename:
                    nucleo.guardar_firma(conn, archivo.read())
            except ErrorValidacion as e:
                flash(str(e), "error")
                return render_template("contador.html", datos=request.form,
                                       tiene_firma=nucleo.obtener_contador(conn)["firma"] is not None)
            flash("Datos del contador guardados.", "ok")
            return redirect(url_for("contador"))
        datos = nucleo.obtener_contador(conn)
        return render_template("contador.html", datos=datos, tiene_firma=datos["firma"] is not None)

    @app.get("/contador/firma.png")
    def imagen_firma():
        firma = nucleo.obtener_contador(db.get_db())["firma"]
        if firma is None:
            abort(404)
        return Response(firma, mimetype="image/png", headers={"Cache-Control": "no-store"})

    @app.post("/contador/firma/eliminar")
    def eliminar_firma():
        nucleo.eliminar_firma(db.get_db())
        flash("Imagen de firma eliminada.", "ok")
        return redirect(url_for("contador"))

    @app.post("/empresa/eliminar")
    def eliminar_empresa():
        actual = empresa_activa()
        if request.form.get("confirmacion", "").strip().upper() != (actual["razon_social"] or "").strip().upper():
            flash("Para eliminar, escribe la razón social exactamente como aparece.", "error")
            return redirect(url_for("empresa"))
        try:
            copia = copia_automatica(app, "eliminar_empresa")
            nucleo.eliminar_empresa(db.get_db(), actual["id"])
        except ErrorValidacion as e:
            flash(str(e), "error")
            return redirect(url_for("empresa"))
        flash(f"Empresa «{actual['razon_social']}» eliminada. Copia previa guardada en «{copia.name}».", "ok")
        return redirect(url_for("empresas"))

    # -------------------------------------------------------- plan de cuentas
    @app.route("/cuentas")
    def cuentas():
        filas = db.get_db().execute(
            """SELECT c.*, (SELECT COUNT(*) FROM lineas l WHERE l.cuenta_id = c.id) AS movimientos
               FROM cuentas c WHERE c.empresa_id = ? ORDER BY c.codigo""",
            (eid(),),
        ).fetchall()
        if pide_exportacion():
            return respuesta_exportada(exportacion.informe_plan_cuentas(filas))
        return render_template("cuentas.html", cuentas=filas)

    @app.route("/cuentas/nueva", methods=["GET", "POST"])
    @app.route("/cuentas/<int:cuenta_id>/editar", methods=["GET", "POST"])
    def editar_cuenta(cuenta_id=None):
        conn = db.get_db()
        cuenta = None
        if cuenta_id is not None:
            cuenta = nucleo.obtener_cuenta(conn, eid(), cuenta_id)
            if cuenta is None:
                abort(404)
        if request.method == "POST":
            f = request.form
            try:
                nucleo.guardar_cuenta(conn, eid(), f.get("codigo"), f.get("nombre"), f.get("tipo"),
                                      imputable="imputable" in f, activa="activa" in f,
                                      cuenta_id=cuenta_id, resultados_en_ocho="resultados_en_ocho" in f)
            except ErrorValidacion as e:
                flash(str(e), "error")
                datos = {"codigo": f.get("codigo", ""), "nombre": f.get("nombre", ""), "tipo": f.get("tipo", ""),
                         "imputable": "imputable" in f, "activa": "activa" in f,
                         "resultados_en_ocho": "resultados_en_ocho" in f}
                return render_template("cuenta_form.html", datos=datos, cuenta=cuenta)
            flash("Cuenta guardada.", "ok")
            return redirect(url_for("cuentas"))
        if cuenta:
            datos = cuenta
        else:
            codigo = request.args.get("codigo", "")
            padre = conn.execute(
                "SELECT tipo FROM cuentas WHERE empresa_id = ? AND codigo = ?", (eid(), codigo.rstrip("."))
            ).fetchone()
            datos = {"codigo": codigo, "nombre": "", "tipo": padre["tipo"] if padre else "",
                     "imputable": True, "activa": True}
        return render_template("cuenta_form.html", datos=datos, cuenta=cuenta)

    @app.post("/cuentas/<int:cuenta_id>/eliminar")
    def eliminar_cuenta(cuenta_id):
        try:
            nucleo.eliminar_cuenta(db.get_db(), eid(), cuenta_id)
            flash("Cuenta eliminada.", "ok")
        except ErrorValidacion as e:
            flash(str(e), "error")
        return redirect(url_for("cuentas"))

    # ---------------------------------------------------------- comprobantes
    @app.route("/asientos")
    def asientos():
        desde, hasta = rango_fechas()
        texto = request.args.get("q", "").strip() or None
        filas = nucleo.listar_asientos(db.get_db(), eid(), desde, hasta, texto)
        return render_template("asientos.html", asientos=filas, desde=desde, hasta=hasta, q=texto or "")

    @app.route("/asientos/nuevo", methods=["GET", "POST"])
    @app.route("/asientos/<int:asiento_id>/editar", methods=["GET", "POST"])
    def editar_asiento(asiento_id=None):
        conn = db.get_db()
        existente = None
        if asiento_id is not None:
            existente = nucleo.obtener_asiento(conn, eid(), asiento_id)
            if existente is None:
                abort(404)
            if existente["asiento"]["cierre"]:
                flash("El asiento de cierre no se edita; elimínalo y vuelve a cerrar el ejercicio.", "error")
                return redirect(url_for("ver_asiento", asiento_id=asiento_id))

        if request.method == "POST":
            f = request.form
            crudas = []
            try:
                lineas, crudas = lineas_desde_formulario()
                nuevo_id = nucleo.guardar_asiento(conn, eid(), f.get("tipo"), f.get("fecha"), f.get("glosa"),
                                                  lineas, asiento_id=asiento_id, apertura="apertura" in f,
                                                  **confirmacion_periodo())
            except ErrorValidacion as e:
                periodo_cerrado = e if isinstance(e, nucleo.PeriodoCerrado) else None
                if periodo_cerrado is None:
                    flash(str(e), "error")
                datos = {"tipo": f.get("tipo"), "fecha": f.get("fecha"), "glosa": f.get("glosa", ""),
                         "apertura": "apertura" in f}
                return render_template("asiento_form.html", datos=datos, lineas=crudas or [{}, {}],
                                       cuentas=cuentas_imputables(), existente=existente,
                                       periodo_cerrado=periodo_cerrado, motivo=f.get("motivo_cerrado", ""))
            for campo, tabla in (("sueldo_ids", "sueldos_empresariales"), ("honorario_ids", "honorarios")):
                ids = [int(x) for x in f.get(campo, "").split(",") if x.strip().isdigit()]
                if ids:
                    remuneraciones.marcar_contabilizados(conn, eid(), tabla, ids, nuevo_id)
            ids_rcv = [int(x) for x in f.get("rcv_ids", "").split(",") if x.strip().isdigit()]
            if ids_rcv:
                tributario.marcar_centralizados(conn, eid(), ids_rcv, nuevo_id)
                flash(f"{len(ids_rcv)} documento(s) del RCV quedaron centralizados en este comprobante.", "ok")
            flash("Comprobante guardado.", "ok")
            if "guardar_y_nuevo" in f:
                return redirect(url_for("editar_asiento"))
            return redirect(url_for("ver_asiento", asiento_id=nuevo_id))

        if existente:
            a = existente["asiento"]
            datos = {"tipo": a["tipo"], "fecha": a["fecha"], "glosa": a["glosa"], "apertura": a["apertura"]}
            lineas = [{"cuenta_id": str(l["cuenta_id"]), "glosa": l["glosa"],
                       "debe": nucleo.formato_clp(l["debe"]) if l["debe"] else "",
                       "haber": nucleo.formato_clp(l["haber"]) if l["haber"] else ""}
                      for l in existente["lineas"]]
        else:
            datos = {"tipo": request.args.get("tipo", "TRASPASO"), "fecha": date.today().isoformat(),
                     "glosa": "", "apertura": False}
            lineas = [{}, {}]
        return render_template("asiento_form.html", datos=datos, lineas=lineas,
                               cuentas=cuentas_imputables(), existente=existente)

    @app.route("/asientos/<int:asiento_id>")
    def ver_asiento(asiento_id):
        datos = nucleo.obtener_asiento(db.get_db(), eid(), asiento_id)
        if datos is None:
            abort(404)
        if pide_exportacion():
            return respuesta_exportada(exportacion.informe_comprobante(datos))
        return render_template("asiento_ver.html", **datos)

    @app.post("/asientos/<int:asiento_id>/eliminar")
    def eliminar_asiento(asiento_id):
        try:
            nucleo.eliminar_asiento(db.get_db(), eid(), asiento_id, **confirmacion_periodo())
        except nucleo.PeriodoCerrado as e:
            datos = nucleo.obtener_asiento(db.get_db(), eid(), asiento_id)
            return render_template("asiento_ver.html", confirmar_eliminacion=e, **datos)
        flash("Comprobante eliminado.", "ok")
        return redirect(url_for("asientos"))

    # ---------------------------------------------------------------- libros
    @app.route("/libro-diario")
    def libro_diario():
        desde, hasta = rango_fechas()
        datos = nucleo.libro_diario(db.get_db(), eid(), desde, hasta)
        if pide_exportacion():
            return respuesta_exportada(exportacion.informe_libro_diario(datos, desde, hasta))
        return render_template("libro_diario.html", desde=desde, hasta=hasta, **datos)

    @app.route("/libro-mayor")
    def libro_mayor():
        desde, hasta = rango_fechas()
        cuenta = request.args.get("cuenta", "")
        todas = cuenta == "todas" or bool(request.args.get("todas"))
        completo = mayor = None
        if todas:
            completo = nucleo.libro_mayor_completo(db.get_db(), eid(), desde, hasta)
            if pide_exportacion():
                return respuesta_exportada(exportacion.informe_libro_mayor_completo(completo, desde, hasta))
        cuenta_id = int(cuenta) if cuenta.isdigit() and not todas else None
        if cuenta_id:
            mayor = nucleo.libro_mayor(db.get_db(), eid(), cuenta_id, desde, hasta)
            if mayor and pide_exportacion():
                return respuesta_exportada(exportacion.informe_libro_mayor(mayor, desde, hasta))
        cuentas = db.get_db().execute(
            "SELECT id, codigo, nombre FROM cuentas WHERE empresa_id = ? AND imputable = 1 ORDER BY codigo", (eid(),)
        ).fetchall()
        return render_template("libro_mayor.html", desde=desde, hasta=hasta, cuentas=cuentas,
                               cuenta_id=cuenta_id, mayor=mayor, todas=todas, completo=completo)

    # -------------------------------------------------------------- informes
    @app.route("/balance-8-columnas")
    def balance_ocho():
        desde, hasta = rango_fechas()
        datos = nucleo.balance_ocho_columnas(db.get_db(), eid(), desde, hasta)
        if pide_exportacion():
            return respuesta_exportada(exportacion.informe_balance_ocho(datos, desde, hasta))
        return render_template("balance_ocho.html", desde=desde, hasta=hasta, **datos)

    @app.route("/estado-resultados")
    def estado_resultados():
        desde, hasta = rango_fechas()
        datos = nucleo.estado_resultados(db.get_db(), eid(), desde, hasta)
        if pide_exportacion():
            return respuesta_exportada(exportacion.informe_estado_resultados(datos, desde, hasta))
        return render_template("estado_resultados.html", desde=desde, hasta=hasta, **datos)

    @app.route("/balance-general")
    def balance_general():
        _, hasta = rango_fechas()
        datos = nucleo.balance_general(db.get_db(), eid(), hasta)
        if pide_exportacion():
            return respuesta_exportada(exportacion.informe_balance_general(datos, hasta))
        return render_template("balance_general.html", hasta=hasta, **datos)

    # ---------------------------------------------------------------- cierre
    @app.route("/cierre", methods=["GET", "POST"])
    def cierre():
        conn = db.get_db()
        anio = request.values.get("anio", type=int) or empresa_activa()["ejercicio"]
        periodo_cerrado = None
        if request.method == "POST":
            try:
                asiento_id, resultado = nucleo.cerrar_ejercicio(conn, eid(), anio,
                                                                request.form.get("cuenta_destino", type=int),
                                                                **confirmacion_periodo())
            except nucleo.PeriodoCerrado as e:
                periodo_cerrado = e
            except ErrorValidacion as e:
                flash(str(e), "error")
                return redirect(url_for("cierre", anio=anio))
            else:
                tipo = "Utilidad" if resultado >= 0 else "Pérdida"
                flash(f"Ejercicio {anio} cerrado. {tipo}: ${nucleo.formato_clp(abs(resultado))}.", "ok")
                return redirect(url_for("ver_asiento", asiento_id=asiento_id))
        er = nucleo.estado_resultados(conn, eid(), f"{anio}-01-01", f"{anio}-12-31")
        return render_template("cierre.html", anio=anio, er=er,
                               existente=nucleo.asiento_cierre(conn, eid(), anio),
                               cuentas=nucleo.cuentas_patrimonio(conn, eid()),
                               sugerida=request.form.get("cuenta_destino", type=int)
                               or nucleo.cuenta_resultado_sugerida(conn, eid()),
                               periodo_cerrado=periodo_cerrado)

    # ------------------------------------------------- apertura del ejercicio
    def parametros_apertura():
        conn = db.get_db()
        anio = request.args.get("anio", type=int) or empresa_activa()["ejercicio"] + 1
        sugeridas = nucleo.cuentas_destino_sugeridas(conn, eid())
        return {
            "anio": anio,
            "fecha": request.args.get("fecha") or f"{anio}-01-02",
            "destino_utilidad": request.args.get("destino_utilidad", type=int) or sugeridas["utilidad"],
            "destino_perdida": request.args.get("destino_perdida", type=int) or sugeridas["perdida"],
        }

    @app.route("/apertura")
    def apertura():
        conn = db.get_db()
        p = parametros_apertura()
        propuesta = error = None
        try:
            propuesta = nucleo.propuesta_apertura(conn, eid(), p["anio"], p["destino_utilidad"], p["destino_perdida"])
        except ErrorValidacion as e:
            error = str(e)
        return render_template("apertura.html", p=p, propuesta=propuesta, error=error,
                               cuentas=nucleo.cuentas_patrimonio(conn, eid()))

    @app.route("/apertura/propuesta")
    def propuesta_apertura():
        """Muestra la propuesta en el formulario de comprobante, sin guardar nada."""
        conn = db.get_db()
        p = parametros_apertura()
        try:
            nucleo.parse_fecha(p["fecha"])
            propuesta = nucleo.propuesta_apertura(conn, eid(), p["anio"], p["destino_utilidad"], p["destino_perdida"])
        except ErrorValidacion as e:
            flash(str(e), "error")
            return redirect(url_for("apertura", **request.args))
        datos = {"tipo": "TRASPASO", "fecha": p["fecha"], "glosa": propuesta["glosa"], "apertura": True}
        lineas = [{"cuenta_id": str(l["cuenta_id"]), "glosa": "",
                   "debe": nucleo.formato_clp(l["debe"]) if l["debe"] else "",
                   "haber": nucleo.formato_clp(l["haber"]) if l["haber"] else ""} for l in propuesta["lineas"]]
        usadas = {l["cuenta_id"] for l in propuesta["lineas"]}
        cuentas = [c for c in conn.execute(  # activas, más las inactivas que tengan saldo
            "SELECT id, codigo, nombre, activa FROM cuentas WHERE empresa_id = ? AND imputable = 1 ORDER BY codigo",
            (eid(),)) if c["activa"] or c["id"] in usadas]
        return render_template("asiento_form.html", datos=datos, lineas=lineas, cuentas=cuentas,
                               existente=None, propuesta=propuesta, accion=url_for("editar_asiento"))

    # ------------------------------------------------------------ tributario
    def periodo_pedido():
        valor = request.values.get("periodo", "")
        try:
            return tributario.validar_periodo(valor)
        except ErrorValidacion:
            hoy = date.today()
            anio = empresa_activa()["ejercicio"]
            if anio == hoy.year:
                return tributario.periodo_anterior(f"{hoy.year}-{hoy.month:02d}") if hoy.month > 1 else f"{anio}-01"
            return f"{anio}-12"

    def informe_rcv_del_mes(conn, periodo, compras, ventas):
        """RCV del mes con sus asientos de centralización registrados y, si hay
        documentos pendientes, la propuesta de su asiento."""
        ids = []
        for d in compras + ventas:
            if d["asiento_id"] and d["asiento_id"] not in ids:
                ids.append(d["asiento_id"])
        asientos = [a for a in (nucleo.obtener_asiento(conn, eid(), i) for i in ids) if a]
        cuentas = {c["id"]: c for c in conn.execute("SELECT id, codigo, nombre FROM cuentas WHERE empresa_id = ?",
                                                     (eid(),))}
        propuestas, avisos = [], []
        for registro, docs in (("COMPRA", compras), ("VENTA", ventas)):
            if any(d["asiento_id"] is None for d in docs):
                try:
                    p = tributario.propuesta_centralizacion(conn, eid(), periodo, registro)
                except ErrorValidacion as e:
                    avisos.append(f"No se pudo proponer el asiento de {registro.lower()}s pendientes: {e}")
                    continue
                lineas = [{"codigo": cuentas[l["cuenta_id"]]["codigo"], "nombre": cuentas[l["cuenta_id"]]["nombre"],
                           "debe": l["debe"], "haber": l["haber"]} for l in p["lineas"]]
                propuestas.append({"glosa": p["glosa"], "fecha": p["fecha"], "lineas": lineas})
        return exportacion.informe_rcv(periodo, compras, ventas, asientos, propuestas, avisos)

    @app.route("/rcv")
    def rcv():
        conn = db.get_db()
        periodo = periodo_pedido()
        documentos = tributario.documentos_rcv(conn, eid(), periodo)
        compras = [d for d in documentos if d["registro"] == "COMPRA"]
        ventas = [d for d in documentos if d["registro"] == "VENTA"]
        if pide_exportacion():
            return respuesta_exportada(informe_rcv_del_mes(conn, periodo, compras, ventas))
        defecto = tributario.cuentas_tributarias(conn, eid())
        defectos = {  # cuenta que se usará si el documento no tiene una elegida
            d["id"]: (defecto["compras_activo_fijo"] if d["activo_fijo"] else defecto["compras_neto"])
            if d["registro"] == "COMPRA" else (defecto["ventas_neto"] if d["neto"] else defecto["ventas_exento"])
            for d in documentos}
        cuentas = cuentas_imputables()
        return render_template(
            "rcv.html", periodo=periodo, compras=compras, ventas=ventas,
            total_compras=tributario.totales_rcv(compras), total_ventas=tributario.totales_rcv(ventas),
            cuentas=cuentas, defectos=defectos,
            nombres_cuenta={c["id"]: f"{c['codigo']} {c['nombre']}" for c in cuentas},
            tipos_resumen=tributario.TIPOS_RESUMEN, tipos_documento=tributario.TIPOS_DOCUMENTO,
            datos_doc={d["id"]: {k: d[k] for k in ("id", "registro", "tipo_doc", "folio", "fecha", "rut",
                                                   "razon_social", "exento", "neto", "iva", "iva_no_recuperable",
                                                   "otros_impuestos", "total", "activo_fijo", "cantidad",
                                                   "cuenta_id", "asiento_id")}
                       | {"comprobante": nucleo.numero_comprobante(d["asiento_tipo"], d["asiento_numero"])
                          if d["asiento_id"] else ""} for d in documentos},
            nombre_tipo=tributario.nombre_tipo, signo=tributario.signo)

    @app.post("/rcv/importar")
    def importar_rcv():
        periodo = periodo_pedido()
        archivo = request.files.get("archivo")
        if archivo is None or not archivo.filename:
            flash("Selecciona el archivo CSV descargado del SII.", "error")
            return redirect(url_for("rcv", periodo=periodo))
        # El SII nombra los archivos con el RUT y el período: RCV_..._76086428_202609.csv
        nombre = tributario.datos_nombre_archivo(archivo.filename)
        tipo_archivo = nombre[2] if nombre else None
        if nombre:
            rut_archivo = nucleo.limpiar_rut(nombre[0])
            rut_empresa = nucleo.limpiar_rut(empresa_activa()["rut"])[:-1]
            if rut_empresa and rut_archivo != rut_empresa:
                flash(f"El archivo es del RUT {nucleo.formato_clp(int(rut_archivo))} y la empresa activa es "
                      f"{empresa_activa()['razon_social']} ({empresa_activa()['rut']}). No se importó: cambia a la "
                      "empresa correcta en el selector del menú.", "error")
                return redirect(url_for("rcv", periodo=periodo))
            periodo_archivo = nombre[1]
            if periodo_archivo != periodo:
                flash(f"El archivo corresponde a {nucleo.nombre_periodo(periodo_archivo)}; se importó en ese período.",
                      "ok")
                periodo = periodo_archivo
        try:
            registro, nuevos, otros = tributario.importar_rcv(db.get_db(), eid(), periodo, archivo.read(), tipo_archivo)
        except ErrorValidacion as e:
            flash(str(e), "error")
        else:
            if registro == "RESUMEN":
                texto = (f"Resumen de ventas de {nucleo.nombre_periodo(periodo)}: {nuevos} tipo(s) de boletas o "
                         "comprobantes de pago registrados." if nuevos else
                         f"El resumen de ventas de {nucleo.nombre_periodo(periodo)} no trae boletas ni "
                         "comprobantes de pago.")
                if otros:
                    texto += f" Se omitieron {otros} línea(s) de facturas o notas, que se importan con el CSV de detalle."
            else:
                texto = f"{'Compras' if registro == 'COMPRA' else 'Ventas'} de {nucleo.nombre_periodo(periodo)}: " \
                        f"{nuevos} documento(s) importado(s)."
                if otros:
                    texto += f" {otros} ya estaban registrados y se omitieron."
            flash(texto, "ok")
        return redirect(url_for("rcv", periodo=periodo))

    @app.post("/rcv/resumen")
    def resumen_ventas():
        """Registra el resumen mensual de boletas o comprobantes de pago electrónico."""
        periodo = periodo_pedido()
        f = request.form

        def monto(nombre):
            texto = (f.get(nombre) or "").strip()
            return nucleo.parse_monto(texto) if texto else None

        try:
            tipo = f.get("tipo_doc", type=int)
            cantidad = f.get("cantidad", type=int)
            tributario.registrar_resumen_ventas(db.get_db(), eid(), periodo, tipo, cantidad, monto("total"),
                                                exento=monto("exento") or 0, neto=monto("neto"), iva=monto("iva"))
        except ErrorValidacion as e:
            flash(str(e), "error")
        else:
            flash(f"Resumen de {tributario.TIPOS_RESUMEN[tipo].lower()} de {nucleo.nombre_periodo(periodo)} "
                  "registrado.", "ok")
        return redirect(url_for("rcv", periodo=periodo) + "#resumen-ventas")

    @app.post("/rcv/documento")
    def guardar_documento_rcv():
        """Agrega o modifica un documento del RCV desde la ventana de edición (responde JSON)."""
        f = request.form

        def monto(nombre):
            texto = (f.get(nombre) or "").strip()
            return nucleo.parse_monto(texto) if texto else 0

        try:
            periodo = tributario.validar_periodo(f.get("periodo", ""))
            datos = {"registro": f.get("registro"), "tipo_doc": f.get("tipo_doc"), "folio": f.get("folio"),
                     "fecha": f.get("fecha"), "rut": f.get("rut"), "razon_social": f.get("razon_social"),
                     "exento": monto("exento"), "neto": monto("neto"), "iva": monto("iva"),
                     "iva_no_recuperable": monto("iva_no_recuperable"), "otros_impuestos": monto("otros_impuestos"),
                     "activo_fijo": "activo_fijo" in f, "cantidad": f.get("cantidad") or 1,
                     "cuenta_id": f.get("cuenta_id", type=int)}
            documento_id = tributario.guardar_documento(db.get_db(), eid(), periodo, datos,
                                                        documento_id=f.get("id", type=int))
        except ErrorValidacion as e:
            return {"ok": False, "error": str(e)}, 400
        flash("Documento guardado." if f.get("id") else "Documento agregado.", "ok")
        return {"ok": True, "id": documento_id}

    @app.post("/rcv/documento/<int:documento_id>/eliminar")
    def eliminar_documento_rcv(documento_id):
        if tributario.eliminar_documentos(db.get_db(), eid(), [documento_id]):
            flash("Documento eliminado.", "ok")
            return {"ok": True}
        return {"ok": False, "error": "No se pudo eliminar: el documento no existe o ya está centralizado."}, 400

    @app.post("/rcv/documentos")
    def documentos_rcv():
        conn = db.get_db()
        periodo = periodo_pedido()
        f = request.form
        asignacion = {int(k[7:]): (int(v) if v.isdigit() else None)
                      for k, v in f.items() if k.startswith("cuenta_") and k[7:].isdigit()}
        tributario.asignar_cuentas(conn, eid(), asignacion)
        if "eliminar" in f:
            ids = [int(x) for x in f.getlist("seleccion") if x.isdigit()]
            if not ids:
                flash("Marca los documentos que quieres eliminar.", "error")
            else:
                flash(f"{tributario.eliminar_documentos(conn, eid(), ids)} documento(s) eliminado(s).", "ok")
            return redirect(url_for("rcv", periodo=periodo))
        if f.get("centralizar") in ("COMPRA", "VENTA"):
            return redirect(url_for("centralizar_rcv", periodo=periodo, registro=f["centralizar"]))
        flash("Cuentas guardadas. Se recordarán para cada proveedor o cliente.", "ok")
        return redirect(url_for("rcv", periodo=periodo))

    @app.route("/rcv/centralizar")
    def centralizar_rcv():
        """Muestra la centralización en el formulario de comprobante, sin guardar nada."""
        periodo = periodo_pedido()
        registro = request.args.get("registro", "")
        try:
            propuesta = tributario.propuesta_centralizacion(db.get_db(), eid(), periodo, registro)
        except ErrorValidacion as e:
            flash(str(e), "error")
            return redirect(url_for("rcv", periodo=periodo))
        datos = {"tipo": "TRASPASO", "fecha": propuesta["fecha"], "glosa": propuesta["glosa"], "apertura": False}
        lineas = [{"cuenta_id": str(l["cuenta_id"]), "glosa": "",
                   "debe": nucleo.formato_clp(l["debe"]) if l["debe"] else "",
                   "haber": nucleo.formato_clp(l["haber"]) if l["haber"] else ""} for l in propuesta["lineas"]]
        return render_template("asiento_form.html", datos=datos, lineas=lineas, cuentas=cuentas_imputables(),
                               existente=None, centralizacion=propuesta, accion=url_for("editar_asiento"),
                               rcv_ids=",".join(map(str, propuesta["documentos"])))

    @app.route("/tributario/cuentas", methods=["GET", "POST"])
    def cuentas_tributarias():
        conn = db.get_db()
        if request.method == "POST":
            asignacion = {c: request.form.get(c, type=int) for c in tributario.CONCEPTOS}
            try:
                tributario.guardar_cuentas_tributarias(conn, eid(), asignacion, request.form.get("tasa_ppm", "0"))
            except ErrorValidacion as e:
                flash(str(e), "error")
            else:
                flash("Cuentas tributarias guardadas.", "ok")
            return redirect(url_for("cuentas_tributarias"))
        return render_template("cuentas_tributarias.html", conceptos=tributario.CONCEPTOS,
                               grupos=[("Centralización de compras", tributario.CONCEPTOS_COMPRA),
                                       ("Centralización de ventas", tributario.CONCEPTOS_VENTA),
                                       ("Borrador del F29", tributario.CONCEPTOS_F29),
                                       ("Sueldo empresarial y honorarios", tributario.CONCEPTOS_REMUNERACIONES)],
                               actuales=tributario.cuentas_tributarias(conn, eid()), cuentas=cuentas_imputables())

    @app.route("/f29", methods=["GET", "POST"])
    def f29():
        conn = db.get_db()
        periodo = periodo_pedido()
        iniciales = tributario.valores_iniciales_f29(conn, eid(), periodo)

        def numero(nombre, defecto):
            texto = (request.values.get(nombre) or "").strip()
            if not texto:
                return defecto
            try:
                return float(texto.replace(".", "").replace(",", ".")) if nombre.startswith("utm") \
                    else nucleo.parse_monto(texto)
            except (ValueError, ErrorValidacion):
                flash(f"Valor inválido: «{texto}».", "error")
                return defecto

        entradas = {
            "remanente_anterior": numero("remanente_anterior", iniciales["remanente_anterior"] or 0),
            "utm_anterior": numero("utm_anterior", iniciales["utm_anterior"]),
            "utm_actual": numero("utm_actual", iniciales["utm_actual"]),
        }
        resultado = tributario.calcular_f29(conn, eid(), periodo, **entradas)
        cambiado = entradas["remanente_anterior"] != (iniciales["remanente_anterior"] or 0)
        resultado["entradas"]["origen_remanente"] = "ingresado manualmente" if cambiado else iniciales["origen_remanente"]
        if request.method == "POST":
            tributario.guardar_borrador(conn, eid(), periodo, resultado)
            flash(f"Borrador del F29 de {nucleo.nombre_periodo(periodo)} guardado en el historial. Su remanente "
                  "(código 77) se usará como remanente anterior del mes siguiente.", "ok")
            return redirect(url_for("f29", periodo=periodo))
        if pide_exportacion():
            return respuesta_exportada(exportacion.informe_f29(resultado))
        return render_template("f29.html", periodo=periodo, f=resultado,
                               presentacion=tributario.periodo_siguiente(periodo),
                               guardado=tributario.borrador_guardado(conn, eid(), periodo))

    # ------------------------------------------------- sueldo empresarial
    def formulario_propuesta(propuesta, campo_ids, titulo, volver):
        """Muestra una propuesta de asiento en el formulario de comprobante, sin guardar nada."""
        datos = {"tipo": "TRASPASO", "fecha": propuesta["fecha"], "glosa": propuesta["glosa"], "apertura": False}
        lineas = [{"cuenta_id": str(l["cuenta_id"]), "glosa": "",
                   "debe": nucleo.formato_clp(l["debe"]) if l["debe"] else "",
                   "haber": nucleo.formato_clp(l["haber"]) if l["haber"] else ""} for l in propuesta["lineas"]]
        return render_template("asiento_form.html", datos=datos, lineas=lineas, cuentas=cuentas_imputables(),
                               existente=None, accion=url_for("editar_asiento"),
                               ids_origen={campo_ids: ",".join(map(str, propuesta["ids"]))},
                               aviso_propuesta={"titulo": titulo, "volver": volver})

    def monto_formulario(nombre, defecto=0):
        texto = (request.form.get(nombre) or "").strip()
        return nucleo.parse_monto(texto) if texto else defecto

    @app.route("/sueldos")
    def sueldos():
        conn = db.get_db()
        periodo = periodo_pedido()
        liquidas = {l["socio_id"]: l for l in remuneraciones.liquidaciones(conn, eid(), periodo)}
        return render_template("sueldos.html", periodo=periodo, socios=remuneraciones.socios(conn, eid()),
                               liquidaciones=liquidas, utm_mes=remuneraciones.utm(conn, periodo),
                               editar=request.args.get("editar", type=int))

    @app.post("/sueldos/socio")
    def guardar_socio():
        f = request.form
        try:
            remuneraciones.guardar_socio(db.get_db(), eid(), {
                "nombre": f.get("nombre"), "rut": f.get("rut"), "sueldo_bruto": monto_formulario("sueldo_bruto"),
                "activo": "activo" in f or not f.get("id")}, socio_id=f.get("id", type=int))
        except ErrorValidacion as e:
            flash(str(e), "error")
        else:
            flash("Socio guardado.", "ok")
        return redirect(url_for("sueldos", periodo=periodo_pedido()))

    @app.post("/sueldos/socio/<int:socio_id>/eliminar")
    def eliminar_socio(socio_id):
        try:
            remuneraciones.eliminar_socio(db.get_db(), eid(), socio_id)
        except ErrorValidacion as e:
            flash(str(e), "error")
        else:
            flash("Socio eliminado.", "ok")
        return redirect(url_for("sueldos", periodo=periodo_pedido()))

    @app.post("/sueldos/liquidar")
    def liquidar_sueldos():
        conn = db.get_db()
        periodo = periodo_pedido()
        f = request.form
        try:
            valor_utm = monto_formulario("utm")
            if valor_utm:
                remuneraciones.guardar_utm(conn, periodo, valor_utm)
            elegidos = [int(x) for x in f.getlist("incluir") if x.isdigit()]
            if not elegidos:
                raise ErrorValidacion("Marca al menos un socio para calcular su liquidación.")
            for socio_id in elegidos:
                remuneraciones.guardar_liquidacion(conn, eid(), socio_id, periodo, monto_formulario(f"bruto_{socio_id}"),
                                                   monto_formulario(f"afp_{socio_id}"),
                                                   monto_formulario(f"salud_{socio_id}"))
        except ErrorValidacion as e:
            flash(str(e), "error")
        else:
            flash(f"Liquidaciones de {nucleo.nombre_periodo(periodo)} calculadas.", "ok")
        return redirect(url_for("sueldos", periodo=periodo))

    @app.post("/sueldos/liquidacion/<int:liquidacion_id>/eliminar")
    def eliminar_liquidacion(liquidacion_id):
        if remuneraciones.eliminar_liquidacion(db.get_db(), eid(), liquidacion_id):
            flash("Liquidación eliminada.", "ok")
        else:
            flash("No se pudo eliminar: la liquidación ya está contabilizada.", "error")
        return redirect(volver_a() or url_for("sueldos", periodo=periodo_pedido()))

    @app.route("/sueldos/contabilizar")
    def contabilizar_sueldos():
        periodo = periodo_pedido()
        try:
            propuesta = remuneraciones.propuesta_sueldos(db.get_db(), eid(), periodo)
        except ErrorValidacion as e:
            flash(str(e), "error")
            return redirect(url_for("sueldos", periodo=periodo))
        return formulario_propuesta(
            propuesta, "sueldo_ids",
            f"Sueldo empresarial de {nucleo.nombre_periodo(periodo)}: {propuesta['cantidad']} liquidación(es)",
            url_for("sueldos", periodo=periodo))

    # ------------------------------------------------------------ honorarios
    @app.route("/honorarios")
    def honorarios():
        conn = db.get_db()
        periodo = periodo_pedido()
        lista = remuneraciones.boletas(conn, eid(), periodo)
        editar = request.args.get("editar", type=int)
        return render_template(
            "honorarios.html", periodo=periodo, boletas=lista, tipos=remuneraciones.TIPOS_BOLETA,
            tasa=remuneraciones.tasa_retencion(int(periodo[:4])),
            editando=next((b for b in lista if b["id"] == editar and not b["asiento_id"]), None),
            totales={k: sum(b[k] for b in lista) for k in ("bruto", "retencion", "liquido")})

    @app.post("/honorarios/boleta")
    def guardar_boleta():
        periodo = periodo_pedido()
        f = request.form
        try:
            remuneraciones.guardar_boleta(db.get_db(), eid(), periodo, {
                "tipo": f.get("tipo"), "folio": f.get("folio"), "fecha": f.get("fecha"), "rut": f.get("rut"),
                "nombre": f.get("nombre"), "monto": monto_formulario("monto"),
                "es_liquido": f.get("base") == "liquido", "sin_retencion": "sin_retencion" in f,
                "glosa": f.get("glosa")}, boleta_id=f.get("id", type=int))
        except ErrorValidacion as e:
            flash(str(e), "error")
        else:
            flash("Boleta guardada.", "ok")
        return redirect(url_for("honorarios", periodo=periodo))

    @app.post("/honorarios/boleta/<int:boleta_id>/eliminar")
    def eliminar_boleta(boleta_id):
        if remuneraciones.eliminar_boleta(db.get_db(), eid(), boleta_id):
            flash("Boleta eliminada.", "ok")
        else:
            flash("No se pudo eliminar: la boleta ya está contabilizada.", "error")
        return redirect(volver_a() or url_for("honorarios", periodo=periodo_pedido()))

    @app.route("/honorarios/contabilizar")
    def contabilizar_honorarios():
        periodo = periodo_pedido()
        try:
            propuesta = remuneraciones.propuesta_honorarios(db.get_db(), eid(), periodo)
        except ErrorValidacion as e:
            flash(str(e), "error")
            return redirect(url_for("honorarios", periodo=periodo))
        return formulario_propuesta(
            propuesta, "honorario_ids",
            f"Honorarios de {nucleo.nombre_periodo(periodo)}: {propuesta['cantidad']} boleta(s)",
            url_for("honorarios", periodo=periodo))

    # ------------------------------------------------------------ historiales
    def volver_a():
        """Dirección interna a la que volver después de una acción (campo «volver»)."""
        destino = request.form.get("volver", "")
        return destino if destino.startswith("/") and not destino.startswith("//") else None

    def anio_pedido():
        anio = request.args.get("anio", "")
        return anio if re.fullmatch(r"\d{4}", anio) else ""

    @app.route("/f29/historial")
    def f29_historial():
        conn = db.get_db()
        anio = anio_pedido()
        borradores = tributario.borradores_guardados(conn, eid(), anio)
        if pide_exportacion():
            return respuesta_exportada(exportacion.informe_historial_f29(borradores))
        totales = {k: sum(b["codigos"].get(k) or 0 for b in borradores) for k in ("538", "537", "89", "62", "151", "48", "91")}
        return render_template("f29_historial.html", borradores=borradores, anio=anio, totales=totales,
                               anios=tributario.anios_borradores(conn, eid()))

    @app.route("/f29/guardado/<periodo>", methods=["GET", "POST"])
    def f29_guardado(periodo):
        conn = db.get_db()
        try:
            tributario.validar_periodo(periodo)
        except ErrorValidacion:
            abort(404)
        guardado = tributario.borrador_guardado(conn, eid(), periodo)
        if guardado is None:
            flash(f"No hay un borrador guardado de {nucleo.nombre_periodo(periodo)}.", "error")
            return redirect(url_for("f29_historial"))
        if request.method == "POST":
            f = request.form
            try:
                tributario.guardar_estado_borrador(conn, eid(), periodo, "declarado" in f, f.get("fecha_declaracion"),
                                                   f.get("folio_sii"), f.get("observacion"))
            except ErrorValidacion as e:
                flash(str(e), "error")
            else:
                flash("Estado del borrador guardado.", "ok")
            return redirect(url_for("f29_guardado", periodo=periodo))
        resultado = guardado | {"periodo": periodo}
        if pide_exportacion():
            return respuesta_exportada(exportacion.informe_f29(resultado, guardado))
        e = guardado.get("entradas", {})
        actual = tributario.calcular_f29(conn, eid(), periodo, e.get("remanente_anterior") or 0, e.get("utm_anterior"),
                                         e.get("utm_actual"))["codigos"]
        cambios = [(k, actual.get(k, 0)) for k in ("538", "537", "77", "62", "91")
                   if actual.get(k, 0) != guardado["codigos"].get(k, 0)]
        return render_template("f29_guardado.html", periodo=periodo, g=guardado, cambios=cambios,
                               presentacion=tributario.periodo_siguiente(periodo))

    @app.post("/f29/guardado/<periodo>/eliminar")
    def eliminar_f29_guardado(periodo):
        if tributario.eliminar_borrador(db.get_db(), eid(), periodo):
            flash(f"Borrador de {nucleo.nombre_periodo(periodo)} eliminado.", "ok")
        return redirect(url_for("f29_historial"))

    @app.route("/rcv/historial")
    def rcv_historial():
        conn = db.get_db()
        anio = anio_pedido()
        periodos = tributario.historial_rcv(conn, eid(), anio)
        if pide_exportacion():
            return respuesta_exportada(exportacion.informe_historial_rcv(periodos))
        return render_template("rcv_historial.html", periodos=periodos, anio=anio, anios=tributario.anios_rcv(conn, eid()))

    @app.post("/rcv/eliminar-pendientes")
    def eliminar_pendientes_rcv():
        periodo = periodo_pedido()
        n = tributario.eliminar_pendientes_periodo(db.get_db(), eid(), periodo)
        flash(f"{n} documento(s) pendiente(s) de {nucleo.nombre_periodo(periodo)} eliminado(s).", "ok")
        return redirect(volver_a() or url_for("rcv_historial"))

    @app.route("/sueldos/historial")
    def sueldos_historial():
        conn = db.get_db()
        anio = anio_pedido()
        lista = remuneraciones.historial_liquidaciones(conn, eid(), anio)
        if pide_exportacion():
            return respuesta_exportada(exportacion.informe_historial_sueldos(lista))
        return render_template("sueldos_historial.html", grupos=remuneraciones.agrupar_por_mes(lista), lista=lista,
                               anio=anio, anios=remuneraciones.anios_historial(conn, eid(), "sueldos_empresariales"))

    @app.route("/honorarios/historial")
    def honorarios_historial():
        conn = db.get_db()
        anio = anio_pedido()
        lista = remuneraciones.historial_boletas(conn, eid(), anio)
        if pide_exportacion():
            return respuesta_exportada(exportacion.informe_historial_honorarios(lista))
        return render_template("honorarios_historial.html", grupos=remuneraciones.agrupar_por_mes(lista), lista=lista,
                               anio=anio, anios=remuneraciones.anios_historial(conn, eid(), "honorarios"))

    # ------------------------------------------------------- cierre de meses
    @app.route("/periodos")
    def periodos():
        conn = db.get_db()
        anio = request.args.get("anio", type=int) or empresa_activa()["ejercicio"]
        return render_template("periodos.html", anio=anio, meses=nucleo.resumen_periodos(conn, eid(), anio),
                               cambios=nucleo.cambios_en_periodos_cerrados(conn, eid()))

    @app.post("/periodos/<accion>")
    def cambiar_periodo(accion):
        acciones = {"cerrar": (nucleo.cerrar_mes, "cerrado"),
                    "reabrir": (nucleo.reabrir_mes, "reabierto"),
                    "cerrar-hasta": (nucleo.cerrar_hasta, "cerrado")}
        if accion not in acciones:
            abort(404)
        funcion, participio = acciones[accion]
        anio, mes = request.form.get("anio", type=int), request.form.get("mes", type=int)
        try:
            funcion(db.get_db(), eid(), anio, mes)
        except ErrorValidacion as e:
            flash(str(e), "error")
        else:
            nombre = nucleo.nombre_periodo(f"{anio:04d}-{mes:02d}")
            if accion == "cerrar-hasta":
                flash(f"Meses cerrados desde enero hasta {nombre}.", "ok")
            else:
                flash(f"Mes de {nombre} {participio}.", "ok")
        return redirect(url_for("periodos", anio=anio))

    # --------------------------------------------------------------- respaldo
    @app.route("/respaldo")
    def respaldo():
        memoria = sqlite3.connect(":memory:")
        db.get_db().backup(memoria)
        contenido = memoria.serialize()
        memoria.close()
        return send_file(io.BytesIO(contenido), as_attachment=True,
                         download_name=f"contabilidad_respaldo_{date.today().isoformat()}.db",
                         mimetype="application/octet-stream")

    @app.route("/respaldo/en-linea")
    def exportar_en_linea():
        """Archivo .json de la empresa activa para importarlo en la versión en línea."""
        import json
        empresa = empresa_activa()
        datos = nucleo.exportar_en_linea(db.get_db(), empresa["id"])
        nombre = re.sub(r"[^A-Za-z0-9]+", "_", empresa["razon_social"] or "empresa").strip("_")
        return send_file(io.BytesIO(json.dumps(datos, ensure_ascii=False).encode("utf-8")), as_attachment=True,
                         download_name=f"{nombre}_en_linea_{date.today().isoformat()}.json",
                         mimetype="application/json")

    def archivo_pendiente():
        return carpeta_respaldos(app) / "_pendiente.db"

    def copias_automaticas():
        return sorted((c for c in carpeta_respaldos(app).glob("antes_de_*.db")),
                      key=lambda c: c.stat().st_mtime, reverse=True)

    def preparar_confirmacion():
        """Valida el archivo pendiente y muestra la pantalla de confirmación."""
        try:
            nuevo = db.validar_respaldo(archivo_pendiente())
        except ErrorValidacion as e:
            archivo_pendiente().unlink(missing_ok=True)
            flash(str(e), "error")
            return redirect(url_for("respaldos"))
        actual = db.validar_respaldo(app.config["DATABASE"])
        return render_template("respaldo_confirmar.html", nuevo=nuevo, actual=actual)

    @app.route("/respaldos")
    def respaldos():
        archivo_pendiente().unlink(missing_ok=True)
        return render_template("respaldos.html", copias=copias_automaticas())

    @app.post("/respaldos/subir")
    def subir_respaldo():
        archivo = request.files.get("archivo")
        if archivo is None or not archivo.filename:
            flash("Selecciona un archivo .db para restaurar.", "error")
            return redirect(url_for("respaldos"))
        archivo.save(archivo_pendiente())
        return preparar_confirmacion()

    @app.post("/respaldos/copia/<nombre>")
    def usar_copia(nombre):
        copia = next((c for c in copias_automaticas() if c.name == nombre), None)
        if copia is None:
            abort(404)
        shutil.copyfile(copia, archivo_pendiente())
        return preparar_confirmacion()

    @app.get("/respaldos/copia/<nombre>")
    def descargar_copia(nombre):
        copia = next((c for c in copias_automaticas() if c.name == nombre), None)
        if copia is None:
            abort(404)
        return send_file(copia, as_attachment=True, download_name=nombre)

    @app.post("/respaldos/restaurar")
    def restaurar_respaldo():
        pendiente = archivo_pendiente()
        if not pendiente.exists():
            flash("No hay un archivo pendiente de restaurar; súbelo de nuevo.", "error")
            return redirect(url_for("respaldos"))
        try:
            db.validar_respaldo(pendiente)
        except ErrorValidacion as e:
            pendiente.unlink(missing_ok=True)
            flash(str(e), "error")
            return redirect(url_for("respaldos"))
        copia = copia_automatica(app, "restaurar")
        db.restaurar(db.get_db(), pendiente)
        pendiente.unlink(missing_ok=True)
        flash(f"Respaldo restaurado. Los datos anteriores quedaron guardados en «{copia.name}».", "ok")
        return redirect(url_for("inicio"))

    @app.errorhandler(404)
    def no_encontrado(_e):
        return render_template("404.html"), 404
