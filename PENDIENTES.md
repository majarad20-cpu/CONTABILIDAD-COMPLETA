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


## Prioridad media (pospuesto por el dueño)

Ideas evaluadas y aún no pedidas: conciliación bancaria por cartola, cuentas por cobrar y pagar con antigüedad y cobranza, flujo de caja proyectado, asistente de cierre mensual, asientos recurrentes y plantillas, centros de costo y presupuesto contra real, búsqueda global, inventario valorizado, papelera y deshacer.

## Pendientes ya identificados

- **Versión de escritorio (Flask):** llevar activo fijo, personal y remuneraciones, renta anual, contabilidad simplificada, resumen ejecutivo, panel y revisor al programa de escritorio. El dueño pidió hacerlo después, cuando esté en su PC.
- **Proyección tributaria** como sección del resumen ejecutivo (renta estimada, impuesto de primera categoría y efecto de los retiros).
- **Paso de contabilidad simplificada a completa**, convirtiendo el libro de caja en asientos.
- **Contabilidad simplificada:** confirmar el formato oficial de los anexos de la Resolución Ex. SII N° 14 y N° 31 (2021), que no fue posible leer directamente. Revisar columnas y reglas con el SII.
- **Parámetros referenciales a confirmar cada año:** tasas de trabajo pesado, composición de la cotización adicional de la Ley 21.735 para 2027-2032, tramos de asignación familiar, SIS, fechas del calendario tributario, tasa de retención de honorarios.
- El sitio sii.cl no es accesible desde el entorno de desarrollo: las normas se verifican con fuentes secundarias.
