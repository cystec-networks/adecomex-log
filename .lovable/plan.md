# Fase 2 — Pantallas del módulo Logística

## Resultado
Crear el módulo independiente **Logística** con navegación, listado, alta y detalle operativo, reutilizando los patrones visuales y funcionales existentes sin modificar Expedientes, Cotizaciones, Órdenes, Permisos ni Transportes.

## Implementación

### 1. Base de incidencias
- Agregar `incidencias.logistica_id` con relación a `operaciones_logistica` y borrado en cascada.
- Añadir índice para consultas por operación.
- Mantener los permisos actuales de `incidencias`; no se crean tablas nuevas.

### 2. Menú
- Incorporar el grupo **Logística** entre Comercial y Expedientes.
- Mostrar **Operaciones** y **Nueva Operación** con iconos y estados activos correctos.
- Respetar la visibilidad del módulo existente para personal; las acciones de escritura seguirán limitadas por los permisos de la Fase 1.

### 3. Listado `/logistica`
- Consultar operaciones con Cliente y Responsable.
- Buscar por número o cliente.
- Agrupar y ordenar por las seis etapas, con contador y estado colapsado persistido en el navegador.
- Añadir grupo final para operaciones completadas o canceladas cuando existan.
- Mostrar: número, cliente, tipo, proveedor, ETA, responsable y estado; cada fila abrirá su detalle.

### 4. Nueva operación `/logistica/nueva`
- Formulario para Cliente, vínculos opcionales a Cotización/Orden/Expediente, tipo, responsable, proveedor/TID y observaciones.
- Reutilizar el selector de terceros extranjeros y el listado de responsables de Logística.
- Crear la operación y navegar al detalle con `nuevo=1`, para abrirla editable con fondo verde.

### 5. Detalle `/logistica/$id`
- Encabezado fijo con número, cliente, badges de tipo/estado y progreso “X de 6 etapas completadas”.
- Abrir en modo lectura; habilitar edición mediante botón flotante. Fondo amarillo al editar y verde en una operación recién creada.
- Guardar todos los datos operativos y costos propios de Logística, mostrando su total sin tocar costos de Expedientes o productos.
- Mostrar las seis etapas con progreso visual. Solo la etapa en curso podrá marcarse completada; al hacerlo, se actualizará el estado principal y avanzará la siguiente etapa.
- Subir un adjunto al bucket `documentos` bajo `logistica/`, con vista previa y opción de quitarlo durante edición.
- Listar, crear y resolver incidencias vinculadas exclusivamente a la operación logística.

### 6. Validación
- Verificar tipos y rutas generadas.
- Probar en navegador el listado, creación, modo lectura/edición, guardado, progreso, adjunto e incidencias.
- Revisar escritorio y ancho móvil para evitar solapamientos del encabezado y botones flotantes.

## Detalles técnicos
- Se crearán tres rutas protegidas: `logistica.index.tsx`, `logistica.nueva.tsx` y `logistica.$id.tsx`.
- Se reutilizarán `useGruposColapsados`, `EstadoDivider`, `TerceroExtranjeroPicker`, `DocumentoPreviewButton` y los controles visuales existentes.
- Las escrituras respetarán las políticas ya creadas para roles `admin` y `logistica`.
- Cada ruta incluirá metadatos propios de título y descripción.
