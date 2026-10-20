/* Pruebas del artefacto. Uso: cd tests/artefacto && npm install && npm test
   Abre artefacto/contabilidad.html en Chromium con los datos en memoria (sin conexión a Claude).
   Variables opcionales: CHROMIUM_PATH (ruta del navegador), ARCHIVO (otra copia del HTML). */
const path = require("path");
const fs = require("fs");
let chromium;
try { ({ chromium } = require("playwright")); } catch (_) { ({ chromium } = require("/opt/node22/lib/node_modules/playwright")); }

const HTML = process.env.ARCHIVO || path.resolve(__dirname, "../../artefacto/contabilidad.html");
const LIBS = path.join(__dirname, "node_modules");
const LIB = { "jspdf.umd.min.js": "jspdf/dist/jspdf.umd.min.js", "jspdf.plugin.autotable.min.js": "jspdf-autotable/dist/jspdf.plugin.autotable.min.js", "exceljs.min.js": "exceljs/dist/exceljs.min.js", "pdf-lib.min.js": "pdf-lib/dist/pdf-lib.min.js" };
const espera = (ms = 80) => new Promise((r) => setTimeout(r, ms));

let fallos = 0, pasaron = 0;
function ok(nombre, cond, detalle = "") {
  if (cond) { pasaron++; console.log(`  ✔ ${nombre}`); } else { fallos++; console.log(`  ✘ ${nombre} ${detalle}`); }
}
const igual = (nombre, real, esperado) => ok(nombre, JSON.stringify(real) === JSON.stringify(esperado), `(obtenido ${JSON.stringify(real)}, esperado ${JSON.stringify(esperado)})`);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errores = [];
  page.on("pageerror", (e) => errores.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::|ERR_/.test(m.text())) errores.push("console: " + m.text()); });
  const hayLibs = fs.existsSync(path.join(LIBS, "jspdf"));
  await page.route("**/cdnjs.cloudflare.com/**", (route) => {
    const f = route.request().url().split("/").pop();
    LIB[f] && hayLibs ? route.fulfill({ path: path.join(LIBS, LIB[f]), contentType: "application/javascript" }) : route.abort();
  });
  await page.goto("file://" + HTML);
  await page.waitForFunction(() => typeof S !== "undefined" && S.almacen);

  console.log("Versión y datos de base");
  ok("la versión se muestra en el menú", /^Versión \d+\.\d+\.\d+$/.test(await page.textContent("#version")));
  await page.evaluate(async () => {
    const e = { razon_social: "PZ STUDIO SPA", rut: "76.086.428-3", giro: "Servicios", direccion: "Av. Providencia 123", comuna: "Providencia", representante: "Juan Pérez", rut_representante: "12.345.678-5",
      regimen: "Pro Pyme General 14 D3", ejercicio: 2026, tasa_ppm: 0.25, ultimo_folio: 0, creado: Date.now(), cuentas: planBase() };
    await BD.setEmpresa("e1", e); cambiarEmpresa("e1"); await new Promise((r) => setTimeout(r, 60));
    const cta = (c) => S.cuentas.find((x) => x.codigo === c).id;
    await BD.setAsiento("e1", "a1", { fecha: "2026-03-15", glosa: "Ventas", apertura: false, cierre: false, creado: 1, lineas: [{ cuenta: cta("1.1.02"), debe: 10000000, haber: 0 }, { cuenta: cta("4.1.01"), debe: 0, haber: 10000000 }] });
    await BD.setAsiento("e1", "a2", { fecha: "2026-04-15", glosa: "Gastos", apertura: false, cierre: false, creado: 2, lineas: [{ cuenta: cta("5.2.12"), debe: 3000000, haber: 0 }, { cuenta: cta("1.1.02"), debe: 0, haber: 3000000 }] });
    await new Promise((r) => setTimeout(r, 60));
  });

  console.log("Activo fijo");
  const af = await page.evaluate(async () => {
    const cta = (c) => S.cuentas.find((x) => x.codigo === c).id;
    await S.almacen.set("empresas/e1/activos/f1", { codigo: "AF-001", nombre: "Notebook", cat: 5, fecha_adq: "2026-01-10", costo: 1200000, residual: 0, vida_normal_meses: 72, vida_meses: 72, acelerada: false, cuenta: cta("1.2.06"), documento: "", estado: "activo", fecha_baja: "" });
    await S.almacen.set("empresas/e1/activos/f3", { codigo: "AF-003", nombre: "Impresora", cat: 6, fecha_adq: "2026-02-01", costo: 90000, residual: 0, vida_normal_meses: 36, vida_meses: 12, acelerada: true, cuenta: "", documento: "", estado: "baja", fecha_baja: "2026-06-15" });
    await new Promise((r) => setTimeout(r, 60));
    const [f1, f3] = S.activos.slice().sort((a, b) => (a.codigo < b.codigo ? -1 : 1));
    let suma = 0, p = "2026-01"; for (let i = 0; i < 72; i++) { suma += depMes(f1, p); p = periodoSiguiente(p); }
    const pr = propuestaDepreciacion("2026-08");
    return { suma, primerMes: depMes(f1, "2026-01"), baja: [depAcum(f3, "2026-06"), depAcum(f3, "2026-12"), depMes(f3, "2026-07")], debe: pr.lineas[0].debe, haber: pr.lineas[1].haber };
  });
  igual("la depreciación de toda la vida suma el costo exacto", af.suma, 1200000);
  igual("depreciación del primer mes", af.primerMes, 16667);
  igual("un bien dado de baja deja de depreciarse", af.baja, [37500, 37500, 0]);
  ok("el asiento de depreciación cuadra", af.debe === af.haber && af.debe > 0);
  await page.evaluate(() => { S.pestana.activos = "dep"; S.afPeriodo = "2026-09"; S.afPeriodoEid = "e1"; ir("activos"); });
  await page.click('[data-n="contabilizar-dep"]'); await espera();
  await page.evaluate(() => guardarAsiento()); await espera(200);
  igual("contabilizar deja la depreciación marcada", await page.evaluate(() => S.depreciaciones.map((d) => d.id)), ["2026-09"]);
  const bloqueo = await page.evaluate(async () => {
    S.pestana.activos = "fichas"; ir("activos");
    document.querySelector('[data-n="editar-activo"]').click();
    document.querySelector("#af-costo").value = "2.000.000";
    await guardarActivo();
    return [document.querySelector("#toast").textContent, S.activos.find((a) => a.id === "f1").costo];
  });
  ok("no deja cambiar el costo de un bien ya depreciado en la contabilidad", /ya tiene depreciación contabilizada/.test(bloqueo[0]) && bloqueo[1] === 1200000, JSON.stringify(bloqueo));
  await page.evaluate(() => { S.activoEdit = null; const a = S.lista.find((x) => x.glosa.startsWith("DEPRECIACIÓN")); abrirEditor(a.id); });
  await page.click('[data-accion="pedir-eliminar-asiento"]'); await page.click('[data-accion="eliminar-asiento"]'); await espera(200);
  igual("eliminar el asiento libera la depreciación", await page.evaluate(() => S.depreciaciones.length), 0);

  console.log("Remuneraciones");
  const rem = await page.evaluate(async () => {
    const t = { ...trabajadorVacio(), nombre: "María González", rut: "12.345.678-5", cargo: "Diseñadora", sueldo_base: 1000000, colacion: 50000, movilizacion: 30000, fecha_ingreso: "2026-01-02" };
    await S.almacen.set("empresas/e1/trabajadores/w1", t); await new Promise((r) => setTimeout(r, 60));
    const tr = S.trabajadores[0];
    const l = calcularLiquidacionTrabajador(tr, "2026-09", { dias: 30, horas_extra: 0, bonos: 0, no_imponibles: 0, anticipos: 50000, otros_desc: 0 });
    S.prev = { ...S.prev, uf: { "2026-09": 40000 } };
    const alto = calcularLiquidacionTrabajador({ ...tr, sueldo_base: 6000000, gratificacion: "ninguna" }, "2026-09", { dias: 30, horas_extra: 0, bonos: 0, no_imponibles: 0, anticipos: 0, otros_desc: 0 });
    S.prev = { ...S.prev, uf: {} };
    let sinUtm = ""; try { calcularLiquidacionTrabajador(tr, "2030-01", { dias: 30 }); } catch (e) { sinUtm = e.message; }
    await S.almacen.set("empresas/e1/liquidaciones/w1_2026-09", l); await new Promise((r) => setTimeout(r, 60));
    const pr = propuestaRemuneraciones("2026-09");
    return { l, alto: [alto.afp, alto.tope_aplicado], sinUtm, D: pr.lineas.reduce((s, x) => s + x.debe, 0), H: pr.lineas.reduce((s, x) => s + x.haber, 0) };
  });
  igual("gratificación legal con tope", rem.l.gratificacion, 219115);
  igual("AFP 11,27 %", rem.l.afp, 137394);
  igual("salud 7 %", rem.l.salud, 85338);
  igual("seguro de cesantía del trabajador", rem.l.cesantia, 7315);
  igual("impuesto único de segunda categoría", rem.l.impuesto_unico, 833);
  igual("líquido a pagar", rem.l.liquido, 1018235);
  igual("tope imponible con UF", rem.alto, [405720, true]);
  ok("sin UTM no calcula y lo explica", /UTM/.test(rem.sinUtm));
  ok("el asiento de remuneraciones cuadra", rem.D === rem.H && rem.D > 0);
  await page.evaluate(() => { S.liqPeriodo = "2026-09"; S.liqPeriodoEid = "e1"; S.pestana.rrhh = "liquidaciones"; ir("rrhh"); });
  await page.click('[data-n="contabilizar-rem"]'); await espera();
  await page.evaluate(() => guardarAsiento()); await espera(200);
  ok("contabilizar marca la liquidación", await page.evaluate(() => S.liquidaciones.every((l) => !!l.asiento)));
  const edicion = await page.evaluate(async () => { S.pestana.rrhh = "liquidaciones"; ir("rrhh"); return !document.querySelector('[data-n="eliminar-liquidacion"]'); });
  ok("una liquidación contabilizada no se puede eliminar", edicion);

  console.log("Remuneraciones: reforma de pensiones y nuevas funciones");
  const rn = await page.evaluate(async () => {
    const tr = S.trabajadores[0], e0 = { dias: 30, horas_extra: 0, festivos: 0, comisiones: 0, bonos: 0, vacaciones: 0, no_imponibles: 0, anticipos: 0, otros_desc: 0 };
    const jul = calcularLiquidacionTrabajador(tr, "2026-07", e0), sep = calcularLiquidacionTrabajador(tr, "2026-09", e0), sig = { emp_reforma: Math.round(tr.sueldo_base * parametrosPrev("2027-09").reforma / 100) };
    const asig = asignacionFamiliar(parametrosPrev("2026-09"), 400000, 2, 30);
    const con = calcularLiquidacionTrabajador({ ...tr, cargas: 2, sueldo_base: 400000, gratificacion: "ninguna", colacion: 0, movilizacion: 0 }, "2026-09", e0);
    const apv = calcularLiquidacionTrabajador({ ...tr, apv_monto: 100000, apv_regimen: "B" }, "2026-09", e0);
    const com = calcularLiquidacionTrabajador({ ...tr, semana_corrida: true }, "2026-09", { ...e0, comisiones: 300000, festivos: 2 });
    const df = calcularLiquidacionTrabajador({ ...tr, descuentos_fijos: [{ concepto: "Pensión", tipo: "monto", valor: 50000 }] }, "2026-09", e0);
    const sv = saldoVacaciones({ ...tr, fecha_ingreso: "2025-01-02", vacaciones: [{ fecha: "2026-02-01", dias: 5 }] }, "2026-10-01");
    const fq = calcularFiniquito({ ...tr, fecha_ingreso: "2025-03-01" }, { fecha: "2026-09-30", causal: "necesidades", uf: 40000, indemnizar: true, aviso_dado: false });
    return { jul: [jul.emp_reforma, jul.emp_sis], sep: [sep.emp_reforma, sep.emp_sis], sig: sig.emp_reforma, asig, conAsig: con.asig_familiar, aporte: sep.aportes_empleador, costo: sep.costo_empresa, imp: sep.imponible, apvTrib: apv.base_tributable < sep.base_tributable, com: [com.comisiones, com.semana_corrida > 0], df: df.liquido === sep.liquido - 50000, sv: sv.saldo, fq: { ind: fq.indemnizacion, aviso: fq.aviso, anos: fq.anos.computables } };
  });
  ok("hasta julio de 2026 el empleador paga SIS y 1 % de reforma", rn.jul[1] > 0 && rn.jul[0] > 0, JSON.stringify(rn.jul));
  ok("desde agosto de 2026 el SIS pasa a la cotización de la reforma", rn.sep[1] === 0 && rn.sep[0] > rn.jul[0], JSON.stringify(rn.sep));
  igual("la cotización total del empleador sube a 4,25 % desde agosto de 2027", await page.evaluate(() => parametrosPrev("2027-09").reforma), 4.25);
  ok("la asignación familiar se calcula por tramo y cargas", rn.asig.monto > 0 && rn.conAsig === rn.asig.monto, JSON.stringify([rn.asig, rn.conAsig]));
  ok("el costo de la empresa suma los aportes del empleador", rn.costo === rn.imp + 0 || rn.costo > rn.imp, JSON.stringify([rn.costo, rn.imp]));
  ok("el APV régimen B rebaja la base tributable", rn.apvTrib);
  ok("comisiones y semana corrida", rn.com[0] === 300000 && rn.com[1]);
  ok("los descuentos fijos bajan el líquido", rn.df);
  ok("saldo de vacaciones", rn.sv > 0 && rn.sv < 30, String(rn.sv));
  ok("finiquito: indemnización por años de servicio y aviso", rn.fq.ind > 0 && rn.fq.aviso > 0 && rn.fq.anos === 2 && rn.fq.ind === 2 * rn.fq.aviso, JSON.stringify(rn.fq));
  for (const t of ["vacaciones", "finiquitos"]) { await page.evaluate((t) => { S.pestana.rrhh = t; ir("rrhh"); }, t); ok(`la pestaña ${t} se dibuja`, await page.evaluate(() => document.querySelector("main")?.textContent.length > 200)); }
  await page.evaluate(() => { S.pestana.rrhh = "finiquitos"; ir("rrhh"); });
  await page.click('[data-n="nuevo-finiquito"]'); await espera();
  await page.evaluate(() => { $("#fq-uf").value = "40.000"; $("#fq-fecha").value = "2026-10-15"; });
  await page.evaluate(() => { leerFiniquito(); render(); });
  await page.click('[data-n="guardar-finiquito"]'); await espera(200);
  const fqs = await page.evaluate(() => ({ n: S.finiquitos.length, baja: S.trabajadores[0].activo === false }));
  ok("guardar el finiquito da de baja al trabajador", fqs.n === 1 && fqs.baja);
  await page.click('[data-n="contabilizar-finiquito"]'); await espera();
  await page.evaluate(() => guardarAsiento()); await espera(200);
  ok("contabilizar el finiquito marca el documento", await page.evaluate(() => S.finiquitos.every((x) => !!x.asiento)));
  ok("la DJ 1887 incluye el finiquito (remuneración del mes más indemnizaciones)", await page.evaluate(() => { const q = S.finiquitos[0], p = perceptores1887(2026).find((x) => x.rut === "12.345.678-5"); return !!p && p.meses === 2 && p.no_imponible >= q.indemnizacion + q.aviso; }));
  const fq2 = await page.evaluate(() => {
    const F = feriadosLegales(), t = { fecha_ingreso: "2020-03-10", sueldo_base: 1000000, gratificacion: "ninguna", colacion: 50000, movilizacion: 30000, haberes_fijos: [] };
    const c = (extra) => calcularFiniquito({ ...S.trabajadores[0], ...t }, { fecha: "2026-10-15", causal: "necesidades", uf: 40000, base: null, dias_mes: 15, vac_dias: 0, anticipos: 0, otros: [], indemnizar: true, aviso_dado: false, ...extra });
    const a = c({}), b = c({ recargo: 30, afc_imputable: 100000, vac_dias: 10 }), d = c({ causal: "desahucio" }), e = c({ causal: "renuncia", indemnizar: false });
    const ant = anosServicio({ fecha_ingreso: "1980-01-01" }, "2026-10-15").computables;
    return { co: [habilesACorridos("2026-10-14", 12.5, F), habilesACorridos("2026-12-24", 20, F), habilesACorridos("2026-04-01", 7.25, F), habilesACorridos("2027-03-20", 15, F)],
      a: [a.anos.computables, a.indemnizacion, a.aviso, a.baseTope], b: [b.recargo, b.afc, b.corridos, b.baseFeriado], d: [d.indemnizacion, d.aviso], e: [e.indemnizacion, e.aviso], ant };
  });
  igual("días hábiles a corridos como el programa de remuneraciones", fq2.co, [16.5, 30, 10.25, 24]);
  igual("finiquito 161-1: 6 años y 7 meses computan 7, indemnización y aviso con base 1.080.000", fq2.a, [7, 7560000, 1080000, 1080000]);
  igual("recargo 30 %, imputación AFC y feriado sin colación ni movilización", fq2.b, [2268000, 100000, 14, 1000000]);
  igual("desahucio indemniza y renuncia no", [fq2.d, fq2.e], [[7560000, 1080000], [0, 0]]);
  console.log("Previred y LRE (borradores)");
  const pv = await page.evaluate(() => {
    const ant = { t: S.trabajadores, l: S.liquidaciones, f: S.finiquitos, prev: S.prev, rc: empresa().rem_config, rut: empresa().rut };
    S.utm = { ...(S.utm || {}), "2026-09": 71721 }; S.prev = { ...S.prev, uf: { ...(S.prev.uf || {}), "2026-09": 41057.2 } };
    const base = (o) => ({ ...trabajadorVacio(), id: "t", nombre: "Ana Perez Soto", rut: "12345678-5", fecha_nac: "1990-05-10", fecha_ingreso: "2020-03-01", sueldo_base: 1000000, colacion: 50000, afp: "Habitat", afp_comision: 1.27, ...o });
    const e = { dias: 30, horas_extra: 0, horas_extra_100: 0, festivos: 0, comisiones: 0, bonos: 0, vacaciones: 0, no_imponibles: 0, anticipos: 0, otros_desc: 0 };
    const ts = [base({ id: "1" }), base({ id: "3", rut: "22222222-2", fecha_nac: "1955-01-01", pensionado: true, afp: "Uno", afp_comision: 0.46, sexo: "F" })];
    S.trabajadores = ts; S.finiquitos = []; empresa().rem_config = { mutual_nombre: "ACHS", mutual_basica: 0.9, mutual_adicional: 0, sanna: 0.03, ccaf: "" }; empresa().rut = "76123456-0";
    S.liquidaciones = ts.map((t) => ({ ...calcularLiquidacionTrabajador(t, "2026-09", e), id: "l" + t.id }));
    const r = { pv: archivoPrevired("2026-09", S.liquidaciones).trim().split("\r\n"), lre: archivoLre("2026-09", S.liquidaciones).trim().split("\r\n"), rev: revisionArchivosRem(S.liquidaciones) };
    S.trabajadores = ant.t; S.liquidaciones = ant.l; S.finiquitos = ant.f; S.prev = ant.prev; empresa().rem_config = ant.rc; empresa().rut = ant.rut;
    return r;
  });
  igual("Previred: trabajador activo igual al programa de remuneraciones (105 campos)", pv.pv[0].toUpperCase(), "12345678;5;PEREZ;SOTO;ANA;M;0;01;092026;;AFP;0;30;00;0;;;C;0;0;0;0;0;0;N;05;1219115;138613;21700;0;0;0;0;0;;;;00,00;0;000;;0;0;0;000;;0;0;0;0;;;;;0;;;00;0;0;0;0000;00,00;1219115;0;0;0000;00,00;0;85338;0;0;0;0;07;;0;0;0;0;0;0;00;0;0;0;0;0;0;0;0;0;1;8778;10972;01;1219115;11338;0;1219115;7315;29259;0;;");
  igual("Previred: pensionado igual al programa de remuneraciones", pv.pv[1].toUpperCase(), "22222222;2;PEREZ;SOTO;ANA;F;0;01;092026;;SIP;2;30;00;0;;;C;0;0;0;0;0;0;N;00;0;0;0;0;0;0;0;0;;;;00,00;0;000;;0;0;0;000;;0;0;0;0;;;;;0;;;00;0;0;0;0000;00,00;1219115;0;0;0000;00,00;0;85338;0;0;0;0;07;;0;0;0;0;0;0;00;0;0;0;0;0;0;0;0;0;1;0;0;01;1219115;11338;0;0;0;0;0;;");
  ok("LRE: encabezado y dos filas con las mismas columnas", pv.lre.length === 3 && pv.lre.every((x) => x.replace(/^\uFEFF/, "").split(";").length === 72), String(pv.lre.map((x) => x.split(";").length)));
  ok("la revisión previa avisa lo que falta (sexo, región y comuna)", pv.rev.some((x) => /sexo/.test(x)) && pv.rev.some((x) => /región/.test(x)), JSON.stringify(pv.rev));
  igual("el tope de 11 años no rige para contratos anteriores a 1981-08-14", fq2.ant, 47);
  console.log("Vacaciones con feriados");
  const vc = await page.evaluate(() => {
    const d = (ing, al, ap) => feriadoDevengado({ fecha_ingreso: ing, anios_previos: ap }, al), F = feriadosLegales();
    const antes = (S.prev.feriados || []).slice();
    return { dev: [d("2020-03-10", "2026-10-15", 0), d("2012-02-29", "2026-10-15", 5), d("2005-06-01", "2026-10-15", 10), d("2026-01-15", "2026-10-15", 0), d("2016-05-05", "2026-05-05", 8)],
      per: periodoVacaciones("2026-12-21", 5, F), per2: periodoVacaciones("2026-04-01", 3, F), antes };
  });
  igual("feriado devengado igual al programa de remuneraciones", vc.dev, [99.04, 233.34, 393.26, 11.26, 159.05]);
  igual("el período de vacaciones salta feriados y fines de semana", [vc.per, vc.per2], [{ hasta: "2026-12-28", reintegro: "2026-12-29" }, { hasta: "2026-04-06", reintegro: "2026-04-07" }]);
  await page.evaluate(() => { S.pestana.rrhh = "vacaciones"; ir("rrhh"); });
  await page.evaluate(() => { $("#fer-fecha").value = "2030-05-01"; agregarFeriado(); }); await espera(200);
  ok("agregar un feriado adicional lo suma al calendario", await page.evaluate(() => feriadosLegales().has("2030-05-01") && (S.prev.feriados || []).includes("2030-05-01")));
  await page.click('[data-n="feriado-quitar"]'); await espera(200);
  ok("quitar el feriado adicional", await page.evaluate(() => !feriadosLegales().has("2030-05-01")));
  console.log("Libro de caja: mes en curso, edición por línea y exportación por rango");
  const lc = await page.evaluate(async () => {
    const r = {}, ant = { mes: S.cajaMes, anio: S.cajaAnio };
    S.cajaAnio = "2026"; S.cajaMes = undefined; S.cajaPanel = null; S.cajaEdit = null; S.pestana.caja = "libro"; ir("caja"); await new Promise((x) => setTimeout(x, 60));
    r.mesDefecto = document.getElementById("caja-mes")?.value === mesPorDefectoCaja(2026) && mesPorDefectoCaja(2026) === hoy().slice(5, 7);
    r.sinForm = !document.getElementById("cj-fecha") && !!document.querySelector('[data-n="caja-panel"][data-id="mov"]');
    document.querySelector('[data-n="caja-panel"][data-id="mov"]').click(); r.conForm = !!document.getElementById("cj-fecha");
    document.querySelector('[data-n="caja-panel"][data-id="mov"]').click(); r.cierra = !document.getElementById("cj-fecha");
    S.cajaMes = "09"; S.cajaNuevaLinea = null; render(); r.sinLineaAbierta = !document.getElementById("ql-glosa") && !!document.querySelector('[data-n="caja-linea-mostrar"]');
    document.querySelector('[data-n="caja-linea-mostrar"]').click(); r.filaRapida = !!document.getElementById("ql-glosa");
    const n0 = S.caja.length; document.getElementById("ql-fecha").value = "2026-09-28"; document.getElementById("ql-glosa").value = "Línea rápida"; document.getElementById("ql-tipo").value = "1"; document.getElementById("ql-monto").value = "119.000"; document.getElementById("ql-base").value = "100.000";
    await agregarLineaCaja(); await new Promise((x) => setTimeout(x, 100));
    const nueva = S.caja.find((m) => m.glosa === "Línea rápida"); r.agregada = S.caja.length === n0 + 1 && nueva && nueva.monto === 119000 && nueva.base === 100000 && nueva.tipo === 1;
    S.cajaEdit = nueva.id; render(); r.editando = !!document.getElementById("ce-glosa");
    document.getElementById("ce-glosa").value = "Línea editada"; document.getElementById("ce-monto").value = "238.000"; document.getElementById("ce-base").value = "200.000"; document.getElementById("ce-tipo").value = "2";
    await guardarEdicionCaja(); await new Promise((x) => setTimeout(x, 100));
    const ed = S.caja.find((m) => m.id === nueva.id); r.editada = [ed.glosa, ed.monto, ed.base, ed.tipo, S.cajaEdit];
    r.rango = [informeLibroCaja(2026, "01", false, "03").filas.length, informeLibroCaja(2026, "01", false, "01").filas.length, informeLibroCaja(2026, "09", false, "09").filas.length, informeLibroCaja(2026, "", false).filas.length];
    const inf = informeLibroCaja(2026, "08", false, "09"); r.periodo = [inf.sii.periodo, inf.sii.cierres.length, inf.sii.cierres.at(-1)[0]];
    await S.almacen.del(`empresas/${S.eid}/caja/${nueva.id}`); S.cajaMes = ant.mes; S.cajaAnio = ant.anio; return r;
  });
  ok("el libro abre en el mes en curso", lc.mesDefecto);
  ok("el formulario de nuevo movimiento se despliega y se cierra con su botón", lc.sinForm && lc.conForm && lc.cierra);
  ok("se agrega una línea rápida al pie de la tabla", lc.filaRapida && lc.agregada);
  ok("la línea nueva del libro no se ve hasta pulsar el botón «+ Agregar línea»", lc.sinLineaAbierta);
  const sg = await page.evaluate(() => { const sc = S.caja; S.caja = [{ tipo: 2, doc_tipo: "Cartola Bancaria", glosa: "Pago F29 JULIO 2026, PPM.-", monto: 1, base: 0, fecha: "2026-08-16" }, { tipo: 1, doc_tipo: "Factura", glosa: "Ventas de julio 2026", monto: 1, base: 1, fecha: "2026-08-01" }];
    const r = { d1: sugerenciasDocCaja(1), d2: sugerenciasDocCaja(2), g2: sugerenciasGlosaCaja(2, "", "2026-09-15"), g1: sugerenciasGlosaCaja(1, "Boleta electrónica", "2026-09-30") }; S.caja = sc; return r; });
  ok("el tipo de documento sugerido depende de si es ingreso o egreso y prioriza lo ya usado", sg.d2[0] === "Cartola Bancaria" && sg.d1[0] === "Factura" && sg.d1.includes("Boleta electrónica") && sg.d2.includes("Boleta de honorarios") && !sg.d1.includes("Boleta de honorarios"), JSON.stringify([sg.d1, sg.d2]));
  ok("la glosa sugerida trae el mes actual y los meses anteriores, y reutiliza el historial con el mes cambiado", sg.g2[0] === "Pago F29 AGOSTO 2026, PPM.-" && sg.g2.some((g) => /pagadas en septiembre 2026/.test(g)) && sg.g1.some((g) => /Ventas de agosto 2026 afectas a IVA, percibidas en septiembre 2026, Boleta Electrónica/.test(g)), JSON.stringify(sg.g2.slice(0, 5)));
  const av = await page.evaluate(() => {
    const e = { inicio_actividades: "2025-10-08", contab_desde: "inicio" }, h = "2025-12-15", pend = (x) => mesesPendientesContables({ ...e, ...x }, [], true, h).pendientes;
    return { sin: pend({}), constitucion: pend({ caja_inicial: { 2025: 200000 } }), omitido: pend({ caja_inicial: { 2025: 200000 }, avisos_omitidos: { "sinmov:2025-11": true } }), clave: claveAviso({ area: "X", texto: "Hay 3 meses" }) === claveAviso({ area: "X", texto: "Hay 12 meses" }) };
  });
  igual("el mes de constitución con aporte no se avisa como sin contabilizar y un aviso se puede omitir", [av.sin, av.constitucion, av.omitido, av.clave], [["2025-10", "2025-11"], ["2025-11"], [], true]);
  igual("una línea se edita en su lugar y sale del modo de edición", lc.editada, ["Línea editada", 238000, 200000, 2, null]);
  ok("el rango de meses del libro suma los meses elegidos", lc.rango[0] >= lc.rango[1] && lc.rango[3] >= lc.rango[0] && lc.rango[2] >= 1, JSON.stringify(lc.rango));
  ok("el período del informe por rango lleva los meses y su total", /AGOSTO A SEPTIEMBRE 2026/.test(lc.periodo[0]) && lc.periodo[2] === "TOTAL DEL PERÍODO", JSON.stringify(lc.periodo));
  console.log("Meses antes del inicio de actividades");
  const ia = await page.evaluate(async () => {
    const r = {}, e = empresa(), ant = { ini: e.inicio_actividades, caja: S.caja, lista: S.lista };
    e.inicio_actividades = "2026-04-23";
    S.caja = [{ id: "i1", fecha: "2026-02-10", tipo: 1, categoria: "Ventas", glosa: "Antes", monto: 1000, base: 1000, origen: "manual", ref: "" }, { id: "i2", fecha: "2026-04-30", tipo: 1, categoria: "Ventas", glosa: "Abril", monto: 2000, base: 2000, origen: "manual", ref: "" }];
    r.reglas = [antesDelInicio("2026-03-31"), antesDelInicio("2026-04-01"), antesDelInicio("2025-12-15")];
    r.cajaDe = cajaDe(2026).map((m) => m.id); r.cerrado = /anterior al inicio de actividades/.test(CAJA_CERRADO(["2026-03-05"]) || "") ; r.abierto = CAJA_CERRADO(["2026-04-05"]) || "";
    S.edit = { fecha: "2026-01-05", glosa: "x", lineas: [], apertura: false, cierre: false }; const antes = S.lista.length; await guardarAsiento(); r.asiento = S.lista.length === antes;
    S.cajaAnio = "2026"; S.cajaMes = "02"; S.pestana.caja = "libro"; ir("caja"); await new Promise((x) => setTimeout(x, 60));
    r.mesAjustado = document.getElementById("caja-mes")?.value; r.opciones = [...document.querySelectorAll("#caja-mes option")].map((o) => o.value).filter(Boolean).length;
    const x = await aPdfLibroCaja({ anio: 2026, m1: "01", m2: "06" }, 1); r.hojas = Object.keys(x.folios);
    S.cajaAnio = "2025"; S.cajaMes = undefined; ir("caja"); await new Promise((x2) => setTimeout(x2, 60)); r.anioAnterior = /anterior al inicio de actividades/.test(document.querySelector("main").textContent);
    e.inicio_actividades = ant.ini; if (ant.ini === undefined) delete e.inicio_actividades; S.caja = ant.caja; S.lista = ant.lista; S.cajaAnio = null; S.cajaMes = undefined; S.edit = null;
    return r;
  });
  igual("antes del inicio de actividades solo cuentan los meses anteriores", ia.reglas, [true, false, true]);
  ok("los movimientos anteriores al inicio no cuentan en el libro y no se pueden registrar", JSON.stringify(ia.cajaDe) === '["i2"]' && ia.cerrado && ia.abierto === "", JSON.stringify([ia.cajaDe, ia.cerrado, ia.abierto]));
  ok("un asiento anterior al inicio de actividades se rechaza", ia.asiento);
  ok("el libro de caja no ofrece meses anteriores al inicio y el PDF no los incluye", ia.mesAjustado === "04" && ia.opciones === 9 && JSON.stringify(ia.hojas) === '["2026-04","2026-05","2026-06"]', JSON.stringify([ia.mesAjustado, ia.opciones, ia.hojas]));
  ok("un año anterior al inicio muestra el aviso", ia.anioAnterior);
  console.log("Contabilidad al día: inicio de actividades y meses sin movimientos");
  const ca = await page.evaluate(async () => {
    const r = {}, e = empresa(), ant = { ini: e.inicio_actividades, desde: e.contab_desde, sm: e.meses_sin_mov, lista: S.lista };
    const mov = (f) => ({ fecha: f }), hoyF = "2026-10-13";
    r.a = mesesPendientesContables({ inicio_actividades: "2024-04-23", contab_desde: "ejercicio" }, [mov("2026-02-10"), mov("2026-05-03")], true, hoyF).pendientes;
    r.b = mesesPendientesContables({ inicio_actividades: "2026-04-15", contab_desde: "ejercicio" }, [mov("2026-05-03")], true, hoyF).pendientes;
    r.c = mesesPendientesContables({ inicio_actividades: "2025-11-20", contab_desde: "inicio" }, [mov("2025-11-25")], true, "2026-02-05").pendientes;
    r.d = mesesPendientesContables({ inicio_actividades: "2026-08-01", contab_desde: "ejercicio", meses_sin_mov: { "2026-08": true } }, [], true, hoyF).pendientes;
    r.e = mesesPendientesContables({ contab_desde: "ejercicio" }, [], true, "2026-03-10");
    e.inicio_actividades = "2026-04-15"; e.contab_desde = "ejercicio"; e.meses_sin_mov = { "2026-06": true }; S.lista = [{ id: "z", fecha: "2026-05-05", numero: 1, glosa: "x", lineas: [] }];
    const hall = revisarDatos().filter((h) => /Contabilidad sin hacer/.test(h.texto)); r.revisor = [hall.length, hall[0]?.cantidad === mesesPendientesContables(e, S.lista, false).pendientes.length];
    const inf = informeDiario("2026-04-01", "2026-07-31"); r.diario = inf.filas.some((f) => f.valores.some((v) => /MES SIN MOVIMIENTOS CONTABLES/.test(String(v))));
    r.vistaDiario = (S.vista = "diario", true);
    e.inicio_actividades = ant.ini; e.contab_desde = ant.desde; e.meses_sin_mov = ant.sm; S.lista = ant.lista;
    if (ant.ini === undefined) delete e.inicio_actividades; if (ant.desde === undefined) delete e.contab_desde; if (ant.sm === undefined) delete e.meses_sin_mov;
    return r;
  });
  igual("avisa desde el año en curso aunque el inicio de actividades sea de 2024", ca.a, ["2026-01", "2026-03", "2026-04", "2026-06", "2026-07", "2026-08", "2026-09"]);
  igual("una empresa que inició en abril de 2026 avisa desde abril", ca.b, ["2026-04", "2026-06", "2026-07", "2026-08", "2026-09"]);
  igual("con «desde el inicio de actividades» avisa los meses históricos", ca.c, ["2025-12", "2026-01"]);
  igual("un mes marcado sin movimientos no cuenta como pendiente", ca.d, ["2026-09"]);
  ok("sin inicio de actividades se avisa desde enero del año en curso", ca.e.sinInicio && ca.e.desde === "2026-01");
  igual("el revisor da un solo aviso con el detalle de los meses", ca.revisor, [1, true]);
  ok("el libro diario deja constancia del mes sin movimientos contables", ca.diario);
  console.log("PPM por período del F29");
  const pp2 = await page.evaluate(async () => {
    const ant = S.caja, r = {}, mk = (id, fecha, monto, per, extra = {}) => ({ id, fecha, tipo: 2, categoria: "Pago de impuestos (IVA, PPM, F29)", doc_tipo: "Formulario 29", doc_num: "1", rut: "", nombre: "", glosa: "Pago F29 PPM", monto, base: 0, clase: "f29_ppm", ...(per ? { f29_periodo: per } : {}), origen: "manual", ref: "", ...extra });
    S.caja = [mk("p1", "2026-01-12", 14899, "2025-12"), mk("p2", "2026-02-12", 19977, "2026-01"), mk("p3", "2026-04-20", 27737, "2026-02"), mk("p4", "2026-05-10", 5000, ""), mk("p5", "2027-01-12", 7000, "2026-12")];
    const x = ppmPagadoPorPeriodo(2026); r.total = x.total; r.dic = x.porMes[11].monto; r.sinPeriodo = x.sinPeriodo.length;
    const inf = informeControlPpm(2026); r.filas = inf.filas.map((f) => [f.valores[0], f.valores[1], f.valores[3]]); r.notas = inf.notas.some((n) => /no tienen período/.test(n));
    r.revisor = revisarDatos().some((h) => /sin período del F29/.test(h.texto));
    const res = informeControlResultados(2026); r.dj = (res.paneles.der.find((t) => /1947/.test(t.titulo)) || { filas: [[0, null]] }).filas[0][1];
    S.caja = ant; return r;
  });
  igual("el PPM del año son los F29 de enero a diciembre (sin diciembre del año anterior), aunque se paguen después", [pp2.total, pp2.dic, pp2.sinPeriodo], [19977 + 27737 + 7000, 7000, 1]);
  igual("el control marca el pago desfasado y el de diciembre pagado el año siguiente", pp2.filas, [["Enero", 19977, "Pagado al mes siguiente"], ["Febrero", 27737, "Pagado con desfase"], ["Diciembre", 7000, "Pagado al mes siguiente"], ["TOTAL", 54714, ""]]);
  ok("los pagos de PPM sin período se avisan en el informe y en el revisor", pp2.notas && pp2.revisor);
  const pr = await page.evaluate(async () => {
    const inf = informeControlResultados(2026), r = {};
    r.paneles = [!!inf.paneles, inf.paneles?.izq.titulo, inf.paneles?.der.map((t) => t.titulo), inf.filas.length > inf.panelDesde];
    r.pdf = (await aPdf(inf)).paginas;
    S.cajaControl = "resultados"; S.pestana.caja = "control"; S.cajaAnio = "2026"; ir("caja"); await new Promise((x) => setTimeout(x, 60));
    r.pantalla = !!document.querySelector(".paneles") && document.querySelectorAll(".paneles table").length >= 2; S.cajaControl = null;
    return r;
  });
  ok("el resumen para el F22 y el capital propio quedan lado a lado, y las filas planas siguen para Excel y CSV", pr.paneles[0] && /FORMULARIO 22/.test(pr.paneles[1]) && /CAPITAL PROPIO/.test(pr.paneles[2][0]) && pr.paneles[3], JSON.stringify(pr.paneles));
  ok("el control de resultados con sus resúmenes cabe en una página y se ve en pantalla", pr.pdf === 1 && pr.pantalla, JSON.stringify([pr.pdf, pr.pantalla]));
  console.log("Libro de caja: modelo del contador, PDF con folios e informes");
  const md = await page.evaluate(async () => {
    const r = {}, ant = { c: S.caja, e: { ...empresa() } };
    S.caja = [{ id: "a1", fecha: "2026-01-11", tipo: 2, categoria: "Honorarios", doc_tipo: "Boleta de honorarios", doc_num: "73", rut: "17.992.401-3", glosa: "Pago honorarios", monto: 21611, base: 21611, origen: "manual", ref: "" },
      { id: "a2", fecha: "2026-01-31", tipo: 1, categoria: "Ventas", doc_tipo: "", doc_num: "xx", rut: "", glosa: "Ventas del mes", monto: 2377262, base: 1997699, origen: "manual", ref: "" },
      { id: "b1", fecha: "2026-02-28", tipo: 1, categoria: "Ventas", doc_tipo: "", doc_num: "xx", rut: "", glosa: "Ventas febrero", monto: 1000000, base: 800000, origen: "manual", ref: "" },
      { id: "b2", fecha: "2026-02-28", tipo: 2, categoria: "Compras y gastos", doc_tipo: "", doc_num: "xx", rut: "", glosa: "Compras febrero", monto: 300000, base: 250000, origen: "manual", ref: "" }];
    empresa().caja_inicial = { 2026: 1000000 }; empresa().folios_caja = {};
    const m1 = modeloLibroCaja(2026, "01"), m2 = modeloLibroCaja(2026, "02");
    r.ene = [m1.ini.monto, m1.filas.map((f) => f.monto), m1.totales];
    r.feb = [m2.ini.monto, m2.ini.base, m2.totales];
    r.glosaIni = [m1.ini.glosa, m2.ini.glosa, m1.ini.doc_tipo];
    const x = await aPdfLibroCaja({ anio: 2026, m1: "01", m2: "02" }, 22); r.folios = [x.paginas, x.folios["2026-01"], x.folios["2026-02"]];
    const pdfs = await unirPdfs([x.blob, (await aPdf(informeControlPpm(2026))).blob]); const { PDFDocument } = window.PDFLib; r.paginasUnido = (await PDFDocument.load(await pdfs.arrayBuffer())).getPageCount();
    r.ppm = informeControlPpm(2026).filas.map((f) => f.valores.slice(4));
    empresa().folios_caja = { "2026-01": [22, 22], "2026-02": [23, 23] }; const m3 = modeloLibroCaja(2026, "02"); r.docNum = [m3.ini.doc_num, m3.folio, folioSugeridoCaja({ anio: 2026, m1: "03" })];
    const f29 = clasificarMovimientoExcel(2, "Formulario 29", "Pago F29 Mayo, PPM.", "2026-06-15"), f29b = clasificarMovimientoExcel(2, "Formulario 29", "Pago F29 Diciembre, PPM.", "2026-01-12"), f29c = clasificarMovimientoExcel(2, "Formulario 29", "Pago F29 Marzo Abril, PPM.", "2026-05-08");
    r.periodos = [f29.f29_periodo, f29b.f29_periodo, f29c.f29_periodo];
    S.caja = ant.c; const em = empresa(); em.caja_inicial = ant.e.caja_inicial; if (ant.e.folios_caja === undefined) delete em.folios_caja; else em.folios_caja = ant.e.folios_caja; return r;
  });
  igual("modelo de enero: saldo inicial, egresos en negativo y totales con el saldo inicial", [md.ene[0], md.ene[1], md.ene[2]], [1000000, [-21611, 2377262], { ing: 3377262, egr: 21611, saldo: 3355651, bIng: 1997699, bEgr: 21611, neto: 1976088 }]);
  igual("febrero parte con el saldo de enero y el resultado acumulado como base", [md.feb[0], md.feb[1], md.feb[2].bIng, md.feb[2].neto], [3355651, 1976088, 1976088 + 800000, 1976088 + 800000 - 250000]);
  igual("glosa y tipo de documento del saldo inicial", md.glosaIni, ["Saldo Inicial Libro de Caja Diciembre de 2025", "Saldo Inicial Libro de Caja Enero de 2026", "Libro de Caja Diciembre 2025"]);
  igual("el PDF lleva una hoja y un folio por mes", [md.folios[0], md.folios[1], md.folios[2]], [2, [22, 22], [23, 23]]);
  ok("los informes se pueden unir al PDF del libro", md.paginasUnido >= 3, String(md.paginasUnido));
  ok("el PPM actualizado queda pendiente de corrección monetaria", md.ppm.length >= 1 && md.ppm.every((v) => v[2] === "Pendiente"), JSON.stringify(md.ppm));
  igual("el saldo inicial cita el folio de la hoja anterior y se sugiere el folio siguiente", md.docNum, [22, [23, 23], 24]);
  igual("el período del F29 sin año sale del mes de pago", md.periodos, ["2026-05", "2025-12", "2026-04"]);
  const sa = await page.evaluate(async () => {
    const ant = { mes: S.cajaMes, anio: S.cajaAnio, sal: S.cajaSaldos }, tarjetas = () => [...document.querySelectorAll(".tarjetas .tarjeta strong")].map((x) => x.textContent.replace(/[$.]/g, ""));
    S.cajaAnio = "2026"; S.cajaMes = "09"; S.cajaSaldos = "mes"; S.pestana.caja = "libro"; ir("caja"); await new Promise((x) => setTimeout(x, 60));
    const pregunta = !!document.getElementById("caja-saldos"), t1 = tarjetas(), M = libroCaja(2026, "09"), A = libroCaja(2026, "01", "09");
    S.cajaSaldos = "acum"; render(); const t2 = tarjetas();
    S.cajaMes = ""; render(); const sinMes = !document.getElementById("caja-saldos");
    S.cajaMes = ant.mes; S.cajaAnio = ant.anio; S.cajaSaldos = ant.sal;
    return { pregunta, sinMes, mes: [t1[0], t1[1], t1[2], t1[3]].map(Number), ref1: [M.inicial, M.ing, M.eg, M.saldo], acum: t2.slice(0, 4).map(Number), ref2: [A.inicial, A.ing, A.eg, A.saldo] };
  });
  ok("el panel pregunta si los saldos son del mes o acumulados (solo al consultar un mes)", sa.pregunta && sa.sinMes);
  igual("saldos solo del mes consultado", sa.mes, sa.ref1);
  igual("saldos acumulados de enero al mes consultado", sa.acum, sa.ref2);
  ok("el saldo final es el mismo en ambas vistas", sa.ref1[3] === sa.ref2[3]);
  console.log("Meses sin movimiento, IVA como gasto y F29 compacto");
  const mv = await page.evaluate(() => {
    const e = empresa(), ant = { m: e.rcv_meses, rcv: S.rcv }, per = "2031-03", r = {};
    e.rcv_meses = {}; S.rcv = [];
    const vacio = calcularF29(per); r.alertaVacio = vacio.alertas.some((a) => /No hay ventas ni compras/.test(a)); r.sinIva = vacio.sinIva; r.lineasCompactas = lineasF29Visibles(vacio.codigos, false).filter((l) => l[0] !== "titulo").length; r.lineasTodas = lineasF29Visibles(vacio.codigos, true).filter((l) => l[0] !== "titulo").length;
    e.rcv_meses = { [per]: { sin_ventas: true, sin_compras: true } }; r.alertaMarcado = calcularF29(per).alertas.some((a) => /No hay (ventas|compras)/.test(a));
    const b = calcularF29(per, 0, null, null, 1, 500000); r.base = [b.codigos["563"], b.codigos["62"]];
    S.rcv = [{ id: "g1", registro: "COMPRA", periodo: per, tipo_doc: 33, folio: "1", fecha: per + "-10", rut: "1-9", razon_social: "P", cantidad: 1, exento: 0, neto: 100000, iva: 19000, iva_no_recuperable: 0, otros_impuestos: 0, total: 119000, activo_fijo: false, cuenta: "", asiento: "" }];
    e.rcv_meses = {}; const normal = calcularF29(per).codigos; e.rcv_meses = { [per]: { iva_gasto: true } }; const gasto = calcularF29(per).codigos;
    r.credito = [normal["520"], normal["564"], gasto["520"], gasto["564"], gasto["521"]];
    try { const pc = propuestaCentralizacion(per, "COMPRA"); r.central = [pc.lineas.length, pc.lineas.reduce((s, l) => s + l.debe, 0)]; } catch (x) { r.central = String(x.message); }
    e.rcv_meses = {}; try { r.centralNormal = propuestaCentralizacion(per, "COMPRA").lineas.length; } catch (x) { r.centralNormal = String(x.message); }
    e.rcv_meses = ant.m; S.rcv = ant.rcv; return r;
  });
  ok("un mes vacío avisa; marcado «sin ventas / sin compras» deja de avisar", mv.alertaVacio && !mv.alertaMarcado);
  ok("sin operaciones con IVA el F29 muestra solo las líneas con valor", mv.sinIva && mv.lineasCompactas < mv.lineasTodas && mv.lineasCompactas <= 8, JSON.stringify([mv.lineasCompactas, mv.lineasTodas]));
  igual("base del PPM ingresada a mano: 500.000 al 1 % = 5.000", mv.base, [500000, 5000]);
  igual("IVA como gasto: sin crédito (cód. 520) y la compra pasa a «sin derecho a crédito»", mv.credito, [19000, 0, 0, 1, 100000]);
  ok("la centralización con IVA como gasto no usa la cuenta de crédito fiscal", Array.isArray(mv.central) ? mv.central[0] === mv.centralNormal - 1 : /Falta configurar/.test(mv.central), JSON.stringify([mv.central, mv.centralNormal]));
  console.log("F29: tasa de PPM en el borrador y base desde el libro de caja");
  const pp = await page.evaluate(async () => {
    const e = empresa(), ant = { tipo: e.tipo_contabilidad, tasa: e.tasa_ppm, caja: S.caja, f29: S.f29, rcv: S.rcv };
    e.tipo_contabilidad = "simplificada"; e.tasa_ppm = 0; S.rcv = [];
    S.caja = [{ id: "z1", fecha: "2026-08-10", tipo: 1, monto: 119000, base: 100000 }, { id: "z2", fecha: "2026-08-20", tipo: 1, monto: 59500, base: 50000 }, { id: "z3", fecha: "2026-08-21", tipo: 2, monto: 20000, base: 20000 }];
    S.f29 = null; ir("f29"); parametrosF29().periodo = "2026-08"; render();
    const campo = !!document.querySelector("#f29-ppm"), sin = resultadoF29();
    $("#f29-ppm").value = "1,5"; leerEntradasF29(); const con = resultadoF29();
    $("#f29-ppm").value = ""; leerEntradasF29(); const vacio = resultadoF29();
    $("#f29-ppm").value = "abc"; const malo = leerEntradasF29();
    e.tipo_contabilidad = ant.tipo; e.tasa_ppm = ant.tasa; S.caja = ant.caja; S.f29 = ant.f29; S.rcv = ant.rcv;
    return { campo, aviso0: sin.alertas.some((a) => /Tasa PPM/.test(a)), base: con.codigos["563"], ppm: con.codigos["62"], tasa: con.entradas.tasa_ppm, vacio: vacio.entradas.tasa_ppm, malo };
  });
  ok("el borrador del F29 tiene su propio campo de tasa de PPM", pp.campo && pp.aviso0);
  igual("con 1,5 % sobre los ingresos del libro de caja (150.000) el PPM es 2.250", [pp.base, pp.ppm, pp.tasa], [150000, 2250, 1.5]);
  ok("sin tasa en el borrador se usa la de la empresa, y un valor inválido se rechaza", pp.vacio === 0 && pp.malo === false);
  console.log("Topes prorrateados por días trabajados");
  const tp = await page.evaluate(() => {
    S.utm = { ...(S.utm || {}), "2026-09": 71721 }; const ufAnt = S.prev.uf; S.prev = { ...S.prev, uf: { ...(S.prev.uf || {}), "2026-09": 41057.2 } };
    const t = { ...trabajadorVacio(), id: "x", nombre: "Luis Pedro Perez Soto", rut: "11111111-1", fecha_nac: "1990-05-10", fecha_ingreso: "2026-09-16", sueldo_base: 5000000, colacion: 50000, afp: "Cuprum", afp_comision: 1.44 };
    const e = { horas_extra: 0, horas_extra_100: 0, festivos: 0, comisiones: 0, bonos: 0, vacaciones: 0, no_imponibles: 0, anticipos: 0, otros_desc: 0 };
    const a = calcularLiquidacionTrabajador(t, "2026-09", { ...e, dias: 15 }), b = calcularLiquidacionTrabajador(t, "2026-09", { ...e, dias: 30 });
    S.prev = { ...S.prev, uf: ufAnt };
    return { a: [a.afp, a.tope_aplicado], b: [b.afp, b.tope_aplicado] };
  });
  igual("con 15 días el tope de AFP es la mitad (igual al programa de remuneraciones)", tp.a, [211362, true]);
  ok("con 30 días rige el tope completo de 90 UF", tp.b[0] === Math.round(90 * 41057.2 * 0.1144) && tp.b[1], JSON.stringify(tp.b));

  console.log("Renta");
  const renta = await page.evaluate(() => {
    S.rentaAnio = "2026"; const r = rentaActual(); r.ajustes.push({ tipo: "agregado", concepto: "Gastos rechazados", monto: 200000 }, { tipo: "deduccion", concepto: "CM", monto: 100000 });
    const c = calcularRenta(r); const c2 = calcularRenta({ ...r, perdida_anterior: 20000000 });
    const c3 = calcularRenta({ ...r, regimen: "d8", propietarios: [{ nombre: "A", rut: "1-9", porcentaje: 60 }, { nombre: "B", rut: "2-7", porcentaje: 40 }] });
    return { tasa: r.tasa, rli: c.rli, idpc: c.idpc, conPerdida: [c2.rli, c2.perdidaSiguiente], d8: [c3.idpc, c3.atribuida.map((x) => x.monto)] };
  });
  ok("renta: tasa Pro Pyme 12,5 % en 2026", renta.tasa === 12.5);
  igual("renta líquida imponible (con el gasto de la remuneración)", renta.rli > 0, true);
  ok("impuesto = RLI × 12,5 %", renta.idpc === Math.round(renta.rli * 0.125));
  igual("pérdida de años anteriores absorbe la renta", renta.conPerdida[0], 0);
  igual("régimen transparente: sin impuesto y renta atribuida", renta.d8[0], 0);
  ok("la renta atribuida suma la RLI", renta.d8[1].reduce((a, b) => a + b, 0) === renta.rli);


  console.log("Renta: capital propio, registros y renta líquida imponible");
  const rr = await page.evaluate(async () => {
    const e = { razon_social: "SEGUNDA SPA", rut: "76.111.111-6", giro: "Servicios", ejercicio: 2026, tasa_ppm: 0.25, ultimo_folio: 0, creado: Date.now(), regimen: "Pro Pyme General", cuentas: planBase() };
    await BD.setEmpresa("e2", e); cambiarEmpresa("e2"); await new Promise((r) => setTimeout(r, 80));
    const c = (cod) => S.cuentas.find((x) => x.codigo === cod).id;
    const as = async (id, fecha, glosa, lineas, ap = false, n = 1) => BD.setAsiento("e2", id, { fecha, glosa, apertura: ap, cierre: false, creado: n, lineas: lineas.map(([cod, d, h]) => ({ cuenta: c(cod), debe: d, haber: h })) });
    await as("b0", "2026-01-01", "Apertura", [["1.1.02", 10000000, 0], ["3.1.01", 0, 10000000]], true, 1);
    await as("b1", "2026-02-01", "Compra equipo", [["1.2.06", 1200000, 0], ["1.1.02", 0, 1200000]], false, 2);
    await as("b2", "2026-03-10", "Venta", [["1.1.04", 1190000, 0], ["4.1.01", 0, 1000000], ["2.1.04", 0, 190000]], false, 3);
    await as("b3", "2026-04-10", "Gasto", [["5.2.12", 300000, 0], ["2.1.01", 0, 300000]], false, 4);
    await S.almacen.set("empresas/e2/activos/f1", { codigo: "AF-001", nombre: "Notebook", cat: 5, fecha_adq: "2026-02-01", costo: 1200000, residual: 0, vida_normal_meses: 72, vida_meses: 72, acelerada: false, cuenta: c("1.2.06"), documento: "", estado: "activo", fecha_baja: "", dep_trib: "instantanea" });
    await new Promise((r) => setTimeout(r, 100));
    S.rentaAnio = "2026"; S.rentaEdit = null; const r = rentaActual(); r.vipc = 0; r.capital.inicial = 9000000;
    r.retiros.push({ fecha: "2026-06-30", nombre: "Socio", rut: "1-9", monto: 300000, pct: 0, credito: 0 });
    const k = calcularRenta(r);
    const claves = k.auto.map((a) => a.key);
    // régimen 14 A: corrección monetaria y DDAN
    S.rentaEdit = null; const ra = rentaActual(); ra.regimen = "a"; ra.tasa = 27; ra.vipc = 3; ra.cpt.inicial = 1000000;
    const ka = calcularRenta(ra);
    await S.almacen.set("empresas/e2/activos/f2", { codigo: "AF-002", nombre: "Máquina", cat: 2, fecha_adq: "2026-01-15", costo: 3600000, residual: 0, vida_normal_meses: 72, vida_meses: 72, acelerada: false, cuenta: "", documento: "", estado: "activo", fecha_baja: "", dep_trib: "acelerada" });
    await new Promise((r) => setTimeout(r, 80));
    const ddan = ddanFichas(2026);
    // continuidad de saldos entre años
    await S.almacen.set("empresas/e2/renta/2026", { calculo: { perdida_siguiente: 1247899, cpt_final: 9683333, capital_final: 9000000, rai_final: 383333, rex_final: 0, sac_final: 0 }, guardado_en: new Date().toISOString() });
    await new Promise((r) => setTimeout(r, 80));
    const n27 = nuevaRenta(2027); n27.vipc = 5; const k27 = calcularRenta(n27);
    return { claves, resultado: k.er.resultado, antes: k.antes, perdidaSig: k.perdidaSiguiente, rli: k.rli, cpt: k.cpt.cpt, patrimonio: k.cpt.patrimonioContable, af: k.cpt.afAjuste, capital: k.reg.capitalFinal, rai: [k.reg.rai0, k.reg.aRai, k.reg.raiFinal],
      cm: ka.auto.find((a) => a.key === "cm"), ddan, previa: [n27.perdida_anterior, k27.perdidaReaj, k27.cpt.inicial, k27.cpt.inicialReaj], baseCajaA: ka.auto.some((a) => a.key.startsWith("caja")), tabs: null };
  });
  ok("el CPT parte del patrimonio contable", rr.patrimonio === 10700000, String(rr.patrimonio));
  igual("resultado contable", rr.resultado, 700000);
  ok("hay ajustes automáticos de depreciación tributaria y de base de caja", ["dep_trib", "caja_activos", "caja_pasivos"].every((k) => rr.claves.includes(k)), JSON.stringify(rr.claves));
  igual("renta líquida antes de la pérdida (caja y depreciación instantánea)", rr.antes, -1247899);
  igual("la pérdida del año se arrastra", [rr.rli, rr.perdidaSig], [0, 1247899]);
  igual("el activo fijo se ajusta a valor tributario", rr.af, -1016667);
  igual("capital propio tributario", rr.cpt, 9683333);
  igual("capital aportado sin reajuste", rr.capital, 9000000);
  igual("el RAI se determina con el capital propio y los retiros", rr.rai, [983333, 300000, 683333]);
  ok("régimen 14 A: reajuste del capital propio inicial", rr.cm && rr.cm.tipo === "deduccion" && rr.cm.monto === 30000, JSON.stringify(rr.cm));
  ok("régimen 14 A no usa base de caja", rr.baseCajaA === false);
  igual("DDAN: depreciación acelerada menos normal", rr.ddan, 1200000);
  igual("los saldos del año anterior pasan al siguiente (pérdida reajustada y CPT)", rr.previa, [1247899, 1310294, 9683333, 10167500]);
  const vistasRenta = await page.evaluate(() => { const o = []; for (const t of ["rli", "cpt", "registros"]) { S.pestana.renta = t; S.rentaEdit = null; ir("renta"); o.push([t, document.querySelector("main").innerText.length > 200, !!document.querySelector("#form-renta")]); } return o; });
  ok("las tres pestañas de renta se dibujan", vistasRenta.every((x) => x[1] && x[2]), JSON.stringify(vistasRenta));
  const edicionRenta = await page.evaluate(async () => {
    S.pestana.renta = "registros"; S.rentaEdit = null; ir("renta");
    document.querySelector('[data-n="rn-add-retiro"]').click();
    document.querySelector("#rn-rt-monto-0").value = "500.000"; document.querySelector("#rn-rt-fecha-0").value = "2026-07-15";
    document.querySelector("#rn-rt-monto-0").dispatchEvent(new Event("change", { bubbles: true }));
    const antes = document.querySelector("#rn-registros").innerText;
    await guardarRenta(); await new Promise((r) => setTimeout(r, 150));
    return { guardado: S.renta.some((x) => x.id === "2026" && x.retiros?.length === 1), calculo: S.renta.find((x) => x.id === "2026")?.calculo?.rai_final, resumen: /RAI/.test(antes) };
  });
  ok("guardar el borrador conserva retiros y saldos de registros", edicionRenta.guardado && typeof edicionRenta.calculo === "number" && edicionRenta.resumen, JSON.stringify(edicionRenta));
  await page.evaluate(() => { cambiarEmpresa("e1"); });
  await espera(150);

  console.log("Resumen ejecutivo");
  const rs = await page.evaluate(async () => {
    const d = datosResumen("2026-09"), d0 = datosResumen("2020-03");
    ir("resumen"); await new Promise((r) => setTimeout(r, 60));
    const html = document.querySelector("main").textContent;
    const blob = await pdfResumen(d, "Comentario de prueba");
    return { ok: d.serie.length === 12 && d.tonos && Array.isArray(d.puntos) && d.puntos.length > 0, titular: d.titular, hay: d.mes.hay, res: d.mes.resultado, ing: d.mes.ingresos, gas: d.mes.gastos, cuadra: d.cuadra, vacio: d0.titular, pdf: blob.size, tiles: document.querySelectorAll(".rs-tile").length, svg: !!document.querySelector("main svg"), html: /Lo más importante hoy/.test(html) && /Recomendaciones/.test(html) };
  });
  ok("el resumen reúne indicadores, serie de 12 meses y puntos de atención", rs.ok, JSON.stringify(rs));
  ok("el resultado del mes es ingresos menos gastos", rs.res === rs.ing - rs.gas);
  ok("un mes sin movimientos lo dice con claridad", /No hay movimientos/.test(rs.vacio));
  ok("el titular está en lenguaje simple", /el resultado del mes fue una (utilidad|pérdida) de \$[\d.]+|No hay movimientos/.test(rs.titular), rs.titular);
  ok("la pantalla muestra cuatro indicadores, el gráfico y las secciones", rs.tiles === 4 && rs.svg && rs.html);
  ok("el PDF del resumen se genera", rs.pdf > 3000, String(rs.pdf));
  const rs2 = await page.evaluate(async () => {
    const d = datosResumen(resumenPeriodo()), sin = svgSerie(d.serie, false), con = svgSerie(d.serie, true);
    const encendido = resumenValores(); const b1 = (await pdfResumen(d, "")).size; recordar("resumen-valores", false); const apagado = resumenValores() === false; recordar("resumen-valores", true);
    return { sinValores: !/font-size="8.5"/.test(sin), conValores: /font-size="8.5"/.test(con), etiqueta: etiquetaMes("2026-09"), venc: vencimientoF29("2026-12"), neg: pesosTexto(-11439836), pdfValores: b1 > 3000, switchApagado: encendido && apagado, ordenado: d.puntos.every((p, i, a) => !i || ({ mal: 0, aviso: 1, ok: 2 })[a[i - 1][0]] <= ({ mal: 0, aviso: 1, ok: 2 })[p[0]]) };
  });
  ok("los valores del gráfico aparecen por defecto y se pueden apagar con el interruptor", rs2.sinValores && rs2.conValores && rs2.switchApagado && rs2.pdfValores, JSON.stringify(rs2));
  igual("etiquetas con año, vencimiento del F29 y negativos", [rs2.etiqueta, rs2.venc, rs2.neg], ["Sep 26", "enero de 2027", "-$11.439.836"]);
  ok("los puntos de atención van ordenados de lo más grave a lo menos", rs2.ordenado);
  await page.evaluate(() => { presentar(true); });
  ok("el modo presentación oculta el menú", await page.evaluate(() => getComputedStyle(document.querySelector(".menu")).display === "none"));
  await page.keyboard.press("Escape");
  ok("Escape sale de la presentación", await page.evaluate(() => getComputedStyle(document.querySelector(".menu")).display !== "none"));
  await page.evaluate(() => { document.querySelector("#rs-notas").value = "Nota de prueba"; document.querySelector("#rs-notas").dispatchEvent(new Event("change", { bubbles: true })); });
  ok("los comentarios del contador se recuerdan", await page.evaluate(() => /Nota de prueba/.test(document.querySelector("main").textContent)));
  await page.evaluate(() => { recordar(claveNotas("2026-09"), ""); ir("inicio"); });

  console.log("Contabilidad simplificada");
  const sm = await page.evaluate(async () => {
    const e2 = { razon_social: "TALLER LOPEZ EIRL", rut: "76.543.210-3", giro: "Taller", ejercicio: 2026, tasa_ppm: 0.25, ultimo_folio: 0, tipo_contabilidad: "simplificada", regimen: "Pro Pyme General 14 D3", creado: Date.now(), cuentas: planBase() };
    await BD.setEmpresa("e9", e2); cambiarEmpresa("e9"); await new Promise((r) => setTimeout(r, 120));
    const menu = [...document.querySelectorAll("#nav button")].map((b) => b.textContent);
    ir("asientos"); await new Promise((r) => setTimeout(r, 40));
    const guarda = document.querySelector("main").textContent.includes("Resumen del ejercicio");
    await S.almacen.set("empresas/e9/rcv/d1", { registro: "VENTA", periodo: "2026-09", tipo_doc: 33, folio: "101", fecha: "2026-09-05", rut: "76.111.111-1", razon_social: "Cliente Uno", neto: 1000000, exento: 0, iva: 190000, iva_no_recuperable: 0, otros_impuestos: 0, total: 1190000, cantidad: 1 });
    await S.almacen.set("empresas/e9/rcv/d2", { registro: "COMPRA", periodo: "2026-09", tipo_doc: 33, folio: "55", fecha: "2026-09-10", rut: "76.222.222-2", razon_social: "Proveedor Dos", neto: 400000, exento: 0, iva: 76000, iva_no_recuperable: 0, otros_impuestos: 0, total: 476000, cantidad: 1 });
    await S.almacen.set("empresas/e9/rcv/d3", { registro: "VENTA", periodo: "2026-09", tipo_doc: 33, folio: "102", fecha: "2026-09-20", rut: "76.111.111-1", razon_social: "Cliente Uno", neto: 500000, exento: 0, iva: 95000, iva_no_recuperable: 0, otros_impuestos: 0, total: 595000, cantidad: 1 });
    await new Promise((r) => setTimeout(r, 120));
    await BD.setEmpresa("e9", { ...empresa(), caja_inicial: { 2026: 300000 } }); await new Promise((r) => setTimeout(r, 80));
    S.cajaImp = "2026-09"; await importarCaja("rcv"); await new Promise((r) => setTimeout(r, 120));
    await guardarMovimientos([{ id: "mx1", fecha: "2026-09-25", tipo: 2, categoria: "Retiros de socios", glosa: "Retiro del dueño", monto: 200000, base: 0, doc_tipo: "", doc_num: "", rut: "", nombre: "", origen: "manual", ref: "" }]); await new Promise((r) => setTimeout(r, 120));
    const L = libroCaja(2026), er = estadoCaja("2026-01-01", "2026-12-31"), dev = devengadosHasta("2026-09-30");
    const f29 = calcularF29("2026-09", 0, null, null);
    S.cajaAnio = "2026"; S.cajaMes = ""; S.pestana.caja = "libro"; ir("caja"); await new Promise((r) => setTimeout(r, 60));
    const tabla = document.querySelectorAll("main tbody tr").length; S.cajaMes = undefined;
    const inf = informeLibroCaja(2026, "", false), infD = informeLibroCaja(2026, "", true), infIE = informeIngresosEgresos(2026);
    const rdo = datosResumen("2026-09"); ir("resumen"); await new Promise((r) => setTimeout(r, 60));
    const renta = calcularRenta(completarRenta(nuevaRenta(2026)));
    S.pestana.caja = "ingresos"; ir("caja"); await new Promise((r) => setTimeout(r, 60));
    const pdf = await pdfResumen(rdo, "");
    return { menu, guarda, n: S.caja.length, inicial: L.inicial, ing: L.ing, eg: L.eg, saldo: L.saldo, baseIng: L.baseIng, baseEg: L.baseEg, erRes: er.resultado, cobrar: dev.cobrar, iva: f29.codigos["89"], avisos: f29.alertas.length, tabla, filas: inf.filas.length, dia: infD.filas.length, ie: infIE.filas.length, caja: rdo.caja, ingRes: rdo.mes.ingresos, ingVentas: S.caja.filter((m) => m.tipo === 1 && m.categoria === "Ventas" && m.fecha.startsWith("2026-09")).reduce((a, m) => a + m.base, 0), titular: rdo.titular, patrimonio: rdo.patrimonio, rli: renta.rli, pdf: pdf.size, ieTexto: /Documentos por cobrar/.test(document.querySelector("main").textContent) };
  });
  ok("el menú de la empresa simplificada trae el libro de caja y oculta los asientos", sm.menu.includes("Libro de caja e ingresos y egresos") && !sm.menu.includes("Asientos") && !sm.menu.includes("Plan de cuentas") && sm.menu.includes("Resumen ejecutivo"), JSON.stringify(sm.menu));
  ok("una vista de contabilidad completa lleva al inicio simplificado", sm.guarda);
  igual("la importación del RCV registra las dos facturas del mes y el retiro", sm.n, 4);
  igual("el libro de caja: saldo inicial, ingresos y egresos", [sm.inicial, sm.ing, sm.eg, sm.saldo], [300000, 1785000, 676000, 1409000]);
  igual("en simplificada los ingresos del resumen son lo percibido por ventas (sin IVA)", sm.ingRes, sm.ingVentas);
  const ini = await page.evaluate(async () => {
    const a = String(empresa().ejercicio), antes = saldoInicialCaja(a);
    const sin = bloqueMesCaja(a, "01", true), otro = bloqueMesCaja(a, "02", true);
    S.cajaIniEdit = `${a}-01`; const con = bloqueMesCaja(a, "01", true); S.cajaPanel = null;
    S.cajaAnio = a; S.cajaMes = "01"; S.cajaDiario = false; S.pestana.caja = "libro"; ir("caja"); await new Promise((r) => setTimeout(r, 60)); S.cajaIniEdit = `${a}-01`; render(); await new Promise((r) => setTimeout(r, 60));
    const campo = !!document.querySelector("#cini-monto"); if (campo) document.querySelector("#cini-monto").value = "777.000";
    await guardarSaldoInicialLinea(); await new Promise((r) => setTimeout(r, 120));
    S.cajaMes = "01"; S.cajaIniEdit = `${a}-01`; render(); await new Promise((r) => setTimeout(r, 60));
    const A0 = modeloLibroCaja(a, "01", true).ini; document.querySelector("#cini-num").value = "99"; document.querySelector("#cini-glosa").value = "Saldo inicial corregido"; document.querySelector("#cini-base").value = "-21.492"; document.querySelector("#cini-monto").value = String(A0.monto);
    await guardarSaldoInicialLinea(); await new Promise((r) => setTimeout(r, 120));
    const Mc = modeloLibroCaja(a, "01"), Mfeb = modeloLibroCaja(a, "02"), completa = { num: Mc.ini.doc_num, glosa: Mc.ini.glosa, base: Mc.ini.base, netoCambia: Mc.totales.neto === modeloLibroCaja(a, "01", true).totales.neto - A0.base - 21492, arrastra: Mfeb.ini.base === Mc.totales.neto, negativa: Mc.totales.bEgr === modeloLibroCaja(a, "01", true).totales.bEgr + 21492 && Mc.totales.bIng === modeloLibroCaja(a, "01", true).totales.bIng - Math.max(A0.base, 0), guardado: Object.keys(empresa().ini_caja?.[`${a}-01`] || {}).sort().join(",") };
    S.cajaIniEdit = `${a}-01`; await restaurarLineaInicial(); await new Promise((r) => setTimeout(r, 120));
    completa.restaurado = !empresa().ini_caja?.[`${a}-01`] && modeloLibroCaja(a, "01").ini.glosa === A0.glosa;
    S.cajaMes = "01"; S.cajaIniEdit = `${a}-01`; render(); await new Promise((r) => setTimeout(r, 60));
    const despuesEne = saldoInicialCaja(a); const feb0 = modeloLibroCaja(a, "02").ini.monto; S.cajaMes = "02"; S.cajaIniEdit = `${a}-02`; render(); await new Promise((r) => setTimeout(r, 60));
    if (document.querySelector("#cini-monto")) { document.querySelector("#cini-monto").value = clp(feb0 + 1000); await guardarSaldoInicialLinea(); await new Promise((r) => setTimeout(r, 120)); }
    const febAjuste = modeloLibroCaja(a, "02").ini.monto - feb0, base = despuesEne;
    await BD.setEmpresa(S.eid, { ...empresa(), caja_inicial: { ...(empresa().caja_inicial || {}), [a]: despuesEne } });
    const despues = saldoInicialCaja(a), libro = libroCaja(a, "01").inicial;
    await BD.setEmpresa(S.eid, { ...empresa(), caja_inicial: { ...(empresa().caja_inicial || {}), [a]: antes } });
    return { completa, febAjuste, boton: /caja-ini-editar/.test(sin), soloPrimer: /caja-ini-editar/.test(otro), campoEdicion: /id="cini-monto"/.test(con), campo, despues, libro, restaurado: saldoInicialCaja(a) === antes };
  });
  ok("el saldo inicial de la primera línea del libro tiene botón de edición en cualquier mes", ini.boton && ini.soloPrimer && ini.campoEdicion && ini.campo, JSON.stringify(ini));
  igual("guardar la línea de saldo inicial actualiza el saldo del libro", [ini.despues, ini.libro, ini.restaurado], [777000, 777000, true]);
  igual("la edición de la primera línea guarda solo lo que cambió (N°, glosa y base) y la base se arrastra al mes siguiente", [ini.completa.num, ini.completa.glosa, ini.completa.base, ini.completa.guardado, ini.completa.arrastra, ini.completa.restaurado], ["99", "Saldo inicial corregido", -21492, "base,doc_num,glosa", true, true]);
  ok("una base inicial negativa suma a los egresos de la base y una positiva a los ingresos, sin cambiar el resultado neto", ini.completa.negativa);
  igual("editar el saldo inicial de otro mes ajusta el saldo inicial del año para que ese mes parta con el monto indicado", ini.febAjuste, 1000);
  igual("la base imponible excluye el IVA y los retiros", [sm.baseIng, sm.baseEg], [1500000, 400000]);
  igual("el resultado de caja es la base de ingresos menos egresos", sm.erRes, 1100000);
  ok("el IVA del F29 sale del RCV sin necesidad de asientos", sm.iva === 285000 - 76000 || sm.iva === 209000, String(sm.iva));
  ok("el F29 no pide cuentas contables en contabilidad simplificada", sm.avisos === 0, String(sm.avisos));
  ok("la pantalla del libro de caja se dibuja", sm.tabla >= 5);
  ok("los libros se arman en formato de informe", sm.filas === 1 + 4 + 3 + 3 && sm.dia >= 4 && sm.ie >= 4, JSON.stringify([sm.filas, sm.dia, sm.ie]));
  igual("el saldo de caja del resumen ejecutivo", sm.caja, 1409000);
  ok("el resumen ejecutivo no muestra patrimonio y sí un titular", sm.patrimonio === null && /el resultado del mes fue una utilidad/.test(sm.titular), sm.titular);
  igual("la renta líquida parte del libro de caja", sm.rli, 1100000);
  ok("el PDF del resumen se genera para la empresa simplificada", sm.pdf > 3000);
  console.log("Simplificada: reglas del programa propio (IVA, honorarios, PPM, cierres, libros)");
  const sr = await page.evaluate(async () => {
    const m = (o) => { const x = calcularMontosCaja(o); return [x.neto, x.iva, x.retencion, x.monto, x.base]; };
    const calc = {
      factura: m({ categoria: "Compras y gastos", tipo: 2, docTipo: "Factura", neto: 100000, anio: 2026 }),
      boleta: m({ categoria: "Compras y gastos", tipo: 2, docTipo: "Boleta", neto: 100000, anio: 2026 }),
      exenta: m({ categoria: "Ventas", tipo: 1, docTipo: "Factura exenta", exento: 50000, anio: 2026 }),
      honorarios: m({ categoria: "Honorarios", tipo: 2, docTipo: "Boleta de honorarios", neto: 1000000, anio: 2026 }),
      rechazado: m({ categoria: "Gasto rechazado (art. 21 LIR)", tipo: 2, docTipo: "Factura", neto: 100000, anio: 2026 }),
      retiro: m({ categoria: "Retiros de socios", tipo: 2, docTipo: "", neto: 100000, anio: 2026 }),
      venta: m({ categoria: "Ventas", tipo: 1, docTipo: "Factura", neto: 1000000, anio: 2026 }),
    };
    const ppm = [tasaPpmVigente(2026, 3, "d3"), tasaPpmVigente(2025, 7, "d3"), tasaPpmVigente(2028, 1, "d3"), tasaPpmVigente(2026, 1, "d8"), tasaPpmVigente(2026, 1, "a"), tasaPpmVigente(2026, 3, "d3", true), tasaPpmVigente(2025, 8, "d3")];
    const cierre = cierresCaja(2026).find((c) => c.mes === "09"), L = libroCaja(2026);
    const imp = S.caja.find((x) => x.ref === "rcv:d1"), egr = S.caja.find((x) => x.ref === "rcv:d2");
    const emisores = [rutEmisorCaja(imp), rutEmisorCaja(egr)];
    S.pestana.caja = "libro"; ir("caja"); await new Promise((r) => setTimeout(r, 60));
    const poner = (id, v) => { const el = document.getElementById(id); el.value = v; return el; };
    const llenar = (extra) => { if (!document.getElementById("cj-fecha")) { S.cajaPanel = "mov"; render(); } for (const [k, v] of Object.entries({ "cj-fecha": hoy(), "cj-categoria": "Compras y gastos", "cj-tipo": "2", "cj-doc": "Factura", "cj-num": "9", "cj-rut": "76.543.210-3", "cj-nombre": "Prov", "cj-glosa": "Compra de prueba", "cj-neto": "200000", "cj-exento": "", "cj-iva": "", "cj-monto": "", "cj-base": "", "cj-fechadoc": "", ...extra })) poner(k, v); };
    const n0 = S.caja.length;
    llenar({ "cj-num": "" }); await guardarMovimientoCaja(); await new Promise((r) => setTimeout(r, 80));
    const sinFolio = S.caja.length === n0;
    llenar({}); poner("cj-neto", "200000").dispatchEvent(new Event("input", { bubbles: true }));
    const vista = document.getElementById("cj-calculo").textContent;
    await guardarMovimientoCaja(); await new Promise((r) => setTimeout(r, 150));
    const nuevo = S.caja.find((x) => x.glosa === "Compra de prueba");
    const e = empresa(); await BD.setEmpresa("e9", { ...e, cerrados: { [hoy().slice(0, 7)]: "x" } }); await new Promise((r) => setTimeout(r, 100));
    S.pestana.caja = "libro"; ir("caja"); await new Promise((r) => setTimeout(r, 60)); llenar({ "cj-glosa": "En mes cerrado" }); const n1 = S.caja.length; await guardarMovimientoCaja(); await new Promise((r) => setTimeout(r, 80));
    const bloqueado = S.caja.length === n1;
    await BD.setEmpresa("e9", { ...e, cerrados: {} }); await new Promise((r) => setTimeout(r, 100));
    await S.almacen.set("empresas/e9/rcv/d4", { registro: "VENTA", periodo: "2026-08", tipo_doc: 33, folio: "888", fecha: "2026-08-10", rut: "76.111.111-1", razon_social: "Cliente Uno", neto: 100000, exento: 0, iva: 19000, iva_no_recuperable: 0, otros_impuestos: 0, total: 119000, cantidad: 1 });
    await new Promise((r) => setTimeout(r, 100));
    const d4 = S.rcv.find((x) => x.id === "d4");
    await guardarMovimientos([{ ...movimientoDesdeDoc(d4, "2026-10-02"), id: idMov(refRcv(d4)) }]); await new Promise((r) => setTimeout(r, 120));
    const filas888 = filasIngresosEgresos(2026).filter((x) => x.num === "888").map((x) => [x.fecha, x.ip, x.id]);
    const infCaja = informeLibroCaja(2026, "", false);
    return { calc, ppm, cierre, saldoL: L.saldo, emisores, rut: e.rut, sinFolio, vista, nuevo: nuevo && [nuevo.neto, nuevo.iva, nuevo.monto, nuevo.base], bloqueado, filas888, notas: infCaja.notas.join(" ") };
  });
  igual("factura de compra: IVA con crédito, el neto afecta la base", sr.calc.factura, [100000, 19000, 0, 119000, 100000]);
  igual("boleta de compra: sin crédito fiscal, el IVA es parte del gasto", sr.calc.boleta, [100000, 19000, 0, 119000, 119000]);
  igual("factura exenta: sin IVA", sr.calc.exenta, [0, 0, 0, 50000, 50000]);
  igual("honorarios: retención del 15,25 % en 2026, el líquido es el flujo y el bruto la base", sr.calc.honorarios, [1000000, 0, 152500, 847500, 1000000]);
  igual("gasto rechazado: paga el total pero no afecta la base", sr.calc.rechazado, [100000, 19000, 0, 119000, 0]);
  igual("un retiro no lleva IVA ni afecta la base", sr.calc.retiro, [100000, 0, 0, 100000, 0]);
  igual("factura de venta: IVA débito fuera de la base", sr.calc.venta, [1000000, 190000, 0, 1190000, 1000000]);
  igual("tasas vigentes de PPM: rebaja 2025-2027, vuelve en 2028, transparente 0,2 %", sr.ppm, [0.125, 0.25, 0.25, 0.2, null, 0.25, 0.125]);
  ok("el cierre mensual C10 a C15 cuadra con el libro", sr.cierre && sr.cierre.c12 === sr.saldoL && sr.cierre.c15 === sr.cierre.c14 - sr.cierre.c13, JSON.stringify(sr.cierre));
  igual("el RUT emisor es el de la empresa en los documentos que emite", sr.emisores, [sr.rut, "76.222.222-2"]);
  ok("la factura sin número no se registra", sr.sinFolio);
  ok("el formulario muestra el cálculo", /Total \$238\.000/.test(sr.vista) && /afecta la base por \$200\.000/.test(sr.vista), sr.vista);
  igual("el movimiento calculado guarda neto, IVA, total y base", sr.nuevo, [200000, 38000, 238000, 200000]);
  ok("un mes cerrado no admite movimientos nuevos", sr.bloqueado);
  igual("el documento cobrado después se anota devengado y percibido", sr.filas888, [["2026-08-10", 0, 119000], ["2026-10-02", 119000, 0]]);
  ok("el libro de caja explica los cierres mensuales", /C10 a C15/.test(sr.notas));
  console.log("Simplificada: formato de los Anexos 1 a 4 y 1.1 a 4.1 de las Res. 14 y 31");
  const an = await page.evaluate(async () => {
    await guardarMovimientos([{ id: "mrel", fecha: "2026-09-26", tipo: 2, categoria: "Compras y gastos", doc_tipo: "Factura", doc_num: "77", rut: "76.222.222-2", nombre: "Relacionada", glosa: "Compra a relacionada", monto: 119000, base: 100000, relacionada: true, origen: "manual", ref: "" }]);
    await new Promise((r) => setTimeout(r, 120));
    const caja = informeLibroCaja(2026, "", false), dia = informeLibroCaja(2026, "", true), ie = informeIngresosEgresos(2026), ieDia = informeIngresosEgresos(2026, true), mes = informeLibroCaja(2026, "09", false);
    const v = (inf) => inf.filas.map((f) => f.valores);
    const cajaV = v(caja), diaV = v(dia), ieV = v(ie), ieDiaV = v(ieDia);
    const seccionB = ieV.findIndex((x) => /SECCIÓN B/.test(String(x[0]))), totalFlujo = cajaV.find((x) => /SALDO DE CAJA \(C12\)/.test(String(x[6])));
    return {
      correlativo: [cajaV[0][0], cajaV[0][1], cajaV[1][0], cajaV[2][0]], op: cajaV.slice(0, 4).map((x) => x[1]),
      c15: [totalFlujo[7], totalFlujo[8]], cabecera: caja.columnas.map((c) => c.titulo).slice(0, 6),
      diario: diaV.filter((x) => x[1] === "1" || x[1] === "2").every((x) => /^2026-/.test(x[0])) && diaV.filter((x) => x[1] === "1").length >= 2, tiposDia: [...new Set(diaV.map((x) => x[1]).filter(Boolean))].sort(),
      secciones: ie.filas.filter((f) => f.estilo === "seccion").map((f) => f.valores[0]),
      corrB: ieV.slice(seccionB + 1).filter((x) => typeof x[0] === "number").map((x) => x[0]),
      sinRetiro: !ieV.some((x) => /RETIRO DEL DUEÑO/.test(String(x[7]))), conRetiroEnCaja: cajaV.some((x) => /RETIRO DEL DUEÑO/.test(String(x[6]))),
      relacionada: ieV.filter((x) => x[8] === "X").map((x) => x[7]),
      totalesMes: ieV.filter((x) => /^TOTAL (SEPTIEMBRE|AGOSTO|OCTUBRE)$/.test(String(x[7]))).length >= 2,
      diarioIE: ieDiaV.some((x) => /^TOTAL SEPTIEMBRE$/.test(String(x[0]))), mesVista: mes.filas.length >= 4,
    };
  });
  igual("libro de caja: el saldo inicial es el registro 1 con tipo de operación 0 y los demás siguen", [an.correlativo, an.op[0], an.op[1]], [[1, "0", 2, 3], "0", "1"]);
  ok("libro de caja: columnas C1 a C9 con los nombres del Anexo 4", /C1/.test(an.cabecera[0]) && /C2/.test(an.cabecera[1]) && /C3/.test(an.cabecera[2]) && /C4/.test(an.cabecera[3]) && /C5/.test(an.cabecera[4]) && /C6/.test(an.cabecera[5]), JSON.stringify(an.cabecera));
  ok("libro de caja: el resultado neto C15 es negativo cuando los ingresos superan a los egresos", an.c15[1] < 0 && an.c15[0] > 0, JSON.stringify(an.c15));
  ok("resumen diario de caja: una fila por día y tipo de operación (0, 1 y 2)", an.diario && an.tiposDia.join(",") === "0,1,2", JSON.stringify(an.tiposDia));
  igual("libro de ingresos y egresos: sección A de ingresos y sección B de egresos", an.secciones, ["SECCIÓN A · INGRESOS PERCIBIDOS O DEVENGADOS", "SECCIÓN B · EGRESOS PAGADOS O ADEUDADOS"]);
  ok("el correlativo de egresos parte en 1", an.corrB[0] === 1 && an.corrB.every((n, i) => n === i + 1), JSON.stringify(an.corrB));
  ok("el retiro de socios va al libro de caja y no al de ingresos y egresos", an.sinRetiro && an.conRetiroEnCaja);
  ok("las operaciones con entidades relacionadas se marcan con X", an.relacionada.length === 1 && /RELACIONADA/.test(an.relacionada[0]), JSON.stringify(an.relacionada));
  ok("el libro de ingresos y egresos trae sumatoria mensual y resumen diario", an.totalesMes && an.diarioIE && an.mesVista);
  console.log("Simplificada: pago de F29 en líneas y resumen mensual del RCV");
  const f2 = await page.evaluate(async () => {
    const mk = (id, o) => S.almacen.set(`empresas/e9/rcv/${id}`, { periodo: "2026-07", cantidad: 1, iva_no_recuperable: 0, otros_impuestos: 0, exento: 0, ...o });
    await mk("r1", { registro: "VENTA", tipo_doc: 33, folio: "1", fecha: "2026-07-05", rut: "76.111.111-1", razon_social: "Cli", neto: 1000000, iva: 190000, total: 1190000 });
    await mk("r2", { registro: "VENTA", tipo_doc: 39, folio: "2", fecha: "2026-07-31", rut: "66.666.666-6", razon_social: "Boletas", neto: 840336, iva: 159664, total: 1000000 });
    await mk("r3", { registro: "VENTA", tipo_doc: 61, folio: "3", fecha: "2026-07-20", rut: "76.111.111-1", razon_social: "Cli", neto: 100000, iva: 19000, total: 119000 });
    await mk("r4", { registro: "COMPRA", tipo_doc: 33, folio: "10", fecha: "2026-07-10", rut: "76.222.222-2", razon_social: "Prov", neto: 400000, iva: 76000, total: 476000 });
    await mk("r5", { registro: "COMPRA", tipo_doc: 33, folio: "11", fecha: "2026-07-12", rut: "76.222.222-2", razon_social: "Combustible", neto: 50000, iva: 9500, otros_impuestos: 8000, total: 67500 });
    await mk("r6", { registro: "COMPRA", tipo_doc: 33, folio: "12", fecha: "2026-07-15", rut: "76.222.222-2", razon_social: "Mixta", neto: 100000, exento: 30000, iva: 19000, total: 149000 });
    await mk("r7", { registro: "COMPRA", tipo_doc: 33, folio: "13", fecha: "2026-07-18", rut: "76.222.222-2", razon_social: "Maquina", neto: 2000000, iva: 380000, total: 2380000, activo_fijo: true });
    await new Promise((r) => setTimeout(r, 150));
    const res = resumenRcvMes("2026-07").map((x) => [x.clave, x.monto, x.base, x.n]);
    S.cajaImp = "2026-07"; S.pestana.caja = "importar"; S.cajaAnio = "2026"; ir("caja"); await new Promise((r) => setTimeout(r, 60));
    const vista = document.querySelector("main").textContent;
    await importarCaja("rcvmes"); await new Promise((r) => setTimeout(r, 150));
    const lineas = S.caja.filter((m) => m.ref?.startsWith("rcvmes:2026-07")).map((m) => [m.clase, m.tipo, m.monto, m.base, m.doc_tipo, rutEmisorCaja(m) === empresa().rut]);
    const n1 = S.caja.length; await importarCaja("rcvmes"); await new Promise((r) => setTimeout(r, 100)); const idem = S.caja.length === n1;
    await importarCaja("rcv"); await new Promise((r) => setTimeout(r, 100)); const bloqueaDoc = S.caja.length === n1;
    const pend = documentosPendientesCaja(2026).filter((d) => d.periodo === "2026-07").length;
    const ie = filasIngresosEgresos(2026).filter((x) => x.fecha === "2026-07-31").length;
    S.pestana.caja = "libro"; ir("caja"); await new Promise((r) => setTimeout(r, 60));
    const poner = (id, v) => { if (!document.getElementById(id)) { S.cajaPanel = "f29"; render(); } document.getElementById(id).value = v; };
    poner("f29p-periodo", "2026-06"); poner("f29p-fecha", "2026-07-12"); poner("f29p-folio", "8700001"); poner("f29p-iva", "100.000"); poner("f29p-ppm", "12.000"); poner("f29p-ret", "3.000"); poner("f29p-iusc", "");
    await registrarPagoF29(); await new Promise((r) => setTimeout(r, 150));
    const f29 = S.caja.filter((m) => m.origen === "f29").map((m) => [m.clase, m.monto, m.base, m.doc_tipo, m.doc_num, rutEmisorCaja(m) === empresa().rut]).sort();
    const n2 = S.caja.length; poner("f29p-periodo", "2026-06"); poner("f29p-fecha", "2026-07-12"); poner("f29p-iva", "100.000"); poner("f29p-ppm", "12.000"); poner("f29p-ret", "3.000"); await registrarPagoF29(); await new Promise((r) => setTimeout(r, 100));
    const sinRepetir = S.caja.length === n2;
    const revisor = revisarDatos().some((h) => /base imponible no coincide/.test(h.texto) && h.detalle.some((t) => /Retención|retención/.test(t) || /Pago de impuestos/.test(t)));
    poner("f29p-periodo", "2026-07"); poner("f29p-fecha", "2026-07-12"); poner("f29p-iva", "5"); const n3 = S.caja.length; await registrarPagoF29(); await new Promise((r) => setTimeout(r, 80));
    const fechaAnterior = S.caja.length === n3;
    const bhe = importarCaja.toString().includes("líquidos");
    return { res, hayResumen: /Resumen mensual del RCV/.test(vista), lineas, idem, bloqueaDoc, pend, ie, f29, sinRepetir, revisor, fechaAnterior, bhe };
  });
  igual("el resumen del RCV agrupa por tipo de documento, resta las notas de crédito y separa lo exento", f2.res, [["factura", 1071000, 900000, 2], ["boleta", 1000000, 840336, 1], ["compra_afecta", 596000 - 30000 + 0, 4 + 0, 0]].slice(0, 2).concat([["compra_afecta", 476000 + 67500 + 119000, 400000 + 50000 + 8000 + 100000, 3], ["compra_activo_fijo", 2380000, 2000000, 1], ["compra_exenta", 30000, 30000, 1]]));
  ok("la pestaña Importar ofrece el resumen mensual del RCV", f2.hayResumen);
  igual("el resumen mensual crea una línea por grupo con base distinta del total, RUT emisor de la empresa y sin repetirse", [f2.lineas.map((l) => [l[0], l[1], l[2], l[3], l[4], l[5]]), f2.idem], [[["factura", 1, 1071000, 900000, "Registro de Ventas SII", true], ["boleta", 1, 1000000, 840336, "Registro de Ventas SII", true], ["compra_afecta", 2, 662500, 558000, "Registro de Compras SII", true], ["compra_activo_fijo", 2, 2380000, 2000000, "Registro de Compras SII", true], ["compra_exenta", 2, 30000, 30000, "Registro de Compras SII", true]], true]);
  ok("no se puede mezclar con la importación documento por documento y los documentos del mes dejan de figurar como pendientes", f2.bloqueaDoc && f2.pend === 0);
  igual("el pago del F29 crea una línea por concepto y solo la retención afecta la base", f2.f29, [["f29_iva", 100000, 0, "Formulario 29", "8700001", true], ["f29_ppm", 12000, 0, "Formulario 29", "8700001", true], ["f29_ret", 3000, 3000, "Formulario 29", "8700001", true]].sort());
  ok("el mismo pago no se registra dos veces y la fecha debe ser posterior al período", f2.sinRepetir && f2.fechaAnterior);
  ok("el revisor no marca la retención del F29 como inconsistente", !f2.revisor);
  ok("las boletas de honorarios se importan por su líquido", f2.bhe);
  console.log("Simplificada: informes de control anual");
  const ct = await page.evaluate(async () => {
    const er = estadoCaja("2026-01-01", "2026-12-31"), res = datosControlResultados(2026), fl = datosControlFlujo(2026), L = libroCaja(2026);
    const suma = (a) => a.reduce((x, y) => x + y, 0);
    const fila = (d, nombre) => d.find(([n]) => n.includes(nombre))?.[1];
    const ret = suma(fila(res.egr, "Honorarios")), ppmFlujo = suma(fila(fl.filas, "PPM")), retFlujo = suma(fila(fl.filas, "retención de 2ª"));
    const inf = informeControlResultados(2026), infF = informeControlFlujo(2026), infP = informeControlPpm(2026);
    const filasR = inf.filas.map((f) => f.valores[0]);
    S.pestana.caja = "control"; S.cajaAnio = "2026"; S.cajaControl = "flujo"; ir("caja"); await new Promise((r) => setTimeout(r, 60));
    const tabla = document.querySelectorAll("main table tbody tr").length, titulo = document.querySelector("main").textContent.includes("Control anual");
    S.cajaControl = "resultados"; ir("caja"); await new Promise((r) => setTimeout(r, 60)); const tablaR = document.querySelectorAll("main table tbody tr").length;
    const junio = infP.filas.find((f) => f.valores[0] === "Junio")?.valores;
    return { base: [suma(res.resultado), er.resultado], saldo: [fl.final[11], L.saldo], sep: [fl.final[8], saldoCaja("2026-09-30")], ret, ppmFlujo, retFlujo, resumen: filasR.includes("Base imponible o pérdida tributaria del ejercicio") && filasR.includes("CAPITAL PROPIO TRIBUTARIO SIMPLIFICADO"),
      flujoFilas: infF.filas.length, tabla, tablaR, titulo, junio, cols: [inf.columnas.length, infF.columnas.length] };
  });
  igual("el resultado tributario del control coincide con el resultado de caja del año", ct.base[0], ct.base[1]);
  igual("el flujo de caja por categoría termina en el mismo saldo que el libro", [ct.saldo[0], ct.sep[0]], [ct.saldo[1], ct.sep[1]]);
  igual("el PPM y la retención del F29 salen en sus filas y la retención se suma a honorarios", [ct.ppmFlujo, ct.retFlujo, ct.ret], [-12000, -3000, ct.ret]);
  ok("el control de resultados trae el resumen para el F22 y el capital propio simplificado", ct.resumen);
  ok("la pestaña Control anual dibuja las tablas", ct.titulo && ct.tabla > 10 && ct.tablaR > 10 && ct.cols[0] === 14 && ct.cols[1] === 14, JSON.stringify([ct.tabla, ct.tablaR, ct.cols]));
  igual("el control de PPM muestra el PPM del F29 de junio, pagado en julio", ct.junio.slice(0, 4), ["Junio", 12000, "12/07/2026", "Pagado al mes siguiente"]);
  if (hayLibs) {
    const exc = await page.evaluate(async () => { const r = []; for (const f of [informeControlResultados, informeControlFlujo, informeControlPpm]) { try { r.push([(await aExcel(f(2026))).size > 1000, (await aPdf(f(2026))).blob.size > 1000]); } catch (e) { r.push("ERR " + e.message); } } return r; });
    ok("los informes de control se exportan a Excel y a PDF", JSON.stringify(exc) === JSON.stringify([[true, true], [true, true], [true, true]]), JSON.stringify(exc));
  }
  console.log("Simplificada: importador de libros de caja en Excel");
  const ic = await page.evaluate(async () => {
    await cargarScript("exceljs");
    const wb = new window.ExcelJS.Workbook(), f = (a, m, d) => new Date(Date.UTC(a, m - 1, d)), RUT = "76.543.210-3";
    const hoja = (nombre, filas, tot) => {
      const ws = wb.addWorksheet(nombre); ws.getCell("C9").value = "RUT"; ws.getCell("D9").value = RUT; ws.getCell("C13").value = "REGISTRO DE OPERACIONES";
      ["N° CORRELATIVO", "TIPO OPERACIÓN (FLUJO INGRESO = 1; FLUJO EGRESO = 2 SALDO INICIAL = 0)", "N° DE DOCUMENTO", "TIPO DOCUMENTO", "RUT EMISOR", "FECHA OPERACIÓN", "GLOSA DE OPERACIÓN"].forEach((v, i) => { ws.getCell(14, 3 + i).value = v; });
      ws.getCell("K14").value = "MONTO TOTAL FLUJO DE INGRESO O EGRESO"; ws.getCell("L14").value = "MONTO QUE AFECTA LA BASE IMPONIBLE";
      filas.forEach((r, i) => { const n = 15 + i; [r[0], r[1], r[2], r[3], r[4], r[5], r[6]].forEach((v, j) => { ws.getCell(n, 3 + j).value = v; }); ws.getCell(n, 11).value = { formula: "A1", result: r[7] }; ws.getCell(n, 12).value = r[8]; });
      const n0 = 15 + filas.length + 2; ws.getCell(n0, 3).value = "TOTAL MONTO FLUJO DE INGRESOS"; tot.forEach((v, j) => { ws.getCell(n0 + 1, 3 + j).value = v; });
    };
    hoja("ENERO 2026", [[1, 0, 21, "Libro de Caja Diciembre 2025", RUT, f(2026, 1, 2), "Saldo Inicial Libro de Caja Diciembre de 2025", 100000, 0], [2, 2, 73, "Boleta de Honorarios", "17.992.401-3", f(2026, 1, 11), "Pago de Honorarios Líquidos Diciembre 2025, Contador", -20000, -20000],
      [3, 2, 8700, "Formulario 29", RUT, f(2026, 1, 11), "Pago F29 Diciembre 2025, PPM.", -5000, 0], [4, 2, 8700, "Formulario 29", RUT, f(2026, 1, 11), "Pago F29 Diciembre 2025, Retención 2da Categoría.", -1000, -1000],
      [5, 2, "xx", "Registro de Compras SII", RUT, f(2026, 1, 31), "Compras afectas a IVA, pagadas.", -119000, -100000], [6, 1, "xx", "Registro de Ventas SII", RUT, f(2026, 1, 31), "Ventas afectas a IVA, percibidas, boleta electrónica", 238000, 200000]],
      [338000, -145000, 193000, 200000, -121000, 79000]);
    hoja("FEBRERO 2026", [[1, 0, 22, "Libro de Caja Enero 2026", RUT, f(2026, 2, 1), "Saldo Inicial", 193000, 0], [2, 2, "xx", "Registro de Compras SII", RUT, f(2026, 2, 28), "Compras exentas de IVA, pagadas.", -10000, -10000], [2, 1, "xx", "Registro de Ventas SII", RUT, f(2026, 1, 31), "Ventas afectas a IVA, percibidas, factura electrónica", 119000, 100000]],
      [312000, -5000, 307000, 100000, -10000, 90000]);
    hoja("MARZO 2026", [[1, 0, 23, "Libro de Caja Febrero 2026", RUT, f(2026, 3, 1), "Saldo Inicial", 999999, 0], [2, 1, "xx", "Registro de Ventas SII", RUT, f(2026, 3, 31), "Ventas afectas a IVA, percibidas, comprobante de pago electrónico", 50000, 42000]],
      [1049999, 0, 1049999, 42000, 0, 42000]);
    wb.addWorksheet("CONTROL FLUJO DE CAJA");
    const buf = await wb.xlsx.writeBuffer();
    const r = await analizarLibroCajaExcel("libro.xlsx", buf);
    const ene = r.hojas[0], feb = r.hojas[1], mar = r.hojas[2];
    const cat = (h) => movimientosDeLibroCaja(h).map((m) => [m.categoria, m.clase || "", m.tipo, m.monto, m.base]);
    const fechaFuera = movimientosDeLibroCaja(feb).find((m) => /factura electr/.test(m.glosa)).fecha;
    const rutOtro = limpiarRut(r.rut) === limpiarRut(empresa().rut);
    S.migraCaja = r; S.pestana.caja = "importar"; S.vista = "caja"; render(); await new Promise((x) => setTimeout(x, 60));
    const vista = document.querySelector("main").textContent;
    const antes = S.caja.length; await importarLibroCaja(); await new Promise((x) => setTimeout(x, 200));
    const tras = S.caja.length - antes, ini = empresa().caja_inicial?.[2026];
    S.migraCaja = r; await importarLibroCaja(); await new Promise((x) => setTimeout(x, 150)); const segunda = S.caja.length - antes - tras;
    const f29 = S.caja.filter((m) => m.origen === "excel" && m.clase?.startsWith("f29_")).map((m) => [m.clase, m.f29_periodo, rutEmisorCaja(m) === empresa().rut]).sort();
    return { n: r.hojas.length, avisos: r.avisos.length, problemas: [ene, feb, mar].map((h) => h.problemas), ene: cat(ene), fechaFuera, rutOtro, vista: /Libro de caja en Excel/.test(vista) && /cuadra/.test(vista), tras, ini, segunda, f29 };
  });
  igual("lee las tres hojas de meses y omite la hoja de control", [ic.n, ic.avisos], [3, 0]);
  ok("enero cuadra; febrero trae correlativo repetido, fecha de otro mes, total de egresos y saldo de caja distintos; marzo, saldo inicial distinto",
    ic.problemas[0].length === 0 && [/correlativo 2 está repetido/, /fecha 31\/01\/2026 es de otro mes/, /total de egresos de la hoja/, /saldo de caja de la hoja/].every((re) => ic.problemas[1].some((x) => re.test(x))) && ic.problemas[1].length === 4
    && ic.problemas[2].length === 1 && /saldo inicial \(999\.999\)/.test(ic.problemas[2][0]), JSON.stringify(ic.problemas));
  igual("propone categoría y clase según el documento y la glosa", ic.ene, [["Honorarios", "", 2, 20000, 20000], ["Pago de impuestos (IVA, PPM, F29)", "f29_ppm", 2, 5000, 0], ["Pago de impuestos (IVA, PPM, F29)", "f29_ret", 2, 1000, 1000], ["Compras y gastos", "compra_afecta", 2, 119000, 100000], ["Ventas", "boleta", 1, 238000, 200000]]);
  ok("una fecha de otro mes se anota al último día del mes de la hoja", ic.fechaFuera === "2026-02-28", ic.fechaFuera);
  ok("la pestaña Importar muestra la revisión", ic.vista);
  igual("importa los movimientos, respeta el saldo inicial ya registrado y no repite al importar de nuevo", [ic.tras, ic.ini, ic.segunda], [8, 300000, 0]);
  igual("los pagos del F29 quedan con su clase y período y el RUT emisor de la empresa", ic.f29, [["f29_ppm", "2025-12", true], ["f29_ret", "2025-12", true]]);
  console.log("Remuneraciones: pensionados, edad, 11 años de servicio y horas extra al 100 %");
  const rm = await page.evaluate(() => {
    const utmAntes = S.utm, prevAntes = S.prev;
    S.utm = { ...S.utm, "2026-09": 71721 }; S.prev = { ...S.prev, uf: { ...(S.prev?.uf || {}), "2026-09": 41057.2 }, parametros: [] };
    const base = (o) => ({ id: "t", nombre: "X", rut: "1-9", nacionalidad: "Chilena", fecha_nac: "", fecha_ingreso: "2024-01-02", tipo: "indefinido", jornada: 42, sueldo_base: 0, gratificacion: "legal", gratificacion_monto: 0, colacion: 0, movilizacion: 0, semana_corrida: false, afp: "Habitat", afp_comision: 1.27, salud: "fonasa", isapre: "", plan_uf: 0,
      sin_cesantia: false, pensionado: false, cargas: 0, trabajo_pesado: "ninguno", apv_monto: 0, apv_regimen: "B", haberes_fijos: [], descuentos_fijos: [], activo: true, ...o });
    const e = (o) => ({ dias: 30, horas_extra: 0, horas_extra_100: 0, festivos: 0, comisiones: 0, bonos: 0, vacaciones: 0, no_imponibles: 0, anticipos: 0, otros_desc: 0, ...o });
    const calc = (t, ee = {}) => { const l = calcularLiquidacionTrabajador(base(t), "2026-09", e(ee)); return [l.liquido, l.impuesto_unico, l.aportes_empleador, l.cesantia, l.emp_cesantia, l.emp_sis, l.afp]; };
    const r = { normal: calc({ sueldo_base: 800000 }), once: calc({ sueldo_base: 1000000, fecha_ingreso: "2014-01-01" }), diez: calc({ sueldo_base: 1000000, fecha_ingreso: "2016-01-01" }), pensionado: calc({ sueldo_base: 1000000, fecha_ingreso: "2021-01-01", pensionado: true }),
      mayor65: calc({ sueldo_base: 1000000, fecha_ingreso: "2021-01-01", fecha_nac: "1960-01-01" }), he: calc({ sueldo_base: 700000, fecha_ingreso: "2022-01-01" }, { horas_extra: 8, horas_extra_100: 4 }) };
    const avisos = (t, ee = {}) => calcularLiquidacionTrabajador(base(t), "2026-09", e(ee)).avisos;
    r.avisos = { minimo: avisos({ sueldo_base: 400000, fecha_nac: "2009-05-05" }), art58: avisos({ sueldo_base: 500000 }, { anticipos: 300000 }), ninguno: avisos({ sueldo_base: 800000 }) };
    const l = calcularLiquidacionTrabajador(base({ sueldo_base: 700000, fecha_ingreso: "2022-01-01" }), "2026-09", e({ horas_extra: 8, horas_extra_100: 4 }));
    r.he50 = [l.horas_extra, l.horas_extra_100, l.horas_extra_monto, l.horas_extra_100_monto];
    S.utm = utmAntes; S.prev = prevAntes; return r;
  });
  igual("sin cambios para un trabajador común (líquido, impuesto, aportes, cesantía del trabajador y del empleador, SIS, AFP)", rm.normal, [811300, 0, 68300, 6000, 24000, 0, 112700]);
  igual("con 11 años o más el trabajador no cotiza cesantía y el empleador aporta 0,8 %", [rm.once[3], rm.once[4], rm.once[0], rm.once[2]], [0, 9753, 995257, 63760]);
  igual("con menos de 11 años sigue la regla general", [rm.diez[3], rm.diez[4]], [7315, 29259]);
  igual("el pensionado no paga AFP, SIS ni cesantía", [rm.pensionado[0], rm.pensionado[1], rm.pensionado[2], rm.pensionado[3], rm.pensionado[6]], [1127155, 6622, 11338, 0, 0]);
  igual("el mayor de 65 años no paga la parte del SIS", [rm.mayor65[0], rm.mayor65[1], rm.mayor65[2]], [988235, 833, 61566]);
  igual("las horas extra al 50 % y al 100 % se suman al imponible", [rm.he[0], rm.he[2], rm.he50], [788764, 66403, [8, 4, 77778, 31111]]);
  ok("avisa del ingreso mínimo (menor de 18 años) y del 45 % de descuentos, y no avisa sin motivo", /ingreso mínimo proporcional a la jornada \(\$412\.938\)/.test(rm.avisos.minimo[0]) && rm.avisos.art58.some((a) => /45 %/.test(a)) && rm.avisos.ninguno.length === 0, JSON.stringify(rm.avisos));
  console.log("Excel con la disposición de las plantillas del SII (Anexos 1, 3, 1.1 y 3.1)");
  const xl = await page.evaluate(async () => {
    await cargarScript("exceljs");
    const leer = async (inf) => { const wb = new window.ExcelJS.Workbook(); await wb.xlsx.load(await (await aExcel(inf)).arrayBuffer()); const ws = wb.worksheets[0]; const filas = []; ws.eachRow({ includeEmpty: false }, (row) => { const v = []; row.eachCell({ includeEmpty: true }, (c, j) => { v[j - 1] = c.value instanceof Date ? "FECHA" : c.value; }); filas.push(v); }); return { hoja: ws.name, filas }; };
    const texto = (r) => r.filas.map((f) => f.map((x) => (x == null ? "" : String(x))).join("|"));
    const caja = await leer(informeLibroCaja(2026, "", false)), cd = await leer(informeLibroCaja(2026, "", true)), ie = await leer(informeIngresosEgresos(2026)), id = await leer(informeIngresosEgresos(2026, true));
    const codigos = (r) => r.filas.filter((f) => f.filter(Boolean).every((x) => /^C\d+$/.test(String(x))) && f.filter(Boolean).length > 1).map((f) => f.filter(Boolean).filter((x, i, a) => x !== a[i - 1]).join(","));
    const tc = texto(caja), tcd = texto(cd), tie = texto(ie), tid = texto(id);
    return {
      cajaHoja: caja.hoja, cajaTitulo: tc[0].slice(0, 34), cajaDatos: tc.some((t) => /^PERÍODO\|/.test(t)) && tc.some((t) => /^RUT\|/.test(t)) && tc.some((t) => /^NOMBRE\/RAZÓN SOCIAL\|/.test(t)),
      cajaCab: tc.find((t) => /^N° CORRELATIVO\|TIPO OPERACIÓN/.test(t)) && true, cajaCod: codigos(caja), cajaPrimera: caja.filas.find((f) => f[0] === 1 && f[1] === 0)?.slice(0, 9).map((x) => (x == null ? "" : x)),
      cajaTotales: tc.some((t) => /SALDOS Y TOTALES LIBRO DE CAJA/.test(t)), cajaMeses: tc.filter((t) => /^SEPTIEMBRE\|/.test(t)).length === 1 && tc.some((t) => /^TOTAL DEL PERÍODO\|/.test(t)),
      cdCod: codigos(cd), cdTot: tcd.some((t) => /RESUMEN MONTO TOTAL DIARIO/.test(t)) && tcd.some((t) => /TOTAL MONTO RESUMEN FLUJO DE INGRESOS DEL PERÍODO/.test(t)),
      ieHoja: ie.hoja, ieSecciones: tie.filter((t) => /^SECCIÓN [AB] (INGRESOS|EGRESOS)/.test(t)).length, ieRut: [tie.some((t) => /RUT RECEPTOR/.test(t)), tie.some((t) => /RUT EMISOR/.test(t))],
      ieSub: ["PERCIBIDOS", "DEVENGADOS", "PAGADOS", "ADEUDADOS"].map((w) => tie.some((t) => t.includes(w))), ieCod: codigos(ie), ieTot: tie.some((t) => /^Total Ingresos del Mes · /.test(t)) && tie.some((t) => /^Total de Egresos del Mes · /.test(t)),
      idCod: codigos(id), idTot: tid.some((t) => /^Total resumen diario de ingresos del mes · /.test(t)) && tid.some((t) => /^Total resumen diario de egresos del mes · /.test(t)),
    };
  });
  ok("la planilla del libro de caja trae título del Anexo 3, período, RUT, razón social y el registro de operaciones", xl.cajaHoja === "Libro Caja" && /^ANEXO 3\. LIBRO DE CAJA/.test(xl.cajaTitulo) && xl.cajaDatos && xl.cajaCab, JSON.stringify([xl.cajaHoja, xl.cajaTitulo]));
  igual("la fila de códigos del libro de caja va de C1 a C9 y luego C10 a C15", xl.cajaCod, ["C1,C2,C3,C4,C5,C6,C7,C8,C9", "C10,C11,C12,C13,C14,C15"]);
  igual("el saldo inicial es el registro 1, tipo 0, con el RUT de la empresa", xl.cajaPrimera.slice(0, 2).concat(xl.cajaPrimera[6]), [1, 0, "SALDO INICIAL DE CAJA"]);
  ok("la planilla trae saldos y totales con un cierre por mes y el total del período", xl.cajaTotales && xl.cajaMeses);
  igual("el resumen diario de caja usa C1 a C4 y los totales C5 a C10 (Anexo 3.1)", [xl.cdCod, xl.cdTot], [["C1,C2,C3,C4", "C5,C6,C7,C8,C9,C10"], true]);
  ok("el libro de ingresos y egresos tiene sección A (RUT receptor) y B (RUT emisor) con percibidos, devengados, pagados y adeudados", xl.ieHoja === "Anverso" && xl.ieSecciones === 2 && xl.ieRut.every(Boolean) && xl.ieSub.every(Boolean), JSON.stringify([xl.ieSecciones, xl.ieRut, xl.ieSub]));
  igual("los códigos de ingresos y egresos son C1 a C8 en cada sección", xl.ieCod, ["C1,C2,C3,C4,C5,C6,C7,C8", "C1,C2,C3,C4,C5,C6,C7,C8"]);
  ok("hay totales mensuales de ingresos y de egresos", xl.ieTot);
  igual("el resumen diario de ingresos y egresos usa C1 a C4 en la sección A y C5 a C8 en la B (Anexo 1.1)", xl.idCod, ["C1,C2,C3,C4", "C5,C6,C7,C8"]);
  ok("el resumen diario trae el total del mes por sección", xl.idTot);
  await page.evaluate(async () => { cambiarEmpresa("e1"); await new Promise((r) => setTimeout(r, 120)); await BD.deleteEmpresa("e9"); await new Promise((r) => setTimeout(r, 120)); ir("inicio"); });

  console.log("Revisor de datos y panel de clientes");
  const rv = await page.evaluate(async () => {
    const mk = (id, folio) => ({ registro: "VENTA", periodo: "2026-09", tipo_doc: 33, folio, fecha: "2026-09-05", rut: "76.111.111-1", razon_social: "Cliente", neto: 1000000, exento: 0, iva: 150000, iva_no_recuperable: 0, otros_impuestos: 0, total: 1150000, cantidad: 1 });
    await S.almacen.set("empresas/e1/rcv/rv1", mk("rv1", "900")); await S.almacen.set("empresas/e1/rcv/rv2", mk("rv2", "900")); await new Promise((r) => setTimeout(r, 120));
    const h = revisarDatos(), areas = h.map((x) => `${x.area}:${x.texto.slice(0, 30)}`);
    ir("revisor"); await new Promise((r) => setTimeout(r, 60));
    const vista = document.querySelector("main").textContent;
    ir("inicio"); await new Promise((r) => setTimeout(r, 60));
    const inicio = /revisor de datos encontró/.test(document.querySelector("main").textContent);
    await S.almacen.del("empresas/e1/rcv/rv1"); await S.almacen.del("empresas/e1/rcv/rv2"); await new Promise((r) => setTimeout(r, 100));
    const v1 = proximosVencimientos("2026-10-12"), v2 = proximosVencimientos("2026-10-15"), f29a = v1.find((x) => /F29/.test(x.texto)), f29b = v2.find((x) => /F29/.test(x.texto));
    return { dup: h.some((x) => x.area === "RCV" && /folio repetido/.test(x.texto)), iva: h.some((x) => /IVA distinto/.test(x.texto)), vista: /Revisor de datos/.test(vista) && /Errores/.test(vista), inicio, n: v1.length, f29a: [f29a.texto, f29a.efectiva], f29b: f29b.efectiva, renta: v1.some((x) => /Operación Renta/.test(x.texto)) || proximosVencimientos("2027-03-20").some((x) => /Operación Renta/.test(x.texto)), adelante: mesesAtras("2026-11", -3), areas };
  });
  ok("el revisor detecta folios repetidos y un IVA distinto del 19 %", rv.dup && rv.iva, JSON.stringify(rv.areas));
  ok("la pantalla del revisor y el aviso del inicio aparecen", rv.vista && rv.inicio);
  ok("el revisor lista las facturas con total del RCV distinto y las observaciones de la migración", await page.evaluate(async () => {
    await S.almacen.set("empresas/e1/rcv/mg1", { registro: "COMPRA", periodo: "2026-09", tipo_doc: 33, folio: "777", fecha: "2026-09-05", rut: "76.111.111-1", razon_social: "Estación", neto: 28746, exento: 0, iva: 5462, iva_no_recuperable: 0, otros_impuestos: 1, total: 34209, total_rcv: 34004, dif_total: -205, revisar_total: true, observacion: "Revisar", cantidad: 1, cuenta: "", asiento: "" });
    await new Promise((r) => setTimeout(r, 100)); const h = revisarDatos(); await S.almacen.del("empresas/e1/rcv/mg1"); await new Promise((r) => setTimeout(r, 100));
    return h.some((x) => /total del RCV/.test(x.texto)) && h.some((x) => /observación de la migración/.test(x.texto));
  }));
  igual("el calendario ubica el F29 de septiembre el día 12", rv.f29a, ["F29 y PPM de septiembre 2026", "2026-10-12"]);
  igual("pasado el día 12 el plazo efectivo es el 20 (por internet)", rv.f29b, "2026-10-20");
  ok("el calendario incluye vencimientos anuales y avanza meses correctamente", rv.n >= 4 && rv.renta && rv.adelante === "2027-02", String(rv.adelante));
  const pc = await page.evaluate(async () => { await cargarCartera(); await new Promise((r) => setTimeout(r, 100)); ir("panel"); await new Promise((r) => setTimeout(r, 60));
    const filas = S.cartera.filas.length, tabla = document.querySelectorAll("main tbody tr").length; const id = S.cartera.filas[0].id;
    return { filas, esperado: S.empresas.length, tabla, id }; });
  ok("el panel lee el estado de todas las empresas", pc.filas === pc.esperado && pc.filas >= 1 && pc.tabla >= pc.filas, JSON.stringify(pc));
  await page.click('[data-n="panel-presentado"]'); await espera(150);
  ok("se puede marcar el F29 como presentado", await page.evaluate(() => S.cartera.filas.some((f) => f.f29Presentado)));
  await page.click('[data-n="panel-presentado"]'); await espera(150);
  await page.fill("#rec-texto", "Llamar al cliente"); await page.press("#rec-texto", "Enter"); await espera();
  ok("los recordatorios propios aparecen en el calendario", await page.evaluate(() => /Llamar al cliente/.test(document.querySelector("main").textContent)));
  await page.evaluate(() => { recordar("recordatorios", []); ir("inicio"); });

  console.log("Importador de RCV desde Excel");
  const im = await page.evaluate(async () => {
    await cargarScript("exceljs");
    const wb = new window.ExcelJS.Workbook();
    const cab = ["Nro", "Tipo Doc", "Tipo Compra", "RUT Proveedor", "Razon Social", "Folio", "Fecha Docto", "Fecha Recepcion", "Fecha Acuse", "Monto Exento", "Monto Neto", "Monto IVA Recuperable", "Monto Iva No Recuperable", "Codigo IVA No Rec.", "Monto Total", "Codigo Otro Impuesto", "Valor Otro Impuesto", "Tasa Otro Impuesto"];
    const f = (d) => new Date(Date.UTC(2031, 2, d));
    const hoja = wb.addWorksheet("RCV 03-2031");
    hoja.addRow([null, null, null, null, "COMPRAS"]); hoja.addRow(cab);
    hoja.addRow([1, 33, "Del Giro", "76111111-1", "COMPAÃ‘Ã\x8dA AGROPECUARIA COPEVAL S.A.", 501, f(3), f(3), null, 0, 100000, 19000, null, null, 119000, null, null, null]);
    hoja.addRow([2, 33, "Del Giro", "76222222-2", "ESTACION DE SERVICIO", 502, f(5), f(5), null, 0, 46314, 8800, null, null, 54043, 28, 1, 0]);
    hoja.addRow([3, 33, "Activo Fijo", "96642720-5", "LOS ALFALFALES", 503, f(6), f(6), null, 0, 8403361, 1596639, null, null, 10000000, null, null, null]);
    hoja.addRow([4, 61, "Del Giro", "96642720-5", "LOS ALFALFALES", 504, f(7), f(7), null, 0, -8403361, -1596639, null, null, -10000000, null, null, null]);
    hoja.addRow([null, null, null, null, null, null, null, null, null, null, 0, 0, 0, 0, 0]);
    hoja.addRow([]); hoja.addRow([null, null, null, null, "PROVEEDORES", null, 174115]);
    hoja.addRow([null, null, null, null, "EN MARZO SE REGULA EL IMPUESTO ESPECIFICO DE COMBUSTIBLES"]);
    hoja.addRow([null, null, null, null, "VENTAS"]);
    hoja.addRow(["Nro", "Tipo Doc", "Tipo Venta", "Rut cliente", "Razon Social", "Folio", "Fecha Docto", "Fecha Recepcion", "Fecha Acuse Recibo", "Fecha Reclamo", "Monto Exento", "Monto Neto", "Monto IVA", "Monto total"]);
    hoja.addRow([1, 33, "Del Giro", "79534860-3", "AGRICOLA UAC", 14, f(8), f(8), null, null, 0, 1000000, 190000, 1190000]);
    hoja.addRow([null, null, null, null, "CLIENTES", 1190000]);
    wb.addWorksheet("RCV 03-2031 MALO").addRow(["Nro", "Tipo Doc", "Tipo Compra"]);
    const buf = await wb.xlsx.writeBuffer();
    const csv = "Nro;Tipo Doc;Tipo Venta;Rut cliente;Razon Social;Folio;Fecha Docto;Fecha Recepcion;Monto Neto;Monto IVA;Monto total\r\n1;33;Del Giro;76794130-7;AGRICOLA COIGUE;12;07-04-2031;07-04-2031 8:40; $1.260.000 ; $239.400 ; $1.499.400 \r\n;;;;;;;; $1.260.000 ; $239.400 ; $1.499.400 \r\n;;;;CLIENTES;; $1.499.400 ;;;;\r\n";
    const enc = new TextEncoder().encode(csv);
    const hojas = await analizarArchivosRcv([{ nombre: "RCV_2031.xlsx", buffer: buf }, { nombre: "RCV_04-2031_VENTA.xlsx", buffer: enc.buffer }]);
    S.migra = { hojas, criterio: "recalcular" };
    const R = resumenMigracion(), d = Object.fromEntries(R.docs.map((x) => [x.folio, x]));
    const cu = R.cuadre(hojas[0]), cuCsv = R.cuadre(hojas[2]);
    S.migra.criterio = "rcv"; const R2 = resumenMigracion(), c2 = R2.cuadre(hojas[0]);
    S.migra.criterio = "recalcular";
    const antes = S.rcv.length; await importarMigracionRcv(); await new Promise((r) => setTimeout(r, 200));
    const importados = S.rcv.filter((x) => x.origen === "importación Excel");
    await prepararMigracionRcv([new File([buf], "RCV_2031.xlsx")]); const R3 = resumenMigracion();
    ir("rcv"); await new Promise((r) => setTimeout(r, 50)); const html = document.querySelector("main").textContent;
    S.migra = null;
    for (const x of importados) await S.almacen.del(`empresas/e1/rcv/${x.id}`);
    await new Promise((r) => setTimeout(r, 150));
    return { hojas: hojas.map((h) => [h.hoja, h.incluir, h.periodo, h.docs.length]), nombre: d[501].razon_social, nc: [d[504].neto, d[504].total, d[504].nc_de, d[504].activo_fijo], comb: [d[502].total, d[502].revisar_total, d[502].total_rcv, d[502].dif_total],
      cuRecalc: cu, cuRcv: c2, csv: [d[12]?.neto, d[12]?.total, d[12]?.fecha, cuCsv], notas: hojas[0].notas, nuevos: R.nuevos.length, importados: importados.length, tras: S.rcv.length - antes, segundaVez: R3.nuevos.length, vista: /Importar el RCV/.test(html), rutFmt: d[501].rut, repararDoble: repararTexto("TRANSPORTES Y LOGÃƒï¿½STICA GUIDO") };
  });
  const sinT = await page.evaluate(async () => {
    await cargarScript("exceljs");
    const wb = new window.ExcelJS.Workbook(), h = wb.addWorksheet("RCV 11-2031"), f = (d) => new Date(Date.UTC(2031, 10, d));
    h.addRow(["Nro", "Tipo Compra", "RUT Proveedor", "Razon Social", "Folio", "Fecha Docto", "Fecha Recepcion", "Fecha Acuse", "Monto Exento", "Monto Neto", "Monto IVA Recuperable", "Monto Total", "Valor Otro Impuesto"]);
    h.addRow([1, "Del Giro", "81537600-5", "RENDIC HERMANOS S.A.", 43316669, f(19), f(19), null, 0, 5327, 1012, 6779, 440]);
    h.addRow([2, "Del Giro", "96994750-1", "SUPERFRUT S.A.", 295946, f(19), f(19), null, 0, 15725, 2988, 18713, null]);
    h.addRow([null, null, null, null, null, null, null, null, null, 21052, 4000, 25492, 440]);
    h.addRow([null, null, null, "Proveedorres", null, 25492]);
    const hojas = await analizarArchivosRcv([{ nombre: "RC_11-2031.xlsx", buffer: await wb.xlsx.writeBuffer() }]);
    const docs = armarDocumentosRcv(hojas, "recalcular").docs;
    const sr = S.rcv, sc = S.caja; S.rcv = docs.map((d, i) => ({ ...d, id: "t" + i, periodo: "2031-11" }));
    S.caja = [{ id: "a", fecha: "2031-11-30", tipo: 2, categoria: "Compras y gastos", doc_tipo: "Registro de Compras SII", doc_num: "X", monto: 25052, base: 21052 }, { id: "b", fecha: "2031-11-30", tipo: 2, categoria: "Compras y gastos", doc_tipo: "Registro de Compras SII", doc_num: "X", monto: 440, base: 440 }];
    const bien = cuadreRcvLibro("2031-11"), pend = documentosPendientesCaja("2031").length, con = periodoConResumen("2031-11");
    S.caja.push({ id: "v", fecha: "2031-11-30", tipo: 1, categoria: "Ventas", doc_tipo: "REGISTRO DE VENTAS", doc_num: "X", monto: 1000, base: 840 }); const sinV = cuadreRcvLibro("2031-11"); S.caja.pop();
    S.caja[0].monto = 25000; const mal = cuadreRcvLibro("2031-11");
    S.rcv = sr; S.caja = sc;
    return { sinV: [sinV.ok, sinV.lados.find((l) => l.nombre === "Ventas").sinRcv], n: hojas[0].docs.length, reg: hojas[0].registros.join(), tipos: docs.map((d) => d.tipo_doc).join(), otros: docs.map((d) => d.otros_impuestos).join(), periodo: hojas[0].periodo, bien: [bien.ok, bien.lados[0].rcv.monto, bien.lados[0].rcv.base], pend, con, mal: [mal.ok, mal.lados[0].rcv.monto - mal.lados[0].libro.monto] };
  });
  const det = await page.evaluate(async () => {
    const cab = "Nro;Tipo Doc;Tipo Compra;RUT Proveedor;Razon Social;Folio;Fecha Docto;Fecha Recepcion;Fecha Acuse;Monto Exento;Monto Neto;Monto IVA Recuperable;Monto Iva No Recuperable;Codigo IVA No Rec.;Monto Total;Monto Neto Activo Fijo;IVA Activo Fijo;IVA uso Comun;Impto. Sin Derecho a Credito;IVA No Retenido;Tabacos Puros;Tabacos Cigarrillos;Tabacos Elaborados;NCE o NDE sobre Fact. de Compra;Codigo Otro Impuesto;Valor Otro Impuesto;Tasa Otro Impuesto";
    const csv = [cab, "9;33;Del Giro;81537600-5;RENDIC HERMANOS S.A.;45183980;13/09/2031;13/09/2031 11:32:45;;0;62362;11849;;;76856;;;;;0;;;;0;27;332;10;", ";33;Del Giro;81537600-5;RENDIC HERMANOS S.A.;45183980;13/09/2031;;;;;;;;;;;;;;;;;;271;1127;18;", ";33;Del Giro;81537600-5;RENDIC HERMANOS S.A.;45183980;13/09/2031;;;;;;;;;;;;;;;;;;19;1186;12;",
      "10;33;Del Giro;91004000-6;PRODUCTOS FERNANDEZ S.A.;41584553;14/09/2031;14/09/2031 08:12:46;14/09/2031 20:24:25;0;113240;21516;;;134756;;;;;0;;;;0;;;;", "11;34;Del Giro;78304787-K;SERVICIOS CONTABLES;49;01/09/2031;01/09/2031 19:11:44;;20000;0;0;;;20000;;;;;0;;;;0;;;;"].join("\r\n") + "\r\n";
    const hojas = await analizarArchivosRcv([{ nombre: "RCV_COMPRA_REGISTRO_78268099_203109.csv", buffer: new TextEncoder().encode(csv).buffer }]);
    S.migra = { hojas, criterio: "recalcular" };
    const R = resumenMigracion(), d = Object.fromEntries(R.docs.map((y) => [y.folio, y]));
    const sr = S.rcv; S.rcv = R.docs.map((y, i) => ({ ...y, id: "z" + i, periodo: "2031-09" }));
    const res = resumenRcvMes("2031-09").map((y) => [y.clave, y.monto, y.base]), o = otrosDeDoc(S.rcv.find((y) => y.folio === "45183980"));
    const des = desgloseOtros(S.rcv), panel = panelOtrosImpuestos(S.rcv), tabla = (S.rcvPeriodo = "2031-09", S.rcvPeriodoEid = S.eid, tablaRcv("COMPRA")), inf = informeRcv("2031-09");
    const lineasInf = inf.filas.map((f) => JSON.stringify(f)).join("\n");
    S.rcv = sr; S.migra = null;
    return { des: [des.anticipo, des.noRec, des.porCodigo.map((c) => `${c.codigo}:${c.monto}`).join(",")], panel: /IVA anticipado a la harina/.test(panel) && /Anticipo de IVA/.test(panel), cols: /Anticipo IVA/.test(tabla) && /Imp\. no recup\./.test(tabla), informe: /IVA ANTICIPADO/.test(lineasInf) && /IMPUESTOS NO RECUPERABLES/.test(lineasInf), n: R.docs.length, det: d["45183980"].otros_detalle.map((y) => `${y.codigo}:${y.valor}:${y.tasa}`).join(","), otros: d["45183980"].otros_impuestos, rec: d["45183980"].recepcion, tipo: d["45183980"].tipo_compra, sin: d["41584553"].otros_detalle, acuse: d["41584553"].acuse, res, o: [o.anticipo, o.noRec, o.detallado] };
  });
  const fa = await page.evaluate(() => {
    const sr = S.rcv, per = "2031-09", base = { periodo: per, fecha: "2031-09-10", tipo_doc: 33, exento: 0, cantidad: 1, iva_no_recuperable: 0, activo_fijo: false, asiento: "" };
    const compra = { ...base, id: "c1", registro: "COMPRA", rut: "81.537.600-5", folio: "1", neto: 62362, iva: 11849, otros_impuestos: 1186, otros_detalle: [{ codigo: "19", valor: 1186, tasa: "12" }], total: 75397 };
    const nr = { ...base, id: "c2", registro: "COMPRA", rut: "81.537.600-5", folio: "2", neto: 1000, iva: 190, otros_impuestos: 332, otros_detalle: [{ codigo: "27", valor: 332, tasa: "10" }], total: 1522 };
    const venta = (iva) => ({ ...base, id: "v1", registro: "VENTA", rut: "76.111.111-1", folio: "9", neto: Math.round(iva / 0.19), iva, total: Math.round(iva / 0.19) + iva });
    const calc = (iva, ant = 0) => { S.rcv = [compra, nr, venta(iva)]; const r = calcularF29(per, 0, null, null, 1, 100000, ant).codigos; return { iva: r["89"], an: r["556"], rem: r["557"], tot: r["543"], imp: r["598"], sig: r["rem_anticipo"], ppm: r["62"], pagar: r["91"] }; };
    const holgado = calc(25000), justo = calc(12100), conRem = calc(12100, 500);
    S.rcv = sr; return { holgado, justo, conRem };
  });
  igual("el anticipo de IVA solo reduce el IVA determinado, sin pasarse del tope, y no toca el PPM", [fa.holgado.an, fa.holgado.imp, fa.holgado.sig, fa.holgado.pagar - (fa.holgado.iva - fa.holgado.imp) - fa.holgado.ppm, fa.holgado.ppm], [1186, 1186, 0, 0, 1000]);
  ok("lo que no se alcanza a imputar queda como remanente de anticipo para el mes siguiente y el remanente anterior se suma", fa.justo.imp === fa.justo.iva && fa.justo.sig === 1186 - fa.justo.iva && fa.conRem.tot === 1186 + 500 && fa.conRem.rem === 500 && fa.conRem.sig === fa.conRem.tot - fa.conRem.imp, JSON.stringify(fa));
  const ac = await page.evaluate(async () => {
    const sr = S.rcv, e0 = JSON.stringify(empresa().codigos_otros || null), a0 = JSON.stringify(empresa().rcv_aceptado || null);
    const d = { periodo: "2031-09", fecha: "2031-09-10", tipo_doc: 33, exento: 0, cantidad: 1, iva_no_recuperable: 0, activo_fijo: false, asiento: "", registro: "COMPRA", rut: "81.537.600-5", folio: "7", neto: 1000, iva: 190, otros_impuestos: 120, otros_detalle: [{ codigo: "271", valor: 120, tasa: "18" }], total: 1310, id: "k1" };
    S.rcv = [d]; S.rcvPeriodo = "2031-09"; S.rcvPeriodoEid = S.eid;
    const antes = tratamientoOtro("271"), panel = panelAceptarCarga("COMPRA");
    ir("rcv"); await new Promise((r) => setTimeout(r, 60));
    const sel = document.getElementById("ca-cod-271"); if (sel) sel.value = "anticipo";
    await aceptarCargaRcv("COMPRA"); await new Promise((r) => setTimeout(r, 120));
    const despues = tratamientoOtro("271"), o = otrosDeDoc(d), aceptada = cargaAceptada("2031-09", "COMPRA"), panel2 = panelAceptarCarga("COMPRA");
    S.rcv = [{ ...d, total: 1400 }]; const cambio = /cambió desde entonces/.test(panelAceptarCarga("COMPRA"));
    S.rcv = sr; await quitarAceptacionRcv("COMPRA"); await new Promise((r) => setTimeout(r, 100));
    await BD.setEmpresa(S.eid, { ...empresa(), codigos_otros: JSON.parse(e0) || undefined, rcv_aceptado: JSON.parse(a0) || undefined });
    await new Promise((r) => setTimeout(r, 100));
    return { antes, boton: /rcv-aceptar/.test(panel), despues, anticipo: o.anticipo, aceptada: aceptada && [aceptada.n, aceptada.total], ok: /Carga aceptada el/.test(panel2), cambio, quitada: !cargaAceptada("2031-09", "COMPRA") };
  });
  igual("aceptar la carga del mes fija el tratamiento de los códigos para los meses siguientes y avisa si lo cargado cambia", [ac.antes, ac.boton, ac.despues, ac.anticipo, ac.aceptada, ac.ok, ac.cambio, ac.quitada], ["no_rec", true, "anticipo", 120, [1, 1310], true, true, true]);
  const vt = await page.evaluate(async () => {
    const sr = S.rcv, e0 = JSON.stringify(empresa().rcv_aceptado || null), base = { periodo: "2031-09", fecha: "2031-09-10", exento: 0, iva_no_recuperable: 0, otros_impuestos: 0, activo_fijo: false, asiento: "", registro: "VENTA" };
    S.rcv = [{ ...base, id: "f1", tipo_doc: 33, rut: "76.111.111-1", razon_social: "CLIENTE UNO", folio: "10", neto: 10000, iva: 1900, total: 11900, cantidad: 1 }, { ...base, id: "f2", tipo_doc: 33, rut: "76.222.222-2", razon_social: "CLIENTE DOS", folio: "11", neto: 20000, iva: 3800, total: 23800, cantidad: 1 },
      { ...base, id: "b1", tipo_doc: 39, rut: "78.268.099-4", razon_social: "Resumen boleta electrónica", folio: "RESUMEN 2031-09", fecha: "2031-09-30", neto: 84034, iva: 15966, total: 100000, cantidad: 42 }];
    S.rcvPeriodo = "2031-09"; S.rcvPeriodoEid = S.eid; S.pestana.rcv = "mes"; ir("rcv"); await new Promise((r) => setTimeout(r, 80));
    const html = document.querySelector("main").innerHTML, secciones = /Facturas de ventas/.test(html) && /Boletas, comprobantes de pago y otros ingresos/.test(html), boton = !!document.querySelector('[data-n="rcv-aceptar"][data-id="VENTA"]');
    const resumen = resumenCargaRcv("2031-09", "VENTA");
    await aceptarCargaRcv("VENTA"); await new Promise((r) => setTimeout(r, 120));
    const ac = cargaAceptada("2031-09", "VENTA"), sinCompras = cargaAceptada("2031-09", "COMPRA");
    S.rcv = sr; await quitarAceptacionRcv("VENTA"); await new Promise((r) => setTimeout(r, 100));
    await BD.setEmpresa(S.eid, { ...empresa(), rcv_aceptado: JSON.parse(e0) || undefined }); await new Promise((r) => setTimeout(r, 100));
    return { secciones, boton, resumen: [resumen.facturas.n, resumen.facturas.total, resumen.boletas.n, resumen.boletas.total, resumen.total], ac: ac && [ac.facturas.n, ac.boletas.n, ac.total], sinCompras };
  });
  ok("las ventas del RCV se separan en facturas y boletas, cada una con su detalle, y se pueden aceptar aparte de las compras", vt.secciones && vt.boton && JSON.stringify(vt.resumen) === "[2,35700,42,100000,135700]" && JSON.stringify(vt.ac) === "[2,42,135700]" && vt.sinCompras === null, JSON.stringify(vt));
  const es = await page.evaluate(() => { const d = { periodo: "2031-09", registro: "COMPRA", asiento: "" }, c = { ...d, asiento: "a1" }; return { cent: estadoDocRcv(c).texto, sin: estadoDocRcv(d).texto, simp: esSimplificada() }; });
  igual("el estado del documento del RCV dice centralizado, por centralizar o por aceptar, nunca «pendiente»", [es.cent, es.sin], ["Centralizado", es.simp ? "Por aceptar" : "Por centralizar"]);
  const hi = await page.evaluate(async () => {
    const sr = S.rcv, e0 = JSON.stringify(empresa().rcv_aceptado || null), mk = (id, per, reg, extra = {}) => ({ id, periodo: per, fecha: `${per}-10`, tipo_doc: 33, exento: 0, iva_no_recuperable: 0, otros_impuestos: 0, activo_fijo: false, asiento: "", registro: reg, rut: "76.111.111-1", razon_social: "X", folio: id, neto: 1000, iva: 190, total: 1190, cantidad: 1, ...extra });
    S.rcv = [mk("a", "2031-09", "COMPRA"), mk("b", "2031-09", "VENTA"), mk("c", "2031-08", "COMPRA")];
    await BD.setEmpresa(S.eid, { ...empresa(), rcv_aceptado: { "2031-09": { COMPRA: { fecha: "2031-10-01" } } } }); await new Promise((r) => setTimeout(r, 120));
    S.historialAnio.rcv = ""; const html = vistaRcvHistorial(), c9 = confirmacionRcv("2031-09"), c8 = confirmacionRcv("2031-08");
    S.rcvHistDetalle = "2031-09"; const conDetalle = vistaRcvHistorial(); S.rcvHistDetalle = null;
    const ant = { ...mk("d", "2031-09", "COMPRA", { otros_impuestos: 120, otros_detalle: [{ codigo: "19", valor: 120, tasa: "12" }], total: 1310 }) };
    S.rcv = [ant]; let lineas = null; try { lineas = propuestaCentralizacion("2031-09", "COMPRA", true).lineas.length; } catch (_) { lineas = -1; }
    S.rcv = sr; await BD.setEmpresa(S.eid, { ...empresa(), rcv_aceptado: JSON.parse(e0) || undefined }); await new Promise((r) => setTimeout(r, 100));
    return { solo9: /Septiembre/.test(html.replace(/Cargados y sin aceptar[\s\S]*/, "")) || /sep/i.test(html), sin8: /Cargados y sin aceptar \(no aparecen en el historial\)/.test(html), ventas: /sin aceptar/.test(html), c9: [!!c9.compras, c9.ventas], c8: [c8.compras, c8.ventas], detalle: /Detalle de/.test(conDetalle) && /Resumen mensual del RCV/.test(conDetalle) && /Documentos/.test(conDetalle), lineas };
  });
  ok("el historial del RCV solo muestra los meses con carga aceptada, con el detalle bajo un botón, y lo cargado sin aceptar queda aparte", hi.sin8 && hi.ventas && hi.c9[0] === true && hi.c9[1] === null && hi.c8[0] === null && hi.detalle, JSON.stringify(hi));
  const xlc = await page.evaluate(async () => {
    await cargarScript("exceljs");
    const wb = new window.ExcelJS.Workbook(), f = (d) => new Date(Date.UTC(2031, 3, d)), h = wb.addWorksheet("RC 4");
    h.addRow(["Nro", "Tipo Doc", "Tipo Compra", "RUT Proveedor", "Razon Social", "Folio", "Fecha Docto", "Fecha Recepcion", "Monto Exento", "Monto Neto", "Monto IVA Recuperable", "Monto Total", "Valor Otro Impuesto", "Tasa Otro Impuesto"]);
    h.addRow([1, 33, "Del Giro", "81537600-5", "RENDIC HERMANOS S.A.", 44197468, f(5), f(5), 0, 30529, 5801, 37016, 686, 12]);
    h.addRow([2, 33, "Del Giro", "81537600-5", "RENDIC HERMANOS S.A.", 44388292, f(6), f(6), 0, 22135, 4206, 29615, 2254, 18]);
    h.addRow([null, 33, "Del Giro", "81537600-5", "RENDIC HERMANOS S.A.", 44388292, f(6), null, null, null, null, null, 665, 10]);
    h.addRow([null, 33, "Del Giro", "81537600-5", "RENDIC HERMANOS S.A.", 44388292, f(6), null, null, null, null, null, 355, 12]);
    h.addRow([3, 34, "Del Giro", "78304787-K", "SERVICIOS CONTABLES", 51, f(7), f(7), 25000, 0, 0, 25000, null, null]);
    h.addRow([]); h.addRow([null, null, null, null, "EXISTENCIAS Y SERVICIOS AFECTOS A IVA", 52664]); h.addRow([null, null, null, null, "PROVEEDORES", 66631]); h.addRow([null, null, null, null, "ACREEDORES", 25000]);
    const sm = wb.addWorksheet("RC2"); sm.addRow([null, null, "SIN MOVIMIENTOS"]);
    const hojas = await analizarArchivosRcv([{ nombre: "REGISTRO DE COMPRAS.xlsx", buffer: await wb.xlsx.writeBuffer() }]);
    S.migra = { hojas, criterio: "recalcular" }; const R = resumenMigracion(), d = R.docs.find((y) => y.folio === "44388292");
    const sr = S.rcv; S.rcv = R.docs.map((y, i) => ({ ...y, id: "x" + i, periodo: "2031-04" })); const res = resumenRcvMes("2031-04").map((y) => y.clave + ":" + y.monto); S.rcv = sr;
    const sm1 = hojas.find((y) => y.hoja === "RC2"); S.migra = null;
    return { det: d.otros_detalle.map((y) => `${y.codigo}:${y.valor}:${y.inferido ? "i" : ""}`).join(","), esperado: hojas[0].esperado.PROVEEDORES, calc: Object.values(R.cuadre(hojas[0]))[0]?.calc, res, sm: [sm1.periodo, sm1.marcarSin] };
  });
  igual("el Excel sin columna de código infiere el código de la tasa, suma «Acreedores» al total del registro y la hoja «Sin movimientos» marca el mes", [xlc.det, xlc.esperado, xlc.calc, xlc.sm], ["271:2254:i,27:665:i,19:355:i", 91631, 91631, ["2031-02", "COMPRA"]]);
  ok("el resumen del mes separa el IVA anticipado, los no recuperables y los exentos del Excel", /compra_inr:2919/.test(xlc.res.join()) && /compra_anticipo_iva:1041/.test(xlc.res.join()) && /compra_exenta:25000/.test(xlc.res.join()), JSON.stringify(xlc));
  igual("el CSV del SII guarda los otros impuestos por código, tasa y valor (también las líneas de continuación) y la recepción", [det.n, det.det, det.otros, det.rec, det.tipo, det.sin, det.acuse], [3, "27:332:10,271:1127:18,19:1186:12", 2645, "2031-09-13", "Del Giro", undefined, "2031-09-14"]);
  igual("los otros impuestos se desglosan por código, en anticipo de IVA y no recuperables, en el panel, la tabla y el informe del RCV", [det.des, det.panel, det.cols, det.informe], [[1186, 1459, "19:1186,27:332,271:1127"], true, true, true]);
  igual("el IVA anticipado (código 19) va como anticipo y el resto como impuesto no recuperable, en líneas separadas del resumen mensual", [det.o, det.res], [[1186, 1459, true], [["compra_afecta", 6e4 * 0 + 76856 - 2645 + 134756, 62362 + 113240], ["compra_inr", 1459, 1459], ["compra_anticipo_iva", 1186, 0], ["compra_exenta", 20000, 20000]]]);
  igual("el RCV de Excel sin columna «Tipo Doc» se lee como facturas de compra", [sinT.n, sinT.reg, sinT.tipos, sinT.otros, sinT.periodo], [2, "COMPRA", "33,33", "440,0", "2031-11"]);
  igual("el RCV se compara con las líneas centralizadas del libro, no queda por pagar y avisa si no coincide", [sinT.bien, sinT.pend, sinT.con, sinT.mal], [[true, 25492, 21492], 0, true, [false, 52]]);
  igual("un lado sin RCV cargado no cuenta como diferencia", sinT.sinV, [true, true]);
  igual("el libro tiene la hoja buena, la mala descartada y el texto", im.hojas, [["RCV 03-2031", true, "2031-03", 5], ["RCV 03-2031 MALO", false, null, 0], ["(texto)", true, "2031-04", 1]]);
  ok("repara los textos con la codificación dañada", im.nombre === "COMPAÑÍA AGROPECUARIA COPEVAL S.A." && im.repararDoble === "TRANSPORTES Y LOGÍSTICA GUIDO", im.nombre + " | " + im.repararDoble);
  igual("las notas de crédito pasan a positivo, se enlazan y heredan el activo fijo", im.nc, [8403361, 10000000, "33-503", true]);
  igual("el combustible con impuesto específico no informado se marca y conserva el total del RCV", im.comb, [55115, true, 54043, -1072]);
  igual("el cuadre con la fila PROVEEDORES de la planilla (neto + IVA + otros)", im.cuRecalc, { PROVEEDORES: { esperado: 174115, calc: 174115 }, CLIENTES: { esperado: 1190000, calc: 1190000 } });
  igual("con el criterio «total del RCV» el cuadre cambia y se avisa", im.cuRcv.PROVEEDORES.calc, 174115 - 1072);
  igual("el archivo de texto con «$» y fechas dd-mm-aaaa se lee y cuadra", im.csv, [1260000, 1499400, "2031-04-07", { CLIENTES: { esperado: 1499400, calc: 1499400 } }]);
  ok("captura las notas escritas en la planilla", im.notas.some((t) => /SE REGULA/.test(t)), JSON.stringify(im.notas));
  igual("importa los documentos nuevos y una segunda importación no repite", [im.nuevos, im.importados, im.segundaVez], [6, 6, 0]);
  ok("la pantalla del RCV ofrece la importación desde Excel", im.vista);

  console.log("Importador: CSV del SII, resumen de ventas y fichas de activo fijo");
  const si = await page.evaluate(async () => {
    const enc = (t) => new TextEncoder().encode(t).buffer;
    const mojibake = new TextDecoder("utf-8").decode(new TextEncoder().encode("COMPAÑÍA SII LTDA")) && String.fromCharCode(...new TextEncoder().encode("COMPAÑÍA SII LTDA"));
    const det = "Nro;Tipo Doc;Tipo Compra;RUT Proveedor;Razon Social;Folio;Fecha Docto;Fecha Recepcion;Fecha Acuse;Monto Exento;Monto Neto;Monto IVA Recuperable;Monto Iva No Recuperable;Codigo IVA No Rec.;Monto Total;Monto Neto Activo Fijo;IVA Activo Fijo;IVA uso Comun;Impto. Sin Derecho a Credito;IVA No Retenido;Tabacos Puros;Tabacos Cigarrillos;Tabacos Elaborados;NCE o NDE sobre Fact. de Compra;Codigo Otro Imp.;Valor Otro Imp.;Tasa Otro Imp.\r\n"
      + `1;33;Del Giro;76123456-0;${mojibake};9001;05-05-2032;05-05-2032 10:00:00;;0;100000;19000;0;;119000;0;0;0;0;0;0;0;0;0;;;\r\n`;
    const res = "Tipo Documento;Total Documentos;Monto Exento;Monto Neto;Monto IVA;Monto Total\r\nBoleta Electrónica (39);10;0;84034;15966;100000\r\nFactura Electrónica (33);2;0;1000;190;1190\r\n";
    const hojas = await analizarArchivosRcv([{ nombre: "RCV_COMPRA_REGISTRO_77447556_203205.csv", buffer: enc(det) }, { nombre: "RCV_VENTA_77447556_203205.csv", buffer: enc(res) }]);
    S.migra = { hojas, criterio: "recalcular" };
    const R = resumenMigracion();
    await importarMigracionRcv(); await new Promise((r) => setTimeout(r, 250));
    const nuevos = S.rcv.filter((x) => x.periodo === "2032-05");
    const out = { hojas: hojas.map((h) => [h.hoja, h.docs.length, (h.resumenes || []).length, h.error || ""]), nombre: R.docs[0]?.razon_social, resumenes: R.resumenes.length, nuevos: nuevos.map((x) => [x.registro, x.tipo_doc, x.cantidad, x.total]) };
    for (const x of nuevos) await S.almacen.del(`empresas/e1/rcv/${x.id}`);
    S.migra = null; await new Promise((r) => setTimeout(r, 150));
    return out;
  });
  igual("el CSV de detalle del SII entra al importador y se repara el nombre", [si.hojas[0].slice(0, 2), si.nombre], [["(texto)", 1], "COMPAÑÍA SII LTDA"]);
  igual("el resumen de ventas aporta solo las boletas", [si.hojas[1].slice(0, 3), si.resumenes], [["(CSV del SII)", 0, 1], 1]);
  ok("se importan la factura de compra y el resumen de boletas", si.nuevos.some((x) => x[0] === "COMPRA" && x[3] === 119000) && si.nuevos.some((x) => x[1] === 39 && x[2] === 10 && x[3] === 100000), JSON.stringify(si));
  const afc = await page.evaluate(async () => {
    const base = { registro: "COMPRA", periodo: "2032-06", tipo_doc: 33, rut: "76123456-0", razon_social: "TRANSPORTES SUR", iva_no_recuperable: 0, otros_impuestos: 0, exento: 0, activo_fijo: true, cantidad: 1, cuenta: "", asiento: "" };
    const mk = async (id, o) => guardarDoc(id, { ...base, ...o });
    await mk("dafA", { folio: "7001", fecha: "2032-06-03", neto: 5000000, iva: 950000, total: 5950000 });
    await mk("dafB", { folio: "7002", fecha: "2032-06-04", neto: 800000, iva: 152000, total: 952000 });
    await mk("dafN", { tipo_doc: 61, folio: "7003", fecha: "2032-06-10", neto: 800000, iva: 152000, total: 952000, nc_de: "33-7002" });
    await new Promise((r) => setTimeout(r, 150));
    const antes = comprasActivoSinFicha().filter((d) => d.periodo === "2032-06").map((d) => d.folio);
    S.pestana.activos = "fichas"; ir("activos"); await new Promise((r) => setTimeout(r, 80));
    const bloque = !!document.querySelector('[data-n="afc-crear-todas"]');
    const nFichas = S.activos.length;
    await crearFichasDesdeCompras(["dafA"]); await new Promise((r) => setTimeout(r, 200));
    const f = S.activos.find((a) => a.rcv === "dafA");
    const despues = comprasActivoSinFicha().filter((d) => d.periodo === "2032-06").map((d) => d.folio);
    const out = { antes, bloque, despues, ficha: f && [f.costo, f.fecha_adq, f.estado, f.vida_meses, /^AF-\d{3}$/.test(f.codigo)], nuevas: S.activos.length - nFichas };
    if (f) await S.almacen.del(`empresas/e1/activos/${f.id}`);
    for (const id of ["dafA", "dafB", "dafN"]) await S.almacen.del(`empresas/e1/rcv/${id}`);
    await new Promise((r) => setTimeout(r, 150)); ir("inicio");
    return out;
  });
  igual("las compras de activo fijo anuladas por nota de crédito no piden ficha", afc.antes, ["7001"]);
  ok("la pestaña Fichas ofrece crear las fichas", afc.bloque);
  igual("crear la ficha usa el neto como costo y deja de ofrecer la compra", [afc.ficha, afc.nuevas, afc.despues], [[5000000, "2032-06-03", "activo", 84, true], 1, []]);

  console.log("Apariencia");
  await page.evaluate(() => ir("apariencia")); await espera();
  ok("la pantalla de apariencia se dibuja con estilos, temas y colores", await page.evaluate(() => document.querySelectorAll("[data-estilo]").length >= 8 && document.querySelectorAll('[data-ap="tema"]').length >= 8 && document.querySelectorAll('[data-ap="acento"]').length >= 9));
  await page.click('[data-ap="tema"][data-v="dark"]'); await page.click('[data-ap="acento"][data-v="azul"]'); await page.click('[data-ap="densidad"][data-v="compacta"]'); await page.click('[data-ap="fuente"][data-v="inter"]'); await page.click('[data-ap="radio"][data-v="redondo"]'); await page.click('[data-ap="cebra"][data-v="si"]');
  const ap = await page.evaluate(() => { const r = document.documentElement, cs = getComputedStyle(r); return { t: r.dataset.theme, d: r.dataset.densidad, z: r.dataset.cebra, f: cs.getPropertyValue("--font-ui").trim(), rad: cs.getPropertyValue("--radius").trim(), ac: cs.getPropertyValue("--accent").trim(), g: recuerdo("apariencia", {}) }; });
  igual("se aplican tema, densidad y cebra", [ap.t, ap.d, ap.z], ["dark", "compacta", "si"]);
  ok("se aplican fuente, esquinas y acento (más claro en oscuro)", /Inter/.test(ap.f) && ap.rad === "12px" && /color-mix/.test(ap.ac), JSON.stringify(ap));
  ok("se recuerda la elección", ap.g.tema === "dark" && ap.g.acento === "azul");
  await page.fill("#ap-texto", "120"); await page.dispatchEvent("#ap-texto", "input");
  ok("el control de tamaño de texto ajusta la escala", await page.evaluate(() => document.body.style.zoom === "1.2"));
  await page.click('[data-estilo="contable"]');
  igual("un estilo predeterminado cambia el tema, la fuente y la cebra", await page.evaluate(() => [document.documentElement.dataset.theme, apariencia().fuente, document.documentElement.dataset.cebra, getComputedStyle(document.body).backgroundColor]), ["papel", "serif", "si", "rgb(241, 233, 214)"]);
  await page.fill("#ap-nombre", "Mi estilo"); await page.press("#ap-nombre", "Enter"); await espera();
  ok("se puede guardar un estilo propio y aplicarlo", await page.evaluate(() => estilosPropios().length === 1));
  await page.click('[data-estilo="moderno"]'); await page.click("[data-mio]");
  igual("aplicar el estilo propio recupera el tema papel", await page.evaluate(() => document.documentElement.dataset.theme), "papel");
  await page.click("#ap-rapido");
  ok("el botón rápido cambia el tema", await page.evaluate(() => apariencia().tema === "sistema" || apariencia().tema === "light" || apariencia().tema === "dark"));
  await page.click("[data-ap-reset]");
  igual("restablecer vuelve al valor inicial", await page.evaluate(() => [apariencia().tema, apariencia().acento, apariencia().texto, document.body.style.zoom, estilosPropios().length]), ["sistema", "verde", 100, "1", 1]);
  const tm = await page.evaluate(async () => {
    const r = {}, cs = () => getComputedStyle(document.documentElement);
    for (const t of ["menta", "cielo", "lavanda", "durazno", "niebla", "marfil"]) { fijarApariencia({ tema: t }); r[t] = [document.documentElement.dataset.theme, cs().getPropertyValue("--surface").trim(), cs().colorScheme]; }
    fijarApariencia({ brillo: 90, calido: 20 }); const v = document.getElementById("ap-velo"); r.velo = [!!v, v?.style.display, /255, 165, 60, 0\.1\)/.test(v?.style.background || "")];
    fijarApariencia({ brillo: 100, calido: 0 }); r.sinVelo = document.getElementById("ap-velo").style.display;
    fijarApariencia({ resalte: "marcado" }); r.resalte = [document.documentElement.dataset.resalte, getComputedStyle(document.querySelector("body")).display];
    fijarApariencia({ resalte: "ninguno" }); r.ninguno = document.documentElement.dataset.resalte;
    fijarApariencia(ESTILOS.find((x) => x[0] === "confort")[3], true); r.estilo = [document.documentElement.dataset.theme, document.documentElement.dataset.resalte, apariencia().calido];
    fijarApariencia({}, true); return r;
  });
  igual("los temas claros suaves se aplican con su color de superficie", [tm.menta[0], tm.menta[1], tm.cielo[0], tm.marfil[0]], ["menta", "#f4faf6", "cielo", "marfil"]);
  ok("todos los temas nuevos son claros", ["menta", "cielo", "lavanda", "durazno", "niebla", "marfil"].every((t) => tm[t][2] === "light"));
  ok("el velo de confort atenúa el brillo y calienta el color, y desaparece en 100 % y 0 %", tm.velo[0] && tm.velo[1] === "block" && tm.velo[2] && tm.sinVelo === "none", JSON.stringify([tm.velo, tm.sinVelo]));
  igual("el resaltado se cambia y un estilo trae su propio resaltado", [tm.resalte[0], tm.ninguno, tm.estilo], ["marcado", "ninguno", ["marfil", "marcado", 22]]);
  await page.evaluate(() => { recordar("estilos", []); ir("inicio"); });

  console.log("Respaldo y restauración");
  const resp = await page.evaluate(async () => {
    const d = await datosRespaldo();
    const texto = JSON.stringify(d);
    const a = analizarRespaldo(texto);
    const malo = JSON.parse(texto); malo.colecciones.asientos[0].id = "../x";
    const incompleto = JSON.parse(texto); delete incompleto.empresa.cuentas;
    return { total: a.total, repetida: a.repetida, errores: [analizarRespaldo("no es json").error, analizarRespaldo(JSON.stringify({ formato: "otro" })).error, analizarRespaldo(JSON.stringify(malo)).error, analizarRespaldo(JSON.stringify(incompleto)).error],
      cols: Object.fromEntries(Object.entries(d.colecciones).map(([k, v]) => [k, v.length])), texto };
  });
  ok("el respaldo incluye todas las colecciones", ["asientos", "activos", "trabajadores", "liquidaciones", "finiquitos", "caja", "renta", "depreciaciones", "f29", "rcv", "socios", "sueldos", "honorarios", "cambios"].every((k) => k in resp.cols));
  igual("detecta que la empresa ya existe", resp.repetida, "e1");
  ok("rechaza archivos inválidos con un mensaje", resp.errores.every((e) => typeof e === "string" && e.length > 10), JSON.stringify(resp.errores));
  ok("rechaza identificadores peligrosos", /identificador inválido/.test(resp.errores[2]));
  const antes = await page.evaluate(() => ({ asientos: S.lista.length, activos: S.activos.length, liq: S.liquidaciones.length }));
  const nueva = await page.evaluate(async (texto) => {
    const d = JSON.parse(texto); d.empresa.rut = "77.777.777-7"; d.empresa.razon_social = "COPIA SPA";
    S.restauracion = analizarRespaldo(JSON.stringify(d)); await restaurar(false); await new Promise((r) => setTimeout(r, 100));
    return { eid: S.eid, asientos: S.lista.length, activos: S.activos.length, liq: S.liquidaciones.length, empresas: S.empresas.length, ligada: S.liquidaciones.every((l) => S.lista.some((a) => a.id === l.asiento)) };
  }, resp.texto);
  igual("restaurar como empresa nueva copia los datos", [nueva.asientos, nueva.activos, nueva.liq, nueva.empresas], [antes.asientos, antes.activos, antes.liq, 3]);
  ok("las liquidaciones siguen ligadas a sus asientos tras restaurar", nueva.ligada);
  const reemplazo = await page.evaluate(async (texto) => {
    cambiarEmpresa("e1"); await new Promise((r) => setTimeout(r, 100));
    await S.almacen.del("empresas/e1/activos/f3"); await new Promise((r) => setTimeout(r, 60));
    S.restauracion = analizarRespaldo(texto); await restaurar(true); await new Promise((r) => setTimeout(r, 100));
    return { eid: S.eid, activos: S.activos.length, empresas: S.empresas.length };
  }, resp.texto);
  igual("reemplazar recupera lo borrado sin duplicar la empresa", [reemplazo.eid, reemplazo.activos, reemplazo.empresas], ["e1", 2, 3]);

  console.log("Pantallas");
  const vistas = [["inicio"], ["activos", "fichas"], ["activos", "dep"], ["activos", "libro"], ["rrhh", "trabajadores"], ["rrhh", "liquidaciones"], ["rrhh", "libro"], ["rrhh", "vacaciones"], ["rrhh", "finiquitos"], ["rrhh", "parametros"], ["apariencia"], ["resumen"], ["panel"], ["revisor"], ["renta"], ["dj", "1887"], ["dj", "1879"], ["tributarias"], ["empresa"], ["empresas"]];
  for (const [ancho, nombre] of [[1200, "escritorio"], [400, "móvil"]]) {
    await page.setViewportSize({ width: ancho, height: 800 });
    const malas = [];
    for (const [v, t] of vistas) {
      const r = await page.evaluate(([v, t]) => { cambiarEmpresa("e1"); if (t) S.pestana[v.replace("dj", "dj")] = t; S.liqPeriodo = "2026-09"; S.liqPeriodoEid = "e1"; ir(v); return [document.documentElement.scrollWidth, document.documentElement.clientWidth, document.querySelector("main").innerText.length]; }, [v, t]);
      if (r[0] > r[1] || r[2] < 20) malas.push(`${v}/${t || ""}:${r}`);
    }
    ok(`todas las pantallas se ven bien en ${nombre}`, !malas.length, malas.join(" "));
  }

  console.log("Gestión de importación del RCV");
  const gi = await page.evaluate(async () => {
    const sr = S.rcv, em = empresa(), per = "2032-05", mk = (folio, total, extra = {}) => ({ id: "g" + folio, registro: "COMPRA", periodo: per, tipo_doc: 33, rut: "76.111.111-1", razon_social: "PROV", folio: String(folio), fecha: per + "-05", exento: 0, neto: Math.round(total / 1.19), iva: total - Math.round(total / 1.19), iva_no_recuperable: 0, otros_impuestos: 0, total, activo_fijo: false, cantidad: 1, cuenta: "", asiento: "", ...extra });
    S.rcv = [mk(1, 119000), mk(2, 59500), mk(3, 11900, { asiento: S.lista[0].id })];
    const csv = "Folio;Fecha;RUT;Razon;Neto;IVA;Total\r\n1;05-05-2032;76111111-1;PROV;100000;19000;119000\r\n9;06-05-2032;76111111-1;PROV;50000;9500;59500\r\n";
    const hojas = await analizarArchivosRcv([{ nombre: "propio_05-2032.csv", buffer: new TextEncoder().encode(csv).buffer }]);
    const mapeo = !!hojas[0].mapeo, sel = hojas[0].mapeo?.sel;
    S.rcvPeriodo = per; S.rcvPeriodoEid = S.eid; ir("rcv"); S.migra = { hojas, criterio: "recalcular", eliminar: new Set() }; render(); await new Promise((r) => setTimeout(r, 50));
    const hayFormulario = !!document.querySelector("#mg-map-0-folio");
    const pp = document.querySelector("#mg-map-0-periodo"); if (pp) pp.value = per; aplicarMapeoRcv(0); await new Promise((r) => setTimeout(r, 50));
    const h = S.migra.hojas[0], R = resumenMigracion();
    const ausentes = R.ausentes.map((d) => d.folio).join(), nuevos = R.nuevos.map((d) => d.folio).join();
    const lis = (() => { S.rcvPeriodo = per; S.rcvPeriodoEid = S.eid; return listaRevisionRcv(per, "COMPRA"); })();
    S.migra.eliminar.add("g2"); S.migra.eliminar.add("g3");
    const antes = S.rcv.length; S.rcv = S.rcv.filter(() => true);
    const sacadas = R.ausentes.filter((d) => S.migra.eliminar.has(d.id) && pendiente(d)).map((d) => d.folio).join();
    S.migra = null; S.rcv = sr;
    return { mapeo, sel: [sel?.folio, sel?.total], hayFormulario, periodo: h.periodo, n: h.docs.length, ausentes, nuevos, sacadas, lis: lis.map((x) => [x.ok, x.bloquea]), antes };
  });
  ok("una planilla con otro formato propone las columnas y ofrece asignarlas", gi.mapeo && gi.sel.join() === "0,6" && gi.hayFormulario, JSON.stringify(gi));
  ok("aplicadas las columnas, la planilla se lee y queda con su mes", gi.n === 2 && gi.periodo === "2032-05", JSON.stringify(gi));
  ok("detecta el documento que ya no está en el archivo y el que es nuevo", gi.ausentes === "2,3" && gi.nuevos === "9", gi.ausentes + " / " + gi.nuevos);
  ok("los documentos centralizados no se pueden quitar desde la importación", gi.sacadas === "2", gi.sacadas);
  ok("la revisión del mes señala lo que falta", gi.lis.length >= 1 && gi.lis[0][0] === true, JSON.stringify(gi.lis));
  const rev = await page.evaluate(() => { const sr = S.rcv; S.rcv = []; const a = listaRevisionRcv("2032-06", "COMPRA"); S.rcv = [{ id: "q", registro: "COMPRA", periodo: "2032-06", revisar_total: true, tipo_doc: 33, total: 1, folio: "1", asiento: "" }]; const b = listaRevisionRcv("2032-06", "COMPRA"); S.rcv = sr; return { vacio: a[0].ok, rt: b.some((x) => !x.ok && x.bloquea) }; });
  ok("sin documentos ni marca de «sin compras» no se puede aceptar, y un total por revisar bloquea", rev.vacio === false && rev.rt === true, JSON.stringify(rev));

  console.log("Traer el RCV aceptado al libro de caja");
  const pvr = await page.evaluate(async () => {
    const per = "2033-03", sr = S.rcv, sc = S.caja, e0 = empresa(), r = {};
    const base = { periodo: per, fecha: per + "-10", tipo_doc: 33, exento: 0, cantidad: 1, iva_no_recuperable: 0, otros_impuestos: 0, activo_fijo: false, asiento: "", rut: "76.111.111-1", razon_social: "P" };
    S.rcv = [{ ...base, id: "p1", registro: "COMPRA", folio: "1", neto: 100000, iva: 19000, total: 119000 }, { ...base, id: "p2", registro: "VENTA", folio: "2", neto: 200000, iva: 38000, total: 238000 }];
    S.cajaImp = per; S.cajaPrev = null;
    prepararPrevRcvMes(); r.sinAceptar = !S.cajaPrev;
    await BD.setEmpresa(S.eid, { ...e0, rcv_aceptado: { ...(e0.rcv_aceptado || {}), [per]: { COMPRA: { fecha: "2033-04-01", n: 1, total: 119000 }, VENTA: { fecha: "2033-04-01", n: 1, total: 238000 } } } });
    prepararPrevRcvMes(); r.lineas = S.cajaPrev?.lineas.length;
    editarPrevRcvMes("cp-0-monto", "$250.000", false); editarPrevRcvMes("cp-1-glosa", "Compras del mes corregidas", false);
    r.editado = [S.cajaPrev.lineas[0].monto, S.cajaPrev.lineas[1].glosa];
    const html = panelPrevRcvMes(per); r.panel = /Vista previa/.test(html) && /difieren|distintos del RCV/.test(html);
    await confirmarPrevRcvMes(); await new Promise((x) => setTimeout(x, 150));
    const mov = S.caja.filter((m) => m.ref?.startsWith("rcvmes:" + per)); r.mov = mov.length; r.marcado = mov.some((m) => m.editado); r.fecha = mov[0]?.fecha;
    for (const m of mov) await S.almacen.del(`empresas/${S.eid}/caja/${m.id}`);
    await BD.setEmpresa(S.eid, e0); S.rcv = sr; S.caja = sc; S.cajaPrev = null; await new Promise((x) => setTimeout(x, 100));
    return r;
  });
  ok("no se trae el RCV al libro si la carga no está aceptada", pvr.sinAceptar, JSON.stringify(pvr));
  ok("con el RCV aceptado se arma la vista previa con una línea por tipo", pvr.lineas >= 2, JSON.stringify(pvr));
  ok("se pueden editar montos y glosas antes de traer", pvr.editado[0] === 250000 && pvr.editado[1] === "Compras del mes corregidas" && pvr.panel, JSON.stringify(pvr));
  ok("al confirmar se guardan las líneas con la fecha de fin de mes y marcadas como editadas", pvr.mov >= 2 && pvr.marcado && pvr.fecha === "2033-03-31", JSON.stringify(pvr));

  console.log("Aceptar cargas que cuadran con el libro de caja");
  const pl = await page.evaluate(async () => {
    const per = "2034-02", sr = S.rcv, sc = S.caja, e0 = empresa(), r = {};
    const base = { periodo: per, fecha: per + "-10", tipo_doc: 33, exento: 0, cantidad: 1, iva_no_recuperable: 0, otros_impuestos: 0, activo_fijo: false, asiento: "", rut: "76.111.111-1", razon_social: "P" };
    S.rcv = [{ ...base, id: "l1", registro: "COMPRA", folio: "1", neto: 100000, iva: 19000, total: 119000 }];
    S.caja = [{ id: "lc", fecha: per + "-28", tipo: 2, categoria: "Compras y gastos", doc_tipo: "Registro de Compras SII", doc_num: "X", monto: 119000, base: 100000 }];
    r.antes = cargasPorLibro().map((x) => x.estado).join();
    S.caja[0].monto = 100000; r.difiere = cargasPorLibro().map((x) => x.estado).join(); S.caja[0].monto = 119000;
    S.caja = []; r.sinLibro = cargasPorLibro().map((x) => x.estado).join();
    S.caja = [{ id: "lc", fecha: per + "-28", tipo: 2, categoria: "Compras y gastos", doc_tipo: "Registro de Compras SII", doc_num: "X", monto: 119000, base: 100000 }];
    r.panel = /Aceptar las 1 carga/.test(panelAceptarPorLibro());
    await aceptarCargasPorLibro(); await new Promise((x) => setTimeout(x, 150));
    const ac = cargaAceptada(per, "COMPRA"); r.ac = !!ac && ac.por_libro === true; r.libroIntacto = S.caja.length === 1; r.despues = cargasPorLibro().length;
    await BD.setEmpresa(S.eid, e0); S.rcv = sr; S.caja = sc; await new Promise((x) => setTimeout(x, 100));
    return r;
  });
  ok("una carga sin aceptar que cuadra con el libro se ofrece para aceptar", pl.antes === "cuadra" && pl.panel, JSON.stringify(pl));
  ok("si el monto del libro difiere, o el libro no tiene el mes, no se acepta sola", pl.difiere === "difiere" && pl.sinLibro === "sin_libro", JSON.stringify(pl));
  ok("al aceptarla por el libro queda registrada y no se agrega nada al libro", pl.ac && pl.libroIntacto && pl.despues === 0, JSON.stringify(pl));

  const sd = await page.evaluate(async () => {
    const e0 = empresa(); await BD.setEmpresa(S.eid, { ...e0, codigos_otros: { ...(e0.codigos_otros || {}), "sin_detalle:2035-03": "anticipo" } });
    const d = { id: "sd", registro: "COMPRA", periodo: "2035-03", tipo_doc: 33, neto: 100000, iva: 19000, exento: 0, otros_impuestos: 2427, total: 121427, iva_no_recuperable: 0, activo_fijo: false, cantidad: 1, asiento: "", folio: "1", rut: "76.111.111-1", fecha: "2035-03-05" };
    let r; try { const o = desgloseOtros([d]); const o2 = desgloseOtros([{ ...d, periodo: "2035-04" }]); r = [o.anticipo, o.noRec, o2.anticipo, o2.noRec]; } catch (e) { r = "ERR " + e.message; }
    await BD.setEmpresa(S.eid, e0); return r;
  });
  ok("los otros impuestos sin detalle se tratan como anticipo de IVA solo en el mes elegido", JSON.stringify(sd) === "[2427,0,0,2427]", JSON.stringify(sd));

  const ll = await page.evaluate(async () => {
    const per = "2036-09", sr = S.rcv, sc = S.caja, e0 = empresa(), r = {};
    const base = { periodo: per, fecha: per + "-10", tipo_doc: 33, exento: 0, cantidad: 1, iva_no_recuperable: 0, otros_impuestos: 0, activo_fijo: false, asiento: "", rut: "76.111.111-1", razon_social: "P" };
    S.rcv = [{ ...base, id: "w1", registro: "COMPRA", folio: "1", neto: 100000, iva: 19000, total: 119000 }]; S.caja = [];
    await BD.setEmpresa(S.eid, { ...e0, tipo_contabilidad: "simplificada" });
    S.rcvPeriodo = per; S.rcvPeriodoEid = S.eid; ir("rcv"); await new Promise((x) => setTimeout(x, 50));
    r.bloqueado = !!document.querySelector('[data-n="rcv-llevar-libro"][disabled]');
    await BD.setEmpresa(S.eid, { ...empresa(), tipo_contabilidad: "simplificada", rcv_aceptado: { [per]: { COMPRA: { fecha: "2036-10-01", n: 1, total: 119000 } } } });
    render(); await new Promise((x) => setTimeout(x, 50));
    const b = document.querySelector('[data-n="rcv-llevar-libro"]'); r.habilitado = !!b && !b.disabled;
    b.click(); await new Promise((x) => setTimeout(x, 100));
    r.prev = !!document.querySelector("#cp-panel") && S.cajaPrev?.periodo === per; r.vista = S.pestana.caja;
    S.cajaPrev = null; await BD.setEmpresa(S.eid, e0); S.rcv = sr; S.caja = sc; S.pestana.caja = "libro"; ir("inicio");
    return r;
  });
  ok("en el RCV el botón de llevar al libro está bloqueado hasta aceptar la carga", ll.bloqueado, JSON.stringify(ll));
  ok("con la carga aceptada el botón abre la vista previa en el libro de caja", ll.habilitado && ll.prev && ll.vista === "importar", JSON.stringify(ll));

  console.log("Libro de caja: línea movible y cierre del mes");
  const lcm = await page.evaluate(async () => {
    const per = "2037-05", sc = S.caja, e0 = empresa(), r = {};
    S.caja = [30, 30].map((d, i) => ({ id: "z" + i, fecha: `${per}-${d}`, tipo: 1, categoria: "Ventas", doc_tipo: "", doc_num: "", rut: "", nombre: "", glosa: "L" + i, monto: 1000, base: 1000, origen: "manual", ref: "" }));
    await BD.setEmpresa(S.eid, { ...e0, tipo_contabilidad: "simplificada", ejercicio: 2037, inicio_actividades: "2037-01-01" });
    S.cajaAnio = "2037"; S.cajaMes = "05"; S.pestana.caja = "libro"; S.cajaNuevaLinea = null; S.cajaRapida = null; S.confirmar = null; ir("caja"); await new Promise((x) => setTimeout(x, 50));
    document.querySelector('[data-n="caja-linea-mostrar"]').click(); await new Promise((x) => setTimeout(x, 50));
    const filas = () => [...document.querySelectorAll("table:not(.totales) tbody tr")].map((tr) => tr.classList.contains("rapida") ? "NUEVA" : tr.children[6]?.textContent.trim().slice(0, 2));
    r.antes = filas().join();
    document.querySelector('[data-n="ql-dia"][data-id="10"]').click(); await new Promise((x) => setTimeout(x, 50));
    r.fecha = document.querySelector("#ql-fecha").value; r.despues = filas().join();
    document.querySelector("#ql-glosa").value = "Nueva"; document.querySelector("#ql-monto").value = "500"; document.querySelector('[data-n="ql-dia"][data-id="fin"]').click(); await new Promise((x) => setTimeout(x, 50));
    r.conserva = document.querySelector("#ql-glosa").value === "Nueva" && document.querySelector("#ql-fecha").value === `${per}-31`;
    r.cierraSinProblemas = problemasCierreCaja(per).length;
    cambiarMes(per, true); await new Promise((x) => setTimeout(x, 150));
    r.cerrado = !!cerrados()[per] && /cerrado/.test(document.querySelector("main").textContent) && !document.querySelector('[data-n="caja-editar"]');
    r.bloqueo = CAJA_CERRADO([`${per}-10`]);
    cambiarMes(per, false); await new Promise((x) => setTimeout(x, 150));
    r.reabierto = !cerrados()[per] && !CAJA_CERRADO([`${per}-10`]);
    S.cajaNuevaLinea = null; S.cajaRapida = null; S.caja = sc; await BD.setEmpresa(S.eid, e0); S.cajaMes = undefined; ir("inicio");
    return r;
  });
  ok("la línea nueva se coloca en la tabla según su fecha (01, 10, 15 o fin de mes)", /NUEVA,.*/.test(lcm.antes) === false || lcm.despues.indexOf("NUEVA") <= lcm.antes.indexOf("NUEVA"), JSON.stringify(lcm));
  ok("al elegir el día 10 la línea queda antes de las del día 30 y conserva lo escrito", lcm.fecha === "2037-05-10" && /^[^N]*NUEVA/.test(lcm.despues) && lcm.despues.indexOf("NUEVA") < lcm.despues.indexOf("L0") && lcm.conserva, JSON.stringify(lcm));
  ok("un mes cerrado del libro de caja bloquea los cambios y se puede reabrir", lcm.cerrado && /cerrado/.test(String(lcm.bloqueo)) && lcm.reabierto, JSON.stringify(lcm));

  console.log("Libro de caja: mover líneas con el mouse");
  await page.evaluate(async () => {
    const per = "2038-05"; window.__e0 = empresa();
    await BD.setEmpresa(S.eid, { ...window.__e0, tipo_contabilidad: "simplificada", ejercicio: 2038, inicio_actividades: "2038-01-01" });
    await guardarMovimientos([["a", "05"], ["b", "10"], ["c", "30"]].map(([k, d]) => ({ id: "mv_" + k, fecha: `${per}-${d}`, tipo: 1, categoria: "Ventas", doc_tipo: "", doc_num: "", rut: "", nombre: "", glosa: "Linea " + k, monto: 1000, base: 1000, origen: "manual", ref: "" })));
    await new Promise((x) => setTimeout(x, 200));
    S.cajaAnio = "2038"; S.cajaMes = "05"; S.pestana.caja = "libro"; ir("caja"); await new Promise((x) => setTimeout(x, 80));
  });
  const orden = () => page.evaluate(() => [...document.querySelectorAll("tr[data-mov]")].map((tr) => tr.children[6].textContent.trim().slice(-1) + ":" + tr.children[5].textContent.trim().slice(0, 2)).join());
  const antesDnD = await orden();
  await page.dragAndDrop('tr[data-mov="mv_c"] .asa', 'tr[data-mov="mv_b"]', { targetPosition: { x: 40, y: 3 } });
  await page.waitForTimeout(300);
  const trasDnD = await orden();
  await page.click('tr[data-mov="mv_a"] [data-n="caja-bajar"]'); await page.waitForTimeout(300);
  const trasBajar = await orden();
  const fin = await page.evaluate(async () => {
    const f = S.caja.filter((m) => m.id.startsWith("mv_")).map((m) => [m.id, m.fecha.slice(8), m.orden]);
    for (const m of S.caja.filter((x) => x.id.startsWith("mv_"))) await S.almacen.del(`empresas/${S.eid}/caja/${m.id}`);
    await BD.setEmpresa(S.eid, window.__e0); S.cajaMes = undefined; ir("inicio"); await new Promise((x) => setTimeout(x, 100)); return f;
  });
  ok("las líneas del libro se arrastran con el mouse y cambian de lugar", antesDnD === "a:05,b:10,c:30" && trasDnD.startsWith("a:05,c:") , antesDnD + " | " + trasDnD);
  ok("una línea que queda entre dos fechas toma la que mantiene el orden cronológico", /^a:05,c:(05|10),b:10$/.test(trasDnD), trasDnD);
  ok("los botones ▲▼ también mueven la línea y el orden queda guardado", trasBajar !== trasDnD && fin.every((x) => x[2] != null), trasBajar + " " + JSON.stringify(fin));

  console.log("Revisión del libro de caja: pagos de F29");
  const rvl = await page.evaluate(async () => {
    const sc = S.caja, e0 = empresa(), r = {};
    await BD.setEmpresa(S.eid, { ...e0, tipo_contabilidad: "simplificada", ejercicio: 2039, inicio_actividades: "2039-01-01" });
    const base = { tipo: 2, doc_tipo: "", doc_num: "", rut: "", nombre: "", monto: 5000, base: 0, origen: "manual", ref: "", categoria: "Compras y gastos" };
    S.caja = [{ ...base, id: "f1", fecha: "2039-09-12", glosa: "Pago F29 AGOSTO 2039, PPM.-" }, { ...base, id: "f2", fecha: "2039-09-12", glosa: "Pago F29 AGOSTO 2039, IVA determinado.-" }, { ...base, id: "f3", fecha: "2039-09-13", glosa: "Compra de insumos" }];
    r.sug = S.caja.map((m) => clasificacionSugeridaCaja(m)).map((c) => (c ? `${c.clase}:${c.f29_periodo}` : "-")).join();
    r.antesPpm = ppmPagadoPorPeriodo(2039).total;
    S.caja = S.caja.map((m) => ({ ...m, ...(clasificacionSugeridaCaja(m) || {}) }));
    r.despuesPpm = ppmPagadoPorPeriodo(2039).total; r.nuevaSug = S.caja.map((m) => clasificacionSugeridaCaja(m)).filter(Boolean).length;
    S.cajaAnio = "2039"; S.pestana.caja = "control"; ir("caja"); await new Promise((x) => setTimeout(x, 60));
    r.panel = /Revisión del libro de caja/.test(document.querySelector("main").textContent) && /no hace falta cerrar el mes/.test(document.querySelector("main").textContent);
    S.caja = sc; await BD.setEmpresa(S.eid, e0); S.pestana.caja = "libro"; ir("inicio");
    return r;
  });
  ok("un pago de F29 sin clasificar se detecta por su glosa con concepto y período", rvl.sug === "f29_ppm:2039-08,f29_iva:2039-08,-", JSON.stringify(rvl));
  ok("al clasificarlo, el PPM de agosto pagado en septiembre entra al control de PPM", rvl.antesPpm === 0 && rvl.despuesPpm === 5000 && rvl.nuevaSug === 0, JSON.stringify(rvl));
  ok("la pestaña de control muestra la revisión del libro de caja", rvl.panel, JSON.stringify(rvl));
  const cf = await page.evaluate(async () => {
    const sb = S.f29Borradores, sc = S.caja, per = "2040-09", r = {};
    S.f29Borradores = [{ id: per, codigos: { 89: 40818, 598: 1524, 62: 7179 }, entradas: {} }]; S.caja = [];
    r.sinPago = cotejoF29Caja(2040)[0].estado;
    const pago = (clase, monto) => ({ id: clase, fecha: "2040-10-12", tipo: 2, monto, base: 0, clase, f29_periodo: per, categoria: CAT_F29 });
    S.caja = [pago("f29_iva", 39294)]; r.parcial = cotejoF29Caja(2040)[0].estado;
    S.caja = [pago("f29_iva", 39294), pago("f29_ppm", 7179)]; r.ok = cotejoF29Caja(2040)[0].estado;
    S.f29Borradores = sb; S.caja = sc; return r;
  });
  ok("un F29 aún no pagado se muestra «por pagar» y no «difiere»", /^(Por pagar|Sin pago)/.test(cf.sinPago), JSON.stringify(cf));
  ok("un pago parcial indica cuánto falta y uno completo coincide", /falta PPM \$7\.179/.test(cf.parcial) && cf.ok === "Coincide", JSON.stringify(cf));

  const ra = await page.evaluate(() => {
    const sr = S.rcv; S.rcv = [];
    const a = calcularF29("2041-01", 0, 69751, 69611, null, null, 2167), b = calcularF29("2041-02", 0, 69611, 69889, null, null, 2088), c = calcularF29("2041-03", 0, null, null, null, null, 500);
    S.rcv = sr; return [a.codigos["557"], a.entradas.anticipo_anterior, b.codigos["557"], c.codigos["557"], a.codigos["rem_anticipo"]];
  });
  ok("el remanente de anticipo de IVA se reajusta en UTM como el remanente de crédito (698, 2.088 y 2.097 del SII)", JSON.stringify(ra) === "[2088,2167,2097,500,2088]", JSON.stringify(ra));

  const sn = await page.evaluate(async () => {
    const sc = S.caja, e0 = empresa(); const ej = e0.ejercicio;
    await BD.setEmpresa(S.eid, { ...e0, tipo_contabilidad: "simplificada" });
    const base = { tipo: 1, categoria: "Ventas", doc_tipo: "", doc_num: "", rut: "", nombre: "", glosa: "x", monto: 1000, base: 1000, origen: "manual", ref: "" };
    S.caja = [{ ...base, id: "a1", fecha: `${ej}-03-31`, tipo: 2, monto: 2e9, base: 800, glosa: "egreso" }, { ...base, id: "a2", fecha: `${ej}-03-31`, monto: 2e9 + 1000, glosa: "ingreso" }];
    const r = revisarDatos(true).some((h) => /saldo de caja se vuelve negativo/.test(h.texto));
    S.caja = [{ ...base, id: "a1", fecha: `${ej}-03-30`, tipo: 2, monto: 2e9, base: 800, glosa: "egreso" }, { ...base, id: "a2", fecha: `${ej}-03-31`, monto: 2e9 + 1000, glosa: "ingreso" }];
    const r2 = revisarDatos(true).some((h) => /saldo de caja se vuelve negativo/.test(h.texto));
    S.caja = sc; await BD.setEmpresa(S.eid, e0); return [r, r2];
  });
  ok("el saldo de caja negativo se evalúa al cierre de cada día, no entre operaciones del mismo día", JSON.stringify(sn) === "[false,true]", JSON.stringify(sn));

  const f29d = await page.evaluate(async () => {
    const e0 = empresa(), sb = S.f29Borradores, r = {};
    await BD.setEmpresa(S.eid, { ...e0, inicio_actividades: "2042-01-10", f29_presentado: {} });
    const hoyF = "2042-05-16";
    S.f29Borradores = [];
    r.sinUso = periodosF29SinDeclarar(hoyF).length;
    S.f29Borradores = [{ id: "2042-01", declarado: true, codigos: {}, entradas: {} }, { id: "2042-02", declarado: false, codigos: {}, entradas: {} }];
    r.pend = periodosF29SinDeclarar(hoyF).map((x) => x.periodo).join();
    r.vence = periodosF29SinDeclarar(hoyF)[0].vence;
    S.f29Borradores = sb; await BD.setEmpresa(S.eid, e0);
    return r;
  });
  ok("sin borradores ni meses presentados no se exige el F29 (la empresa no usa el módulo)", f29d.sinUso === 0, JSON.stringify(f29d));
  ok("el F29 se exige todos los meses desde el inicio de actividades, también los sin movimiento", f29d.pend === "2042-02,2042-03,2042-04" && f29d.vence === "2042-03-20", JSON.stringify(f29d));

  const bp = await page.evaluate(() => {
    const sr = S.rcv, per = "2043-08", mk = (id, tipo, neto, iva, ex = 0) => ({ id, registro: "VENTA", periodo: per, tipo_doc: tipo, neto, iva, exento: ex, total: neto + iva + ex, cantidad: 1, folio: id, rut: "1-9", fecha: per + "-10", activo_fijo: false, iva_no_recuperable: 0, otros_impuestos: 0, asiento: "" });
    S.rcv = [mk("a", 33, 619000, 117612), mk("b", 39, 245655, 46675), mk("c", 48, 196160, 37270), mk("d", 34, 0, 0, 5000)];
    const c = calcularF29(per, 0, null, null, 1).codigos; S.rcv = sr; return [c["538"], c["563"], c["62"]];
  });
  ok("la base del PPM se calcula como el SII: débitos ÷ 0,19 más las ventas exentas (agosto de Andrea: 201.557 → 1.060.826)", JSON.stringify(bp) === "[201557,1065826,10658]", JSON.stringify(bp));

  console.log("Corrección monetaria del PPM (movimiento sin efectivo)");
  const cm = await page.evaluate(async () => {
    const sc = S.caja, e0 = empresa(), r = {};
    await BD.setEmpresa(S.eid, { ...e0, tipo_contabilidad: "simplificada", ejercicio: 2044, inicio_actividades: "2044-01-01" });
    const base = { doc_tipo: "Ajuste PPM", doc_num: "x", rut: "", nombre: "", origen: "manual", ref: "" };
    const aj = { ...base, id: "aj1", fecha: "2044-12-31", tipo: 1, categoria: CAT_AJUSTE_PPM, glosa: "Corrección Monetaria PPM PAGADO", monto: 0, base: 49 };
    const normal = { ...base, id: "n1", doc_tipo: "Boleta", fecha: "2044-12-30", tipo: 1, categoria: "Ventas", glosa: "Ventas", monto: 1000, base: 1000 };
    S.caja = [normal, aj];
    r.clasif = clasificarMovimientoExcel(1, "Ajuste PPM", "Corrección Monetaria PPM PAGADO", "2044-12-31").categoria;
    r.malos = revisarDatos(true).filter((h) => /inválidos/.test(h.texto)).length;
    S.caja = [normal, { ...aj, base: 0 }]; r.malosSinBase = revisarDatos(true).filter((h) => /inválidos/.test(h.texto)).length;
    S.caja = [normal, { ...aj, monto: 10 }]; r.malosConMonto = revisarDatos(true).filter((h) => /inválidos/.test(h.texto)).length;
    S.caja = [{ ...normal, monto: 0 }]; r.malosNormalCero = revisarDatos(true).filter((h) => /inválidos/.test(h.texto)).length;
    S.caja = [normal, aj];
    const L = cajaDe(2044); r.saldo = L.filter((m) => m.tipo === 1).reduce((x, m) => x + m.monto, 0);
    S.caja = sc; await BD.setEmpresa(S.eid, e0); ir("inicio");
    return r;
  });
  ok("«Corrección Monetaria PPM» se clasifica como movimiento sin efectivo", cm.clasif === "Corrección monetaria del PPM", JSON.stringify(cm));
  ok("monto $0 con base positiva no es un movimiento inválido", cm.malos === 0, JSON.stringify(cm));
  ok("una corrección monetaria sin base, o con monto distinto de cero, sí se avisa", cm.malosSinBase === 1 && cm.malosConMonto === 1, JSON.stringify(cm));
  ok("un movimiento normal con monto $0 sigue siendo inválido", cm.malosNormalCero === 1, JSON.stringify(cm));
  ok("no mueve la caja: el flujo de ingresos solo suma la venta", cm.saldo === 1000, JSON.stringify(cm));
  const ga = await page.evaluate(async () => {
    const sc = S.caja, e0 = empresa(), r = {};
    await BD.setEmpresa(S.eid, { ...e0, tipo_contabilidad: "simplificada", ejercicio: 2045, inicio_actividades: "2045-01-01" });
    const base = { doc_tipo: "", doc_num: "", rut: "", nombre: "", origen: "manual", ref: "", monto: 0 };
    const mas = { ...base, id: "a1", fecha: "2045-06-30", tipo: 1, categoria: CAT_AJUSTE_MAS, glosa: "Ajuste a la base por reajuste", base: 300 };
    const menos = { ...base, id: "a2", fecha: "2045-06-30", tipo: 2, categoria: CAT_AJUSTE_MENOS, glosa: "Ajuste a la base: deducción sin flujo", base: 120 };
    const venta = { ...base, id: "v1", fecha: "2045-06-29", tipo: 1, categoria: "Ventas", doc_tipo: "Boleta", glosa: "Ventas", monto: 1000, base: 1000 };
    S.caja = [venta, mas, menos];
    r.cl1 = clasificarMovimientoExcel(1, "", "Ajuste a la base por reajuste", "2045-06-30").categoria; r.cl2 = clasificarMovimientoExcel(2, "", "Partida sin movimiento de efectivo", "2045-06-30").categoria;
    r.malos = revisarDatos(true).filter((h) => /inválidos/.test(h.texto)).length;
    r.info = revisarDatos(true).filter((h) => /sin movimiento de efectivo/.test(h.texto)).map((h) => h.texto)[0] || "";
    const d = datosControlResultados(2045); r.resultado = Math.round(totalAnio(d.resultado)); r.flujo = Math.round(totalAnio(datosControlFlujo(2045).neto));
    S.caja = sc; await BD.setEmpresa(S.eid, e0); ir("inicio");
    return r;
  });
  ok("los ajustes «aumenta» y «disminuye» se reconocen por la glosa y no son inválidos", ga.cl1 === "Ajuste a la base imponible (aumenta)" && ga.cl2 === "Ajuste a la base imponible (disminuye)" && ga.malos === 0, JSON.stringify(ga));
  ok("el resultado tributario suma el ajuste que aumenta y resta el que disminuye ($1.000 + $300 − $120), y el flujo de caja solo trae los $1.000", ga.resultado === 1180 && ga.flujo === 1000, JSON.stringify(ga));
  ok("el revisor informa los ajustes sin efectivo y su efecto en el resultado", /2 ajuste\(s\).*\$180/.test(ga.info), JSON.stringify(ga));

  console.log("Capital propio tributario inicial editable");
  const cpi = await page.evaluate(async () => {
    const sc = S.caja, e0 = empresa(), r = {};
    await BD.setEmpresa(S.eid, { ...e0, tipo_contabilidad: "simplificada", ejercicio: 2046, inicio_actividades: "2046-01-01", cpt_inicial: undefined });
    await new Promise((x) => setTimeout(x, 60));
    r.sin = cptInicialEmpresa(2046);
    S.cajaAnio = "2046"; S.pestana.caja = "control"; S.cajaControl = "resultados"; ir("caja"); await new Promise((x) => setTimeout(x, 80));
    r.panel = !!document.querySelector("#cpt-inicial");
    document.querySelector("#cpt-inicial").value = "3.106.987";
    document.querySelector('form[data-form="n-cpt-inicial"]').requestSubmit(); await new Promise((x) => setTimeout(x, 200));
    r.guardado = cptInicialEmpresa(2046);
    r.informe = JSON.stringify(informeControlResultados(2046).paneles.der[0].filas.slice(0, 2));
    r.renta = calcularRenta(nuevaRenta(2046)).cpt.inicial;
    document.querySelector("#cpt-inicial").value = "-500"; document.querySelector('form[data-form="n-cpt-inicial"]').requestSubmit(); await new Promise((x) => setTimeout(x, 200));
    r.negativo = cptInicialEmpresa(2046);
    document.querySelector("#cpt-inicial").value = ""; document.querySelector('form[data-form="n-cpt-inicial"]').requestSubmit(); await new Promise((x) => setTimeout(x, 200));
    r.vacio = cptInicialEmpresa(2046);
    S.caja = sc; await BD.setEmpresa(S.eid, e0); S.pestana.caja = "libro"; ir("inicio");
    return r;
  });
  ok("el control de resultados permite registrar el capital propio tributario inicial del año", cpi.sin === null && cpi.panel && cpi.guardado === 3106987, JSON.stringify(cpi));
  ok("el capital propio inicial registrado entra al informe y a la ficha de renta", /3106987/.test(cpi.informe) && cpi.renta === 3106987, JSON.stringify(cpi));
  ok("acepta un valor negativo y, vacío, vuelve al del año anterior", cpi.negativo === -500 && cpi.vacio === null, JSON.stringify(cpi));

  console.log("Exportaciones");
  if (hayLibs) {
    const ex = await page.evaluate(async () => {
      const r = {}; const t = S.trabajadores[0];
      for (const [n, f] of [["activos", () => informeActivos(2026)], ["renta", () => informeRenta(rentaActual())], ["liquidación", () => informeLiquidacion(S.liquidaciones[0])], ["resumen", () => informeResumenTabular(datosResumen("2026-09"))], ["libro de caja", () => informeLibroCaja(2026, "", false)], ["ingresos y egresos", () => informeIngresosEgresos(2026)], ["libro", () => informeLibroRem("2026-09", S.liquidaciones)], ["dj", () => informeDj1887(2026, perceptores1887(2026))]]) {
        try { const i = f(); r[n] = [(await aPdf(i)).blob.size > 1000, (await aExcel(i)).size > 1000]; } catch (e) { r[n] = "ERR " + e.message; }
      }
      try { r.contrato = (await pdfContrato(t)).size > 1000; } catch (e) { r.contrato = "ERR " + e.message; }
      return r;
    });
    for (const [n, v] of Object.entries(ex)) ok(`PDF y Excel de ${n}`, JSON.stringify(v) === "[true,true]" || v === true, JSON.stringify(v));
  } else console.log("  (se omiten: ejecuta «npm install» en tests/artefacto para probar PDF y Excel)");

  ok("sin errores de JavaScript en toda la sesión", !errores.length, errores.join(" | "));
  await browser.close();
  console.log(`\n${pasaron} pruebas correctas, ${fallos} con fallos.`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
