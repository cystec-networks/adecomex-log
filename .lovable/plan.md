# Módulos Permisos y Transportes

Antes de aplicar, este es el plan visual y técnico. Confirma para ejecutar.

## 1. Sidebar (OPERACIONES)

```text
OPERACIONES
  ├─ Dashboard
  ├─ Solicitudes
  ├─ Expedientes ▾
  │    ├─ Importaciones
  │    └─ Exportaciones
  ├─ Permisos          ← nuevo (icono FileCheck2)
  ├─ Transportes       ← nuevo (icono Truck)
  ├─ Clientes
  └─ OCR
```

## 2. Tabla Permisos `/permisos`

```text
┌──────────┬─────────┬────────────┬───────────┬────────────┬────────────┬───────────┬────────┬────────┬────────┬─────────┐
│ N° Perm. │ N° Res. │ Expediente │ Cliente   │ Tipo       │ Institución│ Estado    │ Solic. │ Emisión│ Vence  │ Acciones│
├──────────┼─────────┼────────────┼───────────┼────────────┼────────────┼───────────┼────────┼────────┼────────┼─────────┤
│ PER-001  │ R-2025..│ EXP-0034 ↗ │ ACME SRL  │ Sanitario  │ MSP        │ [aprobado]│ 01/11  │ 05/11  │ 05/12  │ ✎ 🗑    │
└──────────┴─────────┴────────────┴───────────┴────────────┴────────────┴───────────┴────────┴────────┴────────┴─────────┘
```
- Búsqueda global + filtros Estado / Cliente + orden por fechas.
- Estados con Badge de color: `solicitado` (gris), `en_tramite` (azul), `aprobado` (verde), `rechazado` (rojo), `vencido` (ámbar).
- Vencimiento cercano (<15 días) resaltado en ámbar.

## 3. Formulario Permiso `/permisos/nuevo` y `/permisos/$id`

```text
┌──────────────────────────────────────────────────────────┐
│ Vinculación                                              │
│  Expediente [EXP-0034 ▾]   Cliente: ACME SRL (auto)     │
├──────────────────────────────────────────────────────────┤
│ Datos del Permiso                                        │
│  N° Permiso [___]  N° Resolución [___]                  │
│  Tipo [Sanitario ▾]  Institución [MSP ▾]                │
│  Estado [en_tramite ▾]                                   │
├──────────────────────────────────────────────────────────┤
│ Fechas                                                   │
│  Solicitud [__]  Emisión [__]  Vencimiento [__]         │
├──────────────────────────────────────────────────────────┤
│ Documento adjunto  [ Subir PDF/imagen ]  (bucket documentos)│
│ Observaciones      [ área de texto ]                     │
└──────────────────────────────────────────────────────────┘
```

## 4. Tabla Transportes `/transportes`

```text
┌──────────┬────────────┬──────────┬──────────┬─────────────┬──────────┬───────┬────────┬──────┬──────────┬───────────┬─────────┐
│ N° Viaje │ Expediente │ Cliente  │ Tipo     │ Transportist│ Placa/Ctn│ Origen│ Destino│Salida│ ETA      │ Flete     │ Estado  │
├──────────┼────────────┼──────────┼──────────┼─────────────┼──────────┼───────┼────────┼──────┼──────────┼───────────┼─────────┤
│ TR-0012  │ EXP-0034 ↗ │ ACME SRL │ Marítimo │ MAERSK      │ MSKU1234 │ Miami │ SDQ    │ 01/11│ 10/11    │ USD 3,200 │ tránsito│
└──────────┴────────────┴──────────┴──────────┴─────────────┴──────────┴───────┴────────┴──────┴──────────┴───────────┴─────────┘
```
- Mismo patrón de búsqueda/filtros/orden que Expedientes.
- Estados: `programado`, `en_transito`, `entregado`, `retrasado`.

## 5. Formulario Transporte

