---
name: cargar-contabilidad-desde-archivos
description: Carga un libro diario (PDF o Excel/Google Drive) como asientos reales en una empresa de contabilidad completa del artefacto y verifica que quede idéntico al origen. Usar cuando el usuario sube o enlaza libros diarios para cargar.
---

# Cargar libro diario desde archivos

Aplica solo a empresas de contabilidad completa del artefacto (`artefacto/contabilidad.html`). Los datos viven en la base del artefacto (`ArtifactData`), nunca en el repositorio.

## Antes de escribir
1. Confirma la empresa (`empresas/{eid}`) y el año comercial. Lee el documento de la empresa para obtener su `version` y el plan de cuentas.
2. No cambies datos reales de otras empresas. Solo escribe en la empresa y los años que el usuario pidió.
3. Lee TODA la hoja o PDF. En Excel usa la pestaña LIBRO DIARIO (openpyxl, `data_only=True`). Si hay dos archivos con el mismo nombre, confirma cuál es (el enlace del usuario manda).

## Lectura
- Excel: filas con fecha, comprobante, cuenta, glosa, débito, crédito. Ignora las filas "TOTAL COMPROBANTE".
- PDF: pdfplumber/pdftotext; separa columnas por posición x; no tomes años ("2025", "2026") dentro de las glosas como montos; el lado debe/haber puede deducirse por la sangría del nombre de cuenta.
- Agrupa por número de comprobante. Verifica que cada comprobante tenga una sola fecha y cuadre (debe = haber). Una fecha incoherente (ej. enero en un comprobante de diciembre) se corrige a la de los demás del grupo y se informa al usuario.

## Cuentas
- Mapea por nombre normalizado (sin tildes ni puntos, mayúsculas).
- Si una cuenta no existe, NO la crees sin preguntar. Propón código y tipo, o ofrece mapearla a una existente. Cuando el usuario elija, informa exactamente qué mapeaste (ej. PROVEEDORES → 2.1.20 OTROS PROVEEDORES).
- Formato de cuenta: `{activa:true, codigo, id:"cNNN", imputable:true, nombre, resultados_en_ocho:false, tipo:"ACTIVO|PASIVO|PATRIMONIO|GASTO|INGRESO"}`. El id nuevo es el siguiente libre. Sustituye el arreglo `cuentas` completo con `update` y `if_version`.

## Montos
Redondea a enteros cada línea y vuelve a comprobar que cada comprobante cuadre. Informa cuántas líneas se redondearon.

## Formato del asiento
Documento en `empresas/{eid}/asientos`, id `aAAAA_NNN`:
`{apertura:bool, cierre:bool, creado:<n° de comprobante>, fecha:"AAAA-MM-DD", glosa, lineas:[{cuenta:"cNNN", debe, haber, glosa:""}]}`
- `creado` = número original del comprobante; así el sistema conserva el orden y asigna el correlativo por año.
- `apertura:true` solo en el asiento de apertura. `cierre:false` salvo asientos de cierre (el cierre no es necesario para que cuadre; pregunta antes de cargarlo).

## Escritura
- Genera un JSON por asiento y escribe con `ArtifactData` `batch` (máx. 50 por llamada, `set` con `file_path`). Para sobrescribir un documento existente usa `if_version`.
- Vuelve a leer un documento antes de modificarlo; no sobrescribas con copias antiguas.

## Verificación (obligatoria)
1. Lee de vuelta los asientos guardados y compara con el origen: mismas líneas, cuenta por cuenta y comprobante por comprobante (las diferencias de nombre por mapeos son las únicas aceptables).
2. Cierre del año anterior contra apertura del siguiente: saldos de balance iguales, resultado en pérdidas/utilidades acumuladas.
3. Resultado del ejercicio contra el balance del Excel si lo trae.
4. Informa al usuario en español: cuentas creadas o mapeadas, líneas redondeadas, fechas corregidas, observaciones (por ejemplo tasas de PPM que cambian) y años faltantes.
