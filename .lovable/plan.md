# Reducir el consumo de créditos de IA

## Punto de partida (últimos 31 días, según el registro de llamadas)
- Total: ~2.130 llamadas, ~61 créditos.
- Lectura de documentos (Gemini Flash): 1.470 llamadas, ~29 créditos.
- Datos del texto de cada correo (GPT-6 Astra, el modelo más caro): 454 llamadas, ~17 créditos. Es solo copiar BL, ETA, producto y cliente.
- Asistente, Novedades diarias y Base normativa (GPT-6 Astra): ~74 llamadas, ~15 créditos (13 de ellos el 8 de noviembre, en pruebas).
- Índice de la Base normativa: 69 llamadas, costo casi nulo.

## 1. Medición: pantalla «Consumo de IA» (Administración)
- Cada llamada a IA pasa por un único punto común que guarda: función, modelo, tokens de entrada y salida, costo estimado en créditos, usuario, fecha y si se reutilizó un resultado guardado (sin costo).
- Pantalla solo para administradores: totales por función y por día (gráfico y tabla), filtro de fechas, costo del mes y comparación con el mes anterior.
- El costo se estima con la tarifa por token de cada modelo; puede diferir algo del cobro real de Lovable.

## 2. Texto antes que imagen
- Si el PDF trae texto digital, se extrae en el servidor sin IA y se envía solo el texto al modelo (mucho más barato).
- La lectura visual queda para PDF escaneados, imágenes o PDF con muy poco texto.
- Seguridad: si con texto faltan los datos clave del documento (BL, factura, totales), se repite la lectura visual automáticamente.
- Se aplica a: Nuevo Expediente por documentos y escáneres, facturas e-CF, permisos VUCE y recepción de correos.

## 3. Resultados reutilizados por huella del archivo
- Se guarda el resultado de cada lectura con la huella del archivo y el tipo de lectura.
- Un mismo PDF vuelve a usar ese resultado en lugar de llamar a la IA, en cualquier pantalla.
- En la recepción de correos, los reintentos del mismo mensaje reutilizan las lecturas ya hechas.
- Si se cambian las instrucciones de lectura de un tipo de documento, sus resultados guardados dejan de usarse.

## 4. Modelo económico para lo simple
- Primero, reglas sin IA: nombre del archivo y palabras clave del texto (p. ej. «BILL OF LADING», «PACKING LIST», «COMMERCIAL INVOICE», «PIN», comprobantes bancarios a la DGA).
- Si las reglas no bastan: clasificar el tipo de documento con un modelo económico.
- Los datos del texto del correo y la clasificación diaria de Novedades pasan también a un modelo económico.
- Se mantiene el modelo actual solo para extraer datos de documentos complejos (facturas con líneas, BL, liquidaciones, VUCE).
- Se evita leer dos veces la misma factura del correo (hoy se clasifica y luego se vuelve a leer completa).

## 5. Asistente ADECOMEX
- Cada pregunta frecuente tendrá una respuesta fija que el administrador escribe; al pulsarla se muestra ese texto sin IA. Si una pregunta aún no tiene respuesta escrita, sigue usando la IA.
- Preguntas libres: respuesta más corta (tope de longitud) y solo los últimos 6 mensajes de la conversación.
- El Asistente conserva su modelo actual.

## 6. Topes y avisos
- Límite diario configurable por función (en créditos estimados), editable en «Consumo de IA».
- Al alcanzarlo, esa función se pausa hasta el día siguiente con un aviso claro. Los correos no se pierden: quedan para reintento.
- La plataforma no puede consultar el saldo de créditos de Lovable. Por eso se añade un «presupuesto mensual de IA» configurable. El Panel de Operaciones avisa cuando queda menos del 20 % de ese presupuesto.
- Aviso inmediato en el Panel si Lovable responde «créditos agotados».

## Orden de trabajo
1. Medición (punto 1), para comparar antes y después.
2. Puntos 3 y 4 (mayor ahorro con menor riesgo).
3. Punto 2, probado con PDF reales de cada tipo antes de activarlo.
4. Puntos 5 y 6.

## Detalles técnicos
- Tablas nuevas: `ia_consumo` (registro), `ia_cache` (sha256 + tipo de lectura + versión del prompt → resultado), `ia_limites` (función, límite diario, presupuesto mensual). Lectura solo admin vía `has_role`; escritura solo desde el servidor.
- `callGateway` centraliza `funcion`, lee `usage` de la respuesta, aplica caché y topes; las llamadas directas (correo, novedades, asistente, embeddings) se migran al mismo registro.
- Texto: `unpdf` (ya instalado) con umbral de caracteres por página; validación de campos clave antes de aceptar el resultado del texto.
- Modelo económico: `google/gemini-2.5-flash-lite` (acepta PDF para páginas escaneadas), verificado contra la lista de modelos al implementar.
- `asistente_preguntas_frecuentes` recibe una columna `respuesta` opcional; historial limitado y `maxOutputTokens` en el servidor del Asistente.
- Alerta de presupuesto como bloque del Panel, reutilizando el evaluador de alertas existente.
