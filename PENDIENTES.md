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
5. **Impuesto específico a los combustibles (códigos 28 y 35):** en 10 documentos de 2023 (todos de estaciones de servicio) «neto + IVA + otro impuesto» no coincide con el «Monto total» del RCV, y el «valor otro impuesto» viene como 1. **Corrección (al revisar los archivos de 2022 y los totales de cada hoja):** el contador **no** toma el total del RCV como verdad: el asiento de cada mes, «PROVEEDORES», es siempre la suma de **neto + IVA + otros impuestos**, no la suma del «Monto total». En 2022 incluso corrigió a mano la columna «Monto total» en las hojas «CORRECTO». Pendiente de confirmar con ella cuál es el monto real de esas facturas (conviene cotejar una factura de papel). El importador debe permitir elegir, con aviso en cada caso.
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
8. **Discrepancias en el total:** 38 compras (de 696) donde neto + IVA + otros impuestos no es igual al total. 33 son combustibles (código 28 con «valor» = 1, o código 35), y 5 son activo fijo contadas dos veces por las columnas repetidas (ver punto 6; no es un error real). El contador lo anota en la hoja de julio de 2026: «en algunas facturas el monto total está mal totalizado». En las hojas del contador, el asiento mensual usa **neto + IVA + otros impuestos** y no el total del RCV (ver corrección en el punto 5 del primer archivo).
9. **Rezagados:** 16 compras con fecha anterior al mes de su hoja; ninguna venta.
10. **RUT sin puntos** en todos los casos (899 filas). **80 razones sociales** con la codificación dañada.
11. **Centralización por categoría a partir de abril de 2026:** además de «Insumos y servicios» (luego «Insumos y existencias») aparecen **«Servicios contables»**, **«Maquinarias y equipos»** y **«Vehículos»**, más una fila TOTALES que cuadra debe y haber. Es decir, el contador ya clasifica cada compra por proveedor o tipo de gasto.

Qué conviene adoptar en el sistema a partir de estos archivos (se suma a lo del primer archivo):
- **Cuenta por proveedor (reglas de clasificación):** guardar «este RUT va a esta cuenta» y aplicarlo en la centralización, en lugar de una única cuenta de compras. Reemplaza el trabajo manual que hoy hace el contador en el Excel (insumos, servicios contables, maquinaria, vehículos).
- **Alta automática de fichas de activo fijo** desde las compras marcadas «Activo Fijo» (con fecha, neto e IVA), y detección de la nota de crédito que las revierte.
- **Lector de cabecera por nombre y por búsqueda de «Nro»**, tolerante a variantes de columnas, filas vacías y hojas sin datos.
- **Manejo de documentos con varias filas de impuestos específicos** (tanto en el importador del CSV del SII como en el de Excel).
- **Cuadre automático por mes** contra las filas de centralización y TOTALES del Excel (neto, IVA, no recuperable, total), con la lista de documentos que no cuadran y su causa.
- En el revisor de datos: aviso de **neto + IVA + otros ≠ total** explicando que ocurre sobre todo en combustibles y que hay que cotejar con la factura, y aviso de **nota de crédito sin documento de origen**.


**Archivos 3: RCV de 2022 (marzo a mayo), en archivos sueltos**

Recibidos: `RCV_03-2022`, `RCV_04-2022`, `RCV_04-2022_VENTA`, `RCV_05-2022_COMPRA`, `RCV_05-2022_VENTA`. Faltan el resto de los meses de 2022.

