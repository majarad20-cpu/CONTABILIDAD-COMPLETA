---
name: cargar-rcv-y-libro-de-caja
description: Carga el Registro de Compras y Ventas del SII (CSV y resúmenes de boletas o comprobantes) en una empresa del artefacto, lo cuadra contra los F29 y arma el libro de caja de las empresas simplificadas. Usar cuando el usuario sube RCV de compras o ventas, pantallazos de resúmenes o pide el libro de caja de un mes.
---

# Cargar RCV y armar el libro de caja

Los datos viven en la base del artefacto (`ArtifactData`), nunca en el repositorio. Antes de escribir, lee `reglas-programa-contabilidad` y `operar-base-de-datos-artefacto`.

## Orden de trabajo
1. Identifica la empresa (`empresas/{eid}`), el período y si es simplificada o completa. Lee su documento (versión, `rcv_aceptado`, `codigos_otros`, `tasa_ppm`).
2. Procesa los CSV con el motor del programa en un arnés Playwright (carga `contabilidad.html`, `BD.setEmpresa("ex", ...)`, `analizarArchivosRcv`, `resumenMigracion`). No reescribas el parser a mano.
3. Guarda solo documentos nuevos (clave `registro|tipo_doc|rut|folio`; los repetidos se omiten). Campos: `registro`, `periodo`, `tipo_doc`, `rut`, `razon_social`, `folio`, `fecha`, `exento`, `neto`, `iva`, `iva_no_recuperable`, `otros_impuestos`, `total`, `cantidad:1`, `cuenta:""`, `asiento:""`, `origen:"importación CSV"`. Id: `dx` (compras) o `dv` (ventas) más hash de la clave.
4. Cuadra contra el F29 declarado (ver `cotejo-f29-carpeta-tributaria`) y contra los pantallazos del SII antes de pedir aceptación.
5. Informa en español: documentos por mes y totales, qué cuadra, qué no. Deja el mes sin aceptar.

## Aceptación
- `empresa.rcv_aceptado[AAAA-MM][COMPRA|VENTA]` = resultado de `resumenCargaRcv(periodo, registro)` sin `codigos` ni `sinDetalle`, más `fecha`. Solo cuando el usuario lo pide ("acepta", "si coinciden aceptalos").
- `update` reemplaza el campo completo: re-lee la empresa, copia el `rcv_aceptado` actual, agrega el mes y escribe con `if_version`.

## Resúmenes de boletas y comprobantes (sin CSV)
El SII a veces no deja descargar boletas ni comprobantes de pago. El usuario manda pantallazos del «Resumen Registro de Ventas»: lee solo las filas de boleta (39, 41, 38) y comprobante de pago (48), y descarta facturas y notas de crédito, que ya vienen en el CSV.
- Un documento por mes y tipo: `folio:"RESUMEN AAAA-MM"`, `cantidad` = total de documentos, `exento`, `neto`, `iva`, `total`, `origen` indicando que viene de un resumen del SII, `rut` de la empresa.
- Si neto + IVA + exento no suma el total por $1 de redondeo, ajusta el neto en $1 y déjalo anotado en `observacion`.
- Una nota de crédito va en la línea del documento que corrige (versión 1.61.0 del programa).

## Libro de caja (simplificada)
- Las líneas del RCV salen de `movimientosResumenRcv(periodo)`: una por tipo, con `origen:"rcv_resumen"` e id `m_rcvmes_AAAA-MM_clase`.
- Compras con IVA recuperable: monto = total, base = neto. IVA no recuperable y anticipo van en líneas aparte (`compra_inr`, `compra_anticipo_iva`, base 0 para el anticipo).
- Pago de F29 en el mes en que se paga, no en el del período: una línea `f29_ppm`, otra `f29_ret` y otra de multa (categoría de multas, base 0) con `f29_periodo`. Multa = total con recargo menos impuesto, neto de condonación.
- Ajustes sin efectivo (monto 0 con base distinta de 0) son válidos.
- No cambies datos de otras empresas ni de otros meses.
