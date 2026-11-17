# Recibo de pago DGA contra la Liquidación — análisis (sin construir)

## Lo que encontré en 202610I377 (ATIVA MATERIA PRIMAS, RNC 130594181)
- **No está el recibo.** En Documentos hay Liquidación, PIN de Pago de Impuestos, DUA, Solicitud de Despacho y los PDF de VUCE, pero no hay «Recibo Pago de Impuestos». Tampoco llegó adjunto en este mensaje.
- Ya guardados en la ficha: Liquidación **10150-CL11-2611-001C6A**, PIN **20261114F901382E** (vence 18/11/2026 18:57), total oficial **RD$599,495.89**. Fecha de pago: vacía.

### Lo que el recibo debería traer (sacado de la Liquidación, con reglas fijas)
| Concepto | Liquidación (balance a pagar) |
|---|---|
| Tasa por Servicio Aduanero | 8,943.80 |
| Impuestos Arancelarios (gravamen) | 0.00 |
| ITBIS | 590,293.83 |
| Selectivo | 0.00 |
| Declaración Única Aduanera (DUA) | 258.26 |
| Recargo Art. 374 (declaración tardía) | 0.00 |
| **Total** | **599,495.89** (igual al monto del PIN ✔) |

## Prueba de lectura con reglas fijas (sin IA, sin guardar)
Probé un lector sobre los recibos reales que ya están en el sistema:

| Expediente | Recibo | Total | Por concepto vs. Liquidación |
|---|---|---|---|
| 202608I312 | 20260925-2152 · 25/09 14:32 | 17,804.86 | ✔ todo |
| 202610I366 | 20261112-2470 · 13/11 09:24 | 313,470.94 | ✔ todo (ITBIS 307,841.89) |
| 202610I391 | 20261112-1692 · 13/11 09:32 | 36,064.34 | ✔ todo |
| 202610I398 | 20261106-3395 · 07/11 11:05 | 18,214.30 | ✔ todo (recibo dentro de un paquete de 6 páginas) |

Lee también: Documento No. (RNC), forma de pago, PIN, banco, N.º de transacción, «Balance» y «Facturas pagadas».

**Variantes reales que el lector debe soportar**
- Monto con un solo decimal («$ : 18,214.3»).
- Fila de pago en una línea o repartida en tres; banco en dos líneas.
- El N.º de recibo lleva una fecha (20261112-…) distinta de la fecha del pago (13/11): la fecha de pago sale de «Fecha / Hora», nunca del número.
- Liquidación con «Liquidación 10030-CL11-…» sin dos puntos: hoy 8 de 59 Expedientes con Liquidación tienen el número vacío; el lector debe corregirse para eso.

**Documentos mal clasificados en la casilla «Recibo»**
- 202610I390: es el comprobante del Banco Popular (Referencia = PIN, comisión RD$75), no el recibo DGA.
- 202610I398: es el paquete de factura al cliente con el recibo dentro.
Propuesta: si no hay «COMPROBANTE DE PAGO» + «Recibo No.», mostrar «No es un recibo DGA» y no comparar.

## Reglas propuestas
1. **Emparejar** por número CL11 de «Facturas pagadas» + RNC. Si paga varias, sumar los balances de esas liquidaciones; si alguna no está en el sistema → ✖ no se pudo emparejar.
2. **Comparar contra el balance a pagar** (monto menos «Pagado»), no contra el bruto: si la Liquidación ya trae algo pagado, el recibo solo cubre el resto.
3. Tabla en el documento: ✔ / ⚠ difiere (RD$) / ⚠ pago parcial (Balance > 0 o total menor) / ✖ sin emparejar. Nunca bloquear ni cambiar montos; línea en Auditoría; «Aceptar diferencia» con motivo.
4. **Autocompletar solo vacíos** con etiqueta Automático: N.º de recibo, fecha y hora de pago, PIN, banco y N.º de transacción (hacen falta columnas nuevas para recibo, banco y transacción).
5. **Aviso del PIN:** hoy desaparece cuando hay *fecha de pago*, no cuando hay PIN. En 202610I377 el PIN ya está y el aviso sigue porque falta la fecha; el recibo lo quitará al completar la fecha.
6. **Pago después del vencimiento del PIN**: comparar fecha y hora del recibo con el término del PIN. Hoy hay 1 caso así (202609I350: pagado 12/10, PIN vencía 11/10), sin recibo cargado.
7. **PIN del recibo distinto del PIN guardado** (nuevo PIN tras vencer): aviso, sin sobrescribir.
8. **Requisitos de cierre**: «Recibo DGA validado» como advertencia ámbar, nunca obligatorio.
9. **Checklist**: no hay ningún hito activo de «Impuestos pagados»; la fecha de pago hoy no puede completar ninguno.

## Cruce con el banco (opcional)
- Los débitos de la DGA en tu cuenta se ven así: «EXI PAG DGA 163F2A2 72353573» + «EXI COM DGA …» RD$75 el mismo día. Traen un código y el **N.º de transacción**, que también trae el recibo: es un cruce más seguro que monto + fecha.
- Hoy ningún recibo cargado tiene débito en tu cuenta (los paga el cliente), y los movimientos importados llegan hasta el 11/11, así que 202610I377 aún no podría cruzarse.
- Propuesta: solo informativo («Débito encontrado / no encontrado en tu cuenta»), sin conciliar nada.

## Datos actuales
59 Expedientes con Liquidación · 39 con recibo cargado · 13 sin fecha de pago · 10 sin PIN.
