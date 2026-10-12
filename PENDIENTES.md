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
- **Primer paso concreto:** pedir los archivos de ejemplo y escribir aquí lo que se aprenda de ellos.

## Prioridad media (pospuesto por el dueño)

Ideas evaluadas y aún no pedidas: conciliación bancaria por cartola, cuentas por cobrar y pagar con antigüedad y cobranza, flujo de caja proyectado, asistente de cierre mensual, asientos recurrentes y plantillas, centros de costo y presupuesto contra real, búsqueda global, inventario valorizado, papelera y deshacer.

## Pendientes ya identificados

- **Versión de escritorio (Flask):** llevar activo fijo, personal y remuneraciones, renta anual, contabilidad simplificada, resumen ejecutivo, panel y revisor al programa de escritorio. El dueño pidió hacerlo después, cuando esté en su PC.
- **Proyección tributaria** como sección del resumen ejecutivo (renta estimada, impuesto de primera categoría y efecto de los retiros).
- **Paso de contabilidad simplificada a completa**, convirtiendo el libro de caja en asientos.
- **Contabilidad simplificada:** confirmar el formato oficial de los anexos de la Resolución Ex. SII N° 14 y N° 31 (2021), que no fue posible leer directamente. Revisar columnas y reglas con el SII.
- **Parámetros referenciales a confirmar cada año:** tasas de trabajo pesado, composición de la cotización adicional de la Ley 21.735 para 2027-2032, tramos de asignación familiar, SIS, fechas del calendario tributario, tasa de retención de honorarios.
- El sitio sii.cl no es accesible desde el entorno de desarrollo: las normas se verifican con fuentes secundarias.
