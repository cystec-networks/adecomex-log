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

Use explicit responsive grid slots and reserved action widths for the expediente header; desktop controls stay on one row, with secondary menus consolidated into More actions when the container cannot fit them, while mobile keeps accessible rows.

Keep the new-expediente header in two fixed action rows; render the form-owned submit controls into its header slot through a React portal to preserve validation and avoid a separate floating panel.

Scope detail-header presentation to its dedicated class; logistics and operational identifiers use independent content-sized flex rows with space-between, keeping client label/value together and wrapping identifiers to avoid fixed-column whitespace. Render active warnings below Description and keep the inline presentation field informational, reusing the existing deadline rules.

- Endoso de consignatario lives in `expediente_endosos` (one active row per expediente); never overwrite `expedientes.cliente_id` — SIGA XML swaps in the endorsed client and portal visibility unions both clients, keeping commercial traceability.
- Presentation deadline uses catalogo_regimenes.dias_habiles_presentar with optional expedientes.plazo_presentar_override; expedientes.sla_dias is deprecated — resolve via src/lib/plazo-presentacion.ts. In the header, require real arrival and a configured regime (never ETA), show business days relative to today, and classify overdue by the calendar date so weekends cannot hide expiration.
- In the sticky header, show ETA until real arrival exists, then show real arrival with calendar transit days from loading; keep presentation status immediately after it and omit the duplicate transit field from General Information to preserve a single chronological summary. Mount the deadline override popover content only while open to prevent overlap with the read-only indicator.
- Use the shared state ordering to replace the deadline from verification onward with compliance based on existing fecha_presentado; omit compliance when its date or deadline is missing, never fabricate historical dates.
- Open the existing Endoso section via a parent-owned request counter from both header document menus, preserving a single form and its current persistence logic.
- Keep additional detail warnings in a pure evaluator with separately scoped query hooks; read invoice links and active reception incidents as authoritative evidence to avoid unrelated client debt and recomputing unpersisted reception tolerances.
- Use the shared expediente alert evaluator for list and detail short/long text; keep PIN timestamp countdown separate from business-day presentation deadlines, and batch list evidence reads to avoid per-row requests.
- Group simultaneous PIN and presentation warnings into one list-only deadline entry with both short descriptions; preserve the independent clocks and full detail warnings to avoid hiding payment or legal deadlines.