Lo nuevo frente a 2023-2026:
1. **Un archivo por mes y por tipo**, con nombres distintos (`RCV_03-2022`, `RCV_04-2022_VENTA`, `RCV_05-2022_COMPRA`…) y hojas con nombres también distintos: `RCV 03-2022 CORRECTO`, `RCV 05-2022 COMPRA` y, en las ventas, `RCV_VENTA_77447556-7_202204`, que es el nombre original de la descarga del SII y **contiene el RUT de la empresa** (77447556-7) y el período (AAAAMM). El importador debe sacar período y tipo del nombre de la hoja o del archivo, y el RUT de la empresa para verificar que corresponde a la empresa elegida.
2. **Hojas duplicadas «MALO/CORRECTO» y «ERRÓNEO/CORRECTO»:** el contador dejó la versión descargada y la corregida en el mismo libro. Hay que **detectar el par, preferir la corregida y avisar** (nunca cargar las dos).
3. **Corrección manual del total:** en las hojas «CORRECTO» ella reemplazó el «Monto total» del RCV por neto + IVA + otro impuesto (por ejemplo 36.004 → 42.912) y agregó columnas auxiliares de control. Es la evidencia más clara de su criterio (ver corrección en el punto 5 del primer archivo).
4. **Cabeceras más cortas:** en compras 2022 no hay columna «Monto exento» (12 a 15 columnas); en ventas, 11 columnas sin exento ni fechas de acuse. Las columnas que no existen valen 0.
5. **Centralización con otros nombres:** «OTROS IMPTOS. NO RECUPERABLES», «IVA CRÉDITO FISCAL» (con tilde), «IVA DF» en vez de «IVA DÉBITO FISCAL», y a veces los montos en la columna F y a veces en la G. Hay que comparar por **significado**, no por texto exacto ni por columna.
6. **Inicio de la empresa (corregido tras revisar los asientos ya cargados):** la empresa se constituyó el 24-09-2021 y ya tenía asientos de apertura y de compras de enero y febrero de 2022; los archivos de RCV recibidos parten en marzo de 2022. El usuario (que es el contador) confirmó que no existen RCV de enero y febrero de 2022 porque la empresa no compró ni vendió. **Pero los asientos ya cargados traen «CENTRALIZACIÓN COMPRAS ENERO 2022» por $1.801.492 y «… FEBRERO 2022» por $6.387.765**: hay que revisarlos, porque no tienen respaldo en el RCV.
7. **Ventas mínimas al comienzo** (una factura por mes en abril y mayo de 2022).

Qué conviene adoptar:
- **Detector de versiones duplicadas de un mismo período** (hojas o archivos) con vista previa de las diferencias.
- **Elección explícita de la fuente del total:** «total del RCV» o «recalcular con neto + IVA + otros», por documento o para todo el mes, con registro de lo elegido.
- **Verificación de RUT de la empresa** al importar (viene en el nombre de la hoja de ventas del SII).
- **Normalización de etiquetas de centralización** (equivalencias de nombres) para el cuadre automático.


**Archivos 4: RCV de 2022 (junio a septiembre)**

Recibidos: `RCV_06-2022_COMPRA`, `RCV_06-2022_VENTA`, `RCV_07-2022_COMPRA`, `RCV_08-2022_COMPRA`, `RCV_09-2022_COMPRA`. De ventas solo vino junio (3 facturas); julio, agosto y septiembre no traen archivo de ventas (confirmar si hubo ventas).

Novedades:
1. **Nombre de hoja truncado:** las hojas llamadas `RCV_COMPRA_REGISTRO_77447556-7_` son el nombre original de la descarga del SII cortado a 31 caracteres (límite de Excel): **pierden el período**. Hay que sacarlo del nombre del archivo (`RCV_07-2022_COMPRA`) o, si no, del mes dominante de las fechas de recepción.
2. **Otro nombre para la pareja de hojas:** `MALO` / `BUENO` (antes `ERRÓNEO` / `CORRECTO` y `MALO` / `CORRECTO`). Hay que reconocer los sinónimos: malo, erróneo, incorrecto, original frente a correcto, bueno, corregido.
3. **Dos criterios conviven en un mismo archivo:** en junio, la hoja `MALO` cuadra PROVEEDORES con la suma del «Monto total» del RCV (480.176) y la `BUENO` con neto + IVA + otros (566.232). En julio, agosto y septiembre hay una sola hoja: la columna «Monto total» queda con el valor del RCV, pero una columna auxiliar y el asiento usan neto + IVA + otros. Es la misma práctica de siempre.
4. **Observación sobre el criterio del total (actualizada en el grupo de archivos 5):** el «Monto total» del RCV de las facturas de combustible es un número redondo y menor que neto + IVA + otros. Ver la explicación completa más abajo, donde diciembre de 2022 aclara el origen del problema.
5. **Primera compra de activo fijo:** un **tractor** en agosto de 2022 (neto 9.243.697), que el contador separa en la centralización como «TRACTOR / MAQUINARIAS». Compras de ese mes con las columnas «Monto neto activo fijo» e «IVA activo fijo» (repetidas, ver archivos 2).
6. **Etiquetas de centralización con espacios y nombres de activo:** «TRACTOR MAQUINARIAS» es una cuenta que depende de la compra. Reafirma la idea de la **cuenta por proveedor / por documento** y de crear la **ficha de activo fijo** automáticamente.

