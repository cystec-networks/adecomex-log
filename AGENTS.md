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

Use the shared preliquidation PDF for expediente and quote to prevent divergent summaries.

Use explicit responsive grid slots and reserved action widths for the expediente header; desktop controls stay on one row, with secondary menus consolidated into More actions when the container cannot fit them, while mobile keeps accessible rows.

Keep the new-expediente header in two fixed action rows; render the form-owned submit controls into its header slot through a React portal to preserve validation and avoid a separate floating panel.

Scope detail-header presentation to its dedicated class; logistics and operational identifiers use independent content-sized flex rows with space-between, keeping client label/value together and wrapping identifiers to avoid fixed-column whitespace. Render active warnings below Description and keep the inline presentation field informational, reusing the existing deadline rules.

- Endoso de consignatario lives in `expediente_endosos` (one active row per expediente); never overwrite `expedientes.cliente_id` — SIGA XML swaps in the endorsed client and portal visibility unions both clients, keeping commercial traceability.
- Presentation deadline uses catalogo_regimenes.dias_habiles_presentar with optional expedientes.plazo_presentar_override; expedientes.sla_dias is deprecated — resolve via src/lib/plazo-presentacion.ts. In the header, require real arrival and a configured regime (never ETA), show business days relative to today, and classify overdue by the calendar date so weekends cannot hide expiration.
- In the sticky header, show ETA until arrival, then arrival with calendar transit days; follow with presentation status and omit duplicate transit. Mount deadline override content only while open to avoid overlap.
- Use the shared state ordering to replace the deadline from verification onward with compliance based on existing fecha_presentado; omit compliance when its date or deadline is missing, never fabricate historical dates.
- Open the existing Endoso section via a parent-owned request counter from both header document menus, preserving a single form and its current persistence logic.
- Evaluate detail warnings with scoped evidence queries; invoice links and persisted reception incidents prevent unrelated debt alerts and recomputed tolerances.
- Use the shared expediente alert evaluator for list and detail short/long text; keep PIN timestamp countdown separate from business-day presentation deadlines, and batch list evidence reads to avoid per-row requests.
- Group simultaneous PIN and presentation warnings into one list-only deadline entry with both short descriptions; preserve the independent clocks and full detail warnings to avoid hiding payment or legal deadlines.
- Export DR-CAFTA certificates from the resolved editable preview using native jsPDF text and vector borders, measuring existing cell and text positions to preserve official layouts and annexes without rasterization or losing saved edits.
- Keep inspection type in the existing canal_riesgo storage field; portal the form-owned selector into the detail header so both editors share draft state and the existing save validation without migrating historical values.
- Resolve the effective consignee (active endorsement, else original client) via src/lib/consignatario-efectivo.ts in every expediente document generator and new-invoice preload; issued invoices stay frozen.
- Resolve the dispatch-date modal asynchronously within the existing state mutation and reuse fechasDespachoFaltantes for detail-only preventive alerts, preserving permission checks and audit payloads.
- Centralize product-entry suggestions in buscarSugerenciasProducto/resolverSugerenciasProducto, never historical calculations or Real values. Keep tariff CSV imports in the authenticated staff-checked server function and atomic invoker RPC, without writing product overrides.
- Keep chapter notes in a separate read-only query/panel and admin-only invoker import, so tariff suggestions and the main importer remain unchanged.
- Use ImporteLiquidacionInput and liquidacion-moneda for formatted tax editing; preserve USD drafts, calculations, inventory and PDF.

- Copiloto uses real eight-digit leaf indices, including ranked manual alternatives; never invented codes. Normalize known product nature independently of references. Manual choices only change unsaved results; share immutable staff-readable snapshots/table/export without recalculation.
