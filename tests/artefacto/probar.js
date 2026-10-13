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
    S.cajaAnio = "2026"; S.pestana.caja = "libro"; ir("caja"); await new Promise((r) => setTimeout(r, 60));
    const tabla = document.querySelectorAll("main tbody tr").length;
    const inf = informeLibroCaja(2026, "", false), infD = informeLibroCaja(2026, "", true), infIE = informeIngresosEgresos(2026);
    const rdo = datosResumen("2026-09"); ir("resumen"); await new Promise((r) => setTimeout(r, 60));
    const renta = calcularRenta(completarRenta(nuevaRenta(2026)));
    S.pestana.caja = "ingresos"; ir("caja"); await new Promise((r) => setTimeout(r, 60));
    const pdf = await pdfResumen(rdo, "");
    return { menu, guarda, n: S.caja.length, inicial: L.inicial, ing: L.ing, eg: L.eg, saldo: L.saldo, baseIng: L.baseIng, baseEg: L.baseEg, erRes: er.resultado, cobrar: dev.cobrar, iva: f29.codigos["89"], avisos: f29.alertas.length, tabla, filas: inf.filas.length, dia: infD.filas.length, ie: infIE.filas.length, caja: rdo.caja, titular: rdo.titular, patrimonio: rdo.patrimonio, rli: renta.rli, pdf: pdf.size, ieTexto: /Documentos por cobrar/.test(document.querySelector("main").textContent) };
  });
  ok("el menú de la empresa simplificada trae el libro de caja y oculta los asientos", sm.menu.includes("Libro de caja e ingresos y egresos") && !sm.menu.includes("Asientos") && !sm.menu.includes("Plan de cuentas") && sm.menu.includes("Resumen ejecutivo"), JSON.stringify(sm.menu));
  ok("una vista de contabilidad completa lleva al inicio simplificado", sm.guarda);
  igual("la importación del RCV registra las dos facturas del mes y el retiro", sm.n, 4);
  igual("el libro de caja: saldo inicial, ingresos y egresos", [sm.inicial, sm.ing, sm.eg, sm.saldo], [300000, 1785000, 676000, 1409000]);
  igual("la base imponible excluye el IVA y los retiros", [sm.baseIng, sm.baseEg], [1500000, 400000]);
  igual("el resultado de caja es la base de ingresos menos egresos", sm.erRes, 1100000);
  ok("el IVA del F29 sale del RCV sin necesidad de asientos", sm.iva === 285000 - 76000 || sm.iva === 209000, String(sm.iva));
  ok("el F29 no pide cuentas contables en contabilidad simplificada", sm.avisos === 0, String(sm.avisos));
  ok("la pantalla del libro de caja se dibuja", sm.tabla >= 5);
  ok("los libros se arman en formato de informe", sm.filas === 1 + 4 + 3 + 3 && sm.dia >= 4 && sm.ie >= 4, JSON.stringify([sm.filas, sm.dia, sm.ie]));
  igual("el saldo de caja del resumen ejecutivo", sm.caja, 1409000);
  ok("el resumen ejecutivo no muestra patrimonio y sí un titular", sm.patrimonio === null && /su empresa ganó/.test(sm.titular), sm.titular);
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
    const llenar = (extra) => { for (const [k, v] of Object.entries({ "cj-fecha": hoy(), "cj-categoria": "Compras y gastos", "cj-tipo": "2", "cj-doc": "Factura", "cj-num": "9", "cj-rut": "76.543.210-3", "cj-nombre": "Prov", "cj-glosa": "Compra de prueba", "cj-neto": "200000", "cj-exento": "", "cj-iva": "", "cj-monto": "", "cj-base": "", "cj-fechadoc": "", ...extra })) poner(k, v); };
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
      cuRecalc: cu, cuRcv: c2, csv: [d[12]?.neto, d[12]?.total, d[12]?.fecha, cuCsv], notas: hojas[0].notas, nuevos: R.nuevos.length, importados: importados.length, tras: S.rcv.length - antes, segundaVez: R3.nuevos.length, vista: /Importar desde Excel o planillas/.test(html), rutFmt: d[501].rut, repararDoble: repararTexto("TRANSPORTES Y LOGÃƒï¿½STICA GUIDO") };
  });
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