Resumen de lo recibido de 2022: marzo (compras), abril (compras y ventas), mayo (compras y ventas), junio (compras y ventas), julio, agosto y septiembre (solo compras). Faltan octubre a diciembre y las ventas de julio a septiembre, si las hubo.


**Archivos 5: RCV de 2022 (septiembre a diciembre)**

Recibidos: `RCV_09-2022_VENTA`, `RCV_10-2022_COMPRA`, `RCV_10-2022_VENTA`, `RCV_11-2022_COMPRA`, `RCV_12-2022_COMPRA`. Con esto están todos los meses de compras de 2022 (marzo a diciembre) y las ventas de abril a octubre, salvo julio y agosto (si no hubo ventas, no hay archivo). Falta como máximo un archivo (a confirmar con el usuario).

Hallazgo clave, que aclara el problema de los combustibles:
- **Diciembre de 2022 trae una nota del contador: «EN DICIEMBRE DE 2022 SE REGULA».** En esa hoja el «Valor otro impuesto» viene con **montos reales** (3.336, 3.088, 3.656, 1.796…) y **todos los documentos cuadran**: neto + IVA + otro impuesto = total (por ejemplo 28.746 + 5.462 + 1.796 = 36.004).
- Antes de diciembre de 2022 (y de nuevo en varios meses de 2023 y 2026), el mismo tipo de factura trae «Valor otro impuesto» = **1** (un valor de relleno), un **total redondo** (36.004 aparece tal cual en julio y en diciembre) y un neto + IVA **mayor** que el total (en julio, 50.967 contra 36.004).
- Conclusión probable: cuando el impuesto específico no se informa (queda en 1), el **neto y el IVA del RCV vienen sobreestimados** y el **total es el monto real**. Recalcular el asiento con neto + IVA + 1, como hace la planilla, **sobreestima compras, proveedores e IVA crédito**. Sobre los 61 documentos afectados entre 2022 y 2026 (con las hojas «MALO» descartadas), el exceso suma unos **$1,35 millones** (2022: $242 mil; 2023: $201 mil; 2026: $903 mil).
- **Esto debe confirmarse con el contador o con las facturas originales antes de fijar un criterio, y conviene revisar con ella el efecto en el IVA crédito de los F29 de esos meses.** No es una conclusión definitiva.
- Regla propuesta para el importador: detectar «código de impuesto específico (28 o 35) con valor ≤ 1» y marcar el documento como **«impuesto específico no informado»**, mostrando ambas opciones (total del RCV, o recalcular) con el efecto en el gasto y el IVA, sin elegir en silencio.

Otras novedades:
1. **Notas de crédito en ventas del mismo mes:** en octubre de 2022 la nota de crédito folio 1 (−1.200.000 neto) anula la factura folio 7 emitida el mismo día. El sistema debería **enlazar la nota con su factura** (mismo cliente, mismo monto, misma fecha) y mostrarlas juntas.
2. **Ventas con 12 y 13 columnas** (con o sin «Fecha reclamo»); las ventas de 2022 no traen siempre exento.
3. **Una sola venta** en septiembre de 2022 (540.000 neto): la actividad comercial es pequeña al comienzo.
4. **Las hojas de diciembre** dejan una nota de texto libre debajo de la tabla (columna E, fila 22). El importador debe **capturar las notas de texto** que no son parte de la tabla ni de la centralización y mostrarlas en el informe de migración, porque llevan decisiones del contador.


**Archivo 6 (último de RCV): `RCV_12-2022_VENTA.xlsx`**

Con este queda **completo el RCV de 2022 a 2026** que el usuario tenía (2022: compras de marzo a diciembre y ventas de abril, mayo, junio, septiembre, octubre y diciembre; no hay archivo de ventas de julio, agosto ni noviembre, que se asumen sin ventas; 2023, 2024, 2025 y 2026 hasta septiembre completos).

