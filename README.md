# Contabilidad (Chile)

Programa de contabilidad general para empresas chilenas. Puede llevar varias empresas a la vez.
Funciona en tu PC y se usa desde el navegador. Los datos quedan en un archivo local (`datos/contabilidad.db`).

## Cómo iniciarlo

Haz doble clic en **`iniciar.bat`**. La primera vez instala lo necesario (requiere Python 3.10 o superior).
Después se abre el navegador en http://127.0.0.1:5000. Para detener el programa, cierra la ventana negra.

## Versión portable (pendrive)

Para llevar el programa a cualquier PC con Windows 10 u 11, sin instalar Python ni tener internet:

```
.venv\Scripts\python.exe crear_portable.py E:\Contabilidad
```

(cambia `E:` por la letra del pendrive; sin destino, se arma en `dist\Contabilidad`). La carpeta pesa unos 52 MB y
trae su propio Python. En el otro PC basta con doble clic en **Abrir Contabilidad.bat**; para cerrar, se cierra la
ventana negra. Si se hace doble clic otra vez con el programa abierto, solo se muestra el navegador.

- Los datos viajan en la carpeta `datos` del pendrive. Se copian desde este PC **solo la primera vez**.
- Para actualizar el programa del pendrive, se vuelve a ejecutar el mismo comando: reemplaza `python` y
  `programa`, y **nunca toca** la carpeta `datos`.
- Desde que se usa el pendrive, ese es el lugar de trabajo: los datos de este PC ya no se actualizan solos.
- Conviene respaldar la carpeta `datos` del pendrive de vez en cuando (perder el pendrive es perder los datos).

## Versión en línea (artefacto de Claude)

