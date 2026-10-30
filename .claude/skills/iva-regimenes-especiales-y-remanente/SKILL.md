---
name: iva-regimenes-especiales-y-remanente
description: Criterios de IVA que aparecen al cargar RCV y F29: códigos de IVA no recuperable, regímenes especiales como el gas licuado (cambio de sujeto y código 14), remanente de crédito fiscal, su reajuste y las rectificatorias. Usar cuando el RCV trae IVA no recuperable, otros impuestos, remanentes o hay dudas sobre el crédito fiscal.
---

# IVA: regímenes especiales y remanente

Esto es orientación técnica. Los criterios dudosos se anotan como «a confirmar con el contador», no como regla.

## Clasificación de compras en el RCV
- «Del Giro» tiene IVA recuperable (códigos 520 y 537 del F29). «IVA no recuperable» lleva un código: 1 compras para operaciones exentas o no gravadas, 2 facturas registradas fuera de plazo, 3 gastos no necesarios para producir la renta, 4 entregas gratuitas, 9 otros. El F29 lo informa como 514 y 521, sin crédito.
- Artículo 23 DL 825: no hay crédito por compras afectas a operaciones exentas; con operaciones mixtas, el crédito es proporcional.
- El IVA no recuperable es gasto (o costo) del libro. El IVA recuperable no.
- Códigos de otros impuestos (columna aparte): 14 IVA de margen de comercialización (gas licuado); 17, 18 y 19 son IVA anticipado de faenamiento, carne y harina (anticipo, no gasto, va contra el IVA determinado). Cada empresa fija el tratamiento de cada código al aceptar el mes (`codigos_otros`).

## Gas licuado (Resolución Ex. SII N° 1087 de 1978)
El IVA del margen de comercialización de subdistribuidores y agentes es un impuesto de retención de la distribuidora; esos agentes quedan exentos de emitir boletas al consumidor final y sus ventas salen como exentas (comprobantes de pago). Indicios: ventas casi todas exentas, sin boleta electrónica en «documentos autorizados», compras a la distribuidora con código 14.

**Criterio del usuario (contador): en estas empresas las compras de gas a la distribuidora son «IVA no recuperable».** Las facturas de la distribuidora se clasifican así en todos los meses, incluso cuando el RCV las trae «Del Giro»: no se usa su crédito fiscal, y el IVA va al costo de la compra. Si un mes aparece con crédito de esas facturas y remanente, es un error de clasificación: hay que reclasificar el RCV, recalcular el F29 y rectificar (el IVA pagará de más o de menos según el caso). Otras compras de la empresa (comisiones, servicios) se evalúan una a una.
Salir del régimen (Formulario 2117, resolución del SII) cambiaría el criterio: solo si el usuario lo indica y existe la resolución.

## Remanente de crédito fiscal
- El remanente del período anterior (504) se reajusta: se expresa en UTM con 2 decimales y se vuelve a pesos con la UTM del mes de presentación del F29 actual. Si dos F29 se presentan en el mismo mes, casi no hay reajuste (solo el redondeo de la UTM).
- Si un F29 no incluye el remanente del anterior (código 504), el remanente deja de arrastrarse a los meses siguientes y el IVA se paga de más. La salida es una rectificatoria (el reajuste correcto depende del mes en que se presente).
- En el libro, el remanente es el saldo de la cuenta IVA crédito fiscal. No reajustes el saldo contable salvo instrucción.
- Pago en exceso: no lo contabilices como recuperado hasta que el SII lo resuelva; una cuenta «Impuestos por recuperar» exige preguntar antes de crearla.

## Ventas exentas y base de PPM
Base 563 = round(538 / 0,19) + 142 (ventas exentas). Un F29 con ventas exentas altas y compras con crédito alto puede generar remanentes cuestionables: informarlo.