Lo nuevo de este archivo, que es una trampa importante:
1. **No es un Excel aunque se llame `.xlsx`:** es un **archivo de texto CSV con separador «;»** y fin de línea de Windows. El importador no debe fiarse de la extensión: debe **detectar el formato por el contenido** (un .xlsx real empieza con `PK`, el de texto no) y aceptar los dos.
2. **Números y fechas escritos «a la chilena», como texto:** montos como ` $1.260.000 ` (con signo peso, puntos de miles y espacios), fechas `07-12-2022` y `07-12-2022 8:40` (día-mes-año, hora sin cero inicial). Hay que interpretarlos sin confundir día con mes y sin confundir el punto de miles con decimal. Ya tenemos un lector de números con puntos en el CSV del SII; hay que extenderlo al signo `$` y a los espacios.
3. **La centralización viene mezclada con los datos** (filas CLIENTES, VENTAS, IVA DÉBITO FISCAL y la fila final de totales), igual que en los Excel; hay que reconocerla y usarla solo para cuadrar.

**Resumen de lo que debe soportar el importador de RCV** (de todos los archivos):
- Formatos: `.xlsx` real y texto CSV con `;` (detectado por contenido); hojas con o sin título; cabecera encontrada por la fila que empieza con «Nro»; columnas leídas por nombre (9 variantes de compras, 3 de ventas).
- Períodos: del nombre de la hoja (`01-2023`, `RCV 05-2024`, `RCV_VENTA_<RUT>_202204`), del nombre del archivo (`RCV_07-2022_COMPRA`) o del mes dominante de las fechas de recepción cuando la hoja está truncada. Verificar el RUT de la empresa cuando viene en el nombre.
- Duplicados: hojas MALO/CORRECTO/BUENO/ERRÓNEO, documentos repetidos y filas de continuación de impuestos específicos.
- Limpieza: textos con codificación dañada (UTF-8 leído como Latin-1), RUT sin puntos, notas de crédito negativas (pasar a positivo), montos con `$` y puntos de miles.
- Reglas de negocio: activo fijo (columnas repetidas, ficha automática), combustibles con impuesto específico no informado (marcar y ofrecer las dos opciones), enlace de notas de crédito con su factura, cuenta por proveedor.
- Salidas: vista previa, informe de migración (qué se cargó, qué se omitió y por qué, notas de texto del contador), y cuadre por mes contra la centralización del Excel.

Falta para completar el estudio: una **contabilidad completa** (libro diario, mayor o balance) y una **simplificada** (libro de caja o de ingresos y egresos). Decisión pendiente del usuario: criterio por defecto para los combustibles (total del RCV o recalcular), a confirmar con las facturas originales.



## Migración realizada

**RCV de 2022 a septiembre de 2026 de SERVICIO MAQUINARIA AGRICOLA ARELLANO SPA (empresa `e77447556`) cargado en el artefacto el 12-10-2026.**

- 1.006 documentos (2022: 96 compras y 12 ventas; 2023: 123 y 32; 2024: 132 y 33; 2025: 169 y 80; 2026: 272 y 57) desde 20 archivos y 61 hojas, descartando las versiones «MALO/ERRÓNEO» y las hojas vacías. Los ids son `m0` a `m1005`.
- Cuadre: las 102 filas de centralización de las hojas (PROVEEDORES o CLIENTES de cada mes) coinciden **exactamente** con la suma de lo cargado, y las centralizaciones de marzo a diciembre de 2022 que ya estaban en los asientos de la empresa también coinciden (neto, IVA y total). Las propuestas de centralización del sistema para enero de 2023 coinciden con la hoja del Excel.
- Criterio aplicado a los totales (el mismo de las planillas del contador): se registra **neto + IVA + otros impuestos**; el total original del RCV queda en el campo `total_rcv`, la diferencia en `dif_total` y el documento marcado con `revisar_total` (62 documentos, diferencia acumulada de $1.345.681). El revisor de datos los lista. Es **reversible** y falta confirmar el criterio con las facturas originales.
- Limpieza: textos reparados, RUT con puntos, notas de crédito en positivo, impuesto específico duplicado (campos «Impto. sin derecho a crédito» y «Valor otro impuesto» con el mismo monto) contado una sola vez, y facturas de dos filas unidas.
- Notas de crédito: 15 de 16 enlazadas con su factura de origen (`nc_de`); la de agosto de 2026 por 20 millones hereda «activo fijo» de la factura que anula. La factura folio 244 de ese mes tiene una observación (misma fecha, proveedor y monto que el folio 243, que es activo fijo).
- Los documentos de 2022 quedaron ligados a los asientos de centralización que ya existían (108 documentos), para que no aparezcan como pendientes ni se centralicen dos veces. Los de 2023 a 2026 (898 documentos) quedan **pendientes de centralizar**; no se crearon asientos.
- Se configuraron las cuentas tributarias de la empresa copiando las que ya usan sus asientos (insumos y servicios, maquinarias y equipos, IVA crédito, impuestos no recuperables, proveedores, clientes, ventas e IVA débito). Antes, «clientes» se sugería la cuenta equivocada (1.1.350.1).

