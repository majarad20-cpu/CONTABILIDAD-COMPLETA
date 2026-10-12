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
  ok("el respaldo incluye todas las colecciones", ["asientos", "activos", "trabajadores", "liquidaciones", "renta", "depreciaciones", "f29", "rcv", "socios", "sueldos", "honorarios", "cambios"].every((k) => k in resp.cols));
  igual("detecta que la empresa ya existe", resp.repetida, "e1");
  ok("rechaza archivos inválidos con un mensaje", resp.errores.every((e) => typeof e === "string" && e.length > 10), JSON.stringify(resp.errores));
  ok("rechaza identificadores peligrosos", /identificador inválido/.test(resp.errores[2]));
  const antes = await page.evaluate(() => ({ asientos: S.lista.length, activos: S.activos.length, liq: S.liquidaciones.length }));
  const nueva = await page.evaluate(async (texto) => {
    const d = JSON.parse(texto); d.empresa.rut = "77.777.777-7"; d.empresa.razon_social = "COPIA SPA";
    S.restauracion = analizarRespaldo(JSON.stringify(d)); await restaurar(false); await new Promise((r) => setTimeout(r, 100));
    return { eid: S.eid, asientos: S.lista.length, activos: S.activos.length, liq: S.liquidaciones.length, empresas: S.empresas.length, ligada: S.liquidaciones.every((l) => S.lista.some((a) => a.id === l.asiento)) };
  }, resp.texto);
  igual("restaurar como empresa nueva copia los datos", [nueva.asientos, nueva.activos, nueva.liq, nueva.empresas], [antes.asientos, antes.activos, antes.liq, 2]);
  ok("las liquidaciones siguen ligadas a sus asientos tras restaurar", nueva.ligada);
  const reemplazo = await page.evaluate(async (texto) => {
    cambiarEmpresa("e1"); await new Promise((r) => setTimeout(r, 100));
    await S.almacen.del("empresas/e1/activos/f3"); await new Promise((r) => setTimeout(r, 60));
    S.restauracion = analizarRespaldo(texto); await restaurar(true); await new Promise((r) => setTimeout(r, 100));
    return { eid: S.eid, activos: S.activos.length, empresas: S.empresas.length };
  }, resp.texto);
  igual("reemplazar recupera lo borrado sin duplicar la empresa", [reemplazo.eid, reemplazo.activos, reemplazo.empresas], ["e1", 2, 2]);

  console.log("Pantallas");
  const vistas = [["inicio"], ["activos", "fichas"], ["activos", "dep"], ["activos", "libro"], ["rrhh", "trabajadores"], ["rrhh", "liquidaciones"], ["rrhh", "libro"], ["rrhh", "parametros"], ["renta"], ["dj", "1887"], ["dj", "1879"], ["tributarias"], ["empresa"], ["empresas"]];
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
