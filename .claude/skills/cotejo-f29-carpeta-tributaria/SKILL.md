---
name: cotejo-f29-carpeta-tributaria
description: Lee la carpeta tributaria del SII y certificados de la TGR, y compara los F29 declarados con lo que calcula el programa; deja guardados los borradores. Usar cuando el usuario sube una carpeta tributaria, certificados de pago o pide generar o cotejar borradores de F29.
---

# Cotejo de F29 con la carpeta tributaria

## Lectura de la carpeta
- Convierte con `pdftotext -layout`. Cada declaración empieza en «DECLARACIÓN MENSUAL Y PAGO» (folio [07], período [15]). Los códigos están en pares columna izquierda y derecha.
- Tasa de PPM con decimales (0.125): cuidado al parsear.
- Totales: 91 dentro de plazo, 92 IPC, 93 intereses y multas, 795 condonación, 94 total con recargo (si 94 está vacío, no hubo recargo en el formulario).
- Tipo de declaración: «Primitiva» (con banco y medio de pago = pagada), «Primitiva con Giro» sin banco ni medio = el pago no figura y hay que confirmarlo, «Modificatoria sin giro» corrige un folio anterior.
- Verifica la fecha de presentación contra el vencimiento. Un período sin declaración dice «No se registra declaración».
- Los datos de contribuyente (régimen, inicio, actividades, representante) sirven para revisar la ficha de la empresa, y el documento de la carpeta no es siempre del mismo nombre que el actual si hubo cambio de dueño.

## Certificados de la TGR
Suelen ser PDF escaneados sin texto: `pdftoppm -r 80 -png` y leer las imágenes. «Certificado de Pago»: monto pagado, fecha, folio y vencimiento. Recargo pagado = monto pagado − impuesto declarado. Un «Certificado de Movimiento» muestra el cargo (giro) original.

## Comparación con el programa
Con un arnés Playwright, carga empresa y RCV y ejecuta `calcularF29(periodo, remanente, utmAnterior, utmActual, tasa, null, anticipo)` encadenando el remanente (código 77) al mes siguiente. Compara 142, 502, 538, 520, 528, 514, 521, 563, 62, 91, 504 y 77.
Diferencias normales: 521 con $1 a $11 por redondeo; conteos 519, 527 y 564 cuando hay documentos de $1 o notas de crédito sin IVA. No son errores de monto.

## Borrador guardado (`empresas/{eid}/f29/AAAA-MM`)
`{declarado, fecha_declaracion:"AAAA-MM-DD", folio_sii, observacion, codigos, entradas:{remanente_anterior, utm_anterior, utm_actual, tasa_ppm, base_ppm, anticipo_anterior}, alertas, comparacion, guardado_en}`.
- Las tasas de PPM son las del F29 de cada mes, no las de la ficha, si difieren.
- Declarado: `true` con folio y fecha de la carpeta; un borrador de rectificatoria queda `declarado:false` con su observación.
- Si el programa y el F29 difieren en un código, la observación debe decirlo.

## Hallazgos que hay que informar
Remanente de un mes no usado en el siguiente, tasas de PPM cambiantes, declaraciones tardías y su recargo, declaraciones con giro sin pago confirmado, crédito fiscal que parece inconsistente con ventas exentas. No decidas por el usuario: presenta cifras y opciones.