Hallazgos del revisor sobre los asientos de 2022 ya existentes (a revisar con la contabilidad): saldo negativo de BANCO al 31-12-2022 ($-11.557.625) y de PROVEEDORES ($-117.789, que coincide con las compras de abril de 2022 acreditadas a Banco en el asiento a17).


## Importador de RCV desde Excel (versión 1.10.0)

Construido con los hallazgos de las 30 planillas. En la pantalla **RCV** hay una tarjeta «Importar desde Excel o planillas (varios meses)»:
- Reconoce `.xlsx` y texto con «;» por el contenido; cabeceras por nombre; títulos y posiciones variables; hojas «malo/erróneo/incorrecto/original» descartadas; nombres de hoja truncados (el período sale del archivo, de la hoja o de las fechas de recepción); RUT de la empresa verificado cuando viene en el nombre.
- Repara textos con la codificación dañada (incluida la doble), pasa las notas de crédito a positivo y las enlaza con su factura (heredan el activo fijo), une las facturas de dos filas, cuenta una sola vez el impuesto específico repetido y avisa de posibles activos fijos (misma fecha, proveedor y monto).
- Vista previa con documentos nuevos, ya registrados, con total distinto del RCV, y comparación de cada mes con las filas PROVEEDORES/CLIENTES de la planilla. Muestra las notas escritas en las planillas.
- Elección del criterio para las facturas de combustible: «neto + IVA + otros impuestos» (como las planillas) o «total del RCV». Ambos dejan el documento marcado y guardan `total_rcv`. **El criterio por defecto queda pendiente de definir por el usuario**, que investigará con las facturas originales.
- Prueba contra los 20 archivos reales: 1.006 documentos, 102 de 102 centralizaciones cuadran y cero diferencias frente a la migración hecha antes con un script.

**Versión 1.11.0:** el importador lee también el CSV de detalle del SII y el **resumen de ventas** (boletas) con el mismo reparador de textos, y la pestaña Fichas de activo fijo ofrece crear las fichas desde las compras marcadas como activo fijo (costo = neto; descripción, categoría y vida útil editables por fila; no incluye compras anuladas por nota de crédito; el Revisor avisa de las que faltan).

**Corrección a la migración del 12-10-2026:** 84 razones sociales quedaron con la codificación dañada (el script no trataba los caracteres de Windows-1252). Se corrigieron directamente en la base el mismo día. El importador nuevo ya no tiene ese defecto.

## Ideas del programa de contabilidad simplificada del dueño (versión 1.12.0)

Revisado el repositorio `contabilidad-simplificada` (programa Flask). Traído a la app en 1.12.0: cálculo de IVA, retención de honorarios, total y base por movimiento; categorías nuevas; PPM vigente sugerida; meses cerrados; aviso de registro atrasado; RUT emisor y cierres C10 a C15; doble registro en el libro de ingresos y egresos.
Pendiente de traer: entidades relacionadas del art. 14 A (base devengada en renta y PPM), documentos pendientes de pago dentro del movimiento (hoy se manejan desde el RCV), libro de ingresos y egresos con secciones A y B y totales mensuales, resumen diario de ingresos y egresos, PPM sobre ingresos percibidos del libro de caja (hoy sale del RCV), respaldo descargable. Las Resoluciones 14 y 31 (texto) fueron leídas el 13-10-2026: confirman quién lleva cada libro, que se registran ingresos percibidos y devengados y egresos pagados y adeudados, y que la Res. 31 corrige la numeración (Anexos 1 y 2: Ingresos y Egresos; 3 y 4: Caja). Los Anexos de instrucciones 2, 4, 2.1 y 4.1 fueron leídos y aplicados en 1.13.0 (columnas y totales C1 a C15 de caja, C1 a C8 de ingresos y egresos, resúmenes diarios). Las plantillas (Anexos 1, 3, 1.1 y 3.1) también fueron comparadas y el Excel se genera con su disposición (1.13.1). El PDF de estos libros sigue siendo una tabla genérica con las mismas columnas.
Pendiente de recibir: el programa de remuneraciones del dueño.

