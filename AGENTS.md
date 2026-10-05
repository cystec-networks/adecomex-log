- Use TitleHelp for page subtitle help and primary title/tool rows; ancillary controls occupy a separate row to keep page tools aligned without shrinking badges.
- Use transparent top-divided form action bars instead of framed sticky panels; this keeps actions within the form flow.
<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

Las restricciones de transición de Expediente se aplican tanto en `src/lib/estados-expediente.ts` como en el trigger `public.validar_transicion_expediente()`; así los cambios manuales y automáticos respetan los mismos requisitos.

El identificador visible de un expediente usa la clase compartida `expediente-numero`, basada en `--brand-red`, para mantener el mismo énfasis rojo y negrita en vistas y formularios.

En el volante de solicitud de pago, resolver primero el número del transporte vinculado y luego el TR reservado en la solicitud; un viaje puede tener varios controles TF, que siguen siendo secundarios para conciliación.

El PDF de preliquidación de expediente y cotización comparte el generador horizontal con resumen CIF, Impuestos y Servicios DGA; mantenerlo centralizado evita diferencias entre ambas impresiones.

Use exactly two presentation modes for Expediente detail, creation and listing: a fixed pixel canvas and fixed field/table/header/tab tracks at viewport widths >=1024px, and an independent touch card layout below 1024px. Horizontal scrolling accommodates the desktop canvas; never measure available width to redistribute controls or hide tabs, and wrap long display values inside their fixed cells instead of truncating them.

- Endoso de consignatario lives in `expediente_endosos` (one active row per expediente); never overwrite `expedientes.cliente_id` — SIGA XML swaps in the endorsed client and portal visibility unions both clients, keeping commercial traceability.
- Presentation deadline uses catalogo_regimenes.dias_habiles_presentar with optional expedientes.plazo_presentar_override; expedientes.sla_dias is deprecated — resolve via src/lib/plazo-presentacion.ts. In the header, require real arrival and a configured regime (never ETA), show business days relative to today, and classify overdue by the calendar date so weekends cannot hide expiration.
- In the sticky header, show ETA until real arrival exists, then show real arrival with calendar transit days from loading; keep presentation status immediately after it and omit the duplicate transit field from General Information to preserve a single chronological summary. Mount the deadline override popover content only while open to prevent overlap with the read-only indicator.
- Use the shared state ordering to replace the deadline from verification onward with compliance based on existing fecha_presentado; omit compliance when its date or deadline is missing, never fabricate historical dates.
- Open the existing Endoso section via a parent-owned request counter from both header document menus, preserving a single form and its current persistence logic.
- Render the inspection header selector from TabInfo through a portal into the parent-owned header slot; both selectors use the same draft and save permissions, retaining canal_riesgo storage for legacy compatibility.
- Scope the fixed desktop canvas to Expedientes wrappers, preserve header identity and deadline priorities, and keep table scrolling local where needed so unrelated modules remain unchanged.
- The Expedientes listing keeps fixed table tracks inside one viewport-bounded scroll container, with an opaque right-sticky action column centered vertically; the parent must not add a second horizontal scrollbar.
- Keep compact control height and section spacing scoped to the expediente tab body; typography follows the global role scale, with critical identifiers and alerts retaining higher hierarchy.
- Define the reading scale once in global CSS theme tokens and screen-only semantic role rules; legacy text-size utilities must not reduce operational data below the dense role, and generated PDFs retain their independent print typography.
- Apply touch table presentation below 1024px in the app shell to native and shared read-only tables, preserving controls and row semantics; editable matrices retain local scrolling. Expedientes uses explicit mobile record links with existing filters and groups, and fixed pixel columns on desktop.
