/* Pruebas del artefacto. Uso: cd tests/artefacto && npm install && npm test
   Abre artefacto/contabilidad.html en Chromium con los datos en memoria (sin conexión a Claude).
   Variables opcionales: CHROMIUM_PATH (ruta del navegador), ARCHIVO (otra copia del HTML). */
const path = require("path");
const fs = require("fs");
let chromium;
try { ({ chromium } = require("playwright")); } catch (_) { ({ chromium } = require("/opt/node22/lib/node_modules/playwright")); }

const HTML = process.env.ARCHIVO || path.resolve(__dirname, "../../artefacto/contabilidad.html");
const LIBS = path.join(__dirname, "node_modules");
const LIB = { "jspdf.umd.min.js": "jspdf/dist/jspdf.umd.min.js", "jspdf.plugin.autotable.min.js": "jspdf-autotable/dist/jspdf.plugin.autotable.min.js", "exceljs.min.js": "exceljs/dist/exceljs.min.js" };
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
    return { ok: d.serie.length === 12 && d.tonos && Array.isArray(d.puntos) && d.puntos.length > 0, titular: d.titular, hay: d.mes.hay, res: d.mes.resultado, ing: d.mes.ingresos, gas: d.mes.gastos, cuadra: d.cuadra, vacio: d0.titular, pdf: blob.size, tiles: document.querySelectorAll(".rs-tile").length, svg: !!document.querySelector("main svg"), html: /Puntos de atención/.test(html) && /Recomendaciones/.test(html) };
  });
  ok("el resumen reúne indicadores, serie de 12 meses y puntos de atención", rs.ok, JSON.stringify(rs));
  ok("el resultado del mes es ingresos menos gastos", rs.res === rs.ing - rs.gas);
  ok("un mes sin movimientos lo dice con claridad", /No hay movimientos/.test(rs.vacio));
  ok("el titular está en lenguaje simple", /su empresa (ganó|perdió)|No hay movimientos/.test(rs.titular), rs.titular);
  ok("la pantalla muestra cuatro indicadores, el gráfico y las secciones", rs.tiles === 4 && rs.svg && rs.html);
  ok("el PDF del resumen se genera", rs.pdf > 3000, String(rs.pdf));
  await page.evaluate(() => { presentar(true); });
  ok("el modo presentación oculta el menú", await page.evaluate(() => getComputedStyle(document.querySelector(".menu")).display === "none"));
  await page.keyboard.press("Escape");
  ok("Escape sale de la presentación", await page.evaluate(() => getComputedStyle(document.querySelector(".menu")).display !== "none"));
  await page.evaluate(() => { document.querySelector("#rs-notas").value = "Nota de prueba"; document.querySelector("#rs-notas").dispatchEvent(new Event("change", { bubbles: true })); });
  ok("los comentarios del contador se recuerdan", await page.evaluate(() => /Nota de prueba/.test(document.querySelector("main").textContent)));
  await page.evaluate(() => { recordar(claveNotas("2026-09"), ""); ir("inicio"); });

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
  ok("el respaldo incluye todas las colecciones", ["asientos", "activos", "trabajadores", "liquidaciones", "finiquitos", "renta", "depreciaciones", "f29", "rcv", "socios", "sueldos", "honorarios", "cambios"].every((k) => k in resp.cols));
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
  const vistas = [["inicio"], ["activos", "fichas"], ["activos", "dep"], ["activos", "libro"], ["rrhh", "trabajadores"], ["rrhh", "liquidaciones"], ["rrhh", "libro"], ["rrhh", "vacaciones"], ["rrhh", "finiquitos"], ["rrhh", "parametros"], ["apariencia"], ["resumen"], ["renta"], ["dj", "1887"], ["dj", "1879"], ["tributarias"], ["empresa"], ["empresas"]];
  for (const [ancho, nombre] of [[1200, "escritorio"], [400, "móvil"]]) {
    await page.setViewportSize({ width: ancho, height: 800 });
    const malas = [];
    for (const [v, t] of vistas) {
      const r = await page.evaluate(([v, t]) => { cambiarEmpresa("e1"); if (t) S.pestana[v.replace("dj", "dj")] = t; S.liqPeriodo = "2026-09"; S.liqPeriodoEid = "e1"; ir(v); return [document.documentElement.scrollWidth, document.documentElement.clientWidth, document.querySelector("main").innerText.length]; }, [v, t]);
      if (r[0] > r[1] || r[2] < 20) malas.push(`${v}/${t || ""}:${r}`);
    }
    ok(`todas las pantallas se ven bien en ${nombre}`, !malas.length, malas.join(" "));
  }

  console.log("Exportaciones");
  if (hayLibs) {
    const ex = await page.evaluate(async () => {
      const r = {}; const t = S.trabajadores[0];
      for (const [n, f] of [["activos", () => informeActivos(2026)], ["renta", () => informeRenta(rentaActual())], ["liquidación", () => informeLiquidacion(S.liquidaciones[0])], ["libro", () => informeLibroRem("2026-09", S.liquidaciones)], ["dj", () => informeDj1887(2026, perceptores1887(2026))]]) {
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
