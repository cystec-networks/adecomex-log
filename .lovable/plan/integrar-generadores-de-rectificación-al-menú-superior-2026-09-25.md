# Integrar generadores de rectificación al menú superior

## Cambios
- Agregar al menú fijo **Documentos y Reportes** estas acciones:
  - Generar Oficio de Rectificación Técnica.
  - Generar Paquete Completo (PDF).
  - Preparar Correo a DGA.
- Mostrar las tres acciones únicamente en expedientes guardados con **Rectificación técnica = Sí**.
- Incluirlas tanto en la versión de escritorio como en **Más acciones** para móvil.
- Retirar los botones duplicados que actualmente ocupan espacio dentro de la ficha, conservando intactos sus diálogos, validaciones, descargas y registro de bitácora.

## Verificación
- Confirmar que el menú abre sin cortes y muestra las acciones en el orden indicado.
- Ejecutar una de las acciones desde el menú y comprobar que abre su flujo existente.
- Revisar que no aparezcan en expedientes sin rectificación técnica ni durante la creación de uno nuevo.
