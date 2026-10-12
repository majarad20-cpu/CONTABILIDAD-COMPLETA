# Pendientes y hoja de ruta

Lista viva de lo que falta por hacer. Se actualiza junto con cada versión del artefacto.

## Prioridad alta

### Migración inteligente desde Excel (completa y simplificada)
El dueño del proyecto tiene contabilidades completas y simplificadas llevadas en Excel y quiere traerlas al sistema.

- **Cómo partir:** recibir un ejemplo real (anonimizado) de cada tipo, uno de contabilidad completa y otro de simplificada, antes de diseñar nada. No suponer el formato.
- **Qué debe hacer:**
  - Leer el archivo .xlsx/.csv y reconocer solo las hojas y columnas (fecha, glosa, cuenta, debe/haber, monto, tipo de documento, RUT…), con una asignación de columnas editable.
  - Mostrar una **vista previa** y un informe de lo que no se entendió, antes de guardar.
  - Completa: construir el plan de cuentas, los asientos (incluida la apertura) y comprobar que cuadran.
  - Simplificada: cargar el libro de caja (saldo inicial, ingresos, egresos y monto que afecta la base) y los documentos.
  - Detectar duplicados y no repetir lo ya cargado si se importa dos veces.
  - Pasar el resultado por el **Revisor de datos** y entregar un informe de migración (qué se cargó, qué se omitió y por qué).
- **Aprovechar la migración para mejorar el sistema** (pedido expreso del dueño): al revisar los Excel, anotar qué prácticas, informes, columnas o controles útiles conviene adoptar, extraer o mejorar en el sistema (planes de cuentas, centros de costo, reportes propios, controles que el contador hace a mano).
- **Primer paso concreto:** pedir los archivos de ejemplo y escribir aquí lo que se aprenda de ellos (en curso: ver más abajo).
### Aprendizajes de los archivos recibidos

**Archivo 1: `RCV_2023.xlsx` (compras y ventas de 2023 con su centralización)**

Estructura encontrada:
- Un libro con **12 hojas, una por mes** (`01-2023` … `12-2023`). El período lo da la hoja, no la fecha del documento: hay facturas del 31-08 en la hoja de septiembre y del 29-09 y 30-10 en las de octubre y noviembre (documentos «rezagados», como en el RCV del SII).
- Cada hoja tiene un bloque **COMPRAS** (cabecera en la fila 2, con las columnas del RCV del SII), una fila de totales, y debajo la **centralización**: INSUMOS Y SERVICIOS (neto), IVA CRÉDITO FISCAL, IMPUESTOS NO RECUPERABLES (suma de «Valor otro impuesto») contra PROVEEDORES (total). Luego un bloque **VENTAS** con su centralización: CLIENTES contra VENTAS e IVA DÉBITO FISCAL.
- Aprox. 155 documentos: facturas electrónicas (33) y 3 notas de crédito (61); todas las compras «Del Giro».
- Una columna auxiliar (T, o Q en la hoja de septiembre) comprueba «neto + IVA + otro impuesto» contra el total.

Hallazgos y trampas que debe resolver el importador:
1. **Textos con codificación dañada** en las razones sociales (por ejemplo «COMPAÃ‘Ã​ÍA» en vez de «COMPAÑÍA»): UTF-8 leído como Latin-1. Hay que repararlos al importar (22 casos).
2. **Notas de crédito con montos negativos** en el Excel; nuestro RCV las guarda en positivo y las resta por tipo de documento. Al importar hay que pasarlas a valor absoluto para no restarlas dos veces.
3. **RUT sin puntos** (`77292237-K`): normalizar al formato del sistema.
4. **Hojas con distinta forma:** septiembre tiene menos columnas (sin «Código otro impuesto») y dice «NO HAY VENTAS» en lugar del bloque de ventas. Las filas de totales y de centralización no llevan número y deben ignorarse (pero usarse para **cuadrar** contra lo que calcule el sistema).
5. **Impuesto específico a los combustibles (código 28):** en 10 documentos (todos de estaciones de servicio) «neto + IVA + otro impuesto» no coincide con el total, y el «valor otro impuesto» viene como 1. La contadora cuadra el asiento tomando el **total como verdad** y dejando la diferencia en el gasto. El importador debe hacer lo mismo, pero avisar cada caso en el informe de migración, no absorberlo en silencio.
6. **Fórmulas de Excel** (tablas con referencias estructuradas): leer el valor calculado, no la fórmula.