## Libros de caja reales analizados (13-10-2026)

Dos libros de caja en Excel de empresas Pro Pyme transparente (14 D N°8), uno con 21 meses (2025 y 2026) y otro con 8 meses de 2026. Cómo trabaja el contador, para llevarlo a la app:
- **Una hoja por mes** con la planilla del Anexo 3, el folio del libro y el saldo inicial enlazado al saldo final del mes anterior (documento «Libro de Caja mes año»). Los egresos van con signo negativo en C8 y C9.
- **Líneas resumen del mes** desde el RCV (compras afectas pagadas, compras exentas, ventas por tipo de documento: boleta, factura, comprobante de pago) en lugar de un movimiento por documento; el neto es el total dividido por 1,19.
- **El pago del F29 se parte en tres líneas:** IVA determinado (base 0), PPM (base 0) y retención de segunda categoría (base igual al monto). Los honorarios se pagan líquidos y la retención va con el F29.
- **Hojas de control anuales:** resultados tributarios por mes y categoría con el resumen para el F22, capital propio tributario simplificado (inicial + base − retiros) y datos de la DJ 1947 (resultado a traspasar al socio y PPM pagado acumulado, con corrección monetaria); flujo de caja por categoría; PPM pagados con ajuste por corrección monetaria.
- **Errores encontrados en el libro de uno de ellos:** abril 2025 resta la fila de honorarios (−K16) en vez de sumarla en los egresos y en la base, lo que sube $80.000 el saldo de caja y la base imponible desde esa fecha; y en el control de flujo de caja, de septiembre a diciembre 2026, el saldo final suma solo hasta la fila 27 y deja fuera honorarios, patente, intereses, retiros y multas.
- El «Resultado neto» de estos libros es ingresos menos egresos (positivo si hay utilidad), distinto del signo que pide el Anexo 4 (negativo si los ingresos superan a los egresos). Falta que el contador decida cuál usar.
- Ambas empresas pagan PPM del 1 % sobre las ventas netas.
Hecho en 1.14.0: pago de F29 en líneas con la retención sobre la base e importación del RCV como líneas resumen del mes. Hecho en 1.15.0: informes de control de resultados tributarios, flujo de caja por categoría y PPM pagados, con capital propio simplificado y datos de la DJ 1947 (falta la corrección monetaria del PPM por término de giro). Hecho en 1.16.0: importador de estos libros de Excel (una hoja por mes), con revisión previa. Probado con los dos libros reales sin guardar nada: el control de resultados de la app coincide con el del contador (ingresos, egresos y base de ambas empresas). Además de lo ya anotado, encontró en el libro de PESCADICTOS el correlativo 2 repetido en abril de 2025 y las líneas de compras y ventas de noviembre y diciembre de 2025 con fecha 31-10-2025. Pendiente: cargar los libros reales a la app (requiere autorización del dueño) y decidir el saldo inicial de 2026, que el libro declara $80.000 más alto que sus filas.

## Programa de remuneraciones del dueño (repositorio `rem`, revisado el 13-10-2026)

