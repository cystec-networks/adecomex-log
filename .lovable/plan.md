# MVP Sistema ADECOMEX SRL

Aplicación interna para recepción, gestión y seguimiento de expedientes de importación y trámites aduanales en R.D.

## Alcance de esta primera versión

**Incluido (funcional end-to-end):**
1. Autenticación email/password + Google
2. Roles (Administrador, Operaciones, Ejecutivo, Agente Aduanal, Documentación, Transporte, Finanzas)
3. Dashboard con KPIs y alertas
4. Solicitudes: alta, listado, filtros, detalle
5. Expedientes: creación desde solicitud, detalle con tabs
6. Documentos: carga, estados, vencimientos (Lovable Cloud Storage)
7. Flujo/Timeline: 14 etapas con semáforo, avance manual, responsable, fecha, comentario, evidencia
8. Incidencias: alta, severidad, resolución
9. Finanzas básicas: registro de costos por expediente (estimado/real/diferencia)
10. Administración de usuarios y asignación de roles
11. Bitácora de auditoría de cambios de estado

**Diferido a siguientes iteraciones (stubs o pendiente):**
- Portal externo de cliente (usuario decidió "después")
- Reportes avanzados/exportación PDF (solo Excel/CSV básico en MVP)
- Notificaciones por email (in-app en MVP)
- Kanban view (solo tabla + timeline en MVP)

## Diseño

Corporativo azul marino serio y confiable. Tokens en `src/styles.css`:
- Primary #13315C (navy)
- Primary-deep #0B2545
- Accent #F59E0B (naranja, alertas/prioridad)
- Muted #8DA9C4
- Background #EEF4ED (light warm)
- Estados semáforo: verde/ámbar/rojo/azul/gris
Tipografía: Inter (body) + Manrope (headings) vía @fontsource. Layout con sidebar fijo tipo panel operativo, tablas densas, cards de KPI.

## Arquitectura técnica

- TanStack Start + TanStack Query
- Lovable Cloud (Supabase): DB + Auth (email/password + Google) + Storage
- Rutas protegidas bajo `_authenticated/`
- Server functions con `requireSupabaseAuth` para todas las lecturas/escrituras
- RLS por rol usando `user_roles` + `has_role()`
- Storage bucket privado `documentos` con RLS

## Esquema de base de datos

```
app_role (enum): admin, operaciones, ejecutivo, agente_aduanal, documentacion, transporte, finanzas
user_roles(user_id, role)
profiles(id, nombre, telefono, activo)

clientes(id, nombre, rnc, contacto, email, telefono, direccion)
solicitudes(id, numero, fecha, cliente_id, tipo_operacion, tipo_carga,
  origen, puerto_llegada, fecha_arribo_est, incoterm, medio_transporte,
  prioridad, estado, responsable_id, observaciones)
expedientes(id, numero, solicitud_id, bl_awb, factura_comercial,
  estado, etapa_actual, responsable_id, sla_dias, fecha_compromiso)
documentos(id, expediente_id, tipo, estado, fecha_recepcion,
  fecha_vencimiento, storage_path, observaciones, responsable_id)
etapas(id, expediente_id, orden, nombre, estado, fecha_inicio,
  fecha_cierre, responsable_id, comentario, evidencia_path)
incidencias(id, expediente_id, tipo, severidad, estado, descripcion,
  accion_correctiva, fecha_apertura, fecha_resolucion, responsable_id)
costos(id, expediente_id, concepto, monto_estimado, monto_real,
  estado_facturacion, estado_cobro)
auditoria(id, entidad, entidad_id, accion, usuario_id, timestamp, cambios)
```

Cada tabla con RLS: operaciones/admin/agente_aduanal ven todo; documentacion sobre documentos; finanzas sobre costos; ejecutivo sobre sus asignaciones. Admin gestiona `user_roles`.

## Pantallas

```
/auth              login/signup + Google
/                  Dashboard (KPIs, alertas, tareas)
/solicitudes       Lista + filtros
/solicitudes/nueva Formulario rápido
/solicitudes/$id   Detalle
/expedientes       Lista + filtros
/expedientes/$id   Detalle con tabs: Info | Documentos | Timeline | Incidencias | Costos | Auditoría
/clientes          CRUD clientes
/admin/usuarios    Gestión usuarios y roles (solo admin)
```

## Entregables por orden

1. Habilitar Lovable Cloud
2. Migración de esquema + RLS + trigger auto-perfil + trigger admin al primer usuario
3. Storage bucket `documentos` privado + RLS
4. Configurar Google OAuth
5. Design system (styles.css) + fuentes
6. Auth pages + gate `_authenticated`
7. Layout sidebar + navegación por rol
8. Módulos en orden: Dashboard → Clientes → Solicitudes → Expedientes (+tabs) → Admin usuarios
9. Auditoría y alertas en dashboard
10. Datos semilla mínimos (tipos de documento, catálogos)

Estimo ~15-20 archivos nuevos. Cuando apruebes, ejecuto todo en un solo pase y luego iteramos sobre lo que quieras profundizar (portal cliente, notificaciones email, reportes PDF, kanban).