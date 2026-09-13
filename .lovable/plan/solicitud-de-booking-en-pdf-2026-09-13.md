# Solicitud de Booking en PDF

## Objetivo
Crear un documento A4 para solicitar espacio y cotización antes de confirmar una reserva, usando los datos ya capturados en la Operación Logística.

## Implementación
- Crear el generador `pdf-solicitud-booking.ts` con logo, referencia y fecha, destinatario, responsable, datos del embarque, partes involucradas, tabla de carga, bloque HAZMAT condicional, observaciones y pie de contacto.
- Mantener el intercambio de Shipper y Consignee según Importación o Exportación.
- Usar los contenedores estructurados para indicar el tipo requerido y omitir buque, voyage, booking y BL.
- Crear un botón con vista previa y descarga, siguiendo el comportamiento actual del BL Hijo.
- Colocar el botón junto al generador del BL Hijo únicamente en operaciones ya creadas.

## Verificación
- Comprobar que el documento se genera en una sola hoja A4 sin recortes ni solapamientos.
- Revisar visualmente una versión normal y otra con mercancía peligrosa.
- Confirmar que la vista previa y la descarga funcionan desde una Operación Logística.

## Detalles técnicos
- Generación en navegador con jsPDF y jspdf-autotable.
- Sin cambios en el BL Hijo, otros generadores ni en la base de datos.
