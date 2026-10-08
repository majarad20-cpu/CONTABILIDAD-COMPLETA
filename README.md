# Contabilidad (Chile)

Programa de contabilidad general para empresas chilenas. Puede llevar varias empresas a la vez.
Funciona en tu PC y se usa desde el navegador. Los datos quedan en un archivo local (`datos/contabilidad.db`).

## Cómo iniciarlo

Haz doble clic en **`iniciar.bat`**. La primera vez instala lo necesario (requiere Python 3.10 o superior).
Después se abre el navegador en http://127.0.0.1:5000. Para detener el programa, cierra la ventana negra.

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
3. Registra tus operaciones con comprobantes de **Ingreso**, **Egreso** o **Traspaso**.

## Funciones

| Módulo | Detalle |
|---|---|
| Comprobantes | Numeración correlativa por tipo y año (I-1, E-1, T-1…), validación de cuadre, edición y búsqueda |
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

Reglas de la centralización: las notas de crédito restan; las compras con monto de activo fijo van a la cuenta de
activo fijo; el IVA no recuperable se suma al costo; los impuestos adicionales (por ejemplo, el específico de
combustibles) van a su cuenta. La glosa sigue el formato «CENTRALIZACIÓN COMPRAS MAYO 2026».

**Borrador F29**: calcula débitos y créditos desde el RCV del mes, con cantidades por tipo de documento. Suma el
remanente del mes anterior reajustado por la variación de la UTM, y calcula el PPM con la tasa de la empresa.
Las retenciones de honorarios y el impuesto único salen de los abonos del mes a sus cuentas. **Compara el IVA
del RCV con el contabilizado** y avisa las diferencias, los documentos sin centralizar o los datos faltantes. Al
**guardar el borrador**, su remanente (código 77) se propone como remanente anterior del mes siguiente. Se
exporta a PDF y Excel. Es un borrador referencial: verifica siempre con la propuesta del SII.

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
