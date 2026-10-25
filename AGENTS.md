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

Red IDs: `expediente-numero`/`--brand-red`.

Payment slips: linked transport number before reserved TR; TF last.

Share expediente/quote preliquidation PDF.

Expediente headers: desktop slots, More actions overflow, mobile rows.

New-expediente: two fixed action rows; portal form-owned submits there, preserving validation without floating panels.

Scope detail headers; use content-sized space-between rows, keep client label/value together, wrap IDs, show warnings below Description and reuse deadline rules.

- Endoso de consignatario lives in `expediente_endosos` (one active row per expediente); never overwrite `expedientes.cliente_id` — SIGA XML swaps in the endorsed client and portal visibility unions both clients, keeping commercial traceability.
- Presentation deadline: catalogo_regimenes.dias_habiles_presentar + expedientes.plazo_presentar_override via plazo-presentacion.ts; sla_dias deprecated. Require real arrival and regime, never ETA; show business days vs today, classify overdue by calendar date (including weekends).
- In the sticky header, show ETA until arrival, then arrival with calendar transit days; follow with presentation status and omit duplicate transit. Mount deadline override content only while open to avoid overlap.
- Use the shared state ordering to replace the deadline from verification onward with compliance based on existing fecha_presentado; omit compliance when its date or deadline is missing, never fabricate historical dates.
- Open the existing Endoso section via a parent-owned request counter from both header document menus, preserving a single form and its current persistence logic.
- Evaluate detail warnings with scoped evidence queries; invoice links and persisted reception incidents prevent unrelated debt alerts and recomputed tolerances.
- Use the shared expediente alert evaluator for list and detail short/long text; keep PIN timestamp countdown separate from business-day presentation deadlines, and batch list evidence reads to avoid per-row requests.
- Group simultaneous PIN and presentation warnings into one list-only deadline entry with both short descriptions; preserve the independent clocks and full detail warnings to avoid hiding payment or legal deadlines.
- Export DR-CAFTA certificates from the resolved editable preview using native jsPDF text and vector borders, measuring existing cell and text positions to preserve official layouts and annexes without rasterization or losing saved edits.
- Keep inspection type in the existing canal_riesgo storage field; portal the form-owned selector into the detail header so both editors share draft state and the existing save validation without migrating historical values.
- Use consignatario-efectivo.ts (active endorsement, else original) for documents/new invoices; issued invoices stay frozen.
- Resolve the dispatch-date modal asynchronously within the existing state mutation and reuse fechasDespachoFaltantes for detail-only preventive alerts, preserving permission checks and audit payloads.
- Share entry suggestions via buscarSugerenciasProducto/resolverSugerenciasProducto (not historical/Real); explicit DGA selections use datosProductoHistorico. Tariff CSV uses staff-checked server import and atomic invoker RPC; no product override writes.
- Chapter notes use a separate read-only query/panel and admin invoker import; preserve tariff suggestions/import.
- Use ImporteLiquidacionInput/liquidacion-moneda for RD$ editing with USD storage; shared liquidation results feed UI/PDF without billing writes.

- Copiloto selects real eight-digit leaves, normalizes nature/ranks alternatives. OCR uses it only for blank codes; strip draft warnings before insert. Manual choices affect unsaved results; snapshots/export never recalculate.
- Resolve certificate parties via `terceros-certificado`; `rol_siga` classifies commercial records, never permissions, separating identities by SIGA role.
- Package menus share tab locks/replacement and e-CF: require PDF to generate, email e-NCF without PDFs, skip other missing sources.
- Payment OCR confirms/replaces by SIGA/invoice marker; e-CF only updates pdf_url. Read costs via costos-mercancia-queries: invoice projections dedupe OCR, never write billing; transport/reimbursements use costos-automaticos-liquidacion.
- DGA OCR shares conditional empty-field mapping; save PDFs before OCR.
- Expediente editors register dirty/save callbacks in the scoped provider; visited tabs stay mounted to preserve drafts and header saving reuses validated handlers.