Qué conviene adoptar en el sistema a partir de este archivo:
- **Importador de RCV desde Excel** (varias hojas, un mes por hoja), además del CSV del SII que ya existe. ExcelJS, que ya usamos para exportar, también lee archivos .xlsx.
- **Cuadre automático de la centralización** contra la hoja original: mostrar, por mes, neto, IVA, impuestos no recuperables y total del Excel frente a lo que calcula el sistema.
- **Reparación automática de textos dañados** también en el importador del CSV del SII.
- **Aviso de rezagados:** documentos cuya fecha es anterior al mes del período.
- **Aviso de «sin movimiento»** en el RCV de ventas (hoy el mes simplemente queda vacío).
- El revisor de datos podría comprobar «neto + IVA + otros = total» con un detalle de la causa (impuesto específico de combustibles).

Falta recibir: una **contabilidad completa** (libro diario, mayor o balance) y una **simplificada** (libro de caja o de ingresos y egresos).

**Archivos 2: `RCV_2024.xlsx`, `RCV_2025.xlsx`, `RCV_2026.xlsx` (hasta septiembre) — empresa del rubro maquinaria**

Panorama de los cuatro años (2023-2026): unos 900 documentos (compras: 696 filas; ventas: 202), 12 + 12 + 12 + 9 hojas. Documentos tipo 33 (factura), 34 (factura exenta, los servicios contables) y 61 (nota de crédito, 14 casos). Todas las compras y ventas son «Del Giro», salvo 5 compras de **activo fijo**.

La forma del libro cambió con el tiempo, y el importador debe tolerarlo:
1. **Nombre de las hojas:** `01-2023` en 2023; `RCV 01-2024` desde 2024. Una hoja vacía (`Hoja1`) en 2026. El período sale del nombre de la hoja, con cualquiera de las dos formas.
2. **Posición de los bloques:** hasta marzo de 2026 el rótulo es «COMPRAS»/«VENTAS» en la columna E, con la cabecera en la fila 2. Desde abril de 2026 hay rótulos «1.- REGISTRO DE COMPRAS» y «2.- REGISTRO DE VENTAS» en la columna A, y la cabecera baja a la fila 3. Hay que **buscar la fila cuya primera celda dice «Nro»**, no usar posiciones fijas.
3. **Cabecera de compras con 9 variantes** (de 14 a 21 columnas): con o sin «Impto. sin derecho a crédito», «IVA no retenido», «Monto neto activo fijo», «IVA activo fijo», «Código/valor/tasa otro impuesto». Hay que leer las columnas **por su nombre**. La de ventas es siempre la misma (14 columnas).
4. **Columnas auxiliares del contador** a la derecha de la tabla (suma de control, a veces repetida), que no hay que confundir con datos.
5. **Documentos con dos impuestos específicos:** una factura ocupa dos filas; la segunda no trae número ni montos, solo código y valor del segundo impuesto (código 35 junto al 28). Debe tratarse como continuación, no como documento nuevo (si no, aparece como folio repetido).
6. **Activo fijo:** cuando «Tipo compra» es «Activo Fijo», las columnas «Monto neto activo fijo» e «IVA activo fijo» **repiten** el neto y el IVA ya incluidos en «Monto neto» e «IVA recuperable»; sumarlas duplica el documento. Son 5 compras (un vehículo de 21,3 M neto en agosto de 2025 y maquinaria en 2026). En agosto de 2026 hay dos facturas de activo fijo (10 M y 20 M) y una **nota de crédito de 20 M** que revierte una: el sistema debería ligarlas.
7. **Notas de crédito** siempre con montos negativos (14 casos). Pasarlas a valor absoluto al importar.
8. **Discrepancias en el total:** 38 compras (de 696) donde neto + IVA + otros impuestos no es igual al total. 33 son combustibles (código 28 con «valor» = 1, o código 35), y 5 son activo fijo contadas dos veces por las columnas repetidas (ver punto 6; no es un error real). La contadora lo anota en la hoja de julio de 2026: «en algunas facturas el monto total está mal totalizado». Se concilia siempre con el **total** como verdad.
9. **Rezagados:** 16 compras con fecha anterior al mes de su hoja; ninguna venta.
10. **RUT sin puntos** en todos los casos (899 filas). **80 razones sociales** con la codificación dañada.
11. **Centralización por categoría a partir de abril de 2026:** además de «Insumos y servicios» (luego «Insumos y existencias») aparecen **«Servicios contables»**, **«Maquinarias y equipos»** y **«Vehículos»**, más una fila TOTALES que cuadra debe y haber. Es decir, la contadora ya clasifica cada compra por proveedor o tipo de gasto.

