# Manifiesto de Importación (XML SIGA) en Logística

## Lo que ya existe y se reutiliza (no se duplica nada)

De **operaciones_logistica**:
- Buque (`buque`) → VesselCode · Viaje (`voyage`) → VoyageNo
- Tipo (`tipo`: marítimo/aéreo/terrestre) → TransportType
- Puertos: `origen`/`puerto_descarga`/`puerto_destino` → LoadingPortCode / UnloadingPortCode / LastPortCode
- Fechas: `fecha_salida` → DepartureDate · `eta`/`fecha_arribo` → ArrivalDate
- BL: `bl_awb`, `bl_hijo_numero` → BLNo · `producto` → GoodsName
- Bultos: `cantidad_bultos`, `tipo_bultos` · Pesos: `peso_bruto_kg`, `volumen_m3` · `flete_monto`
- Peligrosa: `es_mercancia_peligrosa` → DangerousGoodsType
- Consignador: `shipper_nombre`, `shipper_tax_id`, `shipper_direccion`, `shipper_telefono`, `shipper_email`
- Consignatario: `comprador_nombre`, `comprador_tax_id`, `comprador_direccion`, `comprador_telefono`, `comprador_email`
- A notificar: `notify_party`

De **logistica_contenedores**: `numero_contenedor`, `sello1`, `sello2`, `tipo_contenedor` → ManifestContainer + ContainerBL.

Catálogos existentes reutilizados: `dga_areas` (AreaCode, mismo selector del DUA), `catalogo_puertos`, `catalogo_paises`, `catalogo_unidades` (PackageUnitCode).

## Campos nuevos en operaciones_logistica

`area_code`, `biz_company_code`, `empty_yn` (default falso), `loading_location_code`, `unloading_location_code`, `via_entrance`, `country_code`, `bl_type`, `transit_type`, `express_type`, y para cada uno de los tres bloques (consignor / consignee / notify): `_tipo`, `_doc_tipo`, `_doc_numero`, `_pais`, `_fax`, `_zip`, `_zona`, `_ciudad`, `_calle`. Los de notify también nombre/tel/email, ya que hoy solo hay texto libre.

Todas nullable, sin tocar columnas actuales.

## Catálogos DGA nuevos

Nuevas tablas con el mismo patrón (`codigo`, `nombre`, `activo`) y su fila en Administración → Catálogos DGA:
- Tipo de Transporte (IG1007-A/S/T)
- Tipo de BL (IG9016-C/E/S/H)
- Tipo de Tránsito (IG9035-E/H/I/R/S/T)
- Tipo Courier (IG1015-C/G)
- Tipo Consignatario (SA09-001/002)
- Tipo de Documento SIGA (SA13-CED/PAS/RNC/TID)

Con sus filas precargadas.

## Generador

`buildImportManifestXml(operaciones, contenedoresPorOperacion, maps)` en `src/lib/siga-xml.ts`, reutilizando los helpers existentes (T, num, fmtDate, esc, cleanId, downloadXml). Estructura: Manifest (datos de viaje de la primera operación) → ManifestBL por operación → ManifestContainer → ContainerBL. Se omite ManifestVehicle.

## Pantalla

- Nuevo bloque "Datos del Manifiesto SIGA" en el detalle de la operación con los campos nuevos (selectores contra los catálogos).
- Opción "Generar Manifiesto XML" en el menú Documentos, con vista previa, lista de advertencias de campos obligatorios faltantes (no bloquea) y botón de descarga.
- Agrupa automáticamente las operaciones con el mismo buque + viaje, permitiendo elegir cuáles incluir.

## Archivos

- Migración de base de datos (columnas + catálogos nuevos)
- `src/lib/siga-xml.ts`
- `src/components/generar-xml-manifiesto.tsx` (nuevo)
- `src/routes/_authenticated/logistica.$id.tsx`
- `src/routes/_authenticated/admin.catalogos.tsx`
