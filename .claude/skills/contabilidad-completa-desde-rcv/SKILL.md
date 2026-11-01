---
name: contabilidad-completa-desde-rcv
description: Arma desde cero la contabilidad completa de una empresa a partir del RCV: centralizaciones de compras y ventas, cobros, pagos, provisión de PPM, pago del F29 con multas, costo de ventas y capital. Usar cuando no hay libro diario del contador y hay que generar asientos y estados.
---

# Contabilidad completa desde el RCV

Aplica a empresas de contabilidad completa sin contabilidad previa. Lee antes `cargar-rcv-y-libro-de-caja`, `cotejo-f29-carpeta-tributaria` y `operar-base-de-datos-artefacto`.

## Antes de empezar
- RCV de compras y ventas cargado y cuadrado con los F29 declarados. La aceptación es del usuario.
- Revisa el plan de cuentas. No crees cuentas sin preguntar (por ejemplo «IVA por pagar», «Remanente IVA» o «Impuestos por recuperar» pueden no existir).
- Meses cerrados (`empresa.cerrados`): no los modifiques sin avisar. Un cambio en un mes cerrado exige constancia con motivo.
- Pregunta las decisiones de criterio: si las facturas se dan por cobradas y pagadas, en qué fecha, y cómo se trata el costo de ventas.

## Asientos por mes (ids `aAAAA_MM_tipo`, fecha del último día del mes)
1. **Centralización de compras y de ventas**: usa `propuestaCentralizacion(periodo, registro)`. Compras al neto de la cuenta por defecto (p. ej. Mercaderías), IVA crédito, impuestos no recuperables, proveedores. Ventas contra clientes, ventas e IVA débito. Luego liga cada documento del RCV con el asiento (campo `asiento`).
2. **Cobro** (Banco / Clientes) y **pago a proveedores** (Proveedores / Banco): solo lo que el usuario indique. Boletas y comprobantes de pago se cobran el mismo mes; las facturas, según la instrucción.
3. **Provisión de PPM**: Debe PPM (activo) / Haber PPM por pagar, por el código 62 del F29.
4. **Costo de ventas**: si el usuario decide que todo lo comprado en el mes se vendió, Debe Costo de ventas / Haber Mercaderías por el neto comprado. No hay control de existencias.
5. **Pago del F29** (fecha de pago real, con folio en la glosa): Debe IVA débito (538), Debe PPM por pagar, Debe Multas e intereses fiscales (total con recargo − código 91), Haber IVA crédito (538 − IVA determinado), Haber Banco (total pagado). El crédito que sobra queda en IVA crédito fiscal como remanente.
6. **Capital**: aporte inicial y aumentos con la fecha real; el aumento puede ir a Banco.

## Formato del asiento
`{apertura:false, cierre:false, creado:<n creciente>, fecha, glosa, lineas:[{cuenta, debe, haber, glosa:""}]}`. `creado` ordena asientos del mismo día: compras, ventas, cobro, provisión de PPM, luego pagos. Comprueba que cada asiento cuadre antes de guardar.

## Verificación
Suma de debe = suma de haber; balance de comprobación; estado de resultados; balance con activo = pasivo + patrimonio (incluyendo el resultado). Cuadra totales y IVA de cada mes entre RCV, asiento y F29. Calcula los saldos desde los asientos reales: no estimes. Si das una cifra y luego descubres que estaba mal, corrígela de inmediato.

## Observaciones que siempre hay que informar
Saldos de banco negativos a fin de mes, pagos de F29 sin respaldo, meses con compras muy bajas, remanentes de IVA y su origen, multas (no son gasto aceptado en la renta) y provisión de renta pendiente.