Qué conviene adoptar en el sistema a partir de estos archivos (se suma a lo del primer archivo):
- **Cuenta por proveedor (reglas de clasificación):** guardar «este RUT va a esta cuenta» y aplicarlo en la centralización, en lugar de una única cuenta de compras. Reemplaza el trabajo manual que hoy hace la contadora en el Excel (insumos, servicios contables, maquinaria, vehículos).
- **Alta automática de fichas de activo fijo** desde las compras marcadas «Activo Fijo» (con fecha, neto e IVA), y detección de la nota de crédito que las revierte.
- **Lector de cabecera por nombre y por búsqueda de «Nro»**, tolerante a variantes de columnas, filas vacías y hojas sin datos.
- **Manejo de documentos con varias filas de impuestos específicos** (tanto en el importador del CSV del SII como en el de Excel).
- **Cuadre automático por mes** contra las filas de centralización y TOTALES del Excel (neto, IVA, no recuperable, total), con la lista de documentos que no cuadran y su causa.
- En el revisor de datos: aviso de **neto + IVA + otros ≠ total** explicando que en combustibles suele ser un error del RCV, y aviso de **nota de crédito sin documento de origen**.

Falta: el RCV de 2022 (repartido en varios Excel), una contabilidad completa (diario, mayor o balance) y una simplificada.


## Prioridad media (pospuesto por el dueño)

Ideas evaluadas y aún no pedidas: conciliación bancaria por cartola, cuentas por cobrar y pagar con antigüedad y cobranza, flujo de caja proyectado, asistente de cierre mensual, asientos recurrentes y plantillas, centros de costo y presupuesto contra real, búsqueda global, inventario valorizado, papelera y deshacer.

## Pendientes ya identificados

- **Versión de escritorio (Flask):** llevar activo fijo, personal y remuneraciones, renta anual, contabilidad simplificada, resumen ejecutivo, panel y revisor al programa de escritorio. El dueño pidió hacerlo después, cuando esté en su PC.
- **Proyección tributaria** como sección del resumen ejecutivo (renta estimada, impuesto de primera categoría y efecto de los retiros).
- **Paso de contabilidad simplificada a completa**, convirtiendo el libro de caja en asientos.
- **Contabilidad simplificada:** confirmar el formato oficial de los anexos de la Resolución Ex. SII N° 14 y N° 31 (2021), que no fue posible leer directamente. Revisar columnas y reglas con el SII.
- **Parámetros referenciales a confirmar cada año:** tasas de trabajo pesado, composición de la cotización adicional de la Ley 21.735 para 2027-2032, tramos de asignación familiar, SIS, fechas del calendario tributario, tasa de retención de honorarios.
- El sitio sii.cl no es accesible desde el entorno de desarrollo: las normas se verifican con fuentes secundarias.