Programa Flask (FastAPI y SQLite) con motor de cálculo puro, 12 pruebas que pasan, archivos de Previred (105 campos) y del LRE, finiquitos, vacaciones con feriados y cierre de período. Se comparó con las remuneraciones de la app con 8 casos de la misma planilla de septiembre de 2026.
- **Coinciden al peso:** sueldo de 800 mil, isapre de 3 UF, sueldo sobre el tope, plazo fijo con APV y el aporte del empleador (SIS más Ley 21.735 suman 3,5 %); en horas extra y asignación familiar difiere solo 1 peso en aportes por redondeo.
- **Diferencias reales por revisar:** (1) seguro de cesantía con 11 años o más (rem: trabajador 0 % y empleador 0,8 %; la app sigue con 0,6 % y 2,4 %); (2) pensionados (rem no cobra AFP, SIS ni cesantía; la app no los distingue); (3) edad: sin SIS desde los 65 años y mínimo distinto para menores de 18 y mayores de 65; (4) trabajo pesado: la app rebaja esa cotización de la base del impuesto único y rem no; (5) asignación familiar: la app mide el tramo con imponible más no imponible y rem solo con el imponible; (6) rem prorratea los topes de AFP y cesantía por los días trabajados y la app no.
- **Hecho en 1.17.0:** diferencias 1 a 3 (11 años, pensionados, edad), horas extra al 100 % y los avisos de ingreso mínimo y del 45 %. Quedan las diferencias 4 a 6 hasta que el dueño decida el criterio: trabajo pesado en la base del impuesto único, base de la asignación familiar y prorrateo de los topes por días.
- **Hecho en 1.18.0:** finiquito mejorado (ver README). Pendiente decidir: si el recargo del art. 168 debe aplicarse también a la indemnización sustitutiva del aviso previo (el otro programa lo aplica solo a la indemnización por años de servicio, como esta versión). Los feriados posteriores a 2027 se agregarán con la mejora de vacaciones (editor de feriados).
- **Hecho en 1.19.0:** Previred (105 campos) y LRE como borrador. Pendiente: validarlos en los portales; el LRE no tiene columnas propias para los aportes de la Ley 21.735 (van sumados en «Total aportes empleador»); la separación de nombres y apellidos es por posición (los dos últimos nombres son apellidos); desde agosto de 2027 la composición de la cotización adicional se debe revisar a mano; no incluye licencias médicas ni días de vacaciones; el archivo de Previred no admite todavía movimientos de personal distintos de ingreso y término.
- **Hecho en 1.20.0:** vacaciones con feriados (ver README). Con esto termina la lista tomada del programa de remuneraciones; quedan las diferencias 4 a 6 por decidir. Pendiente: agregar los feriados de 2028 en adelante a medida que se publiquen.
- **Lo que tiene rem y falta en la app:** archivo de Previred y CSV del LRE (la app solo tiene una planilla de apoyo), horas extra al 100 %, licencias y ausencias, avisos de ingreso mínimo y del 45 % de descuentos (art. 58), finiquito con 9 causales, recargos del art. 168, imputación del aporte de cesantía y feriado proporcional en días corridos con tabla de feriados, novedades en grilla y cierre de período.
- **Lo que tiene la app y falta en rem:** centralización contable, Ley SANNA separada, semana corrida automática, contratos y PDF de liquidación y finiquito, DJ 1887 y 1879, varias empresas, haberes y descuentos fijos por trabajador.
- **Cuidados del repositorio:** el `.rar` incluye `data/remuneraciones.db` (puede tener datos reales de trabajadores) aunque el `.gitignore` lo excluye; conviene sacarlo del repositorio. Sin respaldos automáticos ni usuarios.

## Prioridad media (pospuesto por el dueño)

Ideas evaluadas y aún no pedidas: conciliación bancaria por cartola, cuentas por cobrar y pagar con antigüedad y cobranza, flujo de caja proyectado, asistente de cierre mensual, asientos recurrentes y plantillas, centros de costo y presupuesto contra real, búsqueda global, inventario valorizado, papelera y deshacer.

## Pendientes ya identificados

- **Versión de escritorio (Flask):** llevar activo fijo, personal y remuneraciones, renta anual, contabilidad simplificada, resumen ejecutivo, panel y revisor al programa de escritorio. El dueño pidió hacerlo después, cuando esté en su PC.
- **Proyección tributaria** como sección del resumen ejecutivo (renta estimada, impuesto de primera categoría y efecto de los retiros).
- **Paso de contabilidad simplificada a completa**, convirtiendo el libro de caja en asientos.
- **Contabilidad simplificada:** confirmar el formato oficial de los anexos de la Resolución Ex. SII N° 14 y N° 31 (2021), que no fue posible leer directamente. Revisar columnas y reglas con el SII.
- **Parámetros referenciales a confirmar cada año:** tasas de trabajo pesado, composición de la cotización adicional de la Ley 21.735 para 2027-2032, tramos de asignación familiar, SIS, fechas del calendario tributario, tasa de retención de honorarios.
- El sitio sii.cl no es accesible desde el entorno de desarrollo: las normas se verifican con fuentes secundarias.
