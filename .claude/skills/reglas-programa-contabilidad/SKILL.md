---
name: reglas-programa-contabilidad
description: Reglas del programa de contabilidad chilena (artefacto HTML) y flujo de trabajo para cambiar el sistema: pruebas, documentación, commit, publicación del artefacto y PR. Usar al modificar contabilidad.html o al trabajar con datos de las empresas.
---

# Reglas del programa y flujo de cambios

## Qué es
Sistema contable chileno en un solo archivo HTML con JavaScript puro: `artefacto/contabilidad.html`. Se publica como artefacto de Claude (misma URL) y sus datos están en la base del artefacto. Dos modos: contabilidad simplificada (libro de caja, RCV, F29, renta) y contabilidad completa (plan de cuentas, asientos, balances).

## Reglas con el usuario
- Los cambios al artefacto deben quedar tanto en Claude (publicado) como en GitHub.
- Solo implementar cambios a nivel sistema. No cambiar datos reales de las empresas, salvo que el usuario lo pida explícitamente para esa tarea (cargas de RCV, F29, libros, asientos).
- La aceptación de cargas de RCV es del usuario, salvo que diga "si coinciden, acéptalos".
- No crear cuentas que no existan en el plan de una empresa sin preguntar.
- No hacer cálculos ni cambios más allá de lo pedido; si algo no cuadra, informarlo.
- Antes de modificar un documento de la base, vuelve a leerlo y cambia solo la clave necesaria (`update` reemplaza los campos de primer nivel completos).
- Preguntar antes de decidir criterios (cobros y pagos de facturas, fechas de pago, costo de ventas, rectificatorias). Si una cifra dada antes resulta errada, corregirla de inmediato y decir cuál era la correcta.
- Si el usuario dice que los cambios los revisará después, dejar todo guardado y listar al final lo que debe revisar.
- El usuario es contador: responder en español, claro y directo, con cifras comprobadas. Si el usuario dice "dame acceso al programa", abrir el artefacto con `Artifact open`.

## Flujo por cada cambio de código
1. Editar `artefacto/contabilidad.html` y subir `VERSION`.
2. Lint y pruebas (`tests/artefacto/probar.js`, arnés Playwright); añadir pruebas del cambio.
3. Actualizar `README.md` (entrada de versión) y `PENDIENTES.md` si corresponde.
4. Commit y push a la rama de desarrollo.
5. Publicar el artefacto (mismo `file_path` y `url`).
6. PR y fusión (squash). Si hay conflicto tras una fusión squash: `git merge origin/main`, resolver y verificar que no queden marcadores `<<<<<<<`.

## Conceptos del motor
- Asientos: el sistema numera por año ordenando fecha, apertura primero, cierre último, luego `creado`, luego id.
- Libro de caja: orden por fecha, orden, id; cierre mensual por `empresa.cerrados`.
- F29: `calcularF29`; remanentes reajustados por UTM con 2 decimales; códigos 114/115 son anticipo del mes y remanente de anticipo; base PPM 563 = round(538/0,19) + 142.
- Skills relacionadas: `cargar-rcv-y-libro-de-caja`, `contabilidad-completa-desde-rcv`, `cotejo-f29-carpeta-tributaria`, `iva-regimenes-especiales-y-remanente`, `operar-base-de-datos-artefacto`.
- Notas de crédito y de débito de venta van en la línea del documento que corrigen (1.61.0).
- Reajuste del remanente: UTM del mes de presentación del F29.
- RCV: `rcv_aceptado`, `rcv_meses`, `codigos_otros` (incluye `sin_detalle:AAAA-MM`).
- Coherencia tributaria: lo declarado en el SII manda (ej. anticipo de IVA no es gasto); los ajustes de años declarados se registran para el año siguiente.
