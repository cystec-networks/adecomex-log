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

Apply transitions via `estados-expediente.ts` and `validar_transicion_expediente()` for shared manual/automatic requirements.

Use `expediente-numero`/`--brand-red` for red IDs.

Payment slips use linked transport number before reserved TR; TF is secondary.

Share expediente/quote preliquidation PDF.

Expediente headers reserve grid slots: desktop controls in one row, overflow in More actions, accessible mobile rows.

Keep new-expediente actions in two fixed header rows; portal form-owned submit controls there to preserve validation without floating panels.

Scope detail headers; use content-sized space-between rows, keep client label/value together, wrap IDs, show warnings below Description and reuse deadline rules.

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
- Share entry suggestions via buscarSugerenciasProducto/resolverSugerenciasProducto (not historical/Real); explicit DGA selections use datosProductoHistorico. Tariff CSV uses staff-checked server import and atomic invoker RPC; no product override writes.
- Keep chapter notes in a separate read-only query/panel and admin-only invoker import, so tariff suggestions and the main importer remain unchanged.
- Use ImporteLiquidacionInput and liquidacion-moneda for formatted tax editing; preserve USD drafts, calculations, inventory and PDF.

- Copiloto selects real eight-digit leaves, normalizes nature/ranks alternatives. OCR uses it only for blank codes; strip draft warnings before insert. Manual choices affect unsaved results; snapshots/export never recalculate.
- Resolve certificate parties via `terceros-certificado`; `rol_siga` classifies commercial records, never permissions, separating identities by SIGA role.
- Package menus share tab locks/replacement and e-CF: require PDF to generate, email e-NCF without PDFs, skip other missing sources.
- Port-payment OCR reuses the extractor; confirmed saves replace the slot and link costs by preserved SIGA code to avoid repeat charges.