```text
┌──────────────────────────────────────────────────────────┐
│ Vinculación                                              │
│  Expediente [EXP-0034 ▾]  Cliente: ACME SRL (auto)      │
├──────────────────────────────────────────────────────────┤
│ Datos del Viaje                                          │
│  N° Viaje/Ref [__]  Tipo [Marítimo ▾]                   │
│  Transportista/Naviera [__]  Placa/Unidad/Contenedor [__]│
│  Origen [__]  Destino [__]                              │
├──────────────────────────────────────────────────────────┤
│ Fechas                                                   │
│  Salida [__]   ETA [__]                                  │
├──────────────────────────────────────────────────────────┤
│ Flete   [monto __] [moneda USD/DOP/EUR ▾]                │
│ Estado  [programado ▾]                                   │
│ Observaciones [__]                                       │
└──────────────────────────────────────────────────────────┘
```

## 6. En el detalle de Expediente

Nuevas dos secciones dentro de las pestañas existentes (o nuevas pestañas "Permisos" y "Transportes"):

```text
┌── Permisos vinculados ──────────────────── [+ Agregar Permiso] ┐
│ PER-001 · Sanitario · MSP · [aprobado] · Vence 05/12/2026  ✎ │
│ PER-002 · Fitosanitario · MA · [en_trámite] · —            ✎ │
└──────────────────────────────────────────────────────────────┘

┌── Transportes vinculados ─────────────── [+ Agregar Transporte] ┐
│ TR-0012 · Marítimo · MAERSK · MSKU1234 · ETA 10/11 · tránsito ✎│
└──────────────────────────────────────────────────────────────┘
```
El botón `+ Agregar` navega a `/permisos/nuevo?expediente=<id>` o `/transportes/nuevo?expediente=<id>`, con el expediente y cliente precargados.

## 7. Detalles técnicos

**Migración SQL** (una sola):
- ENUMs: `permiso_estado`, `permiso_tipo`, `transporte_tipo`, `transporte_estado`, `moneda`.
- Tabla `public.permisos`: numero, numero_resolucion, expediente_id (FK), cliente_id (FK), tipo, institucion_emisora, estado, fecha_solicitud, fecha_emision, fecha_vencimiento, documento_url, observaciones, created_by, created_at, updated_at, eliminado_en, eliminado_por.
- Tabla `public.transportes`: numero_viaje, expediente_id (FK), cliente_id (FK), tipo, transportista, placa_contenedor, origen, destino, fecha_salida, eta, flete_monto, flete_moneda, estado, observaciones, created_by, created_at, updated_at, eliminado_en, eliminado_por.
- GRANTs a `authenticated`/`service_role`, RLS ON, políticas equivalentes a expedientes (staff full access, resto lectura).
- Triggers `updated_at`.
- Indices por `expediente_id`, `estado`, `eliminado_en`.

**Rutas nuevas** (TanStack file-based):
- `src/routes/_authenticated/permisos.index.tsx`
- `src/routes/_authenticated/permisos.nuevo.tsx`
- `src/routes/_authenticated/permisos.$id.tsx`
- `src/routes/_authenticated/transportes.index.tsx`
- `src/routes/_authenticated/transportes.nuevo.tsx`
- `src/routes/_authenticated/transportes.$id.tsx`

**Modificaciones**:
- `src/components/app-shell.tsx`: dos entradas de sidebar.
- `src/routes/_authenticated/expedientes.$id.tsx`: dos secciones nuevas (Permisos, Transportes) con listado y botón Agregar.
- `src/routes/_authenticated/expedientes.papelera.tsx`: dos pestañas más (Permisos, Transportes) con Restaurar / Eliminar permanente.
- Upload de documento del permiso al bucket `documentos` existente (privado, signed URL para visualizar).

**Consistencia**: se reutiliza el componente `Th` con indicadores ▲▼, el patrón de ordenamiento con "cerrados/entregados al final", filtros y estilo `Refined semantic table` idéntico a Expedientes.

¿Aplico todo tal cual?
