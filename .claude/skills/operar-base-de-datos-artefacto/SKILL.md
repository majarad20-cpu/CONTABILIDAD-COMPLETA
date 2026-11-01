---
name: operar-base-de-datos-artefacto
description: Cómo leer y escribir de forma segura la base de datos del artefacto de contabilidad con ArtifactData y cómo probar las funciones del programa con Playwright. Usar antes de cualquier carga o corrección de datos.
---

# Operar la base de datos del artefacto

## Lectura y escritura
- Rutas: `empresas/{eid}`, `empresas/{eid}/{asientos|rcv|caja|f29|renta}`. Para colecciones grandes usa `list` con `out_dir` y trabaja sobre los JSON locales; el resultado largo no se pega en el chat.
- `batch`: hasta 50 escrituras por llamada y atómico; cada entrada con `if_version` si el documento ya existe (omítelo solo al crear). Las rutas con `file_path` evitan reescribir JSON en la conversación.
- `update` reemplaza los campos de primer nivel completos: re-lee, copia el valor actual, cambia lo necesario y escribe con `if_version`. Un `version_mismatch` significa que alguien (el usuario) editó el documento: vuelve a leer, no sobrescribas con copias antiguas.
- Límite de la base: 25.000 documentos por artefacto. Cuenta lo que agregas.

## Criterios
- Solo cambia la empresa, los años y los meses que el usuario pidió. Nunca datos de otras empresas.
- No cambies datos reales fuera de lo pedido; informa lo que cambiaste con cifras.
- Meses cerrados: no los modifiques sin avisar y sin dejar constancia.
- No inventes datos: si falta un monto, un folio o una fecha, pídelo.

## Probar funciones del programa (Playwright)
`/opt/pw-browsers/chromium-*/chrome-linux/chrome`, `file:///.../artefacto/contabilidad.html`, espera `S.almacen`. Carga datos con `BD.setEmpresa("ex", empresa)` y `S.almacen.set("empresas/ex/rcv/ID", doc)`; usa `cambiarEmpresa("ex")`. Funciones útiles: `analizarArchivosRcv`, `resumenMigracion`, `resumenCargaRcv`, `calcularF29`, `valoresInicialesF29`, `propuestaCentralizacion`, `movimientosResumenRcv`, `cuadreRcvLibro`, `cuentasTributarias`. Nunca escribas en la base real desde el arnés: solo lee y calcula, y escribe con `ArtifactData`.
