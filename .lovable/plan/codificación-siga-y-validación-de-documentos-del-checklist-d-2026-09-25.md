# Codificación SIGA y validación de documentos del Checklist de Recepción

## Qué verá el usuario
1. **Código SIGA automático**: al subir un documento en el Checklist, se le asigna su código (FAC-001, DOE-001, CEO-001, PER-001, OTD-001…), consecutivo por Expediente y por prefijo. El código se muestra junto a cada documento del Checklist y en la tabla de Documentos.
   - Factura comercial → FAC · Bill of Lading / Guía aérea → DOE · Lista de empaque → OTD · Certificado de origen → CEO · Certificado sanitario / fitosanitario / de análisis y Permiso VUCE → PER · DUA, Liquidación y cualquier otro → OTD.
   - Reemplazar el archivo conserva el código; eliminar un documento no renumera a los demás (evita confusiones con lo ya subido a SIGA).
2. **Advertencia por contenido (no bloquea)**: al elegir el archivo, se lee el PDF y se buscan las palabras clave del tipo (FACTURA COMERCIAL / INVOICE; BILL OF LADING / CONOCIMIENTO DE EMBARQUE / AIRWAY BILL / CARTA DE PORTE; CERTIFICATE OF ORIGIN / CERTIFICADO DE ORIGEN; sanitario, fitosanitario, análisis, VUCE, etc.). Si no hay coincidencia: "Este documento no parece corresponder a [tipo]. ¿Deseas continuar de todas formas?" con Continuar / Cancelar. Si la lectura falla, se permite subir sin aviso.
3. **Archivo duplicado**: si el mismo archivo exacto ya está cargado en otra casilla del mismo Expediente, se detiene la carga: "Este archivo ya fue cargado como [tipo existente]. ¿Seguro que también corresponde a [tipo actual]?". Solo se sube si el usuario marca que es intencional y confirma.

## Detalles técnicos
- Migración: `documentos.codigo_siga text` y `documentos.file_hash text` (+ índice por expediente_id, file_hash). Backfill de códigos para documentos existentes, por fecha de creación.
- `src/lib/codigo-siga.ts`: mapeo tipo → prefijo, palabras clave por prefijo/tipo, cálculo del siguiente consecutivo.
- Hash SHA-256 en el navegador (crypto.subtle) antes de subir.
- Lectura del texto: primero el texto embebido del PDF (pdfjs); si viene vacío (escaneo), se usa el lector IA existente (Lovable AI) para extraer texto de la primera página. Búsqueda sin acentos ni mayúsculas.
- Flujo en el diálogo de carga de expedientes.$id.tsx: hash → chequeo duplicado → chequeo OCR → subida con código asignado. El módulo de Permisos asigna PER-nnn al subir su PDF.
- Prueba end-to-end en 202609I325: subida correcta con código, BL en casilla de Factura (advertencia), mismo archivo en dos casillas (bloqueo).