`artefacto/contabilidad.html` es una versión del programa que funciona como artefacto de Claude
(https://claude.ai/artifact/QS67HRARtFdqVpfFghd92y): se abre desde cualquier navegador con la cuenta de Claude y
guarda los datos en el artefacto. Incluye empresas, plan de cuentas, asientos con correlativo anual, Libro Diario,
Libro Mayor, Balance de 8 columnas, Estado de Resultados y Balance General, con descarga en CSV. Los cálculos son
los mismos del programa local.

Para llevar una empresa: en este programa, **Respaldos → Descargar para la versión en línea** genera un `.json`;
en el artefacto, **Empresas e importación** lo importa después de mostrar un resumen. Los datos de ambas versiones
son independientes: lo que se registra en una no aparece en la otra.

## Activo fijo, personal y renta (por ahora solo en la versión en línea)

Estos módulos están en el artefacto y todavía no en el programa de escritorio.

**Activo fijo** (menú Gestión): ficha de cada bien (costo, valor residual, categoría y vida útil, con depreciación
acelerada opcional), depreciación lineal por meses desde el mes de adquisición, y asiento mensual propuesto
(Depreciación del ejercicio / Depreciación acumulada) que se revisa antes de guardar. El **Libro de activo fijo**
muestra el ejercicio por bien, los bienes dados de baja y la **conciliación** de costo y depreciación acumulada contra
las cuentas contables. Las vidas útiles de la lista son de referencia (Resolución Exenta SII N° 43 de 2002): verifica
cada bien.

**Personal y remuneraciones** (menú Gestión):
- *Trabajadores y contratos*: ficha con los datos del art. 10 del Código del Trabajo y **contrato de trabajo en PDF**
  (indefinido, plazo fijo u obra o faena), con la jornada de 42 horas vigente desde el 26 de abril de 2026.
- *Liquidaciones*: sueldo proporcional a los días, horas extra, gratificación legal (25 % con tope de 4,75 ingresos
  mínimos al año), colación y movilización, AFP, salud (Fonasa o isapre en UF), seguro de cesantía, **impuesto único**
  con la UTM del mes, anticipos y otros descuentos. Se aplican los topes imponibles si se ingresa la UF. Cada
  liquidación se exporta a PDF y Excel.
- *Libro de remuneraciones* del mes con el resumen de cotizaciones (AFP por administradora, salud, cesantía, SIS,
  aporte adicional del empleador y mutual) para declarar en Previred. «Contabilizar remuneraciones» propone el
  asiento completo.
- *Vacaciones*: feriado anual (15 días hábiles más feriado progresivo, art. 68), días devengados, tomados y saldo por trabajador, con valor estimado.
- *Finiquitos*: cálculo con indemnización por años de servicio (tope 11 años y 90 UF), aviso previo, vacaciones proporcionales y remuneración del mes; PDF del finiquito y de la carta de término, baja del trabajador y asiento contable.
- *Reforma de pensiones (Ley 21.735)*: cotización adicional del empleador con su calendario (1 % desde agosto de 2025, 3,5 % desde agosto de 2026, hasta 8,5 % en 2033); desde agosto de 2026 incluye el SIS. La liquidación muestra los aportes del empleador (reforma, SIS, cesantía, mutual con SANNA, trabajo pesado) y el costo total para la empresa.
- *Más haberes y descuentos*: asignación familiar por tramo y cargas, comisiones y semana corrida, haberes y descuentos fijos (pensión de alimentos, cuota sindical, créditos), APV régimen A o B, trabajo pesado, y planilla de apoyo para Previred en CSV.
- *Parámetros*: ingreso mínimo, topes, SIS y cotización adicional del empleador, y tasa de la mutual. Los valores
  vienen de fuentes públicas y son referenciales: confírmalos con Previred y la Superintendencia de Pensiones, y
  regístralos aquí cuando cambien.

**Renta anual y declaraciones juradas** (menú Tributario):
- *Renta anual (F22)*, en tres pestañas:
  - **Renta líquida imponible**: parte del resultado contable y aplica ajustes automáticos (impuesto de primera categoría y multas contabilizados, depreciación contable y tributaria según las fichas de activo fijo, corrección monetaria del capital propio en el 14 A) y, en Pro Pyme, la **conversión a base de caja** con la variación de las cuentas por cobrar, por pagar, anticipos y existencias. Admite ajustes manuales, **pérdida tributaria de años anteriores reajustada con la VIPC**, créditos (PPM y otros), tasa por régimen (Pro Pyme general 12,5 % en 2025 a 2027, transparente y 14 A) y atribución a propietarios.
  - **Capital propio tributario**: activos que son inversión efectiva a valor tributario menos el pasivo exigible (art. 41 N° 1 LIR), con el tratamiento y el ajuste de cada cuenta, el ajuste del activo fijo según las fichas, el CPT inicial reajustado y su variación.
  - **Registros de rentas empresariales**: RAI, REX y SAC (y DDAN en el 14 A), capital aportado, retiros con su orden de imputación (RAI, DDAN y REX) y arrastre de los saldos finales al año siguiente.
  Cada pestaña se exporta a PDF, Excel y CSV. Todo es un borrador referencial: compáralo con la propuesta del SII y con los recuadros del F22 antes de declarar.
- *Declaraciones juradas*: planillas de apoyo para la **DJ 1887** (sueldos de trabajadores, finiquitos y sueldo empresarial) y la
  **DJ 1879** (retenciones de honorarios), con certificados por persona. No reemplazan el formulario del SII.

Las cuentas que usan estos módulos se configuran en **Tributario → Cuentas tributarias**.

Lo que falta por hacer, con su prioridad, está en [PENDIENTES.md](PENDIENTES.md).

## Versiones del artefacto

El número de versión aparece al pie del menú lateral y se define en `VERSION` dentro de `artefacto/contabilidad.html`.

- **1.10.0**: importador de RCV desde Excel o planillas de texto (varias hojas, vista previa, reparación de textos, notas de crédito, cuadre con la planilla y elección del criterio para combustibles). Ver PENDIENTES.md.
- **1.11.0**: el importador de RCV lee también el CSV del SII y el resumen de ventas (con reparación de textos) y se pueden crear las fichas de activo fijo desde las compras marcadas.
- **1.12.0**: ideas del programa de contabilidad simplificada del dueño. Cálculo de IVA, retención de honorarios, total y base en cada movimiento del libro de caja (solo la factura, nota de crédito o débito y DIN dan crédito fiscal; boleta de compra y gasto rechazado), nuevas categorías (existencias, intereses, leyes sociales, gasto rechazado, venta de activo fijo…), tasa de PPM vigente sugerida por régimen y año, meses cerrados que bloquean movimientos, aviso de registro atrasado, RUT emisor y cierres mensuales C10 a C15 en el libro de caja, y doble registro devengado y percibido en el libro de ingresos y egresos. No modifica datos existentes.
- **1.12.1**: con las Resoluciones Ex. SII N° 14 y N° 31 leídas, el libro de caja explica quién lo lleva, que debe estar al día y las sanciones, y el Revisor avisa si un régimen Pro Pyme transparente (14 D N° 8) usa gastos rechazados del art. 21, que no le aplica.
- **1.13.0**: libros de la contabilidad simplificada según los Anexos 2, 4, 2.1 y 4.1 de las Res. Ex. SII N° 14 y N° 31. Libro de caja con C1 a C9 (el saldo inicial es el registro 1) y cierres C10 a C15; resumen diario de caja por día y tipo de operación; libro de ingresos y egresos con sección A de ingresos y B de egresos, correlativos, sumatoria mensual, marca X de entidades relacionadas y resumen diario. Los préstamos, aportes, retiros e impuestos van solo al libro de caja.
- **1.13.1**: el Excel del libro de caja, del libro de ingresos y egresos y de sus resúmenes diarios sale con la disposición de las planillas oficiales del SII (Anexos 3, 1, 3.1 y 1.1 de las Res. 14 y 31): título, período, RUT, razón social, registro de operaciones con la fila de códigos, saldos y totales con los cierres mensuales. Las columnas del libro de caja quedan en el orden C1 a C9.
- **1.13.2**: el Revisor ya no avisa por una tasa de PPM de 1 % (la tasa inicial que muchas empresas pagan según su F29) y aclara que la tasa que vale es la del F29 de cada empresa.
- **1.14.0**: libro de caja de la contabilidad simplificada como lo lleva el contador. «Pago de F29» registra una línea por concepto (IVA, PPM, retención de honorarios, impuesto único); solo la retención afecta la base. Importación del **resumen mensual del RCV** (una línea por tipo de documento, a fin de mes) en vez de un movimiento por documento, sin mezclarse con la importación uno a uno. Las boletas de honorarios se importan por su líquido. La compra importada incluye los otros impuestos no recuperables en la base. Nuevos tipos de documento: boleta exenta, comprobante de pago, Formulario 29 y resúmenes del Registro de Compras y Ventas.
- **1.15.0**: pestaña «Control anual» del libro de caja con tres informes que se exportan a PDF, Excel y CSV: resultados tributarios por mes y categoría (con el resumen para el F22, el capital propio tributario simplificado y los datos de la DJ 1947 en el régimen transparente), flujo de caja por categoría (el saldo final coincide con el del libro) y PPM pagados por mes del F29. Nueva categoría de multas.
- **1.16.0**: importador de libros de caja en Excel (una hoja por mes, como los lleva el contador) en la pestaña Importar. Antes de importar revisa que cada hoja cuadre (totales contra sus filas, saldo inicial contra el saldo final del mes anterior y del año anterior, correlativos y fechas), propone la categoría de cada movimiento según el documento y la glosa, reconoce el pago del F29 en líneas, bloquea el libro de otro RUT y no repite lo ya importado.
- **1.17.0**: remuneraciones con reglas del programa de remuneraciones del dueño. Trabajadores pensionados (sin AFP, SIS ni seguro de cesantía), mayores de 65 años (sin la parte del SIS), seguro de cesantía con 11 años o más de servicio (trabajador 0 %, empleador 0,8 %), horas extra al 100 % en las novedades del mes y avisos en la liquidación (ingreso mínimo proporcional a la jornada y descuentos voluntarios sobre el 45 %). Verificado contra el otro programa con casos de septiembre de 2026: coinciden al peso.
- **1.18.0**: finiquito con las reglas del programa de remuneraciones. Causales nuevas (desahucio art. 161 inc. 2, caso fortuito art. 159 N° 6, liquidación concursal art. 163 bis), recargo del art. 168 (30, 50, 80 o 100 %) sobre la indemnización, imputación del aporte del empleador al seguro de cesantía en la causal de necesidades de la empresa, feriado proporcional con conversión exacta de días hábiles a corridos (sábado inhábil, feriados 2025–2027, contados desde el día siguiente al término) sobre una base sin colación ni movilización, tope de 11 años solo para contratos desde el 14-08-1981 y antigüedad calculada por meses exactos. Los finiquitos ya guardados no se modifican.
- **1.19.0**: archivos de Previred y LRE como borrador. En «Libro y Previred» hay dos botones nuevos: el archivo de Previred de largo variable con 105 campos (TXT) y el CSV del Libro de Remuneraciones Electrónico de la Dirección del Trabajo, con la misma estructura del programa de remuneraciones del dueño. Una revisión previa lista lo que falta (sexo del trabajador, región y comuna, mutual, isapre no reconocida, RUT inválido). Se agregaron el sexo en la ficha del trabajador y la CCAF, región y comuna en los datos de la mutual. Verificado contra el otro programa: los archivos coinciden campo a campo, salvo el prorrateo de topes por días (diferencia pendiente). No están validados con los portales: súbelos primero a la validación de Previred y de Mi DT.
- **1.20.0**: vacaciones con feriados. El feriado devengado se calcula como en el programa de remuneraciones: 15 días hábiles por año completo, el feriado progresivo de cada año (un día por cada 3 años sobre 10, con hasta 10 años previos) y la fracción del año en curso. Los períodos registrados muestran el último día de vacaciones y la fecha de reintegro, saltando sábados, domingos y feriados. El valor estimado usa los días corridos exactos y excluye colación y movilización. Nuevo calendario de feriados editable (viene 2025–2027): agrega los de otros años o los decretados, y se usa también en el finiquito. Los días tomados ya registrados no cambian; el saldo puede variar levemente porque ahora el progresivo se aplica año por año.
- **1.21.0**: diferencias con el programa de remuneraciones resueltas. (6) Con menos de 30 días trabajados en el mes, los topes imponibles de AFP/salud y de cesantía se prorratean por los días (por ejemplo, ingreso a mitad de mes), lo que cambia las cotizaciones de sueldos altos en esos meses; el archivo de Previred y el LRE ya coinciden con el otro programa sin diferencias. (4) Se mantiene que la cotización adicional de trabajo pesado rebaja la base del impuesto único, por ser una cotización previsional obligatoria del trabajador. (5) Se mantiene que el tramo de la asignación familiar usa la remuneración imponible más los haberes no imponibles.
- **1.22.0**: F29 de empresas con contabilidad simplificada. La tasa de PPM ya no depende de «Cuentas tributarias» (que esas empresas no tienen): se ingresa en el propio borrador del F29, por mes (con botón para guardarla como tasa habitual de la empresa), y también en «Datos de la empresa». Sin RCV, la base del PPM (código 563) se toma de los ingresos del libro de caja del mes, netos de IVA; con la tasa de 1 % reproduce el PPM que pagó Alimentos Andrea. Los avisos del revisor y del F29 apuntan ahora a esos lugares.
- **1.23.0**: meses con poco o nada de movimiento (cualquier tipo de contabilidad). En el RCV, un panel «Situación del mes»: marcar «Sin ventas» o «Sin compras» (el F29 deja de avisar que faltan documentos) y elegir por mes si el IVA de las compras es crédito fiscal o gasto. Con «gasto», la centralización suma el IVA al costo y no usa la cuenta de crédito fiscal, el F29 lo muestra como compra sin derecho a crédito y los movimientos nuevos del libro de caja lo incluyen en la base. El borrador del F29 muestra solo las líneas con valor cuando el mes no tiene operaciones con IVA (botón para ver todas), y trae un campo «Base PPM» para corregir los ingresos del mes; sin RCV la base sale de las cuentas de ventas de la contabilidad completa o del libro de caja. Las boletas exentas del mes se ingresan a mano en el formulario de resumen (tipo 41). Se corrigió además que el borrador guardado recalculaba con la tasa de la empresa en vez de la guardada.
- **1.24.0**: libro de caja más ágil. Abre en el mes en curso (con flechas ◀ ▶ y el selector para consultar otro mes o todo el año). «Nuevo movimiento», «Pago de F29» y «Saldo inicial» se despliegan con botones y se cierran al guardar. Cada línea se edita en su lugar (fecha, glosa, tipo, monto, base, categoría y datos del documento) y al pie de la tabla hay una línea de captura rápida (fecha, glosa, tipo, monto y base; Enter agrega). El PDF, Excel y CSV del libro salen por rango de meses (mes inicial y final), con su total del período y cierre de cada mes. Editar el monto de una línea importada quita su desglose de neto e IVA; la línea conserva su referencia, así que no se duplica al volver a importar.
- **1.25.0**: al consultar un mes del libro de caja, el panel pregunta si los saldos de las tarjetas son solo del mes (con el saldo de cierre del mes anterior como saldo inicial) o acumulados de enero al mes consultado (con el saldo inicial del año). La tabla siempre muestra solo el mes; el saldo final es el mismo en ambos casos.
- **1.26.0**: libro de caja igual al modelo del contador. En pantalla cada mes se ve como una hoja: línea 1 con el saldo inicial (folio de la hoja anterior, «Libro de Caja» del mes previo, resultado acumulado como base), todas las columnas de detalle (N° correlativo, tipo de operación, N° de documento, tipo, RUT emisor, fecha, glosa, monto con los egresos en negativo y monto que afecta la base) y la tabla «Saldos y totales» al pie; las líneas se editan y se agregan con todas sus columnas. El PDF del libro sale idéntico: hoja apaisada por mes con folio, encabezado del contribuyente, saldos y totales y firmas del representante legal y del contador. El resultado neto sale positivo cuando los ingresos superan a los egresos, como en el modelo. Los folios impresos se recuerdan por mes y se sugiere el siguiente. Al generar el PDF el sistema pregunta si se agregan al final, sin folio, el control de resultados, el flujo de caja y los PPM pagados (también se imprimen por separado). Los PPM pagados quedan con la corrección monetaria pendiente. Se corrige además la lectura del período del F29 cuando la glosa no trae el año, el pie «Contabilidad simplificada» de los PDF y el tamaño de letra de los informes de 12 columnas.
- **1.27.0**: el control de resultados tributarios se ve y se imprime como la planilla del contador: «Resultados para el Formulario 22 de la empresa» a la izquierda y «Capital propio tributario simplificado» a la derecha, con los datos de la DJ 1947 (régimen transparente) y un recuadro de observaciones en el PDF. Todo el informe cabe en una hoja apaisada, y en pantalla la tabla mensual es más compacta. El PPM pagado acumulado para la DJ 1947 cuenta los F29 del año comercial (período enero a diciembre), no por fecha de pago. El Excel y el CSV mantienen las filas en secuencia.
- **1.28.0**: el PPM del año comercial se determina por el período del F29 y no por la fecha de pago ni por el borrador del F29. Cuentan los F29 de enero a diciembre del año consultado, se paguen cuando se paguen (el de diciembre se paga en enero del año siguiente y entra al año consultado; el de diciembre del año anterior, pagado en enero, no cuenta). Cada pago de F29 del libro de caja lleva su período: las importaciones lo leen de la glosa (si no trae año, lo deduce del mes de pago) y al registrar o editar una línea con la categoría «Pago de impuestos» se indican el período y el concepto del F29 (IVA, PPM, retención, impuesto único). El control de PPM muestra cada período con su fecha de pago y marca los pagos desfasados; los pagos sin período se avisan en el informe y en el revisor y no se consideran. La DJ 1947 y el crédito por PPM de la renta anual de las empresas simplificadas usan este mismo cálculo. Se quitó del control el PPM del borrador del F29.
- **1.29.0**: contabilidad al día. Cada empresa tiene su fecha de inicio de actividades (en Datos de la empresa y al crearla) y se elige desde cuándo se pone la contabilidad al día: el año en curso (para la operación renta del año siguiente, lo normal) o el inicio de actividades (información histórica); nunca se avisa de meses anteriores al inicio de actividades. El sistema da un solo aviso en el revisor de datos con los meses cerrados sin contabilizar (sin movimientos en el libro de caja, o sin asientos en contabilidad completa) y una columna «Meses sin contabilizar» en el panel de clientes. Un mes sin movimientos se marca con un botón: en el libro de caja el saldo pasa al mes siguiente (el PDF muestra la hoja con el saldo inicial y sin filas), y en el libro diario aparece «Mes sin movimientos contables», también en el PDF. No hay marca para el mes en curso. La marca no impide agregar movimientos después: un mes con movimientos cuenta como contabilizado.
- **1.30.0**: apariencia más cómoda para la vista. Seis temas claros nuevos de bajo brillo (Menta suave, Cielo, Lavanda, Durazno, Niebla y Marfil tenue) con contraste de texto sobre 12:1 y tres estilos predeterminados que los combinan (Suave a la vista, Confort cálido y Cielo claro). Nueva sección «Confort visual» con brillo (70 a 100 %), tono cálido (0 a 50 %) y la opción de calentar más el color de 19:00 a 07:00; funciona como un velo sobre la pantalla y no cambia los datos ni los PDF o Excel. Nueva sección «Resaltar lo importante» (sin resaltar, suave o marcado): destaca totales, saldos, cifras negativas, avisos y las tarjetas clave (saldo de caja, base imponible, resultado de caja). Todo se guarda en este navegador.
- **1.38.0**: el RCV guarda el detalle del SII que antes se perdía. Los «otros impuestos» de cada compra quedan por código, tasa y valor (también las líneas de continuación de una factura con varios impuestos), más la fecha de recepción, el acuse y el tipo de compra. El IVA anticipado (códigos 17, 18 y 19) se trata como anticipo de IVA, que no afecta la base, y el resto como impuesto no recuperable; el resumen mensual del RCV los separa en líneas («Impuestos no recuperables de las compras» y «Anticipo de IVA por compras afectas»), como las lleva el contador, y el cuadre con el libro de caja los considera. El documento muestra ese detalle. Al volver a cargar el CSV, los documentos ya registrados se completan con su detalle sin cambiar sus montos.
- **1.37.0**: sugerencias al escribir una línea del libro de caja. El tipo de documento y la glosa se ofrecen como lista (se puede escribir otro texto) según sea ingreso (1) o egreso (2): primero lo que la empresa ya usó y luego plantillas habituales. La glosa propone el mes de la fecha y los tres meses anteriores («Facturas de compras de agosto 2026 afectas a IVA, pagadas en septiembre 2026»), para lo que se devenga antes y se cobra o paga en el mes; las glosas ya usadas se reutilizan con el mes cambiado (los pagos de F29 apuntan al mes anterior). Aplica a la línea nueva, a la edición de la línea y al formulario «+ Nuevo movimiento».
- **1.36.1**: sumatorias del libro de caja (pantalla y PDF): el saldo inicial del «monto que afecta la base» se suma a los ingresos de la base cuando es positivo y a los egresos de la base cuando es negativo, como en el libro del contador (diciembre 2025 de Alimentos Andrea: egresos de la base $336.596). El resultado neto no cambia.
- **1.36.0**: el importador de RCV desde Excel lee registros sin la columna «Tipo Doc» (se asumen facturas) y reconoce las compras por la columna «RUT Proveedor». En contabilidad simplificada, las líneas centralizadas del libro de caja (Registro de Compras o de Ventas SII, también las cargadas desde el Excel del contador) cuentan como resumen del mes: los documentos del RCV de ese mes no quedan «por pagar» ni se pueden importar de nuevo. Nuevo cuadre mes a mes entre el RCV y el libro de caja (monto total y monto que afecta la base) en «Importar», y aviso del revisor cuando no coinciden.
- **1.35.0**: el mes de constitución (inicio de actividades) con aporte o apertura ya no se avisa como «sin movimientos» y el libro de caja lo explica. Los avisos de mes sin contabilizar y los avisos y datos informativos del revisor tienen la opción «Omitir este aviso» (por empresa, con «Restaurar» en el revisor de datos; los errores no se pueden omitir). En el libro de caja la línea nueva no se muestra hasta pulsar «+ Agregar línea».
- **1.34.0**: edición completa de la primera línea (saldo inicial) del libro de caja: N° de documento, tipo de documento, RUT, fecha, glosa, monto y monto que afecta la base. Solo se guardan los campos que se cambian (el resto sigue automático, con la marca «editada»), el monto ajusta el saldo inicial de caja del año, y la base editada se arrastra a los meses siguientes y a los totales. «Restaurar automático» devuelve la línea a su cálculo. El PDF respeta el N° editado.
- **1.33.1**: el botón «Editar» del saldo inicial aparece en la primera línea de cualquier mes del libro de caja. Si el mes no es el primero del año, el sistema ajusta el saldo inicial de caja del año para que ese mes parta con el monto indicado (los meses anteriores se recalculan). Bloqueado si alguno de esos meses está cerrado.
- **1.33.0**: el saldo inicial de la primera línea del libro de caja se puede editar directamente en la tabla (botón «Editar» en esa fila). Solo aparece en el primer mes del libro del año (el de inicio de actividades o enero); los demás meses heredan el saldo del cierre anterior. Cambia el saldo inicial de caja del año y no se puede usar en meses cerrados.
- **1.32.1**: el IVA nunca forma parte de los ingresos del resumen: en simplificada se suma la base (neta) de lo percibido por ventas.
- **1.32.0**: resumen ejecutivo con los montos completos sobre las barras (rotados, sin abreviar). Los ingresos del resumen son las ventas netas en contabilidad completa (cuentas de ventas con y sin IVA configuradas en Cuentas tributarias) y, en simplificada, lo percibido por ventas en el libro de caja (categoría Ventas, sin IVA). El resultado mantiene su base contable.
- **1.31.1**: los valores sobre los gráficos del resumen ejecutivo quedan activados por defecto (el interruptor «Mostrar valores en los gráficos» permite apagarlos).
- **1.31.0**: resumen ejecutivo renovado. «Lo más importante hoy» (puntos de atención ordenados de lo más grave a lo menos) pasa al inicio, en pantalla y PDF; nuevos avisos sobre calidad de la información (gastos casi nulos frente a los ingresos, tasa de PPM en 0 %); el titular habla de «resultado» (utilidad o pérdida) en vez de «ganó/perdió»; negativos con formato `-$1.234` y en rojo; el encabezado del PDF ya no se superpone con el nombre largo de la empresa; el gráfico de 12 meses agrega la serie de resultado, resalta el mes presentado, marca en rojo los meses con pérdida y rotula con el año (Oct 26); el F29 indica el mes de vencimiento (día 12, o 20 por internet). Interruptor «Mostrar valores en los gráficos» (apagado por defecto) que muestra montos abreviados sobre las barras y los montos de los mayores gastos.
- **1.30.1**: los meses anteriores al inicio de actividades no existen para efectos contables. El libro de caja no los ofrece en el selector ni en el rango de exportación, el PDF no genera sus hojas, un año anterior al inicio muestra un aviso, y no se pueden registrar movimientos, pagos de F29, importaciones de libros ni asientos con fecha de esos meses. Los registros que ya existan antes del inicio no se cuentan en el libro ni en los informes, y el revisor los lista como información. El mes del inicio de actividades sí cuenta completo.
- **1.9.1**: el revisor de datos avisa de las facturas cuyo total del RCV no coincide con neto + IVA + otros impuestos (combustibles) y muestra las observaciones de la migración desde Excel.
- **1.9.0**: «Panel de clientes» (estado de todas tus empresas respecto del F29 del mes, documentos sin registrar, mes cerrado y remuneraciones; marca de F29 presentado), calendario tributario con próximos vencimientos y recordatorios propios (fechas referenciales), y «Revisor de datos» que detecta asientos descuadrados, saldos contrarios, folios repetidos, IVA distinto del 19 %, RUT inválidos, movimientos de caja inconsistentes y más, con aviso en el inicio y exportación a PDF, Excel y CSV.
- **1.8.2**: el campo «Ejercicio vigente» pasa a llamarse «Año contable con el que trabajarás» y explica para qué sirve.
- **1.8.1**: el Libro de caja, el de ingresos y egresos y el resumen ejecutivo se exportan también a Excel y CSV.
- **1.8.0**: contabilidad simplificada. Cada empresa tiene un «Tipo de contabilidad» (completa o simplificada) en Datos de la empresa. Las simplificadas no usan asientos ni balances: llevan un **Libro de caja** (tipo de operación 0/1/2, monto total y monto que afecta la base imponible, con resumen diario opcional) y un **Libro de ingresos y egresos** (percibido y devengado, pagado y adeudado), con importación desde el RCV, las remuneraciones y las boletas de honorarios. El F29, la renta anual (base de caja) y el resumen ejecutivo se calculan desde esos libros. Basado en la Resolución Ex. SII N° 14 de 2021 y su complemento N° 31; confirma el formato vigente en sii.cl antes de usarlo como libro oficial.
- **1.7.0**: «Resumen ejecutivo» (menú Informes) para entregar al dueño de la empresa: titular en lenguaje simple, cuatro indicadores con semáforo y comparación con el mes anterior, gráfico de 12 meses, situación de la empresa, mayores gastos, pagos del mes siguiente (F29, cotizaciones, remuneraciones), puntos de atención, recomendaciones y comentarios del contador; en pantalla (con modo presentación) y en PDF.
- **1.6.0**: pantalla «Apariencia» (Administración) con 9 estilos predeterminados y estilos propios guardables, 7 temas (claro, oscuro, papel, nórdico, medianoche, carbón y alto contraste), 9 colores de acento más uno personalizado, 6 fuentes de texto y 4 de números, escala de texto, esquinas, densidad, ancho del contenido, menú, bordes, sombras, filas alternadas y animaciones reducidas, con vista previa. Botón rápido de tema en el menú.
- **1.5.0**: botón «Apariencia» en el menú: tema (sistema, claro, oscuro, papel), color de acento, tamaño de texto, densidad de tablas y tipografía; se recuerda en cada navegador.
- **1.4.1**: la DJ 1887 incluye los finiquitos (remuneración del mes e indemnizaciones).
- **1.4.0**: remuneraciones ampliadas: Ley 21.735 (cotización adicional del empleador con calendario), asignación familiar, comisiones y semana corrida, haberes y descuentos fijos, APV, trabajo pesado, costo de la empresa, planilla Previred, vacaciones y finiquitos con PDF y asiento. Valores referenciales (trabajo pesado, composición 2027-2032, asignación familiar): confírmalos con la Superintendencia de Pensiones y Previred.
- **1.3.0**: renta con capital propio tributario, registros de rentas empresariales (RAI, DDAN, REX y SAC), renta líquida imponible con ajustes automáticos, base de caja Pro Pyme y pérdida reajustada; depreciación tributaria por bien en las fichas de activo fijo.
- **1.2.0**: respaldo y restauración de la empresa (Datos de la empresa y Empresas e importación), protección de activos con depreciación contabilizada, aviso en pantalla ante errores inesperados, corrección del botón «Editar» de activo fijo y pruebas automáticas.
- **1.1.0**: activo fijo, personal y remuneraciones, renta anual y declaraciones juradas; número de versión visible.
- **1.0.0**: libros, informes, RCV, F29, sueldo empresarial y honorarios, con historiales y exportación a PDF y Excel.

## Probarlo desde GitHub (Codespaces)

Sin instalar nada en el PC:

1. En la página del repositorio en GitHub, pulsa **Code → Codespaces → Create codespace on main**.
2. Espera unos minutos mientras se prepara. La primera vez instala Python y las librerías.
3. El programa arranca solo y se abre en una pestaña nueva. Si no se abre, ve a la pestaña **Puertos**
   (Ports) y pulsa el ícono del globo en el puerto **5000**.

El Codespace parte con una base de datos vacía; los datos reales nunca están en GitHub. La dirección es privada:
solo entras tú, con tu sesión de GitHub. No cambies el puerto a «Public», porque el programa no tiene usuario ni
contraseña. Cuando termines, detén el Codespace (en github.com/codespaces: **⋯ → Stop codespace**) para no
gastar las horas gratuitas del mes. Si lo eliminas, se borra lo que hayas registrado en él.

## Empresas

- Cambia de empresa con el selector en la parte superior del menú.
- En **Empresas** ves todas las empresas y puedes crear una nueva, que parte con el plan de cuentas base.
- En **Datos de la empresa** editas la empresa activa: razón social, RUT (se valida el dígito verificador),
  giro, régimen y ejercicio vigente. Desde ahí también se elimina, con confirmación y copia automática previa.

## Primeros pasos con una empresa nueva

1. Revisa el **plan de cuentas**. Cada cuenta tiene un tipo (activo, pasivo, patrimonio, ingreso o gasto),
   que define en qué informe aparece. Puedes agregar subcuentas, renombrar o desactivar cuentas.
2. Registra el **asiento de apertura** con los saldos iniciales (caja, banco, capital…).
3. Registra tus operaciones con **+ Nuevo asiento**.

## Funciones

| Módulo | Detalle |
|---|---|
| Asientos | Numeración correlativa por fecha que se reinicia cada año: un asiento ingresado hacia el pasado toma su lugar y los siguientes se corren; al eliminar no quedan saltos. Validación de cuadre, edición y búsqueda |
| Libro Diario | Por período, exportable a CSV |
| Libro Mayor | Por cuenta, con saldo inicial y saldo acumulado; exportable a CSV |
| Balance de 8 columnas | Sumas, saldos, inventario y resultados con sumas iguales; exportable a CSV |
| Estado de Resultados | Por período, agrupado según el plan de cuentas |
| Balance General | A una fecha, con activo, pasivo y patrimonio |
| Cierre de ejercicio | Traspasa el resultado del año a la cuenta de patrimonio que elijas |
| Respaldos | Descarga y restauración de toda la base (todas las empresas), con copia automática previa |

## Exportar informes

Cada informe tiene botones **PDF**, **Excel** y **CSV**. Los informes son Libro Diario, Libro Mayor, Balance de
8 columnas, Estado de Resultados, Balance General, cada comprobante (PDF y Excel) y el plan de cuentas.

- **PDF** (papel carta): en cada página van razón social, R.U.T., giro, dirección y ciudad, más **FOLIO** y
  «PÁGINA X DE Y». La tabla tiene grilla completa y montos con $. Al final van la declaración del
  **Artículo 100 del Código Tributario** y las firmas de **CONTADOR GENERAL** (con imagen de firma, nombre y RUT)
  y **REPRESENTANTE LEGAL**. El Balance de 8 columnas sale en hoja horizontal.
  - **Libro Diario**: separado por mes, con la glosa y el TOTAL ASIENTO de cada asiento, y el total general.
  - **Libro Mayor**: una cuenta o **todas las cuentas** («Libro Mayor completo»), con el saldo deudor o acreedor
    de cada una y el total general «(CONCORDADO)».
  - **Estado de Situación Financiera** y **Estado de Resultados**: cuentas con saldo y su código.
- **Excel**: el mismo formato. Los montos son números reales (se pueden sumar y usar en fórmulas).
  La hoja queda lista para imprimir en carta, ajustada al ancho y con números de página.
- **CSV**: datos planos separados por «;», para importarlos en otros sistemas.

**Folios**: al pulsar **PDF** en el Diario, el Mayor, los Balances o el Estado de Resultados, el programa pregunta
el **folio inicial**. Sugiere el siguiente al último utilizado por la empresa y se puede cambiar. Cada página usa
el folio siguiente y, al terminar, el programa informa qué folios se usaron. Cada empresa lleva su propia
numeración. Si se reimprimen páginas antiguas con un folio menor, la numeración no retrocede. En **Datos de la
empresa** se ve y se ajusta el último folio utilizado. Los comprobantes, el plan de cuentas, el Excel y el CSV
no usan folios.

**Contador y firma** (menú Administración): nombre, RUT e imagen de la firma escaneada (PNG o JPG). Se usan en
los informes de todas las empresas. El representante legal se toma de los datos de cada empresa.

El nombre del archivo incluye la empresa, el informe y el período, por ejemplo
`pz_studio_spa_balance_general_2026-12-31.pdf`.

**Montos**: en pesos chilenos enteros. Se aceptan `1.234.567` o `1234567`; no se usan decimales.
**Atajo**: en el formulario de comprobante, escribe `=` en Debe o Haber para completar la diferencia.

## Cómo funcionan los saldos

Hay dos formas de llevar la contabilidad entre un año y otro, y el programa acepta las dos:

- **Libro continuo**: no se reabren cuentas. Las cuentas de balance acumulan saldo desde el primer movimiento.
  Si un año no se cerró, su resultado aparece como «Resultados anteriores no cerrados».
- **Apertura anual**: cada año se registra un comprobante marcado como **asiento de apertura**
  (casilla en el formulario). Desde la fecha de ese asiento, los saldos se calculan solo con los
  movimientos posteriores, así que no se duplican. El Libro Mayor muestra el reinicio del saldo.

Una cuenta de patrimonio puede marcarse con **«en el Balance de 8 columnas, mostrarla en Resultados»**
(por ejemplo, Utilidades acumuladas). En ese balance aparece en Pérdidas o Ganancias, y una nota separa el
resultado del ejercicio del monto que aportan esas cuentas. En el Balance General sigue en el patrimonio.

Las cuentas de resultado siempre se informan por período. El asiento de cierre se excluye de los informes de su
propio año, así que el Estado de Resultados no queda en cero después de cerrar.

## Tributario: RCV, centralización y borrador F29

**Cuentas tributarias**: indica qué cuentas usa la centralización (compras: neto, activo fijo, IVA crédito,
otros impuestos y proveedores; ventas: neto, exentas, IVA débito y clientes) y el F29 (remanente, retención
de honorarios e impuesto único). Aquí también va la **tasa de PPM**. Las cuentas se sugieren por nombre.

**Compras y ventas (RCV)**:
1. Descarga del SII el **detalle** del Registro de Compras y Ventas del mes, de compras o de ventas, en CSV.
2. Elige el período e importa el archivo. El programa reconoce si es de compras o de ventas, acepta archivos en
   UTF-8 o Latin-1 y no duplica documentos ya cargados.
3. Revisa los documentos. Si un documento debe ir a otra cuenta (por ejemplo, la factura del contador a
   Servicios contables), elígela: el programa la **recuerda para ese RUT** en los meses siguientes.
   Para **corregir un documento** (folio, fecha, RUT, montos, cuenta…), pulsa **✎** o haz doble clic en su fila:
   se abre una ventana para editarlo o eliminarlo. Con **+ Agregar compra** o **+ Agregar venta** ingresas a mano
   documentos que no vinieron en el CSV. El total se calcula como la suma de los montos. Los documentos ya
   centralizados solo se pueden ver; para modificarlos, elimina primero el asiento de centralización.
4. **Centralizar compras** o **Centralizar ventas** abre la propuesta del asiento en el formulario de
   comprobante, sin guardar nada todavía. Al guardar, los documentos quedan marcados como centralizados. Si se
   elimina el asiento, vuelven a quedar pendientes.

**Boletas y comprobantes de pago electrónico**: el CSV de detalle del SII no los trae, porque el SII los informa
resumidos por mes. Importa el **CSV de resumen de ventas** (por ejemplo `RCV_RESUMEN_VENTA_76086428_202609.csv`).
El programa registra las boletas y los comprobantes de pago con la cantidad y los montos exactos del SII, y omite
las facturas y notas del resumen, que ya vienen en el detalle. También puedes ingresarlos a mano en *Ventas con
boleta y comprobantes de pago electrónico*, con la cantidad y el monto total de cada tipo.

**Nombre del archivo**: si el nombre trae el RUT y el período, como lo descarga el SII, el programa importa en ese
período. Si el RUT no corresponde a la empresa activa, no importa el archivo.

Los tipos de documento resumidos son boleta electrónica 39, boleta exenta 41, comprobante de pago electrónico 48 y
boletas de papel 35 y 38. Si los ingresas a mano, el neto y el IVA se calculan desde el total, o se ingresan tal cual. Si vuelves a ingresar un tipo en el mismo mes, se
reemplaza. El total de estos resúmenes se centraliza en su propia cuenta (*Cuentas tributarias → Ventas con boleta
y comprobantes de pago*), por ejemplo Caja o Banco.

**Exportar el RCV del mes** (botones PDF, Excel y CSV en la página del RCV): incluye el registro de compras y el
de ventas, documento por documento y con totales (las notas de crédito en negativo), y los **asientos contables
del mes**. Son los asientos de centralización registrados y, si quedan documentos pendientes, la propuesta de su
asiento, marcada como «no registrada». En el PDF, cada asiento se mantiene completo en una misma página. Los
resúmenes de boletas y comprobantes de pago llevan el **RUT de la empresa emisora**.

Reglas de la centralización: las notas de crédito restan; las compras con monto de activo fijo van a la cuenta de
activo fijo; el IVA no recuperable se suma al costo; los impuestos adicionales (por ejemplo, el específico de
combustibles) van a su cuenta. La glosa sigue el formato «CENTRALIZACIÓN COMPRAS MAYO 2026».

**Borrador F29**: calcula débitos y créditos desde el RCV del mes, con cantidades por tipo de documento. Suma el
remanente del mes anterior reajustado como lo hace el SII, y calcula el PPM con la tasa de la empresa. El
reajuste divide el remanente (código 77 del F29 anterior) por la UTM del mes en que se presentó ese F29, lo deja
en UTM con dos decimales, aproximando desde 5 (0,255 → 0,26; 0,2533 → 0,25), y lo multiplica por la UTM del mes en
que se presenta el nuevo F29. El resultado en pesos también se aproxima desde 5. Por ejemplo:
$18.165 ÷ 71.721 = 0,25 UTM × 72.151 = $18.038.
Muestra además, como información, las **compras sin derecho a crédito**: afectas con IVA no recuperable
(códigos 564 y 521) y exentas o no gravadas (584 y 562). En el PDF y el Excel, el **total a pagar** va destacado
y al final hay un recuadro con el total a pagar y el remanente para el período siguiente.
Las retenciones de honorarios y el impuesto único salen de los abonos del mes a sus cuentas. **Compara el IVA
del RCV con el contabilizado** y avisa las diferencias, los documentos sin centralizar o los datos faltantes. Al
**guardar el borrador**, su remanente (código 77) se propone como remanente anterior del mes siguiente. Se
exporta a PDF y Excel. Es un borrador referencial: verifica siempre con la propuesta del SII.

## Sueldo empresarial y honorarios

**Sueldo empresarial** (*Tributario → Sueldo empresarial*):
- Registra a los socios que se asignan sueldo, con su RUT y su sueldo bruto habitual.
- Cada mes, el programa calcula la liquidación de cada socio: base (bruto menos AFP y salud, si cotiza),
  **Impuesto Único de Segunda Categoría** según la tabla mensual y la **UTM del mes**, y líquido.
- **Contabilizar sueldos del mes** abre la propuesta del asiento (Sueldo empresarial / Impuesto único por pagar /
  Banco, o las cuentas que configures) para revisarla antes de guardar. La glosa es «SUELDO EMPRESARIAL ENERO 2026».

**Honorarios** (*Tributario → Honorarios*):
- Registra las boletas de honorarios recibidas (BHE) y las boletas de prestación de servicios de terceros emitidas
  (BTE).
- Puedes ingresar el monto **bruto o líquido**. La retención se calcula con la tasa del año de la boleta (15,25 % en
  2026; 16 % en 2027; 17 % desde 2028). También acepta boletas sin retención.
- **Contabilizar honorarios del mes** abre la propuesta del asiento (Honorarios / Retención 2ª categoría / Banco).

Las cuentas se configuran en *Cuentas tributarias → Sueldo empresarial y honorarios*. Las UTM oficiales de 2026
vienen cargadas; si falta un mes, se ingresa en la página de sueldos y también se usa en el borrador F29. El
**borrador F29** compara la retención de honorarios (código 151) y el impuesto único (código 48) con lo registrado en
estos módulos.

## Apertura de ejercicio automática

En **Administración → Apertura de ejercicio** eliges:
- el año a abrir;
- la fecha del asiento (por defecto el 02/01);
- la cuenta de patrimonio que recibe la utilidad y la que recibe la pérdida del año anterior, ambas sugeridas.

La página muestra el resumen del balance al 31/12 anterior. Con **Ver propuesta** se abre el formulario de
comprobante ya completo, con cada cuenta de balance y su saldo y el resultado traspasado a patrimonio.
**Todavía no se ha guardado nada**: puedes cambiar cuentas, montos y glosa, o agregar y quitar líneas. Al
pulsar **Guardar** se registra como asiento de apertura, con las validaciones habituales. Si ese año ya tiene
una apertura, el programa lo advierte. También funciona si el año anterior no tuvo movimientos: arrastra los
saldos del último año con datos.

## Cierre de meses

En **Administración → Cierre de meses** se ven los 12 meses de cada año, con su cantidad de comprobantes y su
estado. Puedes cerrar o reabrir cada mes, o cerrar de una vez todos los meses hasta uno elegido.

Al **crear, modificar o eliminar** un comprobante de un mes cerrado, el programa no guarda directamente.
Muestra «Febrero 2026 está cerrado…» y pide confirmar, con un motivo opcional. También pide confirmación al
mover un comprobante desde o hacia un mes cerrado, y al cerrar el ejercicio si diciembre está cerrado.
Cada cambio confirmado queda registrado en la misma página: fecha y hora, acción, comprobante, mes y motivo.
Los comprobantes de meses cerrados llevan la etiqueta «mes cerrado».

## Importar desde CreandoGestion

```
.venv\Scripts\python -m contabilidad.importar_creandogestion datos\archivo.db
.venv\Scripts\python -m contabilidad.importar_creandogestion datos\archivo.db ID_EMPRESA [ID_EMPRESA ...]
```

El primer comando lista las empresas del archivo y el segundo importa las que indiques. Se importan los datos
de la empresa, el plan de cuentas y los asientos. Los asientos cuya glosa empieza con «APERTURA» se marcan como
asientos de apertura. Antes de importar se guarda una copia en `datos/respaldos/`. Cada empresa se verifica
contra el origen (cantidad de asientos y saldo de cada cuenta); si algo no coincide, esa empresa no se importa.
No se importan remuneraciones, RCV, libro de caja ni boletas de honorarios.

## Respaldos

En el menú **Respaldos**:

- **Descargar respaldo**: guarda una copia completa (todas las empresas) en un archivo `.db`. Hazlo con frecuencia.
- **Restaurar respaldo**: sube un `.db` de este programa, de cualquier versión. Primero se revisa que el archivo sea válido
  (integridad, tablas y comprobantes cuadrados). Después ves el contenido actual y el del respaldo,
  uno al lado del otro, y confirmas.
- **Copias automáticas**: antes de restaurar, importar o eliminar una empresa, los datos actuales se guardan en
  `datos/respaldos/`. Desde la misma página puedes descargarlas o restaurarlas para deshacer.

## Pruebas del artefacto

En `tests/artefacto` hay pruebas automáticas que abren `artefacto/contabilidad.html` en un navegador sin interfaz y revisan cálculos, flujos de contabilización, respaldo y restauración, todas las pantallas (escritorio y móvil) y la exportación a PDF y Excel:

```
cd tests/artefacto
npm install
npm test        # pruebas
npm run lint    # busca funciones o variables que no existen
```

Córrelas antes de publicar cada versión del artefacto.

## Para desarrolladores

```
contabilidad/
  nucleo.py                   lógica contable (sin dependencias web)
  plan_cuentas_chile.py       plan de cuentas inicial
  db.py                       esquema SQLite, migraciones y respaldos
  importar_creandogestion.py  importador
  exportacion.py              exportación a PDF (reportlab), Excel (openpyxl) y CSV
  __init__.py                 rutas Flask
  templates/, static/         interfaz
tests/                        pruebas
```

Para ejecutar las pruebas:

```
.venv\Scripts\python -m unittest discover tests
```

Para usar otra base de datos, define la variable de entorno `CONTABILIDAD_DB` con la ruta del archivo.
